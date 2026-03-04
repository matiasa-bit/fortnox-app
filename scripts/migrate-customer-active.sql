-- Lägg till active-flagga för kundkortsmappning
-- Behövs för att kunna dölja inaktiva Fortnox-kunder i kundfiltret.

ALTER TABLE IF EXISTS customer_costcenter_map
  ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE;

-- Sätt befintliga null-värden till TRUE tills nästa sync uppdaterar exakt status från Fortnox
UPDATE customer_costcenter_map
SET active = TRUE
WHERE active IS NULL;
