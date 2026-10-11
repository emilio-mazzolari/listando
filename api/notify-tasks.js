const webpush = require('web-push');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://eejdpophfxsrqdvsucye.supabase.co';
const RESEND_KEY = process.env.RESEND_API_KEY;

// Lazy init: createClient lancia se la key è undefined (romperebbe il modulo)
let _sb;
function getSb() {
    if (!_sb) {
        const key = process.env.SUPABASE_SERVICE_KEY;
        if (!key) throw new Error('SUPABASE_SERVICE_KEY non configurata');
        _sb = createClient(SUPABASE_URL, key, { auth: { persistSession: false } });
    }
    return _sb;
}

webpush.setVapidDetails(
    'mailto:emilio.mazzolari@gmail.com',
    process.env.VAPID_PUBLIC_KEY || 'BIyJ8XdT5OaVM9uGh9rgjqMzBNd9q2haLd4k_Ugq7ZvUgZrzmOFmRb8-E0-_vUGHZ1_cGxIz84hakLZJPWgxFQM',
    process.env.VAPID_PRIVATE_KEY
);

// Returns current date/time info in Europe/Rome timezone
function getRomeTime() {
    const now = new Date();
    const fmt = new Intl.DateTimeFormat('it-IT', {
        timeZone: 'Europe/Rome',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false
    });
    const parts = fmt.formatToParts(now);
    const get = type => parts.find(p => p.type === type)?.value || '00';
    const hh = parseInt(get('hour'));
    const mm = parseInt(get('minute'));
    // Get day of week (0=Sun,1=Mon,...,6=Sat) in Rome timezone
    const romeDate = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Rome' }));
    return {
        date: `${get('year')}-${get('month')}-${get('day')}`,
        totalMins: hh * 60 + mm,
        dow: romeDate.getDay(),
        romeDate   // restituito per usarlo nel loop checkDates
    };
}

async function sendPush(sb, sub, payload) {
    try {
        await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload
        );
        return true;
    } catch (e) {
        if (e.statusCode === 410 || e.statusCode === 404) {
            await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
        }
        return false;
    }
}

module.exports = async function handler(req, res) {
    const secret = process.env.CRON_SECRET;
    if (secret && req.headers.authorization !== `Bearer ${secret}`) {
        return res.status(401).end();
    }

    let sb;
    try { sb = getSb(); } catch (e) { return res.status(500).json({ error: e.message }); }

    const { date, totalMins, dow, romeDate } = getRomeTime();
    // Start window 5 min early to absorb slight cron delays; end 65 min later
    const windowStart = totalMins - 5;
    const windowEnd = totalMins + 65;

    // ── Reset notificato at midnight for recurring tasks (scadenza=null) ──
    // Runs on the 00:xx cron pass to allow re-notification the next occurrence
    if (totalMins < 65) {
        await sb.from('todo')
            .update({ notificato: false })
            .eq('notificato', true)
            .not('periodicita', 'is', null)
            .is('scadenza', null);
    }

    // ── Load push subscriptions once ─────────────────────────────────────
    const { data: subs } = await sb.from('push_subscriptions').select('*');
    const subsByEmail = {};
    for (const s of (subs || [])) {
        if (!subsByEmail[s.email_utente]) subsByEmail[s.email_utente] = [];
        subsByEmail[s.email_utente].push(s);
    }

    // ── 1. One-off tasks with scadenza — supports multiple rem_anticipi ──────
    // Query tasks whose scadenza falls within the next 7 days (max anticipo)
    const checkDates = [];
    for (let i = 0; i <= 7; i++) {
        const d = new Date(romeDate);
        d.setDate(d.getDate() + i);
        checkDates.push(d.toISOString().split('T')[0]);
    }
    // Include mensile/annuale (periodicita not null but scadenza-based) alongside one-off tasks
    const { data: dateTasks, error } = await sb.from('todo')
        .select('*')
        .eq('completato', false)
        .eq('promemoria_push', true)
        .in('scadenza', checkDates)
        .not('periodicita', 'eq', 'settimanale')
        .not('periodicita', 'eq', 'giornaliera');

    if (error) return res.status(500).json({ error: error.message });

    // For each task, find which anticipo(i) fire today
    const dateDue = [];
    for (const t of (dateTasks || [])) {
        const anticipi = (t.rem_anticipi != null && t.rem_anticipi !== '' ? t.rem_anticipi : '0').split(',').map(Number);
        const inviati  = (t.rem_inviati  || '').split(',').map(Number).filter(n => Number.isFinite(n) && n >= 0);
        for (const anticipo of anticipi) {
            if (inviati.includes(anticipo)) continue;
            const [y, mo, dd] = t.scadenza.split('-').map(Number);
            const remMs = Date.UTC(y, mo - 1, dd) - anticipo * 86400000;
            const remDate = new Date(remMs).toISOString().slice(0, 10);
            if (remDate !== date) continue;
            const timeStr = (t.rem_ora || '09:00').substring(0, 5);
            const [hh, mm] = timeStr.split(':').map(Number);
            const mins = hh * 60 + mm;
            if (mins < windowStart || mins >= windowEnd) continue;
            dateDue.push({ task: t, anticipo, timeStr });
        }
    }

    // ── 2. Weekly recurring tasks ─────────────────────────────────────────
    const { data: weeklyTasks } = await sb.from('todo')
        .select('*')
        .eq('completato', false)
        .eq('notificato', false)
        .eq('promemoria_push', true)
        .eq('periodicita', 'settimanale')
        .is('scadenza', null);

    const weeklyDue = (weeklyTasks || []).filter(t => {
        if (!t.giorni_settimana) return false;
        const days = t.giorni_settimana.split(',').map(Number);
        // rem_anticipi tells us N days BEFORE the action day to send the notification.
        // Notification fires when: (action_day - anticipo + 7) % 7 === today (dow)
        const anticipi = t.rem_anticipi
            ? t.rem_anticipi.split(',').map(Number).filter(n => Number.isFinite(n) && n >= 0)
            : [0];
        const matchesDay = days.some(d => anticipi.some(a => ((d - a) % 7 + 7) % 7 === dow));
        if (!matchesDay) return false;
        const timeStr = (t.rem_ora || t.ora || '').substring(0, 5);
        if (!timeStr) return false;
        const [hh, mm] = timeStr.split(':').map(Number);
        const mins = hh * 60 + mm;
        return mins >= windowStart && mins < windowEnd;
    });

    // ── 3. Daily recurring tasks ──────────────────────────────────────────
    const { data: dailyTasks } = await sb.from('todo')
        .select('*')
        .eq('completato', false)
        .eq('notificato', false)
        .eq('promemoria_push', true)
        .eq('periodicita', 'giornaliera')
        .is('scadenza', null);

    const dailyDue = (dailyTasks || []).filter(t => {
        const timeStr = (t.rem_ora || t.ora || '').substring(0, 5);
        if (!timeStr) return false;
        const [hh, mm] = timeStr.split(':').map(Number);
        const mins = hh * 60 + mm;
        return mins >= windowStart && mins < windowEnd;
    });

    const isDebug = req.query?.debug === '1' || req.body?.debug === '1';

    const totalDue = dateDue.length + weeklyDue.length + dailyDue.length;
    const baseDebug = { totalMins, windowEnd, date, dow, subs: Object.keys(subsByEmail), vapidOk: !!process.env.VAPID_PRIVATE_KEY };

    if (isDebug) {
        // Return detailed task diagnostics without actually sending
        const debugDateTasks = (dateTasks || []).map(t => {
            const anticipi = (t.rem_anticipi != null && t.rem_anticipi !== '' ? t.rem_anticipi : '0').split(',').map(Number);
            const inviati  = (t.rem_inviati  || '').split(',').map(Number).filter(n => Number.isFinite(n) && n >= 0);
            const reasons = anticipi.map(a => {
                if (inviati.includes(a)) return `anticipo=${a}: già_inviato`;
                const [y, mo, dd] = t.scadenza.split('-').map(Number);
                const remMs = Date.UTC(y, mo - 1, dd) - a * 86400000;
                const remDate = new Date(remMs).toISOString().slice(0, 10);
                if (remDate !== date) return `anticipo=${a}: remDate=${remDate}≠today`;
                const timeStr = (t.rem_ora || '09:00').substring(0, 5);
                const [hh, mm] = timeStr.split(':').map(Number);
                const mins = hh * 60 + mm;
                if (mins < windowStart) return `anticipo=${a}: ora=${mins}min<finestraInizio(${windowStart})`;
                if (mins >= windowEnd) return `anticipo=${a}: ora=${mins}min>=finestrafine(${windowEnd})`;
                return `anticipo=${a}: DOVREBBE_SCATTARE`;
            });
            const hasSub = !!(subsByEmail[t.email_utente]?.length);
            return { id: t.id, titolo: t.titolo, email_utente: t.email_utente, scadenza: t.scadenza, rem_ora: t.rem_ora, rem_anticipi: t.rem_anticipi, rem_inviati: t.rem_inviati, completato: t.completato, notificato: t.notificato, hasSub, reasons };
        });
        const debugWeekly = (weeklyTasks || []).map(t => {
            const days = (t.giorni_settimana || '').split(',').map(Number);
            const anticipi = t.rem_anticipi ? t.rem_anticipi.split(',').map(Number).filter(n => Number.isFinite(n) && n >= 0) : [0];
            const matchesDay = days.some(d => anticipi.some(a => ((d - a) % 7 + 7) % 7 === dow));
            const timeStr = (t.rem_ora || t.ora || '').substring(0, 5);
            const [hh, mm] = timeStr ? timeStr.split(':').map(Number) : [0, 0];
            const mins = hh * 60 + mm;
            const hasSub = !!(subsByEmail[t.email_utente]?.length);
            return { id: t.id, titolo: t.titolo, email_utente: t.email_utente, giorni_settimana: t.giorni_settimana, rem_anticipi: t.rem_anticipi, rem_ora: t.rem_ora, notificato: t.notificato, matchesDay, mins, inWindow: mins >= windowStart && mins < windowEnd, hasSub };
        });
        const debugDaily = (dailyTasks || []).map(t => {
            const timeStr = (t.rem_ora || t.ora || '').substring(0, 5);
            const [hh, mm] = timeStr ? timeStr.split(':').map(Number) : [0, 0];
            const mins = hh * 60 + mm;
            const hasSub = !!(subsByEmail[t.email_utente]?.length);
            return { id: t.id, titolo: t.titolo, email_utente: t.email_utente, rem_ora: t.rem_ora, notificato: t.notificato, mins, inWindow: mins >= windowStart && mins < windowEnd, hasSub };
        });
        return res.json({ ...baseDebug, dateTasks: debugDateTasks, weeklyTasks: debugWeekly, dailyTasks: debugDaily, due: { date: dateDue.length, weekly: weeklyDue.length, daily: dailyDue.length } });
    }

    if (!totalDue) return res.json({ sent: 0, ...baseDebug });

    async function notifica(task, timeStr) {
        let sent = 0;
        const payload = JSON.stringify({
            title: '⏰ ' + task.titolo,
            body: task.note || `Promemoria alle ${timeStr}`,
            url: '/todo.html',
            tag: 'todo-' + task.id
        });
        if (task.promemoria_push) {
            for (const sub of (subsByEmail[task.email_utente] || [])) {
                if (await sendPush(sb, sub, payload)) sent++;
            }
        }
        if (task.promemoria_email && RESEND_KEY) {
            try {
                await fetch('https://api.resend.com/emails', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        from: 'Listando <noreply@listando.it>',
                        to: task.email_utente,
                        subject: `⏰ ${task.titolo}`,
                        html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
                            <p style="color:#666;margin:0 0 8px">Promemoria per le <strong>${timeStr}</strong></p>
                            <h2 style="margin:0 0 12px;color:#111">${task.titolo}</h2>
                            ${task.note ? `<p style="color:#555;margin:0 0 20px">${task.note}</p>` : ''}
                            <a href="https://listando.it/todo.html" style="background:#30b0c7;color:white;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:700;display:inline-block">Apri Listando</a>
                        </div>`
                    })
                });
                sent++;
            } catch (e) {}
        }
        return sent;
    }

    let sent = 0;

    // One-off tasks — track per-anticipo with rem_inviati
    for (const { task, anticipo, timeStr } of dateDue) {
        sent += await notifica(task, timeStr);
        const inviati = (task.rem_inviati || '').split(',').map(Number).filter(n => Number.isFinite(n) && n >= 0);
        inviati.push(anticipo);
        const anticipi = (task.rem_anticipi != null && task.rem_anticipi !== '' ? task.rem_anticipi : '0').split(',').map(Number);
        const allSent = anticipi.every(a => inviati.includes(a));
        await sb.from('todo').update({
            rem_inviati: inviati.join(','),
            notificato: allSent
        }).eq('id', task.id);
    }

    // Recurring tasks — keep notificato flag
    for (const task of [...weeklyDue, ...dailyDue]) {
        const timeStr = (task.rem_ora || task.ora || '09:00').substring(0, 5);
        sent += await notifica(task, timeStr);
        await sb.from('todo').update({ notificato: true }).eq('id', task.id);
    }

    return res.json({ sent, due: totalDue, dow, totalMins });
};
