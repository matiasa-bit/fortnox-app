-- Lägg till saknade kolumner/index för invoice_rows på äldre installationer
ALTER TABLE IF EXISTS invoice_rows
  ADD COLUMN IF NOT EXISTS article_number TEXT;

ALTER TABLE IF EXISTS invoice_rows
  ADD COLUMN IF NOT EXISTS article_name TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS quantity DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS unit_price DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS total DECIMAL(10, 2);

CREATE INDEX IF NOT EXISTS idx_invoice_rows_article_number ON invoice_rows(article_number);
