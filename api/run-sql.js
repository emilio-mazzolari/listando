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
    `ALTER TABLE IF EXISTS canzoni ADD COLUMN IF NOT EXISTS note text`,
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
    `INSERT INTO storage.buckets (id, name, public) VALUES ('piante-foto', 'piante-foto', true) ON CONFLICT DO NOTHING`,
    `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='objects' AND schemaname='storage' AND policyname='allow upload piante-foto') THEN
            CREATE POLICY "allow upload piante-foto" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'piante-foto');
        END IF;
    END $$`,
    `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='objects' AND schemaname='storage' AND policyname='allow select piante-foto') THEN
            CREATE POLICY "allow select piante-foto" ON storage.objects FOR SELECT USING (bucket_id = 'piante-foto');
        END IF;
    END $$`,
    `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='objects' AND schemaname='storage' AND policyname='allow delete piante-foto') THEN
            CREATE POLICY "allow delete piante-foto" ON storage.objects FOR DELETE USING (bucket_id = 'piante-foto');
        END IF;
    END $$`,
    `CREATE TABLE IF NOT EXISTS piante (
        id bigint generated always as identity primary key,
        email_utente text not null,
        nome text not null,
        specie text,
        foto_url text,
        descrizione text,
        annaffiatura text,
        luce text,
        temperatura text,
        fertilizzante text,
        note text,
        created_at timestamptz default now(),
        updated_at timestamptz default now()
    )`,
    `ALTER TABLE IF EXISTS piante DISABLE ROW LEVEL SECURITY`,
    `CREATE TABLE IF NOT EXISTS piante_scambi (
        id bigint generated always as identity primary key,
        email_utente text not null,
        tipo text default 'talea',
        titolo text not null,
        descrizione text,
        foto_url text,
        cerca text,
        zona text,
        stato text default 'disponibile',
        created_at timestamptz default now()
    )`,
    `ALTER TABLE IF EXISTS piante_scambi DISABLE ROW LEVEL SECURITY`,
    `CREATE TABLE IF NOT EXISTS piante_post (
        id bigint generated always as identity primary key,
        email_utente text not null,
        tipo text default 'domanda',
        titolo text not null,
        contenuto text,
        foto_url text,
        created_at timestamptz default now()
    )`,
    `ALTER TABLE IF EXISTS piante_post DISABLE ROW LEVEL SECURITY`,
    `CREATE TABLE IF NOT EXISTS piante_commenti (
        id bigint generated always as identity primary key,
        post_id bigint not null references piante_post(id) on delete cascade,
        email_utente text not null,
        testo text not null,
        created_at timestamptz default now()
    )`,
    `ALTER TABLE IF EXISTS piante_commenti DISABLE ROW LEVEL SECURITY`,
    `CREATE TABLE IF NOT EXISTS sport_discipline (
        id bigint generated always as identity primary key,
        email_utente text not null,
        nome text not null,
        emoji text default '🏃',
        colore text default '#3b82f6',
        created_at timestamptz default now()
    )`,
    `ALTER TABLE IF EXISTS sport_discipline DISABLE ROW LEVEL SECURITY`,
    `CREATE TABLE IF NOT EXISTS sport_elementi (
        id bigint generated always as identity primary key,
        email_utente text not null,
        disciplina_id bigint not null references sport_discipline(id) on delete cascade,
        tipo text not null default 'nota',
        titolo text not null,
        descrizione text,
        url text,
        difficolta text,
        data date,
        durata_min int,
        scadenza date,
        completato boolean default false,
        created_at timestamptz default now(),
        updated_at timestamptz default now()
    )`,
    `ALTER TABLE IF EXISTS sport_elementi DISABLE ROW LEVEL SECURITY`,
    `CREATE TABLE IF NOT EXISTS documenti (
        id bigint generated always as identity primary key,
        email_utente text not null,
        nome text not null,
        tipo text not null default 'altro',
        numero text,
        intestatario text,
        ente_rilascio text,
        data_rilascio date,
        data_scadenza date,
        note text,
        created_at timestamptz default now()
    )`,
    `ALTER TABLE IF EXISTS documenti DISABLE ROW LEVEL SECURITY`,
    `CREATE TABLE IF NOT EXISTS documenti_foto (
        id bigint generated always as identity primary key,
        documento_id bigint not null references documenti(id) on delete cascade,
        url text not null,
        ordine int default 0
    )`,
    `ALTER TABLE IF EXISTS documenti_foto DISABLE ROW LEVEL SECURITY`,
    `CREATE TABLE IF NOT EXISTS sv_documenti_viaggio (
        id bigint generated always as identity primary key,
        viaggio_id bigint not null references sv_viaggi(id) on delete cascade,
        documento_id bigint not null references documenti(id) on delete cascade,
        email_utente text not null,
        visibile_partecipanti boolean default false,
        created_at timestamptz default now(),
        unique(viaggio_id, documento_id)
    )`,
    `ALTER TABLE IF EXISTS sv_documenti_viaggio DISABLE ROW LEVEL SECURITY`,
    `CREATE TABLE IF NOT EXISTS auth_state_tokens (
        state text primary key,
        access_token text not null,
        refresh_token text not null,
        expires_at timestamptz not null
    )`,
    `ALTER TABLE IF EXISTS auth_state_tokens DISABLE ROW LEVEL SECURITY`,
    `CREATE TABLE IF NOT EXISTS sv_ripartizione (
        id bigint generated always as identity primary key,
        viaggio_id bigint not null,
        budget_item_id bigint not null,
        persone jsonb not null default '[]',
        risultati jsonb default '[]',
        costo numeric,
        tassa numeric,
        created_at timestamptz not null default now()
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS sv_ripartizione_budget_uniq ON sv_ripartizione(budget_item_id)`,
    `ALTER TABLE IF EXISTS sv_ripartizione DISABLE ROW LEVEL SECURITY`,
    `ALTER TABLE IF EXISTS sv_budget ADD COLUMN IF NOT EXISTS indirizzo_alloggio text`,
    `INSERT INTO storage.buckets (id, name, public) VALUES ('documenti-foto', 'documenti-foto', true) ON CONFLICT DO NOTHING`,
    `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='objects' AND schemaname='storage' AND policyname='allow upload documenti-foto') THEN
            CREATE POLICY "allow upload documenti-foto" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'documenti-foto');
        END IF;
    END $$`,
    `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='objects' AND schemaname='storage' AND policyname='allow select documenti-foto') THEN
            CREATE POLICY "allow select documenti-foto" ON storage.objects FOR SELECT USING (bucket_id = 'documenti-foto');
        END IF;
    END $$`,
    `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='objects' AND schemaname='storage' AND policyname='allow delete documenti-foto') THEN
            CREATE POLICY "allow delete documenti-foto" ON storage.objects FOR DELETE USING (bucket_id = 'documenti-foto');
        END IF;
    END $$`,
];

async function runSql(serviceKey, sql) {
    const headers = {
        'Content-Type': 'application/json',
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`
    };

    // 1. Try rpc/exec (custom SQL executor function in the DB)
    const rpcResp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ query: sql })
    });
    if (rpcResp.ok) {
        return { ok: true, status: rpcResp.status, body: 'rpc/exec OK' };
    }

    // 2. Try rpc/exec_sql (alternative name)
    const rpcResp2 = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ sql_query: sql })
    });
    if (rpcResp2.ok) {
        return { ok: true, status: rpcResp2.status, body: 'rpc/exec_sql OK' };
    }

    // 3. Try Management API with service key as PAT
    const mgmtResp = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
        body: JSON.stringify({ query: sql })
    });
    if (mgmtResp.ok) {
        const body = await mgmtResp.text();
        return { ok: true, status: mgmtResp.status, body: body.slice(0, 300) };
    }

    // 4. Try /pg/query
    const pgResp = await fetch(`${SUPABASE_URL}/pg/query`, {
        method: 'POST', headers,
        body: JSON.stringify({ query: sql })
    });
    const text = await pgResp.text();
    return { ok: pgResp.ok, status: pgResp.status, body: text.slice(0, 300) };
}

async function handleAnalizzaDocumento(req, res) {
    if (req.method !== 'POST') return res.status(405).end();
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) return res.status(200).json({ ok: false, reason: 'no_api_key' });
    const { imageBase64, mimeType = 'image/jpeg' } = req.body || {};
    if (!imageBase64) return res.status(400).json({ error: 'imageBase64 required' });
    const prompt = `Sei un assistente che analizza documenti italiani. Guarda questa immagine e restituisci un oggetto JSON con questi campi (usa null se non visibile):\n{\n  "tipo": uno tra: carta_identita | passaporto | patente | tessera_sanitaria | codice_fiscale | cert_nascita | cert_matrimonio | diploma | rogito | libretto_auto | contratto_lavoro | altro,\n  "numero": "numero/codice del documento",\n  "intestatario": "Nome Cognome dell'intestatario",\n  "data_rilascio": "YYYY-MM-DD",\n  "data_scadenza": "YYYY-MM-DD",\n  "ente_rilascio": "Ente o Comune emittente"\n}\nRispondi SOLO con JSON, senza testo aggiuntivo.`;
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`;
        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ inline_data: { mime_type: mimeType, data: imageBase64 } }, { text: prompt }] }], generationConfig: { maxOutputTokens: 400, temperature: 0 } })
        });
        if (!resp.ok) { const e = await resp.text(); return res.status(200).json({ ok: false, reason: 'api_error', detail: e.slice(0, 200) }); }
        const data = await resp.json();
        const text = (data.candidates?.[0]?.content?.parts?.[0]?.text || '{}').trim();
        let parsed = {};
        try { parsed = JSON.parse(text); } catch { const m = text.match(/\{[\s\S]*\}/); if (m) try { parsed = JSON.parse(m[0]); } catch {} }
        return res.status(200).json({ ok: true, data: parsed });
    } catch (err) {
        return res.status(200).json({ ok: false, reason: 'exception', detail: err.message });
    }
}

async function handleAuthClaim(req, res) {
    const state = (req.query?.state || '').trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(state))
        return res.status(400).json({ ok: false, reason: 'invalid_state' });
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!key) return res.status(500).json({ ok: false, reason: 'no_key' });
    const fetchR = await fetch(`${SUPABASE_URL}/rest/v1/auth_state_tokens?state=eq.${encodeURIComponent(state)}&select=access_token,refresh_token,expires_at`, {
        headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
    });
    const rows = await fetchR.json();
    if (!rows.length) return res.json({ ok: false, reason: 'not_found' });
    const { access_token, refresh_token, expires_at } = rows[0];
    if (new Date(expires_at) < new Date()) return res.json({ ok: false, reason: 'expired' });
    await fetch(`${SUPABASE_URL}/rest/v1/auth_state_tokens?state=eq.${encodeURIComponent(state)}`, {
        method: 'DELETE',
        headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
    });
    return res.json({ ok: true, access_token, refresh_token });
}

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.query?.action === 'analizza-documento') return handleAnalizzaDocumento(req, res);
    if (req.query?.action === 'auth-claim') return handleAuthClaim(req, res);

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
