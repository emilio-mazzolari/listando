const webpush = require('web-push');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://eejdpophfxsrqdvsucye.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVlamRwb3BoZnhzcnFkdnN1Y3llIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2NTMzMDQsImV4cCI6MjA5MzIyOTMwNH0.mpxbwlJyIdZgqKIdutHbLd85JR1P11yiglbYeApi17k';

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

webpush.setVapidDetails(
    'mailto:emilio.mazzolari@gmail.com',
    process.env.VAPID_PUBLIC_KEY || 'BATe8jx7GOX6w2NUFoMQoGI6l8BRyJEVcsDlwf3IdIa5AEENkxpSCNuhkl4PgDxR_8f-AJerrYxENnH0mb-MTys',
    process.env.VAPID_PRIVATE_KEY
);

const ANTICIPO_MINS = { '1h': 60, '3h': 180, '1d': 1440, '3d': 4320, '1w': 10080 };

const ANTICIPO_LABEL = { '1h': '1 ora', '3h': '3 ore', '1d': '1 giorno', '3d': '3 giorni', '1w': '1 settimana' };

module.exports = async function handler(req, res) {
    const secret = process.env.CRON_SECRET;
    if (secret && req.headers.authorization !== `Bearer ${secret}`) {
        return res.status(401).end();
    }

    const now = new Date();
    // Look up to 1 week + 65 min ahead to cover all anticipo values
    const maxLookahead = new Date(now.getTime() + (10080 + 65) * 60000);

    // Load all push subscriptions once
    const { data: subs } = await sb.from('push_subscriptions').select('*');
    const subsByEmail = {};
    for (const s of (subs || [])) {
        if (!subsByEmail[s.email_utente]) subsByEmail[s.email_utente] = [];
        subsByEmail[s.email_utente].push(s);
    }

    // Find upcoming piano items with notifications enabled
    const { data: items, error } = await sb
        .from('sv_piano')
        .select('*')
        .not('notif_dest', 'is', null)
        .not('notif_anticipo', 'is', null)
        .not('data_inizio', 'is', null)
        .gte('data_inizio', now.toISOString())
        .lte('data_inizio', maxLookahead.toISOString());

    if (error) return res.status(500).json({ error: error.message });

    let sent = 0;
    for (const item of (items || [])) {
        const anticipo = ANTICIPO_MINS[item.notif_anticipo] || 60;
        const notifTime = new Date(new Date(item.data_inizio).getTime() - anticipo * 60000);

        // Only send if notifTime falls in [now, now+65min)
        if (notifTime < now || notifTime >= new Date(now.getTime() + 65 * 60000)) continue;

        // Get viaggio owner email
        const { data: viaggio } = await sb.from('sv_viaggi').select('email_utente').eq('id', item.viaggio_id).single();
        const ownerEmail = viaggio?.email_utente;

        // Determine target emails
        let targetEmails = [];
        if (item.notif_dest === 'all') {
            const { data: partecipanti } = await sb
                .from('sv_partecipanti')
                .select('email_collegata')
                .eq('viaggio_id', item.viaggio_id)
                .not('email_collegata', 'is', null);
            targetEmails = [...new Set([
                ...(partecipanti || []).map(p => p.email_collegata).filter(Boolean),
                ...(ownerEmail ? [ownerEmail] : [])
            ])];
        } else {
            if (ownerEmail) targetEmails = [ownerEmail];
        }

        const eventTime = new Date(item.data_inizio).toLocaleTimeString('it-IT', {
            timeZone: 'Europe/Rome',
            hour: '2-digit', minute: '2-digit'
        });

        const payload = JSON.stringify({
            title: '📍 ' + item.titolo,
            body: `Tra ${ANTICIPO_LABEL[item.notif_anticipo] || '1 ora'} — alle ${eventTime}`,
            url: '/spese_viaggio.html'
        });

        for (const email of targetEmails) {
            for (const sub of (subsByEmail[email] || [])) {
                try {
                    await webpush.sendNotification(
                        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                        payload
                    );
                    sent++;
                } catch (e) {
                    if (e.statusCode === 410 || e.statusCode === 404) {
                        await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
                    }
                }
            }
        }
    }

    return res.json({ sent, checked: items?.length || 0 });
};
