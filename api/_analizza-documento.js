module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).end();

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(200).json({ ok: false, reason: 'no_api_key' });

    const { imageBase64, mimeType = 'image/jpeg' } = req.body || {};
    if (!imageBase64) return res.status(400).json({ error: 'imageBase64 required' });

    const prompt = `Sei un assistente che analizza documenti italiani. Guarda questa immagine e restituisci un oggetto JSON con questi campi (usa null se non visibile):
{
  "tipo": uno tra: carta_identita | passaporto | patente | tessera_sanitaria | codice_fiscale | cert_nascita | cert_matrimonio | diploma | rogito | libretto_auto | contratto_lavoro | altro,
  "numero": "numero/codice del documento",
  "intestatario": "Nome Cognome dell'intestatario",
  "data_rilascio": "YYYY-MM-DD",
  "data_scadenza": "YYYY-MM-DD",
  "ente_rilascio": "Ente o Comune emittente"
}
Rispondi SOLO con JSON, senza testo aggiuntivo.`;

    try {
        const resp = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 400,
                messages: [{
                    role: 'user',
                    content: [
                        { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } },
                        { type: 'text', text: prompt }
                    ]
                }]
            })
        });

        if (!resp.ok) {
            const e = await resp.text();
            return res.status(200).json({ ok: false, reason: 'api_error', detail: e.slice(0, 200) });
        }

        const data = await resp.json();
        const text = (data.content?.[0]?.text || '{}').trim();

        let parsed = {};
        try { parsed = JSON.parse(text); }
        catch { const m = text.match(/\{[\s\S]*\}/); if (m) try { parsed = JSON.parse(m[0]); } catch {} }

        return res.status(200).json({ ok: true, data: parsed });
    } catch (err) {
        return res.status(200).json({ ok: false, reason: 'exception', detail: err.message });
    }
};
