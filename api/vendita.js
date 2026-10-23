// Funzione unica per "In vendita" (il piano Hobby di Vercel ammette max 12 funzioni):
//   GET  /api/vendita?id=N  → pagina pubblica dell'annuncio (anche via /annuncio/N)
//   POST /api/vendita       → upload di una foto dell'annuncio
// I file con "_" iniziale in /api non diventano funzioni separate.
const annuncio = require('./_annuncio');
const uploadFoto = require('./_upload-foto');

module.exports = async function handler(req, res) {
    if (req.method === 'GET') return annuncio(req, res);
    return uploadFoto(req, res);
};
