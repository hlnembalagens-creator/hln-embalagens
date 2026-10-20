-- Movimentos do extrato bancário (OFX) já tratados no Financeiro. O FITID é o identificador único
-- que o banco dá a cada lançamento: guardando ele, importar o mesmo extrato de novo (ou um extrato
-- que se sobrepõe ao anterior) nunca duplica nada.
create table if not exists extrato_movimentos (
  fitid text primary key,
  data date not null,
  valor numeric not null,              -- positivo = crédito, negativo = débito
  memo text,
  acao text not null check (acao in ('baixa_entrada', 'entrada_criada', 'ja_lancado', 'saida_vinculada', 'saida_criada', 'ignorado')),
  entrada_id uuid references financeiro_entradas(id) on delete set null,
  saida_id uuid references financeiro_saidas(id) on delete set null,
  created_by uuid,
  created_at timestamptz not null default now()
);

alter table extrato_movimentos enable row level security;

create policy "authenticated_all_extrato_movimentos"
  on extrato_movimentos for all to authenticated
  using (true) with check (true);
