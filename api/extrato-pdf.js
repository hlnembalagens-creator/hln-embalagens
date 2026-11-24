// Função serverless (Vercel) — processa o extrato em PDF enviado pela tela do Financeiro, com o mesmo
// motor do e-mail nfe@ (_lib/extrato-server.js). Só Administrador (admin/ADM 1). Com dryRun: true só
// simula e devolve o plano, sem gravar nada.

var SUPABASE_URL = 'https://tuuwszzjxxqjgfyncnhn.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1dXdzenpqeHhxamdmeW5jbmhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzMzkzNjksImV4cCI6MjEwMDkxNTM2OX0.JlQf2Hz-16v0aFITkOKbxSQWrrwSHZL-12mgM6BaRwM';

var extrato = require('./_lib/extrato-server');

async function usuarioAdmin(accessToken) {
  if (!accessToken) return null;
  var userResp = await fetch(SUPABASE_URL + '/auth/v1/user', { headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + accessToken } });
  if (!userResp.ok) return null;
  var user = await userResp.json();
  var profResp = await fetch(SUPABASE_URL + '/rest/v1/profiles?id=eq.' + user.id + '&select=role,ativo', { headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + accessToken } });
  if (!profResp.ok) return null;
  var rows = await profResp.json();
  var p = rows[0];
  return p && p.ativo !== false && (p.role === 'admin' || p.role === 'admin1') ? user : null;
}

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
