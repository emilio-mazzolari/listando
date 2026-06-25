const webpush = require('web-push');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://eejdpophfxsrqdvsucye.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVlamRwb3BoZnhzcnFkdnN1Y3llIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2NTMzMDQsImV4cCI6MjA5MzIyOTMwNH0.mpxbwlJyIdZgqKIdutHbLd85JR1P11yiglbYeApi17k';
const RESEND_KEY = process.env.RESEND_API_KEY;

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

webpush.setVapidDetails(
    'mailto:emilio.mazzolari@gmail.com',
    process.env.VAPID_PUBLIC_KEY || 'BATe8jx7GOX6w2NUFoMQoGI6l8BRyJEVcsDlwf3IdIa5AEENkxpSCNuhkl4PgDxR_8f-AJerrYxENnH0mb-MTys',
    process.env.VAPID_PRIVATE_KEY
);

// Returns current date (YYYY-MM-DD) and time in minutes, in Europe/Rome timezone
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
    return {
        date: `${get('year')}-${get('month')}-${get('day')}`,
        totalMins: hh * 60 + mm
    };
}

module.exports = async function handler(req, res) {
    const secret = process.env.CRON_SECRET;
    if (secret && req.headers.authorization !== `Bearer ${secret}`) {
        return res.status(401).end();
    }

    const { date, totalMins } = getRomeTime();
    const windowEnd = totalMins + 65; // matches hourly cron with buffer

    // Tasks due today that haven't been notified yet
    const { data: tasks, error } = await sb.from('todo')
        .select('*')
        .eq('completato', false)
        .eq('notificato', false)
        .eq('scadenza', date)
        .not('ora', 'is', null);

    if (error) return res.status(500).json({ error: error.message });

    // Filter to tasks whose reminder time falls in [now, now+65min)
    const due = (tasks || []).filter(t => {
        const [hh, mm] = t.ora.split(':').map(Number);
        const mins = hh * 60 + mm;
        return mins >= totalMins && mins < windowEnd;
    });

    if (!due.length) return res.json({ sent: 0, checked: tasks?.length || 0 });

    // Load all push subscriptions once
    const { data: subs } = await sb.from('push_subscriptions').select('*');
    const subsByEmail = {};
    for (const s of (subs || [])) {
        if (!subsByEmail[s.email_utente]) subsByEmail[s.email_utente] = [];
        subsByEmail[s.email_utente].push(s);
    }

    let sent = 0;
    for (const task of due) {
        const timeStr = task.ora.substring(0, 5);

        if (task.promemoria_push) {
            for (const sub of (subsByEmail[task.email_utente] || [])) {
                try {
                    await webpush.sendNotification(
                        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                        JSON.stringify({
                            title: '⏰ ' + task.titolo,
                            body: task.note || `Promemoria alle ${timeStr}`,
                            url: '/todo.html'
                        })
                    );
                    sent++;
                } catch (e) {
                    if (e.statusCode === 410 || e.statusCode === 404) {
                        await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
                    }
                }
            }
        }

        if (task.promemoria_email && RESEND_KEY) {
            try {
                await fetch('https://api.resend.com/emails', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${RESEND_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        from: 'Listando <noreply@listando.it>',
                        to: task.email_utente,
                        subject: `⏰ ${task.titolo}`,
                        html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
                            <p style="color:#666;margin:0 0 8px">Promemoria per le <strong>${timeStr}</strong></p>
                            <h2 style="margin:0 0 12px;color:#111">${task.titolo}</h2>
                            ${task.note ? `<p style="color:#555;margin:0 0 20px">${task.note}</p>` : ''}
                            <a href="https://listando.it/todo.html"
                               style="background:#30b0c7;color:white;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:700;display:inline-block">
                               Apri Listando
                            </a>
                        </div>`
                    })
                });
                sent++;
            } catch (e) {}
        }

        await sb.from('todo').update({ notificato: true }).eq('id', task.id);
    }

    return res.json({ sent, due: due.length });
};
