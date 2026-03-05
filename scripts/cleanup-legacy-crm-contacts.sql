-- Raderar alla gamla kontakter i legacy-tabellen (om den finns)
-- Kör denna i Supabase SQL Editor om du vill ta bort ALLA gamla kontakter

-- Om du har tabellen crm_contacts:
truncate table if exists public.crm_contacts;

drop table if exists public.crm_contacts;
