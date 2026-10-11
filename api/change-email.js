const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://eejdpophfxsrqdvsucye.supabase.co';

let _sb;
function getSb() {
    if (!_sb) {
        const key = process.env.SUPABASE_SERVICE_KEY;
        if (!key) throw new Error('SUPABASE_SERVICE_KEY non configurata');
        _sb = createClient(SUPABASE_URL, key, { auth: { persistSession: false } });
    }
    return _sb;
}

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).end();

    const { oldEmail, newEmail } = req.body || {};
    if (!oldEmail || !newEmail) return res.status(400).json({ error: 'Email mancante' });
    if (oldEmail === newEmail) return res.status(400).json({ error: 'La nuova email è uguale a quella attuale' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) return res.status(400).json({ error: 'Formato email non valido' });

    let sb;
    try { sb = getSb(); } catch (e) { return res.status(500).json({ error: e.message }); }

    // Find user in auth by current email
    const { data: { users }, error: listErr } = await sb.auth.admin.listUsers({ perPage: 1000 });
    if (listErr) return res.status(500).json({ error: listErr.message });

    const user = users.find(u => u.email?.toLowerCase() === oldEmail.toLowerCase());
    if (!user) return res.status(404).json({ error: 'Utente non trovato' });

    // Check new email is not already taken
    const alreadyTaken = users.find(u => u.email?.toLowerCase() === newEmail.toLowerCase());
    if (alreadyTaken) return res.status(409).json({ error: 'Email già in uso da un altro account' });

    // Update Supabase Auth email
    const { error: authErr } = await sb.auth.admin.updateUserById(user.id, {
        email: newEmail,
        email_confirm: true
    });
    if (authErr) return res.status(500).json({ error: authErr.message });

    // Update all data tables
    const tables = [
        { table: 'profili',              col: 'email_utente' },
        { table: 'todo',                 col: 'email_utente' },
        { table: 'push_subscriptions',   col: 'email_utente' },
        { table: 'canzoni',              col: 'email_utente' },
        { table: 'canzoni_playlist',     col: 'email_utente' },
        { table: 'feedback',             col: 'email_utente' },
        { table: 'canzoni_condivisioni', col: 'email_mittente' },
        { table: 'canzoni_condivisioni', col: 'email_destinatario' },
        { table: 'debiti_crediti',       col: 'email_utente' },
        { table: 'desideri',             col: 'email_utente' },
        { table: 'film',                 col: 'email_utente' },
        { table: 'foto',                 col: 'email_utente' },
        { table: 'foto_album',           col: 'email_utente' },
        { table: 'libri',                col: 'email_utente' },
        { table: 'luoghi',               col: 'email_utente' },
        { table: 'password_vault',       col: 'email_utente' },
        { table: 'ricette',              col: 'email_utente' },
        { table: 'spesa_lista',          col: 'email_utente' },
        { table: 'sv_risparmi',          col: 'email_utente' },
        { table: 'sv_risparmi_doc',      col: 'email_utente' },
        { table: 'sv_risparmi_snapshot', col: 'email_utente' },
        { table: 'sv_utenze',            col: 'email_utente' },
        { table: 'sv_viaggi',            col: 'email_utente' },
        { table: 'sv_partecipanti',      col: 'email_utente' },
        { table: 'sv_partecipanti',      col: 'email_collegata' },
        { table: 'sv_spese',             col: 'email_utente' },
        { table: 'sv_budget',            col: 'email_utente' },
        { table: 'valigie',              col: 'email_utente' },
        { table: 'cose_valigia',         col: 'email_utente' },
        { table: 'documenti_valigia',    col: 'email_utente' },
    ];

    for (const { table, col } of tables) {
        const { error } = await sb.from(table).update({ [col]: newEmail }).eq(col, oldEmail);
        // Ignore "table not found" errors in case some tables don't exist yet
        if (error && !error.message.includes('does not exist') && !error.code?.includes('42P01')) {
            console.error(`Error updating ${table}.${col}:`, error.message);
        }
    }

    return res.status(200).json({ ok: true });
};
