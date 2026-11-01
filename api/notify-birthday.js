const webpush = require('web-push');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://eejdpophfxsrqdvsucye.supabase.co';
const sb = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

webpush.setVapidDetails(
    'mailto:emilio.mazzolari@gmail.com',
    process.env.VAPID_PUBLIC_KEY || 'BIyJ8XdT5OaVM9uGh9rgjqMzBNd9q2haLd4k_Ugq7ZvUgZrzmOFmRb8-E0-_vUGHZ1_cGxIz84hakLZJPWgxFQM',
    process.env.VAPID_PRIVATE_KEY
);

async function pushAll(subs, payload) {
    let sent = 0;
    for (const sub of subs) {
        try {
            await webpush.sendNotification(
                { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                JSON.stringify(payload)
            );
            sent++;
        } catch (err) {
            if (err.statusCode === 410 || err.statusCode === 404) {
                await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
            }
        }
    }
    return sent;
}

async function subsOf(email) {
    const { data } = await sb.from('push_subscriptions').select('*').eq('email_utente', email);
    return data || [];
}

module.exports = async function handler(req, res) {
    const secret = process.env.CRON_SECRET;
    if (secret && req.headers.authorization !== `Bearer ${secret}`) return res.status(401).end();

    const today = new Date();
    const mm  = String(today.getMonth() + 1).padStart(2, '0');
    const dd  = String(today.getDate()).padStart(2, '0');

    const datePlus = (days) => {
        const d = new Date(today);
        d.setDate(d.getDate() + days);
        return d.toISOString().split('T')[0];
    };
    const tomorrow = datePlus(1);
    const in7days  = datePlus(7);

    const results = { birthday: 0, abbonamenti: 0, scadenze: 0 };

    // ── 1. Compleanni ─────────────────────────────────────────────────
    const { data: profiles } = await sb.from('profili').select('email_utente, nome, data_nascita').not('data_nascita', 'is', null);
    for (const p of (profiles || [])) {
        const parts = (p.data_nascita || '').split('-');
        if (parts.length !== 3 || parts[1] !== mm || parts[2] !== dd) continue;
        const nome = p.nome?.trim() || p.email_utente.split('@')[0];
        const subs = await subsOf(p.email_utente);
        results.birthday += await pushAll(subs, {
            title: '🎂 Buon compleanno!',
            body: `Tanti auguri ${nome}! Listando ti augura una giornata speciale 🎉`,
            url: '/index.html',
            tag: `birthday-${p.email_utente}`,
        });
    }

    // ── 2. Abbonamenti in scadenza (domani o tra 7 giorni) ────────────
    const { data: abbs } = await sb.from('abbonamenti')
        .select('email_utente, nome, costo, data_rinnovo')
        .eq('attivo', true)
        .or(`data_rinnovo.eq.${tomorrow},data_rinnovo.eq.${in7days}`);

    for (const a of (abbs || [])) {
        const giorni = a.data_rinnovo === tomorrow ? 'domani' : 'tra 7 giorni';
        const costo  = a.costo != null ? ` — €${Number(a.costo).toFixed(2)}` : '';
        const subs   = await subsOf(a.email_utente);
        results.abbonamenti += await pushAll(subs, {
            title: `🔔 Abbonamento in rinnovo`,
            body: `${a.nome}${costo} si rinnova ${giorni}`,
            url: '/abbonamenti.html',
            tag: `abb-${a.email_utente}-${a.nome}`,
        });
    }

    // ── 3. Scadenze imminenti (domani o tra 7 giorni) ─────────────────
    const { data: scad } = await sb.from('scadenze')
        .select('email_utente, titolo, categoria, data_scadenza')
        .eq('gestita', false)
        .or(`data_scadenza.eq.${tomorrow},data_scadenza.eq.${in7days}`);

    for (const s of (scad || [])) {
        const giorni = s.data_scadenza === tomorrow ? 'domani' : 'tra 7 giorni';
        const subs   = await subsOf(s.email_utente);
        results.scadenze += await pushAll(subs, {
            title: `⚠️ Scadenza imminente`,
            body: `${s.titolo} scade ${giorni}`,
            url: '/scadenze.html',
            tag: `scad-${s.email_utente}-${s.titolo}`,
        });
    }

    return res.status(200).json(results);
};
