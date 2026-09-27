// Função serverless (Vercel) — chamada pelo script local que varre a pasta
// "Nfe" uma vez ao dia. Lê o PDF com a mesma IA do import manual e salva o
// resultado como "pendente" em estoque_importacoes_pendentes — quem confirma
// e grava no estoque de fato é o admin, na tela de Estoque (mesma revisão
// usada no import manual). Autenticação é por segredo compartilhado
// (NFE_IMPORT_SECRET), não por login — quem chama é um script local, não um
// usuário logado no navegador.

var SUPABASE_URL = 'https://tuuwszzjxxqjgfyncnhn.supabase.co';

var extrairDadosDocumento = require('./_lib/ler-documento').extrairDadosDocumento;

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

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY ausente no servidor.' });
    return;
  }

  var resultado = await extrairDadosDocumento(body.pdfBase64);
  var serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  var linha = resultado.ok
    ? { nome_arquivo: body.nomeArquivo, dados: resultado.dados, status: 'pendente' }
    : { nome_arquivo: body.nomeArquivo, dados: {}, status: 'erro', erro: resultado.error };

  var insertResp = await fetch(SUPABASE_URL + '/rest/v1/estoque_importacoes_pendentes', {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: 'Bearer ' + serviceKey,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify(linha)
  });

  if (!insertResp.ok) {
    var erroTexto = await insertResp.text().catch(function () { return ''; });
    res.status(502).json({ error: 'Falha ao gravar pendente no banco: ' + erroTexto });
    return;
  }

  if (!resultado.ok) {
    res.status(200).json({ ok: false, error: resultado.error });
    return;
  }

  res.status(200).json({ ok: true });
};
