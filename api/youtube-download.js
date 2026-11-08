const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://eejdpophfxsrqdvsucye.supabase.co';

function extractVideoId(url) {
    const m = url.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/);
    return m ? m[1] : null;
}

// Client InnerTube in ordine di preferenza
const CLIENTS = [
    {
        name: 'ANDROID',
        key: 'AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w',
        headers: {
            'X-YouTube-Client-Name': '3',
            'X-YouTube-Client-Version': '17.36.4',
            'User-Agent': 'com.google.android.youtube/17.36.4 (Linux; U; Android 12; GB) gzip',
        },
        context: {
            client: {
                clientName: 'ANDROID', clientVersion: '17.36.4',
                androidSdkVersion: 31, hl: 'en', gl: 'US',
                userAgent: 'com.google.android.youtube/17.36.4 (Linux; U; Android 12; GB) gzip',
            }
        },
    },
    {
        name: 'IOS',
        key: 'AIzaSyB-63vPrdThhKuerbB2N_l7Kwwcxj6yUAc',
        headers: {
            'X-YouTube-Client-Name': '5',
            'X-YouTube-Client-Version': '19.29.1',
            'User-Agent': 'com.google.ios.youtube/19.29.1 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X;)',
        },
        context: {
            client: {
                clientName: 'IOS', clientVersion: '19.29.1',
                deviceModel: 'iPhone16,2', hl: 'en', gl: 'US',
                userAgent: 'com.google.ios.youtube/19.29.1 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X;)',
            }
        },
    },
    {
        name: 'TVHTML5',
        key: 'AIzaSyDCU8hByM-4DrUqRUYnGn-3llEO78bcxq8',
        headers: {
            'X-YouTube-Client-Name': '7',
            'X-YouTube-Client-Version': '7.20230405.08.01',
            'User-Agent': 'Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0) AppleWebKit/538.1 (KHTML, like Gecko) Version/6.0 TV Safari/538.1',
        },
        context: {
            client: {
                clientName: 'TVHTML5', clientVersion: '7.20230405.08.01',
                hl: 'en', gl: 'US',
            }
        },
    },
];

async function getYouTubeAudio(videoId) {
    let lastErr = 'Nessun client disponibile';

    for (const client of CLIENTS) {
        try {
            const r = await fetch(
                `https://www.youtube.com/youtubei/v1/player?key=${client.key}&prettyPrint=false`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...client.headers },
                    body: JSON.stringify({ videoId, context: client.context }),
                }
            );

            if (!r.ok) { lastErr = `${client.name}: HTTP ${r.status}`; continue; }

            const data = await r.json();
            const status = data.playabilityStatus?.status;
            if (status === 'LOGIN_REQUIRED') throw new Error('Video privato o richiede login');
            if (status !== 'OK') { lastErr = `${client.name}: ${data.playabilityStatus?.reason || status}`; continue; }

            const formats = (data.streamingData?.adaptiveFormats || [])
                .filter(f => f.mimeType?.startsWith('audio/') && f.url);
            if (!formats.length) { lastErr = `${client.name}: nessun formato audio`; continue; }

            const best = formats.sort((a, b) => {
                const aS = (a.mimeType.includes('mp4') ? 1e9 : 0) + (a.bitrate || 0);
                const bS = (b.mimeType.includes('mp4') ? 1e9 : 0) + (b.bitrate || 0);
                return bS - aS;
            })[0];

            return {
                title: data.videoDetails?.title || 'Canzone',
                duration: parseInt(data.videoDetails?.lengthSeconds) || null,
                audioUrl: best.url,
                ext: best.mimeType.includes('mp4') ? 'm4a' : 'webm',
                contentType: best.mimeType.split(';')[0],
                clientUsed: client.name,
            };
        } catch (e) {
            if (e.message.includes('privato')) throw e;
            lastErr = `${client.name}: ${e.message}`;
        }
    }

    throw new Error(lastErr);
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

        const audioRes = await fetch(audioUrl, {
            headers: { 'User-Agent': 'com.google.android.youtube/17.36.4 (Linux; U; Android 12; GB) gzip' }
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
