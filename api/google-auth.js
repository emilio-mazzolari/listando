const APP_URL      = 'https://listando.it';
const REDIRECT_URI = `${APP_URL}/api/google-auth`;
const SUPABASE_URL = 'https://eejdpophfxsrqdvsucye.supabase.co';
const ANON_KEY     = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVlamRwb3BoZnhzcnFkdnN1Y3llIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2NTMzMDQsImV4cCI6MjA5MzIyOTMwNH0.mpxbwlJyIdZgqKIdutHbLd85JR1P11yiglbYeApi17k';

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { code, error } = req.query;
    const CLIENT_ID     = process.env.GOOGLE_CLIENT_ID;
    const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

    const state = req.query.state || '';

    // ── START: nessun code → avvia il flusso OAuth ────────────────────
    if (!code && !error) {
        if (req.query.debug === 'env') {
            const allKeys = Object.keys(process.env);
            return res.status(200).json({
                CLIENT_ID: !!CLIENT_ID,
                CLIENT_SECRET: !!CLIENT_SECRET,
                googleKeys: allKeys.filter(k => k.startsWith('GOOGLE')),
                allKeyCount: allKeys.length,
                hasGCID: 'GOOGLE_CLIENT_ID' in process.env,
                gcidRaw: process.env['GOOGLE_CLIENT_ID'] ?? 'UNDEFINED',
            });
        }
        if (!CLIENT_ID) return res.status(500).send('GOOGLE_CLIENT_ID non configurato');
        const params = new URLSearchParams({
            client_id:     CLIENT_ID,
            redirect_uri:  REDIRECT_URI,
            response_type: 'code',
            scope:         'openid email profile',
            access_type:   'offline',
            prompt:        'select_account',
            ...(state && { state }),
        });
        return res.redirect(302, `https://accounts.google.com/o/oauth2/v2/auth?${params}`);
    }

    // ── CALLBACK: gestisce il codice restituito da Google ─────────────
    if (error || !code) {
        const msg = encodeURIComponent(error || 'Accesso annullato');
        return res.redirect(302, `${APP_URL}/login.html?google_error=${msg}`);
    }

    if (!CLIENT_ID || !CLIENT_SECRET) {
        return res.redirect(302, `${APP_URL}/login.html?google_error=config_mancante`);
    }

    // 1. Scambia il codice con Google → ottieni id_token
    let id_token;
    try {
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code,
                client_id:     CLIENT_ID,
                client_secret: CLIENT_SECRET,
                redirect_uri:  REDIRECT_URI,
                grant_type:    'authorization_code',
            }),
        });
        if (!tokenRes.ok) throw new Error(await tokenRes.text());
        ({ id_token } = await tokenRes.json());
    } catch (e) {
        return res.redirect(302, `${APP_URL}/login.html?google_error=scambio_codice_fallito`);
    }

    // 2. Scambia l'id_token Google con una sessione Supabase
    let access_token, refresh_token;
    try {
        const sbRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=id_token`, {
            method: 'POST',
            headers: {
                'Content-Type':  'application/json',
                'apikey':        ANON_KEY,
                'Authorization': `Bearer ${ANON_KEY}`,
            },
            body: JSON.stringify({ provider: 'google', id_token }),
        });
        if (!sbRes.ok) throw new Error(await sbRes.text());
        ({ access_token, refresh_token } = await sbRes.json());
    } catch (e) {
        return res.redirect(302, `${APP_URL}/login.html?google_error=sessione_supabase_fallita`);
    }

    // 3a. Flusso PWA iOS: salva token in DB, reindirizza a bridge page
    const isStateFlow = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(state);
    if (isStateFlow) {
        const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
        if (SERVICE_KEY) {
            await fetch(`${SUPABASE_URL}/rest/v1/auth_state_tokens`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': SERVICE_KEY,
                    'Authorization': `Bearer ${SERVICE_KEY}`,
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify({
                    state,
                    access_token,
                    refresh_token,
                    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
                })
            });
        }
        return res.redirect(302, `${APP_URL}/auth-bridge.html`);
    }

    // 3b. Flusso standard: reindirizza a login.html con i token nel fragment
    res.redirect(302,
        `${APP_URL}/login.html#access_token=${access_token}&refresh_token=${refresh_token}&token_type=bearer`
    );
};
