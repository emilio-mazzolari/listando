const webpush = require('web-push');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://eejdpophfxsrqdvsucye.supabase.co';

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

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).end();

    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: 'email mancante' });

    let sb;
    try { sb = getSb(); } catch (e) { return res.status(500).json({ error: e.message }); }

    const { data: subs } = await sb.from('push_subscriptions').select('*').eq('email_utente', email);
    if (!subs?.length) return res.status(200).json({ sent: 0, message: 'Nessuna subscription trovata per questa email' });

    const payload = JSON.stringify({
        title: '✅ Push funzionante!',
        body: `Notifiche attive su questo dispositivo`,
        url: '/profilo.html'
    });

    let sent = 0;
    for (const sub of subs) {
        try {
            await webpush.sendNotification(
                { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                payload
            );
            sent++;
        } catch (e) {
            if (e.statusCode === 410 || e.statusCode === 404) {
                await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
            }
        }
    }

    return res.status(200).json({ sent, total: subs.length });
};
