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

    // GET: download backup per un singolo utente
    if (req.method === 'GET') {
        const email = req.query.email;
        if (!email) return res.status(400).json({ error: 'email richiesta' });
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
