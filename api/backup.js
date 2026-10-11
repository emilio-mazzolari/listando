const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://eejdpophfxsrqdvsucye.supabase.co';

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

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!key) return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY non configurata' });

    const email = req.query.email;
    if (!email) return res.status(400).json({ error: 'email richiesta' });

    const sb = createClient(SUPABASE_URL, key, { auth: { persistSession: false } });
    const tables = await fetchUserData(sb, email);

    const backup = {
        email,
        version: 1,
        createdAt: new Date().toISOString(),
        tables,
    };

    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json(backup);
};

module.exports.fetchUserData = fetchUserData;
