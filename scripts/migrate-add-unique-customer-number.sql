-- Gör customer_number unik i crm_clients
alter table public.crm_clients
add constraint crm_clients_customer_number_key unique (customer_number);
