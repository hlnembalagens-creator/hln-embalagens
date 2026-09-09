// Função serverless (Vercel) — envia mensagens via WhatsApp Cloud API (texto livre
// ou template aprovado) e grava o envio na tabela whatsapp_mensagens.

var SUPABASE_URL = 'https://tuuwszzjxxqjgfyncnhn.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1dXdzenpqeHhxamdmeW5jbmhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzMzkzNjksImV4cCI6MjEwMDkxNTM2OX0.JlQf2Hz-16v0aFITkOKbxSQWrrwSHZL-12mgM6BaRwM';

async function usuarioAutenticado(accessToken) {
  if (!accessToken) return null;
  var resp = await fetch(SUPABASE_URL + '/auth/v1/user', {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + accessToken }
  });
  if (!resp.ok) return null;
  return await resp.json();
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método não permitido.' });
    return;
  }

  var body = req.body || {};
  var user = await usuarioAutenticado(body.accessToken);
  if (!user) {
    res.status(401).json({ error: 'Sessão inválida ou expirada. Faça login novamente.' });
    return;
  }

  var telefone = String(body.to || '').replace(/\D/g, '');
  var tipo = body.tipo === 'template' ? 'template' : 'text';

  if (!telefone) {
    res.status(400).json({ error: 'Telefone inválido.' });
    return;
  }

  if (!process.env.WHATSAPP_ACCESS_TOKEN || !process.env.WHATSAPP_PHONE_NUMBER_ID) {
    res.status(500).json({ error: 'Envio de WhatsApp não configurado no servidor.' });
    return;
  }

  var payload = { messaging_product: 'whatsapp', to: telefone };
  var corpoParaHistorico;

  if (tipo === 'template') {
    var templateName = (body.templateName || '').trim();
    if (!templateName) {
      res.status(400).json({ error: 'Faltou informar o template a ser usado.' });
      return;
    }
    payload.type = 'template';
    payload.template = { name: templateName, language: { code: body.templateLanguage || 'pt_BR' } };
    if (body.templateComponents) payload.template.components = body.templateComponents;
    corpoParaHistorico = '[template: ' + templateName + ']';
  } else {
    var texto = (body.texto || '').trim();
    if (!texto) {
      res.status(400).json({ error: 'Mensagem vazia.' });
      return;
    }
    payload.type = 'text';
    payload.text = { body: texto };
    corpoParaHistorico = texto;
  }

  var waResp = await fetch(
    'https://graph.facebook.com/v21.0/' + process.env.WHATSAPP_PHONE_NUMBER_ID + '/messages',
    {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + process.env.WHATSAPP_ACCESS_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }
  );
  var waData = await waResp.json().catch(function () { return {}; });

  if (!waResp.ok) {
    var mensagemErro = (waData.error && waData.error.message) || 'Erro ao enviar mensagem pelo WhatsApp.';
    // Erro comum: tentar mandar texto livre fora da janela de 24h — só template serve nesse caso.
    res.status(502).json({ error: mensagemErro });
    return;
  }

  var wamid = waData.messages && waData.messages[0] && waData.messages[0].id;

  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    var serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    await fetch(SUPABASE_URL + '/rest/v1/whatsapp_mensagens', {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: 'Bearer ' + serviceKey,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({
        telefone_contato: telefone,
        direcao: 'saida',
        tipo: tipo,
        corpo: corpoParaHistorico,
        wamid: wamid || null,
        status: 'enviada',
        lida: true
      })
    });
  }

  res.status(200).json({ ok: true, wamid: wamid || null });
};
