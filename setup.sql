-- Tabell för att lagra tokens
CREATE TABLE IF NOT EXISTS tokens (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Tabell för fakturor
CREATE TABLE IF NOT EXISTS invoices (
  id BIGSERIAL PRIMARY KEY,
  document_number TEXT UNIQUE NOT NULL,
  customer_name TEXT,
  customer_number TEXT,
  invoice_date DATE,
  total DECIMAL(10, 2),
  balance DECIMAL(10, 2),
  currency_code TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Tabell för faktura rader (artiklar)
CREATE TABLE IF NOT EXISTS invoice_rows (
  id BIGSERIAL PRIMARY KEY,
  invoice_number TEXT NOT NULL,
  article_number TEXT,
  article_name TEXT,
  description TEXT,
  quantity DECIMAL(10, 2),
  unit_price DECIMAL(10, 2),
  total DECIMAL(10, 2),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Säkerställ kolumner på äldre databaser där invoice_rows redan skapats utan dessa
ALTER TABLE IF EXISTS invoice_rows
  ADD COLUMN IF NOT EXISTS article_number TEXT,
  ADD COLUMN IF NOT EXISTS article_name TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS quantity DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS unit_price DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS total DECIMAL(10, 2);

-- Tabell för artikelregister
CREATE TABLE IF NOT EXISTS article_registry (
  article_number TEXT PRIMARY KEY,
  article_name TEXT,
  description TEXT,
  unit TEXT,
  active BOOLEAN,
  updated_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Tabell för mappning artikelnummer -> rapportgrupp
CREATE TABLE IF NOT EXISTS article_group_mappings (
  article_number TEXT PRIMARY KEY,
  article_name TEXT,
  group_name TEXT NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Tabell för tidsredovisning
CREATE TABLE IF NOT EXISTS time_reports (
  unique_key TEXT PRIMARY KEY,
  report_id TEXT,
  report_date DATE,
  employee_id TEXT,
  employee_name TEXT,
  customer_number TEXT,
  customer_name TEXT,
  project_number TEXT,
  project_name TEXT,
  activity TEXT,
  article_number TEXT,
  hours DECIMAL(10, 2),
  description TEXT,
  updated_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Tabell för mappning kundnummer -> kostnadsställe
CREATE TABLE IF NOT EXISTS customer_costcenter_map (
  customer_number TEXT PRIMARY KEY,
  customer_name TEXT,
  cost_center TEXT,
  active BOOLEAN DEFAULT TRUE,
  cost_center_name TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE IF EXISTS customer_costcenter_map
  ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE;

-- Tabell för mappning anställd-id -> namn och grupp
CREATE TABLE IF NOT EXISTS employee_mappings (
  employee_id TEXT PRIMARY KEY,
  employee_name TEXT,
  group_name TEXT,
  cost_center TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE IF EXISTS employee_mappings
  ADD COLUMN IF NOT EXISTS cost_center TEXT;

-- Tabell för kundavtal (Fortnox ContractAccruals)
CREATE TABLE IF NOT EXISTS contract_accruals (
  customer_number TEXT NOT NULL,
  contract_number TEXT NOT NULL,
  customer_name TEXT,
  description TEXT,
  start_date DATE,
  end_date DATE,
  status TEXT,
  accrual_type TEXT,
  period TEXT,
  total DECIMAL(12, 2),
  currency_code TEXT,
  raw_data JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (customer_number, contract_number)
);

-- Index för snabbare queries
CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(invoice_date);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_name);
CREATE INDEX IF NOT EXISTS idx_invoices_customer_number ON invoices(customer_number);
CREATE INDEX IF NOT EXISTS idx_invoice_rows_invoice ON invoice_rows(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoice_rows_article_number ON invoice_rows(article_number);
CREATE INDEX IF NOT EXISTS idx_article_registry_name ON article_registry(article_name);
CREATE INDEX IF NOT EXISTS idx_article_group_mappings_group ON article_group_mappings(group_name);
CREATE INDEX IF NOT EXISTS idx_time_reports_date ON time_reports(report_date);
CREATE INDEX IF NOT EXISTS idx_time_reports_customer ON time_reports(customer_number);
CREATE INDEX IF NOT EXISTS idx_time_reports_employee ON time_reports(employee_id);
CREATE INDEX IF NOT EXISTS idx_ccm_cost_center ON customer_costcenter_map(cost_center);
CREATE INDEX IF NOT EXISTS idx_employee_mappings_group ON employee_mappings(group_name);
CREATE INDEX IF NOT EXISTS idx_contract_accruals_customer ON contract_accruals(customer_number);
CREATE INDEX IF NOT EXISTS idx_contract_accruals_updated ON contract_accruals(updated_at);

-- Enable Row Level Security (RLS)
ALTER TABLE tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE article_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE article_group_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_costcenter_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_accruals ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS customers ENABLE ROW LEVEL SECURITY;

-- RLS Policies (för säkerhet)
DROP POLICY IF EXISTS "Service role can do everything" ON tokens;
DROP POLICY IF EXISTS "Service role can do everything" ON invoices;
DROP POLICY IF EXISTS "Service role can do everything" ON invoice_rows;
DROP POLICY IF EXISTS "Service role can do everything" ON article_registry;
DROP POLICY IF EXISTS "Service role can do everything" ON article_group_mappings;
DROP POLICY IF EXISTS "Service role can do everything" ON time_reports;
DROP POLICY IF EXISTS "Service role can do everything" ON customer_costcenter_map;
DROP POLICY IF EXISTS "Service role can do everything" ON employee_mappings;
DROP POLICY IF EXISTS "Service role can do everything" ON contract_accruals;

CREATE POLICY "Service role can do everything" ON tokens
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can do everything" ON invoices
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can do everything" ON invoice_rows
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can do everything" ON article_registry
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can do everything" ON article_group_mappings
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can do everything" ON time_reports
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can do everything" ON customer_costcenter_map
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can do everything" ON employee_mappings
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can do everything" ON contract_accruals
  FOR ALL USING (auth.role() = 'service_role');
