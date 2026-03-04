-- Mapping table for grouping article numbers into report groups

CREATE TABLE IF NOT EXISTS article_group_mappings (
  article_number TEXT PRIMARY KEY,
  article_name TEXT,
  group_name TEXT NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_article_group_mappings_group ON article_group_mappings(group_name);

ALTER TABLE article_group_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can do everything" ON article_group_mappings;

CREATE POLICY "Service role can do everything" ON article_group_mappings
  FOR ALL USING (auth.role() = 'service_role');
