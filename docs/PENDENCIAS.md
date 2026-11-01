# Pendências (atualizado em 01/11/2026)

## Agora
1. **Leitura automática do `nfe@`** (`api/nfe-email.js`, Vercel Cron 08:00 BRT): variáveis cadastradas e redeploy feito.
   Falta testar: mandar PDF de NF para `nfe@`, rodar em Vercel > Settings > Cron Jobs > Run, conferir a fila em Estoque
   e a pasta "Processados" da caixa.
2. **Supabase (usuário):** Authentication > URL Configuration: Site URL `https://www.hlnembalagens.com.br`;
   Redirect URLs `https://crm.hlnembalagens.com.br/**` e `https://www.hlnembalagens.com.br/**`
   (sem isso o "esqueci a senha" falha). Trocar também o `apiUrl` do `scripts/importar-nfe.config.json` local.
3. **Financeiro (usuário):**
   - Apagar o "Pagamento DAS" duplicado (Administrativo, R$ 84, 30/06/2026); manter "Das" (Imposto):
     `delete from financeiro_saidas where data='2026-06-30' and valor=84 and descricao='Pagamento DAS' and categoria='Administratico';`
   - Apagar a saída errada do pedido 26 (Americaes, R$ 378, "Fornecedor").
   - Refazer no sistema e dar baixa nas vendas recebidas sem pedido: Massue/RA-CHU R$ 1.276,80 (13/07) e R$ 1.157,40 (21/07),
     Dom Bosco R$ 1.008,60 (21/07), Marina R$ 63 (19/08), Casa de Carnes São Miguel R$ 186 (20/08), Heric R$ 378 (26/10, descobrir o cliente).
   - Pedido 7 (RA-CHU, R$ 379,75): sem pagamento no extrato.
   - Conferir o saldo do Financeiro com o banco (Cora: R$ 4.943,05 em 28/10).
4. **Pedidos antigos:** rever/refazer os que só foram impressos (números 1–4, 6, 8–10, 12, 14, 15, 20, 21, 29, 30, 40, 41, 48 não existem no sistema)
   e marcar "Com NF" conforme o emissor.

## Próximos
5. **Resend para o domínio da HLN (antes do Google Ads):** conta nova com `contato@`, adicionar o domínio, DKIM/SPF do subdomínio `send`
   no Registro.br, trocar `RESEND_API_KEY` na Vercel e o `REMETENTE` em `api/enviar-orcamento.js`, `api/esqueci-senha.js`, `api/contato.js`
   (hoje `orcamento@hopvest.com.br`; formulário, orçamentos e recuperação de senha dependem dessa conta).
6. **Visual do site:** fotos reais dos produtos, prova social, layout e auditoria Lighthouse (branch separada).
7. **Meta Business Suite** (WhatsApp Business, WABA, template `orcamento_pronto`, página/Instagram, permissões) e 8. **Google Ads**
   (conversão WhatsApp/formulário, Search Console): em **sessão local** (PC do usuário, com a extensão do Chrome).
9. **Apagar projetos antigos nas contas QuboTech** (Vercel e Supabase da HLN já estão na conta da HLN; ver [CONTAS.md](CONTAS.md)).

## Aguardando terceiros
- **Meta** aprovar o template `orcamento_pronto` (até lá a notificação por WhatsApp falha; o e-mail segue normal).

## Opcional
- Registros SRV `_autodiscover._tcp` e CNAMEs `pop`, `imap`, `smtp`, `mail`, `webmail`, `calendario` no Registro.br
  (só para configurar o e-mail em celular/Outlook; o servidor IMAP é `email-ssl.com.br`, porta 993).
- Corrigir `function_search_path_mutable` em `resequenciar_codigos_produtos` e ligar proteção contra senhas vazadas no Supabase Auth.

## Feito
- Pedidos 28 (apagado) e 51 (R$ 5.584,00); baixas e saídas conciliadas com o extrato da Cora (maio–out); DAS e demais saídas lançadas.
- Domínio `www`/`crm` no ar com HTTPS; CRM redireciona para `crm.hlnembalagens.com.br`; `vercel.app` redireciona (exceto `/api`).
- E-mail Locaweb: `contato@` e `nfe@` funcionando (MX, SPF, DMARC); site usa `contato@`; formulário próprio (`api/contato.js`).

## Decidido
- Quantidade de embalagens a vácuo fica como está (preço por milheiro).
- Resend migra para o domínio da HLN antes do Google Ads.
