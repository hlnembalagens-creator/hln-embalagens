// Função serverless (Vercel) — mantém a RESEND_API_KEY fora do navegador.
// Só envia e-mail se o chamador apresentar um access_token válido de sessão
// autenticada no Supabase (mesmo projeto do Portal HLN), evitando que esse
// endpoint vire um "envie e-mail pra qualquer um" público.

var SUPABASE_URL = 'https://tuuwszzjxxqjgfyncnhn.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1dXdzenpqeHhxamdmeW5jbmhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzMzkzNjksImV4cCI6MjEwMDkxNTM2OX0.JlQf2Hz-16v0aFITkOKbxSQWrrwSHZL-12mgM6BaRwM';
var REMETENTE = 'HLN Embalagens e Equipamentos <orcamento@hopvest.com.br>';

async function usuarioAutenticado(accessToken) {
  if (!accessToken) return false;
  var resp = await fetch(SUPABASE_URL + '/auth/v1/user', {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + accessToken }
  });
  return resp.ok;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método não permitido.' });
    return;
  }

  var body = req.body || {};
  var accessToken = body.accessToken;
  var destinatario = (body.to || '').trim();
  var assunto = (body.subject || '').trim();
  var html = body.html;

  if (!(await usuarioAutenticado(accessToken))) {
    res.status(401).json({ error: 'Sessão inválida ou expirada. Faça login novamente.' });
    return;
  }

  if (!destinatario || !assunto || !html) {
    res.status(400).json({ error: 'Faltam dados para enviar o e-mail (destinatário, assunto ou conteúdo).' });
    return;
  }

  if (!process.env.RESEND_API_KEY) {
    res.status(500).json({ error: 'Envio de e-mail não configurado (RESEND_API_KEY ausente no servidor).' });
    return;
  }

  var resendResp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + process.env.RESEND_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: REMETENTE,
      to: [destinatario],
      subject: assunto,
      html: html
    })
  });

  var resendData = await resendResp.json().catch(function () { return {}; });

  if (!resendResp.ok) {
    res.status(502).json({ error: (resendData && resendData.message) || 'Erro ao enviar e-mail pelo Resend.' });
    return;
  }

  res.status(200).json({ ok: true, id: resendData.id });
};
