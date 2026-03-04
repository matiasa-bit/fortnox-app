-- Employee mappings table for Fortnox user -> name/group settings

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

CREATE INDEX IF NOT EXISTS idx_employee_mappings_group ON employee_mappings(group_name);

ALTER TABLE employee_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can do everything" ON employee_mappings;

CREATE POLICY "Service role can do everything" ON employee_mappings
  FOR ALL USING (auth.role() = 'service_role');
