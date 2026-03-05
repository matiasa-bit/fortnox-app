-- Taggbibliotek
create table if not exists public.crm_tags (
  id bigserial primary key,
  name text not null,
  color text not null default '#3b9eff',
  created_at timestamptz default now()
);

-- Koppling kund <-> tagg
create table if not exists public.crm_client_tags (
  id bigserial primary key,
  client_id bigint not null references crm_clients(id) on delete cascade,
  tag_id bigint not null references crm_tags(id) on delete cascade,
  created_at timestamptz default now(),
  constraint crm_client_tags_unique unique (client_id, tag_id)
);

create index if not exists idx_crm_client_tags_client on public.crm_client_tags(client_id);
create index if not exists idx_crm_client_tags_tag on public.crm_client_tags(tag_id);
