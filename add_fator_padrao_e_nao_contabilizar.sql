-- Configuração geral do sistema (chave/valor) — começa com o Fator padrão
-- usado nos itens de vácuo. Vendedor trabalha com esse valor fechado; só
-- admin/ADM1 pode alterar o Fator de um item específico (negociação especial).
create table if not exists configuracoes (
  chave text primary key,
  valor text,
  updated_at timestamptz not null default now()
);

insert into configuracoes (chave, valor)
values ('fator_padrao_vacuo', '0')
on conflict (chave) do nothing;

alter table configuracoes enable row level security;

create policy "authenticated_all_configuracoes"
on configuracoes for all
to authenticated
using (true)
with check (true);

-- Clientes genéricos (ex: um cadastro "Orçamento" usado só pra registrar
-- orçamentos sem cliente definido) não devem gerar lançamento no Financeiro
-- quando um pedido vira "pedido" de verdade — fica livre no sistema, só não
-- entra na contabilidade.
alter table clientes add column if not exists nao_contabilizar boolean not null default false;
