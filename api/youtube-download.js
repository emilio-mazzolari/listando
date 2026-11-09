const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://eejdpophfxsrqdvsucye.supabase.co';

function extractVideoId(url) {
    const m = url.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/);
    return m ? m[1] : null;
}

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
                client: { clientName: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER', clientVersion: '2.0', hl: 'en', gl: 'US' },
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
                client: { clientName: 'ANDROID', clientVersion: '17.31.35', hl: 'en', gl: 'US' },
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
                client: { clientName: 'IOS', clientVersion: '17.33.2', deviceModel: 'iPhone14,3', hl: 'en', gl: 'US' },
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
                client: { clientName: 'WEB', clientVersion: '2.20231121.08.00', hl: 'en', gl: 'US' },
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
            // LOGIN_REQUIRED senza cookie = IP datacenter bloccato: prova il prossimo client
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
            errors.push(`${client.name}: ${e.message}`);
        }
    }
    throw new Error(errors.join(' | '));
}

async function getYTAudioViaCobalt(videoId) {
    try {
        const r = await fetch('https://api.cobalt.tools/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
            body: JSON.stringify({
                url: `https://www.youtube.com/watch?v=${videoId}`,
                downloadMode: 'audio',
                audioFormat: 'best',
            }),
        });
        const text = await r.text();
        console.log(`cobalt status=${r.status} body=${text.slice(0, 200)}`);
        if (!r.ok) return null;
        const data = JSON.parse(text);
        if (!data.url || !['redirect', 'tunnel', 'stream'].includes(data.status)) return null;
        return { proxyUrl: data.url, filename: data.filename || `audio_${videoId}` };
    } catch (e) {
        console.error('cobalt error:', e.message);
        return null;
    }
}

async function getYTAudioViaPiped(videoId) {
    const INSTANCES = [
        'https://pipedapi.kavin.rocks',
        'https://api.piped.yt',
        'https://pipedapi.in.projectsegfau.lt',
        'https://pipedapi.darkness.services',
    ];
    for (const base of INSTANCES) {
        try {
            const r = await fetch(`${base}/streams/${videoId}`, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
            });
            console.log(`piped ${base} status=${r.status}`);
            if (!r.ok) continue;
            const data = await r.json();
            const streams = (data.audioStreams || []).filter(s => s.url);
            if (!streams.length) continue;
            const best = streams.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
            return {
                title: data.title || 'Canzone',
                duration: Math.round(data.duration) || null,
                audioUrl: best.url,
                ext: best.mimeType?.includes('mp4') ? 'm4a' : 'webm',
                contentType: best.mimeType?.split(';')[0] || 'audio/mp4',
            };
        } catch (e) {
            console.error(`piped ${base} error:`, e.message);
        }
    }
    return null;
}

async function getCookies(sb) {
    if (process.env.YT_COOKIES) return process.env.YT_COOKIES;
    try {
        const { data, error } = await sb.storage.from('canzoni').download('_config/yt_cookies.txt');
        if (data && !error) return (await data.text()).trim() || null;
    } catch {}
    return null;
}

const YT_COOKIE_TOKEN = process.env.YT_COOKIE_TOKEN || 'yt2026listando';

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).end();

    // Route alternativa: salva cookie YouTube
    const { action, cookies: cookieStr, token } = req.body || {};
    if (action === 'save-cookies') {
        if (!cookieStr) return res.status(400).json({ error: 'cookies required' });
        if (token !== YT_COOKIE_TOKEN) return res.status(403).json({ error: 'token non valido' });
        const key = process.env.SUPABASE_SERVICE_KEY;
        if (!key) return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY mancante' });
        const sb = createClient(SUPABASE_URL, key, { auth: { persistSession: false } });
        const { error } = await sb.storage.from('canzoni').upload('_config/yt_cookies.txt',
            Buffer.from(cookieStr, 'utf-8'), { contentType: 'text/plain', upsert: true });
        if (error) return res.status(500).json({ error: error.message });
        return res.status(200).json({ ok: true, savedAt: new Date().toISOString() });
    }

    try {
        const key = process.env.SUPABASE_SERVICE_KEY;
        if (!key) return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY non configurata' });

        const { url, email_utente, playlist_id } = req.body || {};
        if (!url || !email_utente) return res.status(400).json({ error: 'url e email_utente richiesti' });

        const videoId = extractVideoId(url);
        if (!videoId) return res.status(400).json({ error: 'URL YouTube non valido' });

        const sb = createClient(SUPABASE_URL, key, { auth: { persistSession: false } });
        const cookies = await getCookies(sb);

        let audioInfo;
        let cobaltProxy = null;
        try {
            audioInfo = await getYTAudio(videoId, cookies);
        } catch (ytErr) {
            // Fallback 1: cobalt.tools (servizio dedicato al download media)
            cobaltProxy = await getYTAudioViaCobalt(videoId);
            if (!cobaltProxy) {
                // Fallback 2: Piped
                audioInfo = await getYTAudioViaPiped(videoId);
                if (!audioInfo) throw ytErr;
            }
        }

        // Se cobalt ha restituito un URL diretto, scarica da lì e salta il parsing metadata
        if (cobaltProxy) {
            const audioRes = await fetch(cobaltProxy.proxyUrl);
            if (!audioRes.ok) throw new Error(`Cobalt download fallito (${audioRes.status})`);
            const buffer = Buffer.from(await audioRes.arrayBuffer());
            const fname = cobaltProxy.filename || `audio_${videoId}`;
            const ext2 = fname.endsWith('.webm') ? 'webm' : 'm4a';
            const slug = email_utente.replace(/[^a-zA-Z0-9]/g, '_');
            const storagePath = `${slug}/audio/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext2}`;
            const { error: upErr } = await sb.storage.from('canzoni').upload(storagePath, buffer, { contentType: ext2 === 'webm' ? 'audio/webm' : 'audio/mp4' });
            if (upErr) return res.status(500).json({ error: 'Storage: ' + upErr.message });
            const { data: { publicUrl } } = sb.storage.from('canzoni').getPublicUrl(storagePath);
            const titolo = videoId;
            const { data: song, error: dbErr } = await sb.from('canzoni').insert({
                email_utente, playlist_id: playlist_id || null, titolo, artista: null,
                storage_path: storagePath, url: publicUrl,
                size_bytes: buffer.length, durata_sec: null, sort_order: Date.now()
            }).select().single();
            if (dbErr) { await sb.storage.from('canzoni').remove([storagePath]); return res.status(500).json({ error: 'DB: ' + dbErr.message }); }
            return res.status(200).json({ ok: true, song });
        }

        const { title: rawTitle, duration, audioUrl, ext, contentType } = audioInfo;

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
