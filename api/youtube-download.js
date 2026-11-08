const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://eejdpophfxsrqdvsucye.supabase.co';

function extractVideoId(url) {
    const m = url.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/);
    return m ? m[1] : null;
}

// Chiama l'API InnerTube con il client Android — bypassa il bot-check
async function getYouTubeAudio(videoId) {
    const r = await fetch('https://www.youtube.com/youtubei/v1/player', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'com.google.android.youtube/17.36.4 (Linux; U; Android 12; GB) gzip',
            'X-YouTube-Client-Name': '3',
            'X-YouTube-Client-Version': '17.36.4',
            'Origin': 'https://www.youtube.com',
        },
        body: JSON.stringify({
            videoId,
            context: {
                client: {
                    clientName: 'ANDROID',
                    clientVersion: '17.36.4',
                    androidSdkVersion: 31,
                    hl: 'en',
                    gl: 'US',
                }
            }
        })
    });

    if (!r.ok) throw new Error('YouTube API errore: ' + r.status);
    const data = await r.json();

    const status = data.playabilityStatus?.status;
    if (status === 'LOGIN_REQUIRED') throw new Error('Video privato o richiede login');
    if (status !== 'OK') throw new Error('Video non disponibile: ' + (data.playabilityStatus?.reason || status));

    const title = data.videoDetails?.title || 'Canzone';
    const duration = parseInt(data.videoDetails?.lengthSeconds) || null;

    const formats = (data.streamingData?.adaptiveFormats || [])
        .filter(f => f.mimeType?.startsWith('audio/') && f.url);

    if (!formats.length) throw new Error('Nessuno stream audio trovato');

    // Preferisci m4a (audio/mp4), poi il bitrate più alto
    const best = formats.sort((a, b) => {
        const aS = (a.mimeType.includes('mp4') ? 1e9 : 0) + (a.bitrate || 0);
        const bS = (b.mimeType.includes('mp4') ? 1e9 : 0) + (b.bitrate || 0);
        return bS - aS;
    })[0];

    const ext = best.mimeType.includes('mp4') ? 'm4a' : 'webm';
    const contentType = best.mimeType.split(';')[0];

    return { title, duration, audioUrl: best.url, ext, contentType };
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

        const { title: rawTitle, duration, audioUrl, ext, contentType } = await getYouTubeAudio(videoId);

        let titolo = rawTitle;
        let artista = null;
        if (rawTitle.includes(' - ')) {
            const [a, t] = rawTitle.split(' - ', 2);
            artista = a.trim();
            titolo = t.trim();
        }

        // Scarica audio direttamente dal CDN YouTube
        const audioRes = await fetch(audioUrl, {
            headers: {
                'User-Agent': 'com.google.android.youtube/17.36.4 (Linux; U; Android 12; GB) gzip',
                'Referer': 'https://www.youtube.com/',
            }
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
