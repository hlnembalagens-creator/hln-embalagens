# WhatsApp Business (Cloud API)

- `api/whatsapp-webhook.js` – recebe mensagens, grava em `whatsapp_mensagens` e vincula ao cliente pelo telefone.
- `api/whatsapp-enviar.js` – envia respostas/templates.
- `admin/mensagens.html` + `admin/js/mensagens.js` – caixa de entrada (atualiza a cada 15 s).
- Tabela: `sql/add_whatsapp_mensagens.sql`.
- Variáveis: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.

## Pontos de atenção
- App da Meta precisa estar em **Live** para receber mensagens reais.
- Só o toggle não basta: a WABA precisa ser assinada com `POST /{waba-id}/subscribed_apps`.
- Template `orcamento_pronto`: enviado junto com o e-mail ao gerar orçamento; **pendente de aprovação da Meta**
  (falha silenciosa até lá).
