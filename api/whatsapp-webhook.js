// Função serverless (Vercel) — webhook do WhatsApp Cloud API (Meta).
// GET: responde o desafio de verificação que a Meta manda ao configurar o webhook.
// POST: recebe mensagens/eventos em tempo real e grava na tabela whatsapp_mensagens.

var SUPABASE_URL = 'https://tuuwszzjxxqjgfyncnhn.supabase.co';

function apenasDigitos(str) {
  return (str || '').replace(/\D/g, '');
}

async function buscarClientePorTelefone(telefone, serviceKey) {
  var digitos = apenasDigitos(telefone);
  if (digitos.length < 8) return null;
  var ultimos9 = digitos.slice(-9);
  var headers = { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey };
  try {
    var resp = await fetch(
      SUPABASE_URL + '/rest/v1/clientes?select=id,razao_social,nome_fantasia&or=(' +
        'telefone_empresa.ilike.*' + ultimos9 + '*,' +
        'contato_telefone.ilike.*' + ultimos9 + '*' +
      ')&limit=1',
      { headers: headers }
    );
    var rows = await resp.json();
    return rows && rows[0] ? rows[0] : null;
  } catch (err) {
    return null;
  }
}

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    var mode = req.query['hub.mode'];
    var token = req.query['hub.verify_token'];
    var challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
      res.status(200).send(challenge);
      return;
    }
    res.status(403).send('Token de verificação inválido.');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método não permitido.' });
    return;
  }

  // A Meta espera 200 rápido pra não reenviar o evento; qualquer erro de processamento
  // é só logado, nunca retorna erro pra Meta.
  try {
    var serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) {
      res.status(200).json({ ok: true });
      return;
    }

    var body = req.body || {};
    var entries = body.entry || [];

    for (var i = 0; i < entries.length; i++) {
      var changes = entries[i].changes || [];
      for (var j = 0; j < changes.length; j++) {
        var value = (changes[j] || {}).value || {};
        var mensagens = value.messages || [];
        var contatos = value.contacts || [];

        for (var k = 0; k < mensagens.length; k++) {
          var msg = mensagens[k];
          var contato = contatos[k] || contatos[0] || {};
          var nomeContato = contato.profile && contato.profile.name ? contato.profile.name : null;
          var telefone = msg.from;

          var corpo = null;
          if (msg.type === 'text' && msg.text) corpo = msg.text.body;
          else if (msg.type === 'button' && msg.button) corpo = msg.button.text;
          else if (msg.type === 'interactive' && msg.interactive) {
            corpo = (msg.interactive.button_reply && msg.interactive.button_reply.title) ||
                    (msg.interactive.list_reply && msg.interactive.list_reply.title) || null;
          }

          var clienteEncontrado = await buscarClientePorTelefone(telefone, serviceKey);

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
              nome_contato: nomeContato,
              cliente_id: clienteEncontrado ? clienteEncontrado.id : null,
              direcao: 'entrada',
              tipo: msg.type || 'texto',
              corpo: corpo,
              wamid: msg.id,
              status: 'recebida'
            })
          });
        }
      }
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(200).json({ ok: true });
  }
};
