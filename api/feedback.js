const webpush = require('web-push');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://eejdpophfxsrqdvsucye.supabase.co';
const RESEND_KEY = process.env.RESEND_API_KEY;
const ADMIN_EMAIL = 'emilio.mazzolari.shop@gmail.com';

let _sb;
function getSb() {
    if (!_sb) {
        const key = process.env.SUPABASE_SERVICE_KEY;
        if (!key) throw new Error('SUPABASE_SERVICE_KEY non configurata');
        _sb = createClient(SUPABASE_URL, key, { auth: { persistSession: false } });
    }
    return _sb;
}

webpush.setVapidDetails(
    'mailto:emilio.mazzolari@gmail.com',
    process.env.VAPID_PUBLIC_KEY || 'BIyJ8XdT5OaVM9uGh9rgjqMzBNd9q2haLd4k_Ugq7ZvUgZrzmOFmRb8-E0-_vUGHZ1_cGxIz84hakLZJPWgxFQM',
    process.env.VAPID_PRIVATE_KEY
);

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).end();

    const { email, tipo, testo } = req.body || {};
    if (!email || !testo?.trim()) {
        return res.status(400).json({ error: 'Payload non valido' });
    }

    let sb;
    try { sb = getSb(); } catch (e) { return res.status(500).json({ error: e.message }); }

    const tipoSafe = ['suggerimento', 'errore'].includes(tipo) ? tipo : 'suggerimento';

    await sb.from('app_feedback').insert({
        email_utente: email,
        tipo: tipoSafe,
        testo: testo.trim(),
    });

    const emoji = tipoSafe === 'errore' ? '🐛' : '💡';
    const label = tipoSafe === 'errore' ? 'Segnalazione errore' : 'Suggerimento';

    // Push notification to admin
    const { data: subs } = await sb.from('push_subscriptions')
        .select('*')
        .eq('email_utente', ADMIN_EMAIL);

    const payload = JSON.stringify({
        title: `${emoji} ${label}`,
        body: `Da: ${email}\n${testo.trim().slice(0, 100)}`,
        url: '/profilo.html'
    });

    for (const sub of (subs || [])) {
        try {
            await webpush.sendNotification(
                { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                payload
            );
        } catch (e) {
            if (e.statusCode === 410 || e.statusCode === 404) {
                await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
            }
        }
    }

    // Email to admin
    if (RESEND_KEY) {
        await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                from: 'Listando <noreply@listando.it>',
                to: ADMIN_EMAIL,
                subject: `${emoji} ${label} da ${email}`,
                html: `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:24px">
                    <h3 style="margin:0 0 12px">${emoji} ${label}</h3>
                    <p style="margin:0 0 6px;font-size:13px;color:#888">Da: <strong>${email}</strong></p>
                    <div style="background:#f5f6f8;border-radius:12px;padding:16px;margin-top:12px;font-size:15px;line-height:1.6;white-space:pre-wrap">${testo.trim().replace(/</g,'&lt;')}</div>
                    <p style="margin-top:20px"><a href="https://listando.it/profilo.html" style="color:#5856d6;font-weight:700">Vedi tutti i feedback →</a></p>
                </div>`
            })
        }).catch(() => {});
    }

    return res.status(200).json({ ok: true });
};
