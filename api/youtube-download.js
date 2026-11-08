const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://eejdpophfxsrqdvsucye.supabase.co';

const PIPED = [
    'https://pipedapi.kavin.rocks',
    'https://api.piped.projectsegfau.lt',
    'https://piped-api.privacy.com.de',
];

function extractVideoId(url) {
    const m = url.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/);
    return m ? m[1] : null;
}

async function getPipedInfo(videoId) {
    for (const base of PIPED) {
        try {
            const r = await fetch(`${base}/streams/${videoId}`, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                signal: AbortSignal.timeout(8000)
            });
            if (!r.ok) continue;
            const data = await r.json();
            if (data.error) continue;
            const streams = data.audioStreams || [];
            if (!streams.length) continue;
            // Prefer mp4/m4a over webm, then highest bitrate
            const best = streams.sort((a, b) => {
                const aS = (a.mimeType?.includes('mp4') ? 1e6 : 0) + (a.bitrate || 0);
                const bS = (b.mimeType?.includes('mp4') ? 1e6 : 0) + (b.bitrate || 0);
                return bS - aS;
            })[0];
            const ext = best.mimeType?.includes('mp4') ? 'm4a' : 'webm';
            const contentType = (best.mimeType || 'audio/mp4').split(';')[0];
            return { title: data.title || 'Canzone', duration: data.duration || null, audioUrl: best.url, ext, contentType };
        } catch { continue; }
    }
    throw new Error('Nessuna istanza Piped raggiungibile, riprova tra qualche minuto');
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

        const videoId = extractVideoId(url);
        if (!videoId) return res.status(400).json({ error: 'URL YouTube non valido' });

        const { title: rawTitle, duration, audioUrl, ext, contentType } = await getPipedInfo(videoId);

        let titolo = rawTitle;
        let artista = null;
        if (rawTitle.includes(' - ')) {
            const [a, t] = rawTitle.split(' - ', 2);
            artista = a.trim();
            titolo = t.trim();
        }

        // Download audio da Piped proxy
        const audioRes = await fetch(audioUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://piped.kavin.rocks/' }
        });
        if (!audioRes.ok) return res.status(500).json({ error: 'Download audio fallito (' + audioRes.status + ')' });
        const buffer = Buffer.from(await audioRes.arrayBuffer());

        const sb = createClient(SUPABASE_URL, key, { auth: { persistSession: false } });
        const slug = email_utente.replace(/[^a-zA-Z0-9]/g, '_');
        const fname = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const storagePath = `${slug}/audio/${fname}`;

        const { error: upErr } = await sb.storage.from('canzoni').upload(storagePath, buffer, { contentType });
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
            durata_sec: duration,
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
