-- Kundavtal från Fortnox ContractAccruals

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

-- Säkerställ composite key även på redan existerande tabeller
ALTER TABLE contract_accruals
  ALTER COLUMN customer_number SET NOT NULL,
  ALTER COLUMN contract_number SET NOT NULL;

ALTER TABLE contract_accruals DROP CONSTRAINT IF EXISTS contract_accruals_pkey;
ALTER TABLE contract_accruals ADD CONSTRAINT contract_accruals_pkey PRIMARY KEY (customer_number, contract_number);

CREATE INDEX IF NOT EXISTS idx_contract_accruals_customer ON contract_accruals(customer_number);
CREATE INDEX IF NOT EXISTS idx_contract_accruals_updated ON contract_accruals(updated_at);

ALTER TABLE contract_accruals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can do everything" ON contract_accruals;

CREATE POLICY "Service role can do everything" ON contract_accruals
  FOR ALL USING (auth.role() = 'service_role');
