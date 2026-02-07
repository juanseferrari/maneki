-- Migration: Alter files table to add metadata and processing_method
-- Purpose: Store document metadata (JSON) and track how file was processed
-- Date: 2026-02-06

-- Add metadata column (JSONB for flexible document metadata storage)
ALTER TABLE files
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Add processing_method column to track extraction method
ALTER TABLE files
  ADD COLUMN IF NOT EXISTS processing_method TEXT DEFAULT 'template'
    CHECK (processing_method IN ('template', 'claude', 'hybrid'));

-- Create index on processing_method for filtering
CREATE INDEX IF NOT EXISTS idx_files_processing_method
  ON files(processing_method);

-- Create GIN index on metadata for JSON queries
CREATE INDEX IF NOT EXISTS idx_files_metadata_gin
  ON files USING GIN (metadata);

-- Comments for documentation
COMMENT ON COLUMN files.metadata IS 'Document metadata extracted by Claude or templates (banco, numero_cuenta, tipo_cuenta, periodo, saldos)';
COMMENT ON COLUMN files.processing_method IS 'Method used to process file: template (pattern matching), claude (AI extraction), hybrid (fallback)';

-- Example metadata structure:
-- {
--   "banco": "Banco Santander",
--   "numero_cuenta": "1234-5678-90",
--   "tipo_cuenta": "Cuenta Corriente",
--   "periodo": "2026-01",
--   "saldo_inicial": 15000.50,
--   "saldo_final": 12000.75
-- }
