-- Status de pagamento do pedido (separado do "tipo"/"status_orcamento" que já existiam).
-- Um pedido criado já gera a(s) entrada(s) prevista(s) no Financeiro (na data de cada
-- parcela/boleto), mas sem isso o sistema não sabia se o dinheiro já entrou de verdade.
-- O botão "Pago" marca isso e propaga pra entrada financeira correspondente.
alter table pedidos add column if not exists pago boolean not null default false;
alter table pedidos add column if not exists data_pagamento date;

alter table financeiro_entradas add column if not exists pago boolean not null default false;
alter table financeiro_entradas add column if not exists data_pagamento date;
