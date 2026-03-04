-- Shared contacts model: one contact can be linked to many CRM clients.

CREATE TABLE IF NOT EXISTS crm_contact_directory (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT,
  email TEXT,
  phone TEXT,
  linkedin TEXT,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm_client_contacts (
  client_id BIGINT NOT NULL REFERENCES crm_clients(id) ON DELETE CASCADE,
  contact_id BIGINT NOT NULL REFERENCES crm_contact_directory(id) ON DELETE CASCADE,
  relationship_label TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (client_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_client_contacts_client_id ON crm_client_contacts(client_id);
CREATE INDEX IF NOT EXISTS idx_crm_client_contacts_contact_id ON crm_client_contacts(contact_id);
CREATE INDEX IF NOT EXISTS idx_crm_contact_directory_name ON crm_contact_directory(name);

ALTER TABLE crm_contact_directory ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_client_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can do everything" ON crm_contact_directory;
DROP POLICY IF EXISTS "Service role can do everything" ON crm_client_contacts;

CREATE POLICY "Service role can do everything" ON crm_contact_directory
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can do everything" ON crm_client_contacts
  FOR ALL USING (auth.role() = 'service_role');
