-- Extratos em PDF recebidos pelo e-mail nfe@ (ou enviados pela tela do Financeiro) e o que o sistema fez com eles.
-- O que o servidor conseguiu conciliar com segurança é aplicado na hora; o resto fica em movimentos_revisar
-- para o admin decidir na tela do Financeiro.
create table if not exists extrato_importacoes (
  id uuid primary key default gen_random_uuid(),
  nome_arquivo text,
  periodo_de date,
  periodo_ate date,
  saldo numeric,
  status text not null check (status in ('aplicado', 'revisar', 'revisado', 'erro')),
  resumo jsonb not null default '{}'::jsonb,
  movimentos_revisar jsonb not null default '[]'::jsonb,
  erro text,
  created_at timestamptz not null default now(),
  revisado_em timestamptz
);

alter table extrato_importacoes enable row level security;

create policy "authenticated_all_extrato_importacoes"
  on extrato_importacoes for all to authenticated
  using (true) with check (true);
