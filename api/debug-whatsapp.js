// Endpoint temporário de diagnóstico — remover depois de investigar o webhook do WhatsApp.
module.exports = async function handler(req, res) {
  var token = process.env.WHATSAPP_ACCESS_TOKEN;
  var wabaId = process.env.WHATSAPP_WABA_ID;
  if (!token || !wabaId) {
    res.status(500).json({ error: 'Faltam envs' });
    return;
  }
  try {
    var resp = await fetch(
      'https://graph.facebook.com/v21.0/' + wabaId + '/subscribed_apps',
      { headers: { Authorization: 'Bearer ' + token } }
    );
    var data = await resp.json();
    res.status(200).json({ status: resp.status, data: data });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
};
