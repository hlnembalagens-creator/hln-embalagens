-- "Nº do pedido do cliente": número que o cliente manda no pedido dele (aparece no documento quando preenchido). Aplicado em 05/11/2026.
alter table public.pedidos add column if not exists pedido_cliente text;
