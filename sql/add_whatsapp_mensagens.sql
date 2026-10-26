-- Tabela para guardar as mensagens de WhatsApp (recebidas e enviadas) via WhatsApp Cloud API.
create table if not exists whatsapp_mensagens (
  id uuid primary key default gen_random_uuid(),
  telefone_contato text not null,
  nome_contato text,
  cliente_id uuid references clientes(id) on delete set null,
  direcao text not null check (direcao in ('entrada', 'saida')),
  tipo text not null default 'texto',
  corpo text,
  wamid text,
  status text default 'recebida',
  lida boolean not null default false,
  criado_em timestamptz not null default now()
);

create index if not exists idx_whatsapp_mensagens_telefone on whatsapp_mensagens(telefone_contato);
create index if not exists idx_whatsapp_mensagens_criado_em on whatsapp_mensagens(criado_em);

alter table whatsapp_mensagens enable row level security;

create policy "authenticated_all_whatsapp_mensagens"
on whatsapp_mensagens for all
to authenticated
using (true)
with check (true);
