const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://eejdpophfxsrqdvsucye.supabase.co';
const PROJECT_REF  = 'eejdpophfxsrqdvsucye';

const STATEMENTS = [
    `CREATE TABLE IF NOT EXISTS note (
        id bigint generated always as identity primary key,
        email_utente text not null,
        titolo text,
        contenuto text,
        colore text default '#fff9c4',
        pinned boolean default false,
        created_at timestamptz default now(),
        updated_at timestamptz default now()
    )`,
    `CREATE TABLE IF NOT EXISTS hobby (
        id bigint generated always as identity primary key,
        email_utente text not null,
        nome text not null,
        emoji text default '🎸',
        colore text default '#F97316',
        descrizione text,
        ore_totali numeric default 0,
        created_at timestamptz default now()
    )`,
    `CREATE TABLE IF NOT EXISTS hobby_sessioni (
        id bigint generated always as identity primary key,
        email_utente text not null,
        hobby_id bigint not null references hobby(id) on delete cascade,
        data date not null,
        durata_min int not null,
        note text,
        created_at timestamptz default now()
    )`,
    `ALTER TABLE canzoni_playlist ADD COLUMN IF NOT EXISTS parent_id bigint REFERENCES canzoni_playlist(id) ON DELETE SET NULL`,
    `CREATE TABLE IF NOT EXISTS vendita_annunci (
        id bigint generated always as identity primary key,
        email_utente text not null,
        titolo text not null,
        descrizione text,
        prezzo numeric(10,2),
        categoria text,
        condizione text default 'buono',
        visibilita text default 'pubblico',
        stato text default 'attivo',
        created_at timestamptz default now(),
        updated_at timestamptz default now()
    )`,
    `CREATE TABLE IF NOT EXISTS vendita_foto (
        id bigint generated always as identity primary key,
        annuncio_id bigint not null references vendita_annunci(id) on delete cascade,
        url text not null,
        ordine int default 0
    )`,
    `CREATE TABLE IF NOT EXISTS vendita_accesso (
        id bigint generated always as identity primary key,
        annuncio_id bigint not null references vendita_annunci(id) on delete cascade,
        email_utente text not null,
        unique(annuncio_id, email_utente)
    )`,
    `CREATE TABLE IF NOT EXISTS vendita_chat (
        id bigint generated always as identity primary key,
        annuncio_id bigint not null references vendita_annunci(id) on delete cascade,
        email_mittente text not null,
        email_venditore text not null,
        messaggio text not null,
        letto boolean default false,
        created_at timestamptz default now()
    )`,
    `ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS vendita_chat`,
    `CREATE TABLE IF NOT EXISTS note_condivisioni (
        id bigint generated always as identity primary key,
        note_id bigint not null references note(id) on delete cascade,
        email_condiviso text not null,
        unique(note_id, email_condiviso)
    )`,
    `ALTER TABLE IF EXISTS note_condivisioni DISABLE ROW LEVEL SECURITY`,
    `ALTER TABLE IF EXISTS vendita_annunci DISABLE ROW LEVEL SECURITY`,
    `ALTER TABLE IF EXISTS vendita_foto DISABLE ROW LEVEL SECURITY`,
    `ALTER TABLE IF EXISTS vendita_accesso DISABLE ROW LEVEL SECURITY`,
    `ALTER TABLE IF EXISTS vendita_chat DISABLE ROW LEVEL SECURITY`,
    `ALTER TABLE IF EXISTS valigie DISABLE ROW LEVEL SECURITY`,
    `ALTER TABLE IF EXISTS cose_valigia DISABLE ROW LEVEL SECURITY`,
    `ALTER TABLE IF EXISTS documenti_valigia DISABLE ROW LEVEL SECURITY`,
    `ALTER TABLE IF EXISTS catalogo_valigia DISABLE ROW LEVEL SECURITY`,
    `ALTER TABLE IF EXISTS categorie_valigia DISABLE ROW LEVEL SECURITY`,
    `ALTER TABLE IF EXISTS sv_viaggi DISABLE ROW LEVEL SECURITY`,
    // sv_spese: RLS ATTIVO (vedi supabase/migrations/20261018_sv_spese_visibilita.sql) — non disattivarlo qui
    `ALTER TABLE IF EXISTS sv_partecipanti DISABLE ROW LEVEL SECURITY`,
    `ALTER TABLE IF EXISTS sv_inviti DISABLE ROW LEVEL SECURITY`,
    `ALTER TABLE IF EXISTS sv_risparmi DISABLE ROW LEVEL SECURITY`,
    `ALTER TABLE IF EXISTS sv_risparmi_snapshot DISABLE ROW LEVEL SECURITY`,
    `ALTER TABLE IF EXISTS sv_risparmi_doc DISABLE ROW LEVEL SECURITY`,
    `ALTER TABLE IF EXISTS sv_utenze DISABLE ROW LEVEL SECURITY`,
    `ALTER TABLE IF EXISTS foto DISABLE ROW LEVEL SECURITY`,
    `ALTER TABLE IF EXISTS foto_album DISABLE ROW LEVEL SECURITY`,
    `ALTER TABLE IF EXISTS note DISABLE ROW LEVEL SECURITY`,
    `ALTER TABLE IF EXISTS hobby DISABLE ROW LEVEL SECURITY`,
    `ALTER TABLE IF EXISTS hobby_sessioni DISABLE ROW LEVEL SECURITY`,
    `ALTER TABLE IF EXISTS todo DISABLE ROW LEVEL SECURITY`,
    `ALTER TABLE IF EXISTS spesa_lista DISABLE ROW LEVEL SECURITY`,
    `ALTER TABLE IF EXISTS spesa_prodotti DISABLE ROW LEVEL SECURITY`,
    `ALTER TABLE IF EXISTS debiti_crediti DISABLE ROW LEVEL SECURITY`,
    `ALTER TABLE IF EXISTS desideri DISABLE ROW LEVEL SECURITY`,
    `ALTER TABLE IF EXISTS film DISABLE ROW LEVEL SECURITY`,
    `ALTER TABLE IF EXISTS libri DISABLE ROW LEVEL SECURITY`,
    `ALTER TABLE IF EXISTS luoghi DISABLE ROW LEVEL SECURITY`,
    `ALTER TABLE IF EXISTS ricette DISABLE ROW LEVEL SECURITY`,
    `ALTER TABLE IF EXISTS canzoni DISABLE ROW LEVEL SECURITY`,
    `ALTER TABLE IF EXISTS canzoni_playlist DISABLE ROW LEVEL SECURITY`,
    `ALTER TABLE IF EXISTS canzoni_condivisioni DISABLE ROW LEVEL SECURITY`,
    `CREATE TABLE IF NOT EXISTS password_vault (
        id bigint generated always as identity primary key,
        email_utente text not null,
        categoria text,
        titolo text,
        username text,
        password_enc text,
        url text,
        note text,
        campi_extra jsonb default '[]',
        created_at timestamptz default now(),
        updated_at timestamptz default now()
    )`,
    `ALTER TABLE IF EXISTS password_vault DISABLE ROW LEVEL SECURITY`,
    `ALTER TABLE IF EXISTS push_subscriptions DISABLE ROW LEVEL SECURITY`,
    `ALTER TABLE IF EXISTS profili DISABLE ROW LEVEL SECURITY`,
    `CREATE TABLE IF NOT EXISTS app_feedback (
        id bigint generated always as identity primary key,
        email_utente text not null,
        tipo text not null default 'suggerimento',
        testo text not null,
        created_at timestamptz default now()
    )`,
    `ALTER TABLE IF EXISTS app_feedback DISABLE ROW LEVEL SECURITY`,
    `CREATE TABLE IF NOT EXISTS faccende (
        id bigint generated always as identity primary key,
        email_utente text not null,
        titolo text not null,
        descrizione text,
        categoria text not null default 'Altro',
        frequenza text not null default 'una_tantum',
        intervallo_giorni int,
        prossima_data date,
        responsabile text,
        archiviata boolean default false,
        created_at timestamptz default now(),
        updated_at timestamptz default now()
    )`,
    `CREATE TABLE IF NOT EXISTS faccende_esecuzioni (
        id bigint generated always as identity primary key,
        faccenda_id bigint not null references faccende(id) on delete cascade,
        email_utente text not null,
        completata_il date not null default current_date,
        note text,
        created_at timestamptz default now()
    )`,
    `ALTER TABLE IF EXISTS faccende DISABLE ROW LEVEL SECURITY`,
    `ALTER TABLE IF EXISTS faccende_esecuzioni DISABLE ROW LEVEL SECURITY`,
    `CREATE TABLE IF NOT EXISTS faccende_condivisioni (
        id bigint generated always as identity primary key,
        faccenda_id bigint not null references faccende(id) on delete cascade,
        email_proprietario text not null,
        email_condiviso text not null,
        created_at timestamptz default now(),
        unique(faccenda_id, email_condiviso)
    )`,
    `ALTER TABLE IF EXISTS faccende_condivisioni DISABLE ROW LEVEL SECURITY`,
    `ALTER TABLE IF EXISTS valigie ADD COLUMN IF NOT EXISTS data_viaggio date`,
    `ALTER TABLE profili ADD COLUMN IF NOT EXISTS iban text`,
    `ALTER TABLE profili ADD COLUMN IF NOT EXISTS paypal text`,
    `ALTER TABLE profili ADD COLUMN IF NOT EXISTS satispay text`,
    `ALTER TABLE profili ADD COLUMN IF NOT EXISTS home_colori jsonb`,
    `ALTER TABLE app_feedback ADD COLUMN IF NOT EXISTS risposta text`,
    `ALTER TABLE sv_viaggi ADD COLUMN IF NOT EXISTS settl_algo text`,
    `ALTER TABLE sv_viaggi ADD COLUMN IF NOT EXISTS notif_saldi_at timestamptz`,
    `ALTER TABLE vendita_annunci ADD COLUMN IF NOT EXISTS consegna text default 'ritiro'`,
    `ALTER TABLE vendita_annunci ADD COLUMN IF NOT EXISTS luogo text`,
    `ALTER TABLE vendita_annunci ADD COLUMN IF NOT EXISTS sped_peso numeric(6,2)`,
    `ALTER TABLE vendita_annunci ADD COLUMN IF NOT EXISTS sped_dimensioni text`,
    `CREATE TABLE IF NOT EXISTS lista_regali (
        id bigint generated always as identity primary key,
        created_at timestamptz default now(),
        email_utente text not null,
        nome text not null,
        destinatario text,
        prezzo numeric,
        link text,
        note text,
        comprato boolean default false
    )`,
    `ALTER TABLE IF EXISTS lista_regali DISABLE ROW LEVEL SECURITY`,
    `CREATE TABLE IF NOT EXISTS abbonamenti (
        id bigint generated always as identity primary key,
        created_at timestamptz default now(),
        email_utente text not null,
        icona text,
        nome text not null,
        costo numeric,
        frequenza text default 'mensile',
        categoria text default 'Altro',
        data_rinnovo date,
        note text,
        attivo boolean default true
    )`,
    `ALTER TABLE IF EXISTS abbonamenti DISABLE ROW LEVEL SECURITY`,
    `CREATE TABLE IF NOT EXISTS scadenze (
        id bigint generated always as identity primary key,
        created_at timestamptz default now(),
        email_utente text not null,
        titolo text not null,
        categoria text default 'Altro',
        data_scadenza date not null,
        note text,
        gestita boolean default false
    )`,
    `ALTER TABLE IF EXISTS scadenze DISABLE ROW LEVEL SECURITY`,
    `CREATE TABLE IF NOT EXISTS tessere_fedelta (
        id bigint generated always as identity primary key,
        created_at timestamptz default now(),
        email_utente text not null,
        nome text not null,
        codice text not null,
        tipo text default 'auto',
        colore text default '#f59e0b',
        note text
    )`,
    `ALTER TABLE IF EXISTS tessere_fedelta DISABLE ROW LEVEL SECURITY`,
    `ALTER TABLE IF EXISTS tessere_fedelta ADD COLUMN IF NOT EXISTS logo_dominio text`,
    `ALTER TABLE IF EXISTS tessere_fedelta ADD COLUMN IF NOT EXISTS logo_custom text`,
    `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='objects' AND schemaname='storage' AND policyname='allow upload vendita-foto') THEN
            CREATE POLICY "allow upload vendita-foto" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'vendita-foto');
        END IF;
    END $$`,
    `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='objects' AND schemaname='storage' AND policyname='allow select vendita-foto') THEN
            CREATE POLICY "allow select vendita-foto" ON storage.objects FOR SELECT USING (bucket_id = 'vendita-foto');
        END IF;
    END $$`,
    `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='objects' AND schemaname='storage' AND policyname='allow delete vendita-foto') THEN
            CREATE POLICY "allow delete vendita-foto" ON storage.objects FOR DELETE USING (bucket_id = 'vendita-foto');
        END IF;
    END $$`,
];

async function runSql(serviceKey, sql) {
    // Try project-level pg endpoint (works with service key, no PAT needed)
    const pgResp = await fetch(`${SUPABASE_URL}/pg/query`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': serviceKey,
            'Authorization': `Bearer ${serviceKey}`
        },
        body: JSON.stringify({ query: sql })
    });
    if (pgResp.ok) {
        const body = await pgResp.text();
        return { ok: true, status: pgResp.status, body: body.slice(0, 300) };
    }

    // Fall back to Management API (requires PAT — may fail with 401)
    const resp = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceKey}`
        },
        body: JSON.stringify({ query: sql })
    });
    const text = await resp.text();
    return { ok: resp.ok, status: resp.status, body: text.slice(0, 300) };
}

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!key) return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY non configurata' });

    // ?solo=testo esegue soltanto le istruzioni che contengono quel testo
    const solo = req.query?.solo;
    const daEseguire = solo ? STATEMENTS.filter(sql => sql.includes(solo)) : STATEMENTS;
    if (solo && !daEseguire.length) return res.status(400).json({ error: `Nessuna istruzione contiene "${solo}"` });

    const results = [];
    for (const sql of daEseguire) {
        const label = sql.trim().split('\n')[0].slice(0, 60);
        const r = await runSql(key, sql);
        results.push({ sql: label, ok: r.ok, status: r.status, body: r.body });
    }

    const allOk = results.every(r => r.ok);
    return res.status(200).json({ allOk, results });
};
