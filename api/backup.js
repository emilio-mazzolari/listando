const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://eejdpophfxsrqdvsucye.supabase.co';
const BUCKET = 'backups';
const MAX_BACKUPS_PER_USER = 4;

const TABLES = [
    'note', 'hobby', 'hobby_sessioni',
    'sv_viaggi', 'sv_partecipanti', 'sv_spese',
    'valigie', 'cose_valigia',
    'vendita_annunci',
    'todo',
];

async function fetchUserData(sb, email) {
    const tables = {};
    for (const table of TABLES) {
        try {
            const { data, error } = await sb.from(table).select('*').eq('email_utente', email);
            if (!error && data) tables[table] = data;
        } catch (e) {}
    }
    return tables;
}

async function getAllEmails(sb) {
    const emails = new Set();
    for (const table of ['note', 'sv_viaggi', 'valigie', 'hobby']) {
        try {
            const { data } = await sb.from(table).select('email_utente');
            if (data) data.forEach(r => r.email_utente && emails.add(r.email_utente));
        } catch (e) {}
    }
    return [...emails];
}

async function ensureBucket(sb) {
    const { data: buckets } = await sb.storage.listBuckets();
    if (buckets && buckets.some(b => b.name === BUCKET)) return;
    await sb.storage.createBucket(BUCKET, { public: false });
}

async function pruneOldBackups(sb, email) {
    const { data: files } = await sb.storage.from(BUCKET).list(email, { sortBy: { column: 'created_at', order: 'asc' } });
    if (!files || files.length <= MAX_BACKUPS_PER_USER) return;
    const toDelete = files.slice(0, files.length - MAX_BACKUPS_PER_USER).map(f => `${email}/${f.name}`);
    await sb.storage.from(BUCKET).remove(toDelete);
}

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!key) return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY non configurata' });

    const sb = createClient(SUPABASE_URL, key, { auth: { persistSession: false } });

    // GET: download backup o recovery album foto
    if (req.method === 'GET') {
        const email = req.query.email;
        if (!email) return res.status(400).json({ error: 'email richiesta' });

        // ?action=recover-album&album_id=X — ripristina righe foto da storage
        if (req.query.action === 'recover-album') {
            const albumId = parseInt(req.query.album_id);
            if (!albumId) return res.status(400).json({ error: 'album_id richiesto' });

            const slug = email.replace(/[^a-zA-Z0-9]/g, '_');
            const prefix = `${slug}/${albumId}`;

            const { data: files, error: listErr } = await sb.storage.from('foto').list(prefix);
            if (listErr) return res.status(500).json({ error: 'Storage list: ' + listErr.message });
            if (!files || !files.length) return res.status(200).json({ recovered: 0, message: 'Nessun file trovato nel bucket per questo album' });

            // Prende gli storage_path già presenti nel DB per evitare duplicati
            const { data: existing } = await sb.from('foto').select('storage_path').eq('album_id', albumId);
            const existingPaths = new Set((existing || []).map(r => r.storage_path));

            let recovered = 0;
            const errors = [];
            for (const file of files) {
                const path = `${prefix}/${file.name}`;
                if (existingPaths.has(path)) continue;
                const { data: { publicUrl } } = sb.storage.from('foto').getPublicUrl(path);
                const ext = file.name.split('.').pop().toLowerCase();
                const isVideo = ['mp4','mov','webm','avi','mkv','m4v'].includes(ext);
                const mediaType = isVideo ? 'video' : (file.metadata?.mimetype || 'image/jpeg');
                const { error: insErr } = await sb.from('foto').insert({
                    album_id: albumId,
                    email_utente: email,
                    storage_path: path,
                    url: publicUrl,
                    size_bytes: file.metadata?.size || 0,
                    sort_order: new Date(file.created_at || Date.now()).getTime(),
                    media_type: mediaType,
                });
                if (insErr) errors.push({ file: file.name, error: insErr.message });
                else recovered++;
            }
            return res.status(200).json({ recovered, total: files.length, errors });
        }

        const tables = await fetchUserData(sb, email);
        return res.status(200).json({ email, version: 1, createdAt: new Date().toISOString(), tables });
    }

    // POST: cron automatico — salva backup su storage per tutti gli utenti
    if (req.method === 'POST') {
        const secret = process.env.CRON_SECRET;
        if (secret && req.headers['authorization'] !== `Bearer ${secret}`) {
            return res.status(401).json({ error: 'Non autorizzato' });
        }
        await ensureBucket(sb);
        const emails = await getAllEmails(sb);
        const date = new Date().toISOString().slice(0, 10);
        const results = [];
        for (const email of emails) {
            try {
                const tables = await fetchUserData(sb, email);
                const json = JSON.stringify({ email, version: 1, createdAt: new Date().toISOString(), tables });
                const path = `${email}/backup_${date}.json`;
                const { error } = await sb.storage.from(BUCKET).upload(path, Buffer.from(json), { contentType: 'application/json', upsert: true });
                await pruneOldBackups(sb, email);
                results.push({ email, ok: !error, error: error?.message });
            } catch (e) {
                results.push({ email, ok: false, error: e.message });
            }
        }
        return res.status(200).json({ ok: true, date, users: results.length, results });
    }

    return res.status(405).end();
};
