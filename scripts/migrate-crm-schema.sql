-- CRM schema for internal accounting firm client relationship management

CREATE TABLE IF NOT EXISTS crm_clients (
  id BIGSERIAL PRIMARY KEY,
  company_name TEXT NOT NULL,
  organization_number TEXT NOT NULL,
  customer_number TEXT,
  industry TEXT,
  revenue NUMERIC(14,2),
  employees INTEGER,
  client_status TEXT NOT NULL DEFAULT 'active' CHECK (client_status IN ('active','paused','former')),
  start_date DATE,
  responsible_consultant TEXT,
  office TEXT,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE IF EXISTS crm_clients
  ADD COLUMN IF NOT EXISTS customer_number TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_clients_orgnr_unique ON crm_clients(organization_number);
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_clients_customer_number_unique ON crm_clients(customer_number) WHERE customer_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_clients_company_name ON crm_clients(company_name);
CREATE INDEX IF NOT EXISTS idx_crm_clients_status ON crm_clients(client_status);

CREATE TABLE IF NOT EXISTS crm_contacts (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT NOT NULL REFERENCES crm_clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT,
  email TEXT,
  phone TEXT,
  linkedin TEXT,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_contacts_client_id ON crm_contacts(client_id);

CREATE TABLE IF NOT EXISTS crm_services (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT NOT NULL REFERENCES crm_clients(id) ON DELETE CASCADE,
  service_type TEXT NOT NULL,
  price NUMERIC(12,2),
  billing_model TEXT,
  start_date DATE,
  responsible_consultant TEXT,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_services_client_id ON crm_services(client_id);

CREATE TABLE IF NOT EXISTS crm_activities (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT NOT NULL REFERENCES crm_clients(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('meeting','call','email','note')),
  description TEXT NOT NULL,
  created_by TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_activities_client_id ON crm_activities(client_id);
CREATE INDEX IF NOT EXISTS idx_crm_activities_date ON crm_activities(date DESC);

CREATE TABLE IF NOT EXISTS crm_document_links (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT NOT NULL REFERENCES crm_clients(id) ON DELETE CASCADE,
  document_type TEXT,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_document_links_client_id ON crm_document_links(client_id);

ALTER TABLE crm_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_document_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can do everything" ON crm_clients;
DROP POLICY IF EXISTS "Service role can do everything" ON crm_contacts;
DROP POLICY IF EXISTS "Service role can do everything" ON crm_services;
DROP POLICY IF EXISTS "Service role can do everything" ON crm_activities;
DROP POLICY IF EXISTS "Service role can do everything" ON crm_document_links;

CREATE POLICY "Service role can do everything" ON crm_clients
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can do everything" ON crm_contacts
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can do everything" ON crm_services
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can do everything" ON crm_activities
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can do everything" ON crm_document_links
  FOR ALL USING (auth.role() = 'service_role');
