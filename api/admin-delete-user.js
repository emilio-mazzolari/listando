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
    // Secured by CRON_SECRET — only superadmin can call this
    const secret = process.env.CRON_SECRET;
    if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
        return res.status(401).end();
    }
    if (req.method !== 'POST') return res.status(405).end();

    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: 'email mancante' });

    let sb;
    try { sb = getSb(); } catch (e) { return res.status(500).json({ error: e.message }); }

    // Find user in auth
    const { data: { users }, error: listErr } = await sb.auth.admin.listUsers({ perPage: 1000 });
    if (listErr) return res.status(500).json({ error: listErr.message });

    const user = users.find(u => u.email?.toLowerCase() === email.toLowerCase());
    if (!user) return res.status(404).json({ error: 'Utente non trovato in auth' });

    // Delete from all data tables first
    const tables = ['todo', 'push_subscriptions', 'profili', 'canzoni', 'feedback'];
    const deleted = {};
    for (const table of tables) {
        const { count, error } = await sb.from(table).delete({ count: 'exact' }).eq('email_utente', email);
        if (!error) deleted[table] = count ?? 0;
    }
    // canzoni_condivisioni
    await sb.from('canzoni_condivisioni').delete().eq('email_mittente', email);
    await sb.from('canzoni_condivisioni').delete().eq('email_destinatario', email);

    // Delete from Supabase Auth
    const { error: delErr } = await sb.auth.admin.deleteUser(user.id);
    if (delErr) return res.status(500).json({ error: delErr.message, deleted });

    return res.status(200).json({ ok: true, deletedUserId: user.id, deletedData: deleted });
};
