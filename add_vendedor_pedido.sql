-- Liga cada pedido a quem o salvou por último (vendedor responsável, pra comissão).
alter table public.pedidos
  add column if not exists vendedor_id uuid references public.profiles(id);

-- Percentual de comissão por vendedor — 5% como padrão, ajustável por pessoa se
-- no futuro alguém tiver uma comissão diferente.
alter table public.profiles
  add column if not exists comissao_percentual numeric not null default 5;
