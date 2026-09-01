-- Marca clientes que na verdade são fornecedores (ex: Altisvac), usados só pra
-- registrar compras/pedidos feitos a eles — não devem contar nos rankings do
-- Dashboard (top clientes, produtos vendidos, mapa de calor).
alter table public.clientes
  add column if not exists eh_fornecedor boolean not null default false;
