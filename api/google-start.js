const APP_URL     = 'https://listando.it';
const REDIRECT_URI = `${APP_URL}/api/google-callback`;

module.exports = function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
    if (!CLIENT_ID) return res.status(500).send('GOOGLE_CLIENT_ID non configurato');

    const params = new URLSearchParams({
        client_id:     CLIENT_ID,
        redirect_uri:  REDIRECT_URI,
        response_type: 'code',
        scope:         'openid email profile',
        access_type:   'offline',
        prompt:        'select_account',
    });

    res.redirect(302, `https://accounts.google.com/o/oauth2/v2/auth?${params}`);
};
