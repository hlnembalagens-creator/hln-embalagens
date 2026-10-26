# Financeiro e pedidos

- Pedido criado gera entrada(s) previstas em `financeiro_entradas`; botão **Pago** (`pedidos.pago`, `data_pagamento`)
  marca o recebimento e propaga para a entrada. Migração: `sql/add_pedido_pago.sql`.
- Pedido de fornecedor gera saída em `financeiro_saidas` (vinculada por `pedido_id`).
- Botão **Só salvar (pendente)**: salva sem imprimir nem enviar e-mail (rascunho/pedido a fornecedor).
- Vácuo: medidas em **cm** (`20`), convertidas para metros nos cálculos. Quantidade decimal (`0,5` = 500 un.) suportada.
- Importação de extrato OFX: Financeiro > Importar extrato (`admin/js/extrato.js`, tabela `extrato_movimentos`),
  com revisão antes de gravar.
