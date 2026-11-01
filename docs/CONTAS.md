# Contas e recursos (conferido em 01/11/2026)

| Recurso | Situação |
|---|---|
| GitHub `hlnembalagens-creator/hln-embalagens` | Conta HLN |
| Vercel projeto `hln-embalagens` | Conta HLN (usuário `hlnembalagens-2194`, e-mail da HLN, plano Hobby, 2FA ligado). É o único projeto da conta; domínios `www`, `crm` e raiz estão nele |
| Supabase `tuuwszzjxxqjgfyncnhn` | Organização `hlnembalagens-creator's Org`, único projeto, ACTIVE_HEALTHY. É o banco de produção (dados reais conferidos) |
| Registro.br `hlnembalagens.com.br` | DNS no próprio Registro.br |
| Locaweb e-mail | `contato@` e `nfe@` (IMAP `email-ssl.com.br:993`) |
| Resend | Ainda em conta fora da HLN, remetente `@hopvest.com.br` — migrar (ver PENDENCIAS.md) |

**Vercel e Supabase não precisam de migração**: os conectores só enxergam recursos da HLN.

## Limpeza (exige login do usuário nas contas antigas)
Sobras de protótipos nas contas QuboTech, que os conectores desta sessão não enxergam:
Supabase `hln-embalagens` (antigo), `hln-gestao-crm`; Vercel `hln-embalagens` (antigo), `hln-gestao-crm`, `gestao-crm`.
Excluir manualmente depois de conferir que nada de produção depende delas.

## Opcional
- Os cadastros da Vercel (e talvez GitHub e Supabase) ainda usam o Gmail antigo `hlnembalagens@gmail.com`.
  Quando quiser, trocar para `contato@hlnembalagens.com.br` em cada serviço (1 de cada vez, conferindo o e-mail de confirmação).
