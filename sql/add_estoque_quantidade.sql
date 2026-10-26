-- Quantidade em estoque por produto do catálogo. Começa em 0 pra todo mundo —
-- na Fase 1 o ajuste é manual; a Fase 2 (leitura de NF/romaneio) vai alimentar
-- isso automaticamente.
alter table public.produtos_catalogo
  add column if not exists quantidade_estoque numeric not null default 0;
