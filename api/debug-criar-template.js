// Endpoint temporário — cria o template de mensagem do WhatsApp usado para
// notificar o cliente quando um orçamento fica pronto. Remover depois de usar.
module.exports = async function handler(req, res) {
  var token = process.env.WHATSAPP_ACCESS_TOKEN;
  var wabaId = process.env.WHATSAPP_WABA_ID;
  if (!token || !wabaId) {
    res.status(500).json({ error: 'Faltam envs' });
    return;
  }

  try {
    var resp = await fetch('https://graph.facebook.com/v21.0/' + wabaId + '/message_templates', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'orcamento_pronto',
        language: 'pt_BR',
        category: 'UTILITY',
        components: [
          {
            type: 'BODY',
            text: 'Olá {{1}}, seu orçamento nº {{2}} da HLN Embalagens e Equipamentos já está pronto! Confira os detalhes no e-mail que enviamos ou responda por aqui mesmo se tiver alguma dúvida.',
            example: { body_text: [['João', '1042']] }
          }
        ]
      })
    });
    var data = await resp.json();
    res.status(200).json({ status: resp.status, data: data });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
};
