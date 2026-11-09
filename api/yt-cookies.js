const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://eejdpophfxsrqdvsucye.supabase.co';
const TOKEN = process.env.YT_COOKIE_TOKEN || 'yt2026listando';

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).end();

    const { cookies, token } = req.body || {};
    if (!cookies) return res.status(400).json({ error: 'cookies required' });
    if (token !== TOKEN) return res.status(403).json({ error: 'token non valido' });

    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!key) return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY mancante' });

    const sb = createClient(SUPABASE_URL, key, { auth: { persistSession: false } });
    const buf = Buffer.from(cookies, 'utf-8');
    const { error } = await sb.storage.from('canzoni').upload('_config/yt_cookies.txt', buf, {
        contentType: 'text/plain',
        upsert: true,
    });

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true, savedAt: new Date().toISOString() });
};
