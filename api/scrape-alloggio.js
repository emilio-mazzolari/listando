const AMENITY_MAP = {
    wifi:       ['wifi', 'wi-fi', 'free wifi', 'internet', 'wireless', 'hotspot'],
    parcheggio: ['parking', 'free parking', 'car park', 'garage', 'parcheggio', 'estacionamiento'],
    colazione:  ['breakfast', 'free breakfast', 'continental breakfast', 'buffet breakfast', 'colazione'],
    ac:         ['air conditioning', 'air-conditioning', 'cooling', 'climatizzazione', 'aria condizionata', 'ac'],
    piscina:    ['pool', 'swimming pool', 'outdoor pool', 'indoor pool', 'piscina', 'heated pool'],
    lavatrice:  ['washing machine', 'laundry', 'washer', 'lavatrice', 'laundry facilities', 'laundry service'],
    cucina:     ['kitchen', 'kitchenette', 'cucina', 'cooking facilities', 'full kitchen'],
    animali:    ['pets allowed', 'pet-friendly', 'pets', 'animali', 'dog', 'cat'],
    palestra:   ['fitness', 'gym', 'fitness center', 'palestra', 'fitness room', 'fitness facilities', 'workout'],
};

function mapAmenities(names) {
    const result = new Set();
    for (const raw of names) {
        const name = (raw || '').toLowerCase().trim();
        for (const [id, keywords] of Object.entries(AMENITY_MAP)) {
            if (keywords.some(k => name.includes(k))) result.add(id);
        }
    }
    return [...result];
}

function extractFromLd(data, result) {
    const type = data['@type'] || '';
    const isLodging = ['LodgingBusiness','Hotel','BedAndBreakfast','Hostel','Motel','Resort',
                       'VacationRental','Apartment','House'].includes(type);
    if (!isLodging && !data.aggregateRating && !data.amenityFeature) return;

    if (data.name && !result.nome) result.nome = data.name;

    if (data.address && !result.indirizzo) {
        const a = data.address;
        if (typeof a === 'string') {
            result.indirizzo = a;
        } else {
            const parts = [a.streetAddress, a.addressLocality, a.addressRegion]
                .filter(Boolean);
            if (parts.length) result.indirizzo = parts.join(', ');
        }
    }

    if (data.starRating?.ratingValue && !result.stelle) {
        const v = parseInt(data.starRating.ratingValue);
        if (v >= 1 && v <= 5) result.stelle = v;
    }

    if (data.aggregateRating && result.punteggio == null) {
        const v = parseFloat(data.aggregateRating.ratingValue);
        const best = parseFloat(data.aggregateRating.bestRating) || 10;
        if (!isNaN(v)) {
            result.punteggio = parseFloat(v.toFixed(1));
            result.recensioni = parseInt(data.aggregateRating.reviewCount) || 0;
            if (!result.stelle) {
                result.stelle = Math.min(5, Math.max(1, Math.round((v / best) * 5)));
            }
        }
    }

    if (data.amenityFeature?.length && !result.servizi?.length) {
        const names = data.amenityFeature
            .filter(a => a.value !== false && a.value !== 'False' && a.value !== false)
            .map(a => a.name || '');
        const mapped = mapAmenities(names);
        if (mapped.length) result.servizi = mapped;
    }
}

function parseHtml(html) {
    const result = {};
    const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
        try {
            const data = JSON.parse(m[1].trim());
            const items = Array.isArray(data) ? data : [data];
            for (const item of items) extractFromLd(item, result);
        } catch {}
    }

    // Fallback: og:title for name
    if (!result.nome) {
        const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
        if (og) result.nome = og[1];
    }

    // Fallback: search for star count in meta description or title
    if (!result.stelle) {
        const starMatch = html.match(/(\d)\s*stelle|(\d)\s*star/i);
        if (starMatch) {
            const v = parseInt(starMatch[1] || starMatch[2]);
            if (v >= 1 && v <= 5) result.stelle = v;
        }
    }

    return result;
}

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method !== 'GET') return res.status(405).end();

    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'Missing url' });

    try {
        new URL(url); // validate
    } catch {
        return res.status(400).json({ error: 'Invalid url' });
    }

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
            },
            redirect: 'follow',
        });

        const html = await response.text();
        const result = parseHtml(html);
        return res.status(200).json(result);
    } catch (err) {
        return res.status(200).json({});
    }
};
