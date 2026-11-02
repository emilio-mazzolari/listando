module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).end();

    const apiKey = process.env.GOOGLE_AI_API_KEY;
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
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { inline_data: { mime_type: mimeType, data: imageBase64 } },
                        { text: prompt }
                    ]
                }],
                generationConfig: { maxOutputTokens: 400, temperature: 0 }
            })
        });

        if (!resp.ok) {
            const e = await resp.text();
            return res.status(200).json({ ok: false, reason: 'api_error', detail: e.slice(0, 200) });
        }

        const data = await resp.json();
        const text = (data.candidates?.[0]?.content?.parts?.[0]?.text || '{}').trim();

        let parsed = {};
        try { parsed = JSON.parse(text); }
        catch { const m = text.match(/\{[\s\S]*\}/); if (m) try { parsed = JSON.parse(m[0]); } catch {} }

        return res.status(200).json({ ok: true, data: parsed });
    } catch (err) {
        return res.status(200).json({ ok: false, reason: 'exception', detail: err.message });
    }
};
