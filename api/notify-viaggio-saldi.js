const webpush = require('web-push');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://eejdpophfxsrqdvsucye.supabase.co';

webpush.setVapidDetails(
    'mailto:emilio.mazzolari@gmail.com',
    process.env.VAPID_PUBLIC_KEY || 'BIyJ8XdT5OaVM9uGh9rgjqMzBNd9q2haLd4k_Ugq7ZvUgZrzmOFmRb8-E0-_vUGHZ1_cGxIz84hakLZJPWgxFQM',
    process.env.VAPID_PRIVATE_KEY
);

function calcolaQuotePer(s) {
    const divisione = JSON.parse(s.divisione || '[]');
    if (!divisione.length) return {};
    const quotePer = {};
    try {
        if (s.tipo_divisione === 'importi' && s.quote_divisione) {
            const q = JSON.parse(s.quote_divisione);
            divisione.forEach(pid => { quotePer[pid] = parseFloat(q[pid] || 0); });
        } else if (s.tipo_divisione === 'percentuali' && s.quote_divisione) {
            const q = JSON.parse(s.quote_divisione);
            divisione.forEach(pid => { quotePer[pid] = parseFloat(s.importo) * (parseFloat(q[pid] || 0) / 100); });
        } else if (s.tipo_divisione === 'quote' && s.quote_divisione) {
            const q = JSON.parse(s.quote_divisione);
            const tot = divisione.reduce((sum, pid) => sum + parseFloat(q[pid] || 1), 0);
            divisione.forEach(pid => { quotePer[pid] = parseFloat(s.importo) * (parseFloat(q[pid] || 1) / tot); });
        } else {
            const quota = parseFloat(s.importo) / divisione.length;
            divisione.forEach(pid => { quotePer[pid] = quota; });
        }
    } catch (e) {
        const quota = parseFloat(s.importo) / divisione.length;
        divisione.forEach(pid => { quotePer[pid] = quota; });
    }
    return quotePer;
}

module.exports = async function handler(req, res) {
    const secret = process.env.CRON_SECRET;
    const authOk = !secret
        || req.headers.authorization === `Bearer ${secret}`
        || req.query?.key === secret;
    if (!authOk) return res.status(401).end();

    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!key) return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY non configurata' });
    const sb = createClient(SUPABASE_URL, key, { auth: { persistSession: false } });

    // Date window: trips that ended 7–10 days ago, not yet notified
    const romeDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Rome' }));
    const d7 = new Date(romeDate); d7.setDate(d7.getDate() - 7);
    const d10 = new Date(romeDate); d10.setDate(d10.getDate() - 10);
    const sevenDaysAgo = d7.toISOString().split('T')[0];
    const tenDaysAgo  = d10.toISOString().split('T')[0];

    const { data: viaggi, error: vErr } = await sb
        .from('sv_viaggi')
        .select('id, nome, settl_algo, valuta')
        .not('settl_algo', 'is', null)
        .is('notif_saldi_at', null)
        .gte('data_fine', tenDaysAgo)
        .lte('data_fine', sevenDaysAgo);

    if (vErr) return res.status(500).json({ error: vErr.message });
    if (!viaggi?.length) return res.json({ sent: 0, viaggi: 0 });

    const { data: allSubs } = await sb.from('push_subscriptions').select('*');
    const subsByEmail = {};
    for (const s of (allSubs || [])) {
        if (!subsByEmail[s.email_utente]) subsByEmail[s.email_utente] = [];
        subsByEmail[s.email_utente].push(s);
    }

    let totalSent = 0;

    for (const viaggio of viaggi) {
        const { data: partecipanti } = await sb
            .from('sv_partecipanti')
            .select('id, nome, email_collegata')
            .eq('viaggio_id', viaggio.id);

        if (!partecipanti?.length) {
            await sb.from('sv_viaggi').update({ notif_saldi_at: new Date().toISOString() }).eq('id', viaggio.id);
            continue;
        }

        const { data: spese } = await sb
            .from('sv_spese')
            .select('importo, pagato_da, divisione, categoria, tipo_divisione, quote_divisione')
            .eq('viaggio_id', viaggio.id);

        const bilanci = {};
        partecipanti.forEach(p => { bilanci[p.id] = 0; });

        const SALDI_CONTABILI = new Set(['🤝', '💸']);
        for (const s of (spese || [])) {
            const divisione = JSON.parse(s.divisione || '[]');
            if (!divisione.length) continue;
            const isContabile = SALDI_CONTABILI.has(s.categoria);
            const quotePer = calcolaQuotePer(s);
            bilanci[s.pagato_da] = (bilanci[s.pagato_da] || 0) + parseFloat(s.importo);
            if (!isContabile) {
                divisione.forEach(pid => {
                    bilanci[pid] = (bilanci[pid] || 0) - (quotePer[pid] || 0);
                });
            } else {
                // Settlement entry: direct transfer
                divisione.forEach(pid => {
                    bilanci[pid] = (bilanci[pid] || 0) - parseFloat(s.importo);
                });
            }
        }

        // Find debitori (negative balance)
        const debitori = partecipanti.filter(p => (bilanci[p.id] || 0) < -0.01);

        if (!debitori.length) {
            await sb.from('sv_viaggi').update({ notif_saldi_at: new Date().toISOString() }).eq('id', viaggio.id);
            continue;
        }

        for (const debitore of debitori) {
            if (!debitore.email_collegata) continue;
            const userSubs = subsByEmail[debitore.email_collegata.toLowerCase()] || [];
            if (!userSubs.length) continue;
            const dovuto = Math.abs(Math.round((bilanci[debitore.id] || 0) * 100) / 100);
            const payload = JSON.stringify({
                title: `💸 Salda i conti — ${viaggio.nome}`,
                body: `Hai ancora da pagare dopo il viaggio ${viaggio.nome}. Apri l'app per vedere i dettagli.`,
                url: '/spese_viaggio.html',
                tag: `saldi-${viaggio.id}-${debitore.id}`
            });
            for (const sub of userSubs) {
                try {
                    await webpush.sendNotification(
                        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                        payload
                    );
                    totalSent++;
                } catch (e) {
                    if (e.statusCode === 410 || e.statusCode === 404) {
                        await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
                    }
                }
            }
        }

        await sb.from('sv_viaggi').update({ notif_saldi_at: new Date().toISOString() }).eq('id', viaggio.id);
    }

    return res.json({ sent: totalSent, viaggi: viaggi.length });
};
