-- Mesma ligação da entradas, agora para saídas — necessário porque pedidos feitos
-- a um cadastro marcado como fornecedor viram saída (dívida com o fornecedor),
-- não entrada.
alter table public.financeiro_saidas
  add column if not exists pedido_id uuid references public.pedidos(id) on delete cascade;
