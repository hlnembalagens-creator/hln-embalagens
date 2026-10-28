# Pendências (atualizado em 26/10/2026)

## Em andamento
1. **Domínio** – criar registros DNS no Registro.br e depois trocar URLs. Ver [DOMINIO.md](DOMINIO.md).
2. **Pedidos** – script pronto em `sql/regularizar_pedidos_28_51.sql` (apaga pedido teste 28 e corrige o 51 para R$ 5.584,00). Executar no Supabase SQL Editor.
   (480 × 6,16 + 160 × 8,21 + 160 × 8,21; atualizar também a saída vinculada em `financeiro_saidas`
   e os textos de ICMS R$ 973,48 / IPI R$ 175,77). *Aprovado pelo usuário; aguardando execução no Supabase.*
3. **Extrato Cora** – usuário envia o OFX (01/05–19/10/2026). Antes: apagar a saída errada do pedido 26
   (Americaes, R$ 378, "Fornecedor"). Depois importar em Financeiro > Importar extrato.
   Decidir: Marina R$ 63, Casa de Carnes R$ 186; ignorar transferências próprias de R$ 406 e R$ 500;
   pedidos 7, 11, 13, 17, 18, 19 sem lançamento no financeiro. Saldo final a conferir: **R$ 6.773,82**.

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
