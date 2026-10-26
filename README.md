# Portal HLN Embalagens

Site institucional estático + CRM interno (`/admin`) da HLN Embalagens.

- **Front:** HTML/CSS/JS puro (sem build), servido pela Vercel.
- **Backend:** funções serverless em `api/` (Vercel) + Supabase (Postgres/Auth).
- **Integrações:** WhatsApp Business Cloud API, Resend (e-mail), Anthropic (leitura de NF/romaneio).

## Mapa do repositório

| Pasta/arquivo | O que é |
|---|---|
| `index.html`, `obrigado.html`, `privacidade.html`, `404.html` | Site público |
| `css/`, `js/`, `assets/` | Estilos, scripts e imagens do site |
| `admin/` | CRM: pedidos, clientes, financeiro, estoque, mensagens, relatórios |
| `admin/js/` | Lógica de cada tela do CRM |
| `api/` | Funções serverless (WhatsApp, e-mail, NF, usuários) |
| `scripts/` | Utilitários rodados no PC (importar NF-e, atualizar NCM) |
| `sql/` | Migrações SQL já aplicadas no Supabase, em ordem histórica |
| `docs/` | Documentação (comece por `docs/README.md`) |

Documentação completa em [`docs/`](docs/README.md).
