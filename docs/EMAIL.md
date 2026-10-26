# E-mail

**Status:** adiado até depois da migração do site.

- Opções: Locaweb (R$ 4,99/caixa) ou Zoho Lite (R$ 6,35). Requisito: IMAP.
- Caixas: `contato@` (substitui hlnembalagens@gmail.com no site, formulário, privacidade e JSON-LD)
  e `nfe@` (leitura diária por IMAP de romaneios/NF → fila do Estoque, reaproveitando
  `api/_lib/ler-documento.js` e a tabela `estoque_importacoes_pendentes`).
- Resend hoje envia de `@hopvest.com.br` (`api/enviar-orcamento.js`, `api/esqueci-senha.js`).
  Migrar: adicionar o domínio no Resend, DKIM/SPF no Registro.br, trocar `REMETENTE`.
