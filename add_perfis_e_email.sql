-- Amplia os perfis possíveis (mantendo 'admin' e 'vendedor' já existentes
-- funcionando normalmente) e guarda o e-mail real de cada pessoa, usado
-- pelo fluxo de "esqueci minha senha" (o login usa e-mail sintético
-- @hln.internal, que não existe de verdade pra receber e-mail).
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('admin', 'admin1', 'vendedor', 'vendedor_ext', 'vendedor_int'));

alter table public.profiles add column if not exists email text;
