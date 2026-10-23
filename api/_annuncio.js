const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://eejdpophfxsrqdvsucye.supabase.co';

// Pagina pubblica di un annuncio "In vendita", condivisibile fuori dall'app.
// Generata lato server così WhatsApp, Telegram, Facebook ecc. mostrano foto, titolo e prezzo nell'anteprima.
module.exports = async function handler(req, res) {
    const id = parseInt(req.query.id);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');

    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!key) return res.status(500).send(pagina({ messaggio: 'Servizio non configurato' }));
    if (!id) return res.status(404).send(pagina({ messaggio: 'Annuncio non trovato' }));

    const sb = createClient(SUPABASE_URL, key, { auth: { persistSession: false } });
    const { data: a } = await sb.from('vendita_annunci')
        .select('id, titolo, descrizione, prezzo, condizione, categoria, stato, visibilita, vendita_foto(url,ordine)')
        .eq('id', id)
        .maybeSingle();

    // Solo gli annunci pubblici sono visibili fuori dall'app
    if (!a || a.visibilita !== 'pubblico') {
        return res.status(404).send(pagina({ messaggio: 'Annuncio non disponibile' }));
    }

    a.vendita_foto = (a.vendita_foto || []).sort((x, y) => x.ordine - y.ordine);
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res.status(200).send(pagina({ a, origin: `https://${req.headers.host}` }));
};

function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatPrezzo(p) {
    return p != null ? `€ ${Number(p).toFixed(2).replace('.', ',')}` : 'Prezzo libero';
}

function pagina({ a, origin, messaggio }) {
    if (!a) {
        return `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Listando - In Vendita</title><link rel="icon" type="image/png" href="/favicon-32.png">
<style>body{font-family:'Segoe UI',system-ui,sans-serif;background:#f5f6f8;color:#111;margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:24px}
a{display:inline-block;margin-top:16px;padding:12px 20px;border-radius:14px;background:#16a34a;color:#fff;font-weight:800;text-decoration:none}</style>
</head><body><div><div style="font-size:56px">🏷️</div><h2>${esc(messaggio)}</h2><a href="/vendita.html">Vai a Listando</a></div></body></html>`;
    }

    const prezzo = formatPrezzo(a.prezzo);
    const url = `${origin}/annuncio/${a.id}`;
    const cover = a.vendita_foto[0]?.url;
    const descBreve = (a.descrizione || '').replace(/\s+/g, ' ').slice(0, 180);
    const ogDesc = [prezzo, a.condizione && cap(a.condizione), descBreve].filter(Boolean).join(' · ');
    const stato = a.stato === 'venduto' ? '✓ Venduto' : a.stato === 'riservato' ? '⏳ Riservato' : '';

    const slides = a.vendita_foto.length
        ? `<div class="carousel">${a.vendita_foto.map(f => `<img src="${esc(f.url)}" alt="">`).join('')}</div>`
        : `<div class="no-photo">🏷️</div>`;

    return `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(a.titolo)} — ${esc(prezzo)} | Listando</title>
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
<meta name="description" content="${esc(ogDesc)}">
<meta property="og:type" content="product">
<meta property="og:site_name" content="Listando">
<meta property="og:title" content="${esc(a.titolo)} — ${esc(prezzo)}">
<meta property="og:description" content="${esc(ogDesc)}">
<meta property="og:url" content="${esc(url)}">
${cover ? `<meta property="og:image" content="${esc(cover)}">` : `<meta property="og:image" content="${esc(origin)}/icon-pwa-512.png">`}
<meta name="twitter:card" content="${cover ? 'summary_large_image' : 'summary'}">
<style>
:root{color-scheme:light}
*{box-sizing:border-box}
body{font-family:'Segoe UI',system-ui,sans-serif;background:#f5f6f8;color:#111;margin:0}
.wrap{max-width:560px;margin:0 auto;background:#fff;min-height:100vh}
.brand{padding:14px 16px;font-weight:900;color:#16a34a;letter-spacing:1px;font-size:14px;border-bottom:2px solid #f2f2f7}
.carousel{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none}
.carousel::-webkit-scrollbar{display:none}
.carousel img{flex:none;width:100%;height:320px;object-fit:contain;background:#1a1a1a;scroll-snap-align:start}
.no-photo{height:220px;background:linear-gradient(135deg,#e8f5e9,#a7f3d0);display:flex;align-items:center;justify-content:center;font-size:72px}
.body{padding:20px 16px 32px}
.price{font-size:28px;font-weight:900;color:#15803d;margin-bottom:6px}
.title{font-size:20px;font-weight:900;margin:0 0 10px;line-height:1.3}
.meta{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px}
.badge{padding:5px 12px;border-radius:8px;font-size:12px;font-weight:800;background:#f0f0f0;color:#555}
.badge.stato{background:#fee2e2;color:#991b1b}
.desc{font-size:15px;line-height:1.6;color:#444;white-space:pre-wrap;margin-bottom:24px}
.cta{display:block;text-align:center;padding:15px;border-radius:18px;background:#16a34a;color:#fff;font-weight:900;font-size:16px;text-decoration:none}
.hint{text-align:center;color:#888;font-size:12px;margin-top:10px}
</style>
</head>
<body>
<div class="wrap">
    <div class="brand">LISTANDO · IN VENDITA</div>
    ${slides}
    <div class="body">
        <div class="price">${esc(prezzo)}</div>
        <h1 class="title">${esc(a.titolo)}</h1>
        <div class="meta">
            ${a.condizione ? `<span class="badge">${esc(cap(a.condizione))}</span>` : ''}
            ${a.categoria ? `<span class="badge">${esc(a.categoria)}</span>` : ''}
            ${stato ? `<span class="badge stato">${stato}</span>` : ''}
        </div>
        ${a.descrizione ? `<div class="desc">${esc(a.descrizione)}</div>` : ''}
        ${a.stato === 'venduto' ? '' : `<a class="cta" href="/vendita.html?annuncio=${a.id}">💬 Contatta il venditore su Listando</a>
        <div class="hint">Per scrivere al venditore accedi o registrati a Listando</div>`}
    </div>
</div>
</body>
</html>`;
}

function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }
