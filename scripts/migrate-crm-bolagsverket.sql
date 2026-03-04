-- Add Bolagsverket enrichment fields to CRM clients.

ALTER TABLE IF EXISTS crm_clients
  ADD COLUMN IF NOT EXISTS bolagsverket_status TEXT,
  ADD COLUMN IF NOT EXISTS bolagsverket_registered_office TEXT,
  ADD COLUMN IF NOT EXISTS bolagsverket_board_count INTEGER,
  ADD COLUMN IF NOT EXISTS bolagsverket_company_data JSONB,
  ADD COLUMN IF NOT EXISTS bolagsverket_board_data JSONB,
  ADD COLUMN IF NOT EXISTS bolagsverket_updated_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_crm_clients_bolagsverket_updated_at ON crm_clients(bolagsverket_updated_at DESC);
