const webpush = require('web-push');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://eejdpophfxsrqdvsucye.supabase.co';
const sb = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

webpush.setVapidDetails(
    'mailto:emilio.mazzolari@gmail.com',
    process.env.VAPID_PUBLIC_KEY || 'BIyJ8XdT5OaVM9uGh9rgjqMzBNd9q2haLd4k_Ugq7ZvUgZrzmOFmRb8-E0-_vUGHZ1_cGxIz84hakLZJPWgxFQM',
    process.env.VAPID_PRIVATE_KEY
);

module.exports = async function handler(req, res) {
    const secret = process.env.CRON_SECRET;
    if (secret) {
        const auth = req.headers.authorization;
        if (auth !== `Bearer ${secret}`) return res.status(401).end();
    }

    // Oggi in formato MM-DD per confronto
    const today = new Date();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');

    // Carica tutti i profili con data di nascita
    const { data: profiles, error: profErr } = await sb
        .from('profili')
        .select('email_utente')
        .not('data_nascita', 'is', null);

    if (profErr) return res.status(500).json({ error: profErr.message });

    // Filtra chi compie gli anni oggi
    const birthdayEmails = (profiles || [])
        .filter(p => {
            const parts = (p.data_nascita || '').split('-');
            return parts.length === 3 && parts[1] === mm && parts[2] === dd;
        })
        .map(p => p.email_utente);

    if (!birthdayEmails.length) return res.status(200).json({ sent: 0, msg: 'Nessun compleanno oggi' });

    // Carica le sottoscrizioni push degli utenti di compleanno
    const { data: subs, error: subErr } = await sb
        .from('push_subscriptions')
        .select('*')
        .in('email_utente', birthdayEmails);

    if (subErr) return res.status(500).json({ error: subErr.message });
    if (!subs?.length) return res.status(200).json({ sent: 0, msg: 'Nessuna sottoscrizione attiva' });

    const payload = JSON.stringify({
        title: '🎂 Listando',
        body: 'Tanti auguri di buon compleanno! 🎉',
        url: '/index.html',
    });

    let sent = 0, failed = 0;
    for (const sub of subs) {
        try {
            await webpush.sendNotification(
                { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                payload
            );
            sent++;
        } catch (err) {
            failed++;
            if (err.statusCode === 410 || err.statusCode === 404) {
                await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
            }
        }
    }

    return res.status(200).json({ sent, failed, birthdayEmails });
};
