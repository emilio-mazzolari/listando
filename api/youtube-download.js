const { createClient } = require('@supabase/supabase-js');
const ytDlp = require('yt-dlp-exec');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://eejdpophfxsrqdvsucye.supabase.co';

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).end();

    const id = Date.now();
    const tmpTemplate = `/tmp/${id}.%(ext)s`;
    let tmpFile = null;

    try {
        const key = process.env.SUPABASE_SERVICE_KEY;
        if (!key) return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY non configurata' });

        const { url, email_utente, playlist_id } = req.body || {};
        if (!url || !email_utente) return res.status(400).json({ error: 'url e email_utente richiesti' });
        if (!url.match(/youtube\.com\/watch|youtu\.be\/|shorts\//)) {
            return res.status(400).json({ error: 'URL YouTube non valido' });
        }

        // Ottieni metadati video
        const info = await ytDlp(url, {
            dumpSingleJson: true,
            noPlaylist: true,
            noWarnings: true,
            extractorArgs: 'youtube:player_client=android',
        });

        const rawTitle = info.title || 'Canzone';
        const duration = info.duration ? Math.round(info.duration) : null;

        let titolo = rawTitle;
        let artista = null;
        if (rawTitle.includes(' - ')) {
            const [a, t] = rawTitle.split(' - ', 2);
            artista = a.trim();
            titolo = t.trim();
        }

        // Scarica audio (m4a nativo, nessun ffmpeg richiesto)
        await ytDlp(url, {
            format: 'bestaudio[ext=m4a]/bestaudio',
            output: tmpTemplate,
            noPlaylist: true,
            noWarnings: true,
            quiet: true,
            extractorArgs: 'youtube:player_client=android',
        });

        // Trova il file creato
        const files = fs.readdirSync('/tmp').filter(f => f.startsWith(String(id)));
        if (!files.length) return res.status(500).json({ error: 'File audio non trovato dopo il download' });
        tmpFile = `/tmp/${files[0]}`;
        const ext = path.extname(files[0]).slice(1) || 'm4a';
        const contentType = ext === 'm4a' ? 'audio/mp4' : 'audio/webm';

        const buffer = fs.readFileSync(tmpFile);

        // Upload su Supabase storage
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
    } finally {
        try { if (tmpFile && fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch {}
    }
};
