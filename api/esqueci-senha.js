// Função serverless (Vercel) — fluxo de "esqueci minha senha".
// Confere usuário + e-mail cadastrado, gera um link de redefinição via
// Supabase (service_role) e manda por e-mail via Resend. Sempre responde
// de forma genérica, pra não revelar se o usuário/e-mail existe.

var SUPABASE_URL = 'https://tuuwszzjxxqjgfyncnhn.supabase.co';
var REMETENTE = 'HLN Embalagens e Equipamentos <naoresponda@hopvest.com.br>';
var SYNTHETIC_DOMAIN = '@hln.internal';
var REDIRECT_TO = 'https://hln-embalagens.vercel.app/admin/trocar-senha.html';

function usernameToEmail(username) {
  return username.trim().toLowerCase().replace(/\s+/g, '.') + SYNTHETIC_DOMAIN;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método não permitido.' });
    return;
  }

  var body = req.body || {};
  var respostaGenerica = { ok: true, message: 'Se os dados estiverem certos, você vai receber um e-mail com as instruções.' };

  var nomeUsuario = (body.nomeUsuario || '').trim();
  var email = (body.email || '').trim();

  if (!nomeUsuario || !email) {
    res.status(200).json(respostaGenerica);
    return;
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.RESEND_API_KEY) {
    res.status(500).json({ error: 'Redefinição de senha não configurada no servidor.' });
    return;
  }
  var serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  var adminHeaders = { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey, 'Content-Type': 'application/json' };

  try {
    var perfilResp = await fetch(
      SUPABASE_URL + '/rest/v1/profiles?nome_usuario=eq.' + encodeURIComponent(nomeUsuario) + '&select=id,email,nome_exibicao',
      { headers: adminHeaders }
    );
    var perfis = await perfilResp.json();
    var perfil = perfis[0];

    if (!perfil || !perfil.email || perfil.email.toLowerCase() !== email.toLowerCase()) {
      // Usuário não existe ou e-mail não bate — mesma resposta genérica, sem detalhar o motivo.
      res.status(200).json(respostaGenerica);
      return;
    }

    var linkResp = await fetch(SUPABASE_URL + '/auth/v1/admin/generate_link', {
      method: 'POST', headers: adminHeaders,
      body: JSON.stringify({ type: 'recovery', email: usernameToEmail(nomeUsuario), redirect_to: REDIRECT_TO })
    });
    var linkData = await linkResp.json();

    if (!linkResp.ok || !linkData.action_link) {
      res.status(200).json(respostaGenerica);
      return;
    }

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: REMETENTE,
        to: [perfil.email],
        subject: 'Redefinição de senha — Portal HLN',
        html: '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>' +
          '<p>Olá, ' + (perfil.nome_exibicao || '') + '.</p>' +
          '<p>Recebemos um pedido pra redefinir a senha do seu login (<strong>' + nomeUsuario + '</strong>) no Portal HLN.</p>' +
          '<p><a href="' + linkData.action_link + '">Clique aqui pra definir uma nova senha</a></p>' +
          '<p>Se você não pediu isso, pode ignorar este e-mail — sua senha continua a mesma.</p>' +
          '</body></html>'
      })
    });

    res.status(200).json(respostaGenerica);
  } catch (err) {
    res.status(200).json(respostaGenerica);
  }
};
