const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://eejdpophfxsrqdvsucye.supabase.co';

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!key) return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY non configurata' });

    const sb = createClient(SUPABASE_URL, key, { auth: { persistSession: false } });
    const log = [];

    // 1 ─ Create public storage bucket for listing photos
    const { error: bucketErr } = await sb.storage.createBucket('vendita-foto', {
        public: true,
        allowedMimeTypes: ['image/*'],
        fileSizeLimit: 5 * 1024 * 1024
    });
    if (bucketErr && !bucketErr.message?.includes('already exists')) {
        log.push({ bucket: 'ERROR: ' + bucketErr.message });
    } else {
        log.push({ bucket: bucketErr ? 'già esistente' : '✓ creato' });
    }

    // 2 ─ Enable Realtime on vendita_chat via raw SQL through pg_net workaround:
    //     Supabase exposes ALTER PUBLICATION via the sql endpoint with service key
    try {
        const sqlResp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': key,
                'Authorization': `Bearer ${key}`
            },
            body: JSON.stringify({ query: 'ALTER PUBLICATION supabase_realtime ADD TABLE vendita_chat;' })
        });
        log.push({ realtime_rpc: sqlResp.ok ? '✓ abilitato' : 'fallback necessario (vedi istruzioni)' });
    } catch {
        log.push({ realtime_rpc: 'non disponibile — abilita manualmente dal dashboard' });
    }

    // 3 ─ Fallback: try via supabase-js pg endpoint
    try {
        const { error: rtErr } = await sb
            .from('_realtime_subscription_check')
            .select('*')
            .limit(0);
        // Doesn't matter if it errors — we just use the service key to call SQL directly
        const sqlUrl = `${SUPABASE_URL}/pg/query`;
        const pgResp = await fetch(sqlUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': key,
                'Authorization': `Bearer ${key}`
            },
            body: JSON.stringify({ query: 'ALTER PUBLICATION supabase_realtime ADD TABLE vendita_chat;' })
        });
        if (pgResp.ok) log.push({ realtime_pg: '✓ abilitato' });
    } catch {}

    return res.status(200).json({
        ok: true,
        results: log,
        istruzioni: 'Se realtime non è stato abilitato automaticamente, esegui nel SQL Editor di Supabase: ALTER PUBLICATION supabase_realtime ADD TABLE vendita_chat;'
    });
};
