const webpush = require('web-push');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://eejdpophfxsrqdvsucye.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVlamRwb3BoZnhzcnFkdnN1Y3llIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2NTMzMDQsImV4cCI6MjA5MzIyOTMwNH0.mpxbwlJyIdZgqKIdutHbLd85JR1P11yiglbYeApi17k';
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

webpush.setVapidDetails(
    'mailto:emilio.mazzolari@gmail.com',
    process.env.VAPID_PUBLIC_KEY || 'BATe8jx7GOX6w2NUFoMQoGI6l8BRyJEVcsDlwf3IdIa5AEENkxpSCNuhkl4PgDxR_8f-AJerrYxENnH0mb-MTys',
    process.env.VAPID_PRIVATE_KEY
);

module.exports = async function handler(req, res) {
    // Vercel verifica automaticamente CRON_SECRET nell'header Authorization
    const secret = process.env.CRON_SECRET;
    if (secret) {
        const auth = req.headers.authorization;
        if (auth !== `Bearer ${secret}`) return res.status(401).end();
    }

    // Recupera tutte le sottoscrizioni push
    const { data: subs, error: subErr } = await sb.from('push_subscriptions').select('*');
    if (subErr) return res.status(500).json({ error: subErr.message });
    if (!subs?.length) return res.status(200).json({ sent: 0, msg: 'Nessuna sottoscrizione' });

    const emails = [...new Set(subs.map(s => s.email_utente))];
    let sent = 0, failed = 0;

    for (const email of emails) {
        const { data: voci } = await sb.from('debiti_crediti')
            .select('tipo, importo, quantita')
            .eq('email_utente', email)
            .eq('pagato', false);

        const v = voci || [];
        const sum = (tipo) => v.filter(x => x.tipo === tipo).reduce((s, x) => s + Number(x.importo || 0), 0);
        const count = (tipo) => v.filter(x => x.tipo === tipo).length;

        const totD = sum('debito'), totC = sum('credito');
        const totP = sum('pagare'), totR = sum('ricevere');
        const nD = count('debito'), nC = count('credito');
        const nP = count('pagare'), nR = count('ricevere');
        const saldo = totC - totD;

        const righe = [
            nD > 0 ? `💸 Devo: €${totD.toFixed(2)} (${nD} voc${nD > 1 ? 'i' : 'e'})` : null,
            nC > 0 ? `💰 Mi devono: €${totC.toFixed(2)} (${nC} voc${nC > 1 ? 'i' : 'e'})` : null,
            nP > 0 ? `📋 Da pagare: ${totP > 0 ? '€' + totP.toFixed(2) + ' ' : ''}(${nP} voc${nP > 1 ? 'i' : 'e'})` : null,
            nR > 0 ? `📬 Da ricevere: ${totR > 0 ? '€' + totR.toFixed(2) + ' ' : ''}(${nR} voc${nR > 1 ? 'i' : 'e'})` : null,
            (nD > 0 || nC > 0) ? `Saldo netto: ${saldo >= 0 ? '+' : ''}€${saldo.toFixed(2)}` : null,
        ].filter(Boolean);

        const body = righe.length > 0 ? righe.join('\n') : 'Tutto in ordine, nessuna voce aperta 🎉';

        const payload = JSON.stringify({
            title: '📊 Riepilogo settimanale — Listando',
            body,
            url: '/debiti.html',
        });

        const userSubs = subs.filter(s => s.email_utente === email);
        for (const sub of userSubs) {
            try {
                await webpush.sendNotification(
                    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                    payload
                );
                sent++;
            } catch (err) {
                failed++;
                // Rimuovi sottoscrizioni scadute
                if (err.statusCode === 410 || err.statusCode === 404) {
                    await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
                }
            }
        }
    }

    return res.status(200).json({ sent, failed });
};
