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
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).end();

    // auth temporaneamente disabilitata per invio broadcast
    // const secret = process.env.CRON_SECRET;
    // if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    //     return res.status(401).json({ error: 'Non autorizzato' });
    // }

    const { title, body, url } = req.body || {};
    if (!title || !body) return res.status(400).json({ error: 'title e body richiesti' });

    const { data: subs, error } = await sb.from('push_subscriptions').select('*');
    if (error) return res.status(500).json({ error: error.message });
    if (!subs?.length) return res.status(200).json({ sent: 0, msg: 'Nessuna sottoscrizione' });

    const payload = JSON.stringify({ title, body, url: url || '/index.html' });

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

    return res.status(200).json({ sent, failed });
};
