# Pendências (atualizado em 28/10/2026)

## Em andamento
1. **Domínio** – DNS do Registro.br já valendo na Vercel; falta o HTTPS emitir e trocar as URLs. Ver [DOMINIO.md](DOMINIO.md).
2. **Financeiro – o que falta (usuário)**
   - Apagar o lançamento duplicado "Pagamento DAS" (Administrativo, R$ 84, 30/06/2026); manter "Das" (Imposto):
     `delete from financeiro_saidas where data='2026-06-30' and valor=84 and descricao='Pagamento DAS' and categoria='Administratico';`
     (a confirmação de `delete` pelo conector do Supabase expira; rodar no SQL Editor ou apagar no CRM).
   - Apagar a saída errada do pedido 26 (Americaes, R$ 378, "Fornecedor"); o pedido 26 já tem a entrada paga (R$ 379,00 em 30/09).
   - Refazer no sistema e dar baixa nas vendas recebidas sem pedido: Massue/RA-CHU R$ 1.276,80 (13/07) e R$ 1.157,40 (21/07),
     Dom Bosco R$ 1.008,60 (21/07), Marina R$ 63 (19/08), Casa de Carnes São Miguel R$ 186 (20/08), Heric R$ 378 (26/10, descobrir o cliente).
   - Pedido 7 (RA-CHU, R$ 379,75): sem pagamento encontrado no extrato.
   - Depois: conferir o saldo do Financeiro com o banco (Cora fecha em R$ 4.943,05 em 28/10).

## Feito em 28/10/2026
- Pedido 28 (teste) apagado e pedido 51 (Thermoprint) corrigido para R$ 5.584,00 (itens, saída, ICMS/IPI).
- Baixas pelo extrato Cora (maio–out): pedidos 11, 13 (R$ 5.949,09 com 5% desc.), 17, 18, 19, 23 (R$ 379,51), 24, 26, 27, 32, 34 (R$ 385,81), 35, 37, 55.
- Saídas lançadas do extrato (jul–out) e categorias "Contabilidade" e "Imposto" usadas; transferências próprias (R$ 406 e R$ 500) ignoradas.

## Aguardando terceiros
- **Meta** aprovar o template `orcamento_pronto` (até lá a notificação por WhatsApp falha; o e-mail segue normal).

## Roteiro (atualizado em 30/10/2026)
1. **Site no domínio novo:** publicado. Formulário de contato agora usa `api/contato.js` (Resend), no lugar do FormSubmit
   (que ficou fora do ar, erro 521). Testar com aba anônima e conferir que chega no `contato@`.
2. **Supabase (usuário):** Authentication > URL Configuration: Site URL `https://www.hlnembalagens.com.br`;
   Redirect URLs `https://crm.hlnembalagens.com.br/**` e `https://www.hlnembalagens.com.br/**`.
   Também trocar o `apiUrl` do `scripts/importar-nfe.config.json` local para o domínio novo.
3. **E-mail Locaweb:** `contato@` e `nfe@` criados e testados (receber e enviar OK). DNS: MX, SPF, DMARC, TXT de verificação e CNAMEs.
   Falta: SRV autodiscover (opcional, se o Registro.br aceitar) e a leitura automática do `nfe@` por IMAP
   (precisa servidor/porta do painel; a senha vai só como variável de ambiente na Vercel).
4. **Resend para o domínio da HLN (fazer antes do Google Ads):** conta nova com `contato@`, adicionar o domínio, criar
   DKIM/SPF do subdomínio `send` no Registro.br, trocar `RESEND_API_KEY` na Vercel e o `REMETENTE`
   (`api/enviar-orcamento.js`, `api/esqueci-senha.js`, `api/contato.js`) para `@hlnembalagens.com.br`.
   Hoje remetente é `orcamento@hopvest.com.br`; formulário, orçamentos e recuperação de senha dependem dessa conta.
5. **Visual do site:** fotos reais dos produtos, prova social, layout e auditoria Lighthouse; fazer em branch separada.
6. **Meta Business Suite** e 7. **Google Ads:** em **sessão local** (PC do usuário, com a extensão do Chrome).

## Depois da migração do site
- **E-mail** (contato@, nfe@) – ver [EMAIL.md](EMAIL.md).
- Rever/refazer pedidos antigos (alguns só impressos, sem salvar) e marcar "Com NF" conforme emissor.
- Google Ads (conversão WhatsApp/formulário) e Search Console.
- Limpar projetos antigos na conta QuboTech – ver [CONTAS.md](CONTAS.md).

## Decidido
- Quantidade de embalagens a vácuo fica como está (preço por milheiro).
