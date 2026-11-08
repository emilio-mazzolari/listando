const { createClient } = require('@supabase/supabase-js');
const ytdl = require('@distube/ytdl-core');

const SUPABASE_URL = 'https://eejdpophfxsrqdvsucye.supabase.co';

function streamToBuffer(stream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', c => chunks.push(c));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
    });
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

        const ytCookies = process.env.YT_COOKIES;
        if (!ytCookies) {
            return res.status(500).json({
                error: 'YT_COOKIES non configurata — vai su Vercel → listando → Settings → Environment Variables e aggiungi YT_COOKIES con i cookie di sessione YouTube'
            });
        }

        const { url, email_utente, playlist_id } = req.body || {};
        if (!url || !email_utente) return res.status(400).json({ error: 'url e email_utente richiesti' });
        if (!ytdl.validateURL(url)) return res.status(400).json({ error: 'URL YouTube non valido' });

        // createAgent è il modo corretto per passare cookie in ytdl-core v4
        const cookieObjects = ytCookies.split(';').map(c => {
            const eq = c.indexOf('=');
            if (eq === -1) return null;
            return { name: c.substring(0, eq).trim(), value: c.substring(eq + 1).trim() };
        }).filter(Boolean);
        const agent = ytdl.createAgent(cookieObjects);

        const info = await ytdl.getInfo(url, { agent });
        const rawTitle = info.videoDetails.title;
        const durationSec = parseInt(info.videoDetails.lengthSeconds) || null;

        let titolo = rawTitle;
        let artista = null;
        if (rawTitle.includes(' - ')) {
            const [a, t] = rawTitle.split(' - ', 2);
            artista = a.trim();
            titolo = t.trim();
        }

        const formats = ytdl.filterFormats(info.formats, 'audioonly');
        const format = formats.sort((a, b) => (b.audioBitrate || 0) - (a.audioBitrate || 0))[0];
        if (!format) return res.status(400).json({ error: 'Nessun formato audio disponibile' });

        const ext = format.container || 'webm';
        const contentType = (format.mimeType || 'audio/webm').split(';')[0];

        const stream = ytdl.downloadFromInfo(info, { format, agent });
        const buffer = await streamToBuffer(stream);

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
            durata_sec: durationSec,
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
