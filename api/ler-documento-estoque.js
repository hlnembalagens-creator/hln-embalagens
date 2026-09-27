// Função serverless (Vercel) — lê uma NF/romaneio em PDF usando a API da
// Anthropic e devolve os dados extraídos em JSON estruturado. Só admin pode
// chamar (verifica o token da sessão + o profiles.role no Supabase).
// Nada é gravado no banco aqui — quem grava é o front, depois que o admin
// conferir/corrigir os dados na tela.

var SUPABASE_URL = 'https://tuuwszzjxxqjgfyncnhn.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1dXdzenpqeHhxamdmeW5jbmhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzMzkzNjksImV4cCI6MjEwMDkxNTM2OX0.JlQf2Hz-16v0aFITkOKbxSQWrrwSHZL-12mgM6BaRwM';

var extrairDadosDocumento = require('./_lib/ler-documento').extrairDadosDocumento;

async function usuarioAdmin(accessToken) {
  if (!accessToken) return false;
  var userResp = await fetch(SUPABASE_URL + '/auth/v1/user', {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + accessToken }
  });
  if (!userResp.ok) return false;
  var user = await userResp.json();

  var profileResp = await fetch(SUPABASE_URL + '/rest/v1/profiles?id=eq.' + user.id + '&select=role', {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + accessToken }
  });
  if (!profileResp.ok) return false;
  var rows = await profileResp.json();
  return rows[0] && rows[0].role !== 'vendedor';
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método não permitido.' });
    return;
  }

  var body = req.body || {};

  if (!(await usuarioAdmin(body.accessToken))) {
    res.status(401).json({ error: 'Sessão inválida ou sem permissão de admin.' });
    return;
  }

  if (!body.pdfBase64) {
    res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    return;
  }

  var resultado = await extrairDadosDocumento(body.pdfBase64);

  if (!resultado.ok) {
    res.status(502).json({ error: resultado.error, debug: resultado.debug });
    return;
  }

  res.status(200).json({ ok: true, dados: resultado.dados });
};
