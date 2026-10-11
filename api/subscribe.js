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

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).end();

    const { email, subscription } = req.body || {};
    if (!email || !subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
        return res.status(400).json({ error: 'Payload non valido' });
    }

    let sb;
    try { sb = getSb(); } catch (e) { return res.status(500).json({ error: e.message }); }

    const { error } = await sb.from('push_subscriptions').upsert({
        email_utente: email,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
    }, { onConflict: 'endpoint' });

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
};
