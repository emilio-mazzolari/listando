const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://eejdpophfxsrqdvsucye.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVlamRwb3BoZnhzcnFkdnN1Y3llIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2NTMzMDQsImV4cCI6MjA5MzIyOTMwNH0.mpxbwlJyIdZgqKIdutHbLd85JR1P11yiglbYeApi17k';
const RESEND_KEY = process.env.RESEND_API_KEY;
const ADMIN_EMAIL = 'emilio.mazzolari.shop@gmail.com';

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).end();

    const { email, tipo, testo } = req.body || {};
    if (!email || !testo?.trim()) {
        return res.status(400).json({ error: 'Payload non valido' });
    }

    const tipoSafe = ['suggerimento', 'errore'].includes(tipo) ? tipo : 'suggerimento';

    await sb.from('app_feedback').insert({
        email_utente: email,
        tipo: tipoSafe,
        testo: testo.trim(),
    });

    if (RESEND_KEY) {
        const emoji = tipoSafe === 'errore' ? '🐛' : '💡';
        const label = tipoSafe === 'errore' ? 'Segnalazione errore' : 'Suggerimento';
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
