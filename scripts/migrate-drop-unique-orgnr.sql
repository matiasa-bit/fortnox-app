-- Ta bort unikt index på organization_number så att flera kunder kan dela samma orgnr
drop index if exists idx_crm_clients_orgnr_unique;
