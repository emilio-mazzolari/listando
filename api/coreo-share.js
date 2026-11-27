const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://eejdpophfxsrqdvsucye.supabase.co';

function makeToken(n = 14) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let s = '';
    for (let i = 0; i < n; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const KEY = process.env.SUPABASE_SERVICE_KEY;
    if (!KEY) return res.status(500).json({ error: 'server config error' });
    const sb = createClient(SUPABASE_URL, KEY);

    if (req.method === 'POST') {
        const body = req.body;
        if (!body?.coreo) return res.status(400).json({ error: 'coreo mancante' });
        const token = makeToken(14);
        const { error } = await sb.from('coreo_links').insert({
            token,
            coreo_snapshot: body.coreo,
            canzone_titolo: (body.titolo || '').slice(0, 300),
            canzone_artista: (body.artista || '').slice(0, 300),
            canzone_bpm: body.bpm || null,
            modificabile: !!body.modificabile,
            email_mittente: (body.email || '').slice(0, 300)
        });
        if (error) return res.status(500).json({ error: error.message });
        return res.json({ token });
    }

    if (req.method === 'GET') {
        const { token } = req.query;
        if (!token) return res.status(400).json({ error: 'token mancante' });
        const { data, error } = await sb
            .from('coreo_links')
            .select('token,coreo_snapshot,canzone_titolo,canzone_artista,canzone_bpm,modificabile')
            .eq('token', token)
            .single();
        if (error || !data) return res.status(404).json({ error: 'link non trovato' });
        return res.json(data);
    }

    if (req.method === 'PUT') {
        const { token } = req.query;
        if (!token) return res.status(400).json({ error: 'token mancante' });
        const { data: row } = await sb
            .from('coreo_links').select('modificabile').eq('token', token).single();
        if (!row?.modificabile) return res.status(403).json({ error: 'link in sola lettura' });
        const body = req.body;
        if (!body?.coreo) return res.status(400).json({ error: 'coreo mancante' });
        const { error } = await sb
            .from('coreo_links').update({ coreo_snapshot: body.coreo }).eq('token', token);
        if (error) return res.status(500).json({ error: error.message });
        return res.json({ ok: true });
    }

    return res.status(405).end();
};
