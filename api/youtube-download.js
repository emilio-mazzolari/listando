const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://eejdpophfxsrqdvsucye.supabase.co';

function extractVideoId(url) {
    const m = url.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/);
    return m ? m[1] : null;
}

// Client ordinati dal più affidabile al meno (IP datacenter Vercel).
// TV_EMBED (85): embed context con URL video specifico, non richiede PO token.
// ANDROID v17 (3): versione vecchia, body minimale — 400 su v19 con campi extra.
// IOS v17 (5): stessa logica.
// WEB (1): ultimo tentativo, richiede cookie ma a volte passa con cookies.
const CLIENTS = [
    {
        name: 'TV_EMBED',
        headers: {
            'X-YouTube-Client-Name': '85',
            'X-YouTube-Client-Version': '2.0',
            'User-Agent': 'Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0) AppleWebKit/538.1 (KHTML, like Gecko) Version/6.0 TV Safari/538.1',
            'Origin': 'https://www.youtube.com',
            'Referer': 'https://www.youtube.com/',
        },
        body: (videoId) => ({
            videoId,
            context: {
                client: {
                    clientName: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER',
                    clientVersion: '2.0',
                    hl: 'en', gl: 'US',
                },
                thirdParty: { embedUrl: `https://www.youtube.com/embed/${videoId}` },
            },
        }),
    },
    {
        name: 'ANDROID',
        headers: {
            'X-YouTube-Client-Name': '3',
            'X-YouTube-Client-Version': '17.31.35',
            'User-Agent': 'com.google.android.youtube/17.31.35 (Linux; U; Android 11) gzip',
        },
        body: (videoId) => ({
            videoId,
            context: {
                client: {
                    clientName: 'ANDROID',
                    clientVersion: '17.31.35',
                    hl: 'en', gl: 'US',
                },
            },
        }),
    },
    {
        name: 'IOS',
        headers: {
            'X-YouTube-Client-Name': '5',
            'X-YouTube-Client-Version': '17.33.2',
            'User-Agent': 'com.google.ios.youtube/17.33.2 (iPhone14,3; U; CPU iOS 15_6 like Mac OS X)',
        },
        body: (videoId) => ({
            videoId,
            context: {
                client: {
                    clientName: 'IOS',
                    clientVersion: '17.33.2',
                    deviceModel: 'iPhone14,3',
                    hl: 'en', gl: 'US',
                },
            },
        }),
    },
    {
        name: 'WEB',
        headers: {
            'X-YouTube-Client-Name': '1',
            'X-YouTube-Client-Version': '2.20231121.08.00',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
            'Origin': 'https://www.youtube.com',
            'Referer': 'https://www.youtube.com/',
        },
        body: (videoId) => ({
            videoId,
            context: {
                client: {
                    clientName: 'WEB',
                    clientVersion: '2.20231121.08.00',
                    hl: 'en', gl: 'US',
                },
            },
        }),
    },
];

async function getYTAudio(videoId, cookies) {
    const errors = [];
    for (const client of CLIENTS) {
        try {
            const headers = { 'Content-Type': 'application/json', ...client.headers };
            if (cookies) headers['Cookie'] = cookies;

            const r = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
                method: 'POST',
                headers,
                body: JSON.stringify(client.body(videoId)),
            });
            if (!r.ok) { errors.push(`${client.name}: HTTP ${r.status}`); continue; }

            const data = await r.json();
            const status = data.playabilityStatus?.status;
            if (status === 'LOGIN_REQUIRED') throw new Error('Video privato o richiede login');
            if (status !== 'OK') { errors.push(`${client.name}: ${data.playabilityStatus?.reason || status}`); continue; }

            const formats = (data.streamingData?.adaptiveFormats || [])
                .filter(f => f.mimeType?.startsWith('audio/') && f.url);
            if (!formats.length) { errors.push(`${client.name}: nessun formato audio`); continue; }

            const best = formats.sort((a, b) => {
                const sA = (a.mimeType.includes('mp4') ? 1e9 : 0) + (a.bitrate || 0);
                const sB = (b.mimeType.includes('mp4') ? 1e9 : 0) + (b.bitrate || 0);
                return sB - sA;
            })[0];

            return {
                title: data.videoDetails?.title || 'Canzone',
                duration: parseInt(data.videoDetails?.lengthSeconds) || null,
                audioUrl: best.url,
                ext: best.mimeType.includes('mp4') ? 'm4a' : 'webm',
                contentType: best.mimeType.split(';')[0],
            };
        } catch (e) {
            if (e.message.includes('privato')) throw e;
            errors.push(`${client.name}: ${e.message}`);
        }
    }
    throw new Error(errors.join(' | '));
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

        const { title: rawTitle, duration, audioUrl, ext, contentType } =
            await getYTAudio(videoId, process.env.YT_COOKIES || null);

        let titolo = rawTitle;
        let artista = null;
        if (rawTitle.includes(' - ')) {
            const [a, t] = rawTitle.split(' - ', 2);
            artista = a.trim();
            titolo = t.trim();
        }

        const audioRes = await fetch(audioUrl);
        if (!audioRes.ok) return res.status(500).json({ error: `Download audio fallito (${audioRes.status})` });
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
