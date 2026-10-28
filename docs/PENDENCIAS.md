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

## Roteiro (ordem combinada em 28/10/2026)
1. Finalizar o site no domínio novo (aguardando emissão do HTTPS).
2. E-mail (contato@, nfe@).
3. **Meta Business Suite:** configurar e conferir tudo (WhatsApp Business, WABA, template `orcamento_pronto`, página/Instagram, permissões).
4. **Google Ads:** conversão por WhatsApp/formulário e Search Console.

## Depois da migração do site
- **E-mail** (contato@, nfe@) – ver [EMAIL.md](EMAIL.md).
- Rever/refazer pedidos antigos (alguns só impressos, sem salvar) e marcar "Com NF" conforme emissor.
- Google Ads (conversão WhatsApp/formulário) e Search Console.
- Limpar projetos antigos na conta QuboTech – ver [CONTAS.md](CONTAS.md).

## Decidido
- Quantidade de embalagens a vácuo fica como está (preço por milheiro).
