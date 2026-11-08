const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://eejdpophfxsrqdvsucye.supabase.co';

async function getTitle(youtubeUrl) {
    try {
        const r = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(youtubeUrl)}&format=json`);
        if (!r.ok) return null;
        return (await r.json()).title || null;
    } catch { return null; }
}

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).end();

    try {
        const key = process.env.SUPABASE_SERVICE_KEY;
        if (!key) return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY non configurata' });

        const { url, email_utente, playlist_id } = req.body || {};
        if (!url || !email_utente) return res.status(400).json({ error: 'url e email_utente richiesti' });
        if (!url.match(/youtube\.com\/watch|youtu\.be\//)) {
            return res.status(400).json({ error: 'URL YouTube non valido' });
        }

        // Titolo via oEmbed (nessuna autenticazione richiesta)
        const rawTitle = await getTitle(url) || 'Canzone';
        let titolo = rawTitle;
        let artista = null;
        if (rawTitle.includes(' - ')) {
            const [a, t] = rawTitle.split(' - ', 2);
            artista = a.trim();
            titolo = t.trim();
        }

        // URL audio via cobalt.tools (gestisce il bot-check di YouTube)
        const cobaltRes = await fetch('https://api.cobalt.tools', {
            method: 'POST',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, downloadMode: 'audio', audioFormat: 'mp3', filenameStyle: 'basic' })
        });
        const cobalt = await cobaltRes.json();
        if (cobalt.status === 'error') {
            return res.status(400).json({ error: 'cobalt: ' + (cobalt.error?.code || 'errore sconosciuto') });
        }
        const audioUrl = cobalt.url;
        if (!audioUrl) return res.status(500).json({ error: 'Nessun URL audio ricevuto' });

        // Download audio
        const audioRes = await fetch(audioUrl);
        if (!audioRes.ok) return res.status(500).json({ error: 'Download audio fallito (' + audioRes.status + ')' });
        const buffer = Buffer.from(await audioRes.arrayBuffer());

        // Upload su Supabase storage
        const sb = createClient(SUPABASE_URL, key, { auth: { persistSession: false } });
        const slug = email_utente.replace(/[^a-zA-Z0-9]/g, '_');
        const fname = `${Date.now()}_${Math.random().toString(36).slice(2)}.mp3`;
        const storagePath = `${slug}/audio/${fname}`;

        const { error: upErr } = await sb.storage.from('canzoni').upload(storagePath, buffer, { contentType: 'audio/mpeg' });
        if (upErr) return res.status(500).json({ error: 'Storage: ' + upErr.message });

        const { data: { publicUrl } } = sb.storage.from('canzoni').getPublicUrl(storagePath);

        const { data: song, error: dbErr } = await sb.from('canzoni').insert({
            email_utente,
            playlist_id: playlist_id || null,
            titolo,
            artista,
            storage_path: storagePath,
            url: publicUrl,
            size_bytes: buffer.length,
            durata_sec: null,
            sort_order: Date.now()
        }).select().single();

        if (dbErr) {
            await sb.storage.from('canzoni').remove([storagePath]);
            return res.status(500).json({ error: 'DB: ' + dbErr.message });
        }

        return res.status(200).json({ ok: true, song });
    } catch (err) {
        console.error('youtube-download error:', err);
        return res.status(500).json({ error: err?.message || 'Errore interno' });
    }
};
