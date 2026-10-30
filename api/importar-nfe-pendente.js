// Função serverless (Vercel) — chamada pelo script local que varre a pasta
// "Nfe" uma vez ao dia. Lê o PDF com a mesma IA do import manual e salva o
// resultado como "pendente" em estoque_importacoes_pendentes — quem confirma
// e grava no estoque de fato é o admin, na tela de Estoque (mesma revisão
// usada no import manual). Autenticação é por segredo compartilhado
// (NFE_IMPORT_SECRET), não por login — quem chama é um script local, não um
// usuário logado no navegador.

var salvarPendente = require('./_lib/salvar-pendente').salvarPendente;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método não permitido.' });
    return;
  }

  var body = req.body || {};

  if (!process.env.NFE_IMPORT_SECRET || body.secret !== process.env.NFE_IMPORT_SECRET) {
    res.status(401).json({ error: 'Segredo inválido.' });
    return;
  }

  if (!body.pdfBase64 || !body.nomeArquivo) {
    res.status(400).json({ error: 'Envie nomeArquivo e pdfBase64.' });
    return;
  }

  var r = await salvarPendente(body.nomeArquivo, body.pdfBase64);

  if (!r.gravou) {
    res.status(r.error && r.error.indexOf('SUPABASE_SERVICE_ROLE_KEY') === 0 ? 500 : 502).json({ error: r.error });
    return;
  }

  if (!r.ok) {
    res.status(200).json({ ok: false, error: r.error });
    return;
  }

  res.status(200).json({ ok: true });
};
