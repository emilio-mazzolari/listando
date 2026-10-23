const webpush = require('web-push');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://eejdpophfxsrqdvsucye.supabase.co';

// Push al destinatario di un messaggio della chat "In vendita".
// Riceve solo l'id del messaggio: testo e destinatario si leggono dal DB, così l'endpoint
// non può essere usato per mandare notifiche arbitrarie.
module.exports = async function notificaChat(req, res) {
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!key || !process.env.VAPID_PRIVATE_KEY) return res.status(200).json({ sent: 0, msg: 'push non configurate' });

    const id = parseInt(req.body?.messaggioId);
    if (!id) return res.status(400).json({ error: 'messaggioId richiesto' });

    const sb = createClient(SUPABASE_URL, key, { auth: { persistSession: false } });
    const { data: m } = await sb.from('vendita_chat')
        .select('id, annuncio_id, email_mittente, email_venditore, messaggio, created_at, vendita_annunci(titolo)')
        .eq('id', id).maybeSingle();
    if (!m || m.email_mittente === m.email_venditore) return res.status(404).json({ error: 'messaggio non trovato' });
    // Solo messaggi appena inviati
    if (Date.now() - new Date(m.created_at).getTime() > 2 * 60 * 1000) return res.status(200).json({ sent: 0 });

    const { data: subs } = await sb.from('push_subscriptions').select('*').eq('email_utente', m.email_venditore);
    if (!subs?.length) return res.status(200).json({ sent: 0 });

    webpush.setVapidDetails(
        'mailto:emilio.mazzolari@gmail.com',
        process.env.VAPID_PUBLIC_KEY || 'BIyJ8XdT5OaVM9uGh9rgjqMzBNd9q2haLd4k_Ugq7ZvUgZrzmOFmRb8-E0-_vUGHZ1_cGxIz84hakLZJPWgxFQM',
        process.env.VAPID_PRIVATE_KEY
    );
    const testo = m.messaggio.length > 120 ? m.messaggio.slice(0, 117) + '…' : m.messaggio;
    const payload = JSON.stringify({
        title: `💬 ${m.vendita_annunci?.titolo || 'In vendita'}`,
        body: `${m.email_mittente}: ${testo}`,
        url: `/vendita.html?chat=${m.annuncio_id}&con=${encodeURIComponent(m.email_mittente)}`,
        tag: `vendita-chat-${m.annuncio_id}-${m.email_mittente}`
    });

    let sent = 0;
    for (const sub of subs) {
        try {
            await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
            sent++;
        } catch (err) {
            if (err.statusCode === 410 || err.statusCode === 404) {
                await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
            }
        }
    }
    return res.status(200).json({ sent });
};
