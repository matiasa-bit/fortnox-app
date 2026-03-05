-- Skapa app_settings tabell för globala inställningar och synk-timestamps
create table if not exists public.app_settings (
  key text primary key,
  value text,
  updated_at timestamptz default now()
);
