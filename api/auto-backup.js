const { createClient } = require('@supabase/supabase-js');
const { fetchUserData } = require('./backup');

const SUPABASE_URL = 'https://eejdpophfxsrqdvsucye.supabase.co';
const BUCKET = 'backups';
const MAX_BACKUPS_PER_USER = 4;

async function getAllEmails(sb) {
    const sources = ['note', 'sv_viaggi', 'valigie', 'hobby'];
    const emails = new Set();
    for (const table of sources) {
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
    if (req.method === 'OPTIONS') return res.status(200).end();

    const secret = process.env.CRON_SECRET;
    const authHeader = req.headers['authorization'];
    if (secret && authHeader !== `Bearer ${secret}`) {
        return res.status(401).json({ error: 'Non autorizzato' });
    }

    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!key) return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY non configurata' });

    const sb = createClient(SUPABASE_URL, key, { auth: { persistSession: false } });

    await ensureBucket(sb);

    const emails = await getAllEmails(sb);
    const results = [];
    const date = new Date().toISOString().slice(0, 10);

    for (const email of emails) {
        try {
            const tables = await fetchUserData(sb, email);
            const json = JSON.stringify({ email, version: 1, createdAt: new Date().toISOString(), tables });
            const path = `${email}/backup_${date}.json`;
            const { error } = await sb.storage.from(BUCKET).upload(path, Buffer.from(json), {
                contentType: 'application/json',
                upsert: true,
            });
            await pruneOldBackups(sb, email);
            results.push({ email, ok: !error, error: error?.message });
        } catch (e) {
            results.push({ email, ok: false, error: e.message });
        }
    }

    return res.status(200).json({ ok: true, date, users: results.length, results });
};
