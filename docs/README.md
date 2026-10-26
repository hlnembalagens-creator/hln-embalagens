# Documentação do Portal HLN

| Documento | Conteúdo |
|---|---|
| [PENDENCIAS.md](PENDENCIAS.md) | O que falta fazer, em ordem de prioridade |
| [DOMINIO.md](DOMINIO.md) | Migração para hlnembalagens.com.br (DNS, arquivos a trocar) |
| [EMAIL.md](EMAIL.md) | Plano de e-mail (contato@, nfe@) e Resend |
| [WHATSAPP.md](WHATSAPP.md) | Integração WhatsApp Business, webhook, template |
| [CONTAS.md](CONTAS.md) | Onde fica cada recurso (GitHub, Vercel, Supabase) e limpeza |
| [FINANCEIRO.md](FINANCEIRO.md) | Regras de pedido pago, entradas/saídas e importação de extrato |
| [REGRAS.md](REGRAS.md) | Regras de trabalho combinadas |

Segredos **nunca** vão para o repositório: ficam em variáveis de ambiente da Vercel
(`ANTHROPIC_API_KEY`, `NFE_IMPORT_SECRET`, `RESEND_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`)
e em `scripts/importar-nfe.config.json` (ignorado pelo git).
