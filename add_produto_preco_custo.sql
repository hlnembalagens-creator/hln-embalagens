-- Guarda o último custo de compra conhecido (vindo da leitura de NF/romaneio),
-- separado do preco_unitario (que é o preço de venda pro cliente).
alter table public.produtos_catalogo
  add column if not exists preco_custo numeric;
