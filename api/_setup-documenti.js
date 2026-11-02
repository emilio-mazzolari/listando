const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://eejdpophfxsrqdvsucye.supabase.co';

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!key) return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY mancante' });

    const sb = createClient(SUPABASE_URL, key, { auth: { persistSession: false } });

    const { error } = await sb.storage.createBucket('documenti-foto', {
        public: true,
        allowedMimeTypes: ['image/*'],
        fileSizeLimit: 10 * 1024 * 1024
    });

    return res.status(200).json({
        ok: true,
        bucket: error?.message?.includes('already exists') ? 'già esistente' : (error ? 'ERRORE: ' + error.message : 'creato')
    });
};
