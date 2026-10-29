const APP_URL      = 'https://listando.it';
const REDIRECT_URI = `${APP_URL}/api/google-callback`;
const SUPABASE_URL = 'https://eejdpophfxsrqdvsucye.supabase.co';
const ANON_KEY     = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVlamRwb3BoZnhzcnFkdnN1Y3llIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2NTMzMDQsImV4cCI6MjA5MzIyOTMwNH0.mpxbwlJyIdZgqKIdutHbLd85JR1P11yiglbYeApi17k';

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { code, error } = req.query;

    if (error || !code) {
        const msg = encodeURIComponent(error || 'Accesso annullato');
        return res.redirect(302, `${APP_URL}/login.html?google_error=${msg}`);
    }

    const CLIENT_ID     = process.env.GOOGLE_CLIENT_ID;
    const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
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

    // 3. Reindirizza a login.html con i token nel fragment — il client Supabase li rileva automaticamente
    res.redirect(302,
        `${APP_URL}/login.html#access_token=${access_token}&refresh_token=${refresh_token}&token_type=bearer`
    );
};
