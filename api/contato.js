// Função serverless (Vercel) — recebe o formulário de contato do site e envia
// o e-mail para a HLN pelo Resend (RESEND_API_KEY fica só no servidor).
// Substitui o FormSubmit: sem etapa de ativação e sem depender de terceiro.
// O destinatário é fixo, então o endpoint não serve para mandar e-mail a terceiros.

var DESTINATARIO = 'contato@hlnembalagens.com.br';
var REMETENTE = 'HLN Embalagens e Equipamentos <orcamento@hopvest.com.br>';
var LIMITE = { nome: 120, email: 160, telefone: 40, mensagem: 3000 };

function escapar(texto) {
  return String(texto).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function limpar(valor, max) {
  return String(valor == null ? '' : valor).replace(/[\r\n]+/g, ' ').trim().slice(0, max);
}

function paginaErro(res, status, texto) {
  res.status(status).setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>HLN Embalagens</title><body style="font-family:sans-serif;max-width:520px;margin:12vh auto;padding:0 16px">' +
    '<h1>' + escapar(texto) + '</h1><p>Você pode falar com a gente pelo WhatsApp ou tentar novamente.</p>' +
    '<p><a href="/">Voltar ao site</a></p></body>');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).setHeader('Allow', 'POST');
    res.send('Método não permitido.');
    return;
  }

  var body = req.body || {};

  // Honeypot: campo invisível; se vier preenchido é robô — finge sucesso e descarta.
  if (body._honey) {
    res.redirect(303, '/obrigado.html');
    return;
  }

  var nome = limpar(body.Nome, LIMITE.nome);
  var email = limpar(body['E-mail'], LIMITE.email);
  var telefone = limpar(body.Telefone, LIMITE.telefone);
  var mensagem = String(body.Mensagem == null ? '' : body.Mensagem).trim().slice(0, LIMITE.mensagem);

  if (!nome || !mensagem || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    paginaErro(res, 400, 'Preencha nome, e-mail válido e mensagem.');
    return;
  }

  if (!process.env.RESEND_API_KEY) {
    paginaErro(res, 500, 'Não foi possível enviar sua mensagem agora.');
    return;
  }

  var html = '<h2>Novo contato pelo site HLN Embalagens</h2>' +
    '<table cellpadding="6" style="border-collapse:collapse">' +
    '<tr><td><b>Nome</b></td><td>' + escapar(nome) + '</td></tr>' +
    '<tr><td><b>E-mail</b></td><td>' + escapar(email) + '</td></tr>' +
    '<tr><td><b>Telefone / WhatsApp</b></td><td>' + escapar(telefone || '—') + '</td></tr>' +
    '<tr><td valign="top"><b>Mensagem</b></td><td>' + escapar(mensagem).replace(/\n/g, '<br>') + '</td></tr>' +
    '</table>';

  var resp;
  try {
    resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: REMETENTE,
        to: [DESTINATARIO],
        reply_to: email,
        subject: 'Novo contato pelo site HLN Embalagens — ' + nome,
        html: html
      })
    });
  } catch (e) {
    paginaErro(res, 502, 'Não foi possível enviar sua mensagem agora.');
    return;
  }

  if (!resp.ok) {
    paginaErro(res, 502, 'Não foi possível enviar sua mensagem agora.');
    return;
  }

  res.redirect(303, '/obrigado.html');
};
