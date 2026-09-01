-- Adiciona o campo de perfil (admin / vendedor) na tabela profiles.
-- Usuários existentes continuam como 'admin' por padrão (não perdem acesso a nada).
alter table public.profiles
  add column if not exists role text not null default 'admin'
  check (role in ('admin', 'vendedor'));
