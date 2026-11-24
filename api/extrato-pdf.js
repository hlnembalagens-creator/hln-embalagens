// Função serverless (Vercel) — processa o extrato em PDF enviado pela tela do Financeiro, com o mesmo
// motor do e-mail nfe@ (_lib/extrato-server.js). Só Administrador (admin/ADM 1). Com dryRun: true só
// simula e devolve o plano, sem gravar nada.

var extrato = require('./_lib/extrato-server');
var usuarioAdmin = require('./_lib/admin-auth').usuarioAdmin;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Método não permitido.' }); return; }
  var body = req.body || {};
  if (!(await usuarioAdmin(body.accessToken))) { res.status(401).json({ error: 'Sessão inválida ou sem permissão.' }); return; }
  if (!body.pdfBase64) { res.status(400).json({ error: 'Envie o PDF do extrato.' }); return; }

  try {
    var texto = await extrato.textoDoPdf(Buffer.from(body.pdfBase64, 'base64'));
    var r = await extrato.processarExtratoPdf(texto, body.nomeArquivo || 'extrato.pdf', { dryRun: body.dryRun !== false });
    if (!r.ok) { res.status(422).json({ error: r.error }); return; }
    res.status(200).json({ ok: true, dryRun: body.dryRun !== false, resumo: r.resumo, plano: r.plano });
  } catch (e) {
    res.status(500).json({ error: 'Falha ao processar o extrato: ' + (e && e.message ? e.message : e) });
  }
};
