const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://eejdpophfxsrqdvsucye.supabase.co';

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).end();

    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!key) return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY non configurata' });

    const { file, fileName, annuncioId, email, ordine = 0 } = req.body || {};
    if (!file || !fileName || !annuncioId || !email) {
        return res.status(400).json({ error: 'Campi richiesti: file, fileName, annuncioId, email' });
    }

    const matches = file.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) return res.status(400).json({ error: 'Formato file non valido' });
    const contentType = matches[1];
    const buffer = Buffer.from(matches[2], 'base64');

    const sb = createClient(SUPABASE_URL, key, { auth: { persistSession: false } });

    const ext = fileName.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `${email}/${annuncioId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

    const { error: upErr } = await sb.storage.from('vendita-foto').upload(path, buffer, {
        contentType,
        upsert: false
    });
    if (upErr) return res.status(500).json({ error: 'Storage: ' + upErr.message });

    const { data: { publicUrl } } = sb.storage.from('vendita-foto').getPublicUrl(path);

    const { error: insErr } = await sb.from('vendita_foto').insert({
        annuncio_id: parseInt(annuncioId),
        url: publicUrl,
        ordine: parseInt(ordine)
    });
    if (insErr) {
        await sb.storage.from('vendita-foto').remove([path]);
        return res.status(500).json({ error: 'DB: ' + insErr.message });
    }

    return res.status(200).json({ ok: true, publicUrl });
};
