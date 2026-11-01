-- Usuário desativado não entra mais no sistema, mas o histórico (pedidos, financeiro) continua ligado a ele.
alter table public.profiles add column if not exists ativo boolean not null default true;
