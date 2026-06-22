const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://eejdpophfxsrqdvsucye.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVlamRwb3BoZnhzcnFkdnN1Y3llIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2NTMzMDQsImV4cCI6MjA5MzIyOTMwNH0.mpxbwlJyIdZgqKIdutHbLd85JR1P11yiglbYeApi17k';
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).end();

    const { email, subscription } = req.body || {};
    if (!email || !subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
        return res.status(400).json({ error: 'Payload non valido' });
    }

    const { error } = await sb.from('push_subscriptions').upsert({
        email_utente: email,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
    }, { onConflict: 'endpoint' });

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
};
