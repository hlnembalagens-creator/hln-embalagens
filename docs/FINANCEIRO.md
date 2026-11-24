# Financeiro e pedidos

- Pedido criado gera entrada(s) previstas em `financeiro_entradas`; botão **Pago** (`pedidos.pago`, `data_pagamento`)
  marca o recebimento e propaga para a entrada. Migração: `sql/add_pedido_pago.sql`.
- Pedido de fornecedor gera saída em `financeiro_saidas` (vinculada por `pedido_id`).
- Botão **Só salvar (pendente)**: salva sem imprimir nem enviar e-mail (rascunho/pedido a fornecedor).
- Vácuo: medidas em **cm** (`20`), convertidas para metros nos cálculos. Quantidade decimal (`0,5` = 500 un.) suportada.
- Importação de extrato OFX: Financeiro > Importar extrato (`admin/js/extrato.js`, tabela `extrato_movimentos`),
  com revisão antes de gravar.

## Conciliação automática do extrato (PDF da Cora → nfe@)

- Na Cora, o extrato em PDF é enviado ao e-mail **nfe@hlnembalagens.com.br**. O cron `api/nfe-email.js` (1x/dia, 8h de Brasília) lê a caixa; PDF de **extrato da Cora** é separado das NFs e vai para `api/_lib/extrato-server.js`.
- O PDF é lido como texto e conferido: soma de entradas/saídas e saldo precisam fechar com os totais do próprio extrato; se não fechar, **nada é aplicado** e a importação fica como "Erro".
- Só entram lançamentos a partir de `2026-11-01` (variável `EXTRATO_INICIO` altera) e depois do último já registrado em `extrato_movimentos` (menos 10 dias). Cada lançamento recebe um id estável (hash), então extratos que se sobrepõem não duplicam.
- **Aplicado sozinho:** entrada já lançada (só registra); baixa de entrada pendente quando valor bate e o nome/CNPJ do cliente confere; vínculo de saída já lançada (acerta a data do pagamento); criação de saída de fornecedor/imposto/contabilidade/telefone.
- **Vai para revisão** (Financeiro → "Extratos recebidos" → Revisar): crédito sem pedido, valor diferente, pagador com outro CNPJ, cartão de crédito, categoria "Outros".
- Tela do Financeiro também aceita o PDF manualmente, com a opção **Só simular** (mostra o plano sem gravar).
- Tabela `extrato_importacoes` (sql/add_extrato_importacoes.sql) guarda o resultado de cada extrato recebido.
