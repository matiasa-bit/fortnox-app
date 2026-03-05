-- Lägg till is_duplicate-kolumn i crm_clients om den saknas
alter table public.crm_clients
add column if not exists is_duplicate boolean default false;
