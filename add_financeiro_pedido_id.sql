-- Liga cada entrada financeira ao pedido que a gerou automaticamente.
-- ON DELETE CASCADE: se o pedido for excluído, as entradas geradas dele somem junto
-- (entradas cadastradas manualmente, sem pedido_id, nunca são afetadas).
alter table public.financeiro_entradas
  add column if not exists pedido_id uuid references public.pedidos(id) on delete cascade;
