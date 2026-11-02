-- "Sem NF necessária": venda que não precisa de nota fiscal (ex: pessoa física). Aplicado em 02/11/2026.
-- Na mesma data os 23 pedidos de venda sem NF foram marcados (19, 22, 23, 24, 25, 26, 27, 31, 32, 34, 36, 43, 44, 45, 47, 49, 50, 52, 55, 57, 58, 60, 61).
alter table public.pedidos add column if not exists nf_dispensada boolean not null default false;
