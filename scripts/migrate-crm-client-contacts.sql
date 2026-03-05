-- Skapar tabellen för att koppla CRM-klienter till kontakter
create table if not exists public.crm_client_contacts (
  id bigserial primary key,
  client_id bigint not null references crm_clients(id) on delete cascade,
  contact_id bigint not null references crm_contact_directory(id) on delete cascade,
  created_at timestamptz default now()
);

-- Index för snabbare sökning
create index if not exists idx_crm_client_contacts_client_id on public.crm_client_contacts (client_id);
create index if not exists idx_crm_client_contacts_contact_id on public.crm_client_contacts (contact_id);
