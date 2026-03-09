-- Migration: 007-create-bank-templates.sql
-- Sistema de templates bancarios con aprendizaje automático
-- Almacena templates aprendidos cuando Claude procesa exitosamente archivos

CREATE TABLE IF NOT EXISTS bank_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Identificación del banco
  bank_id TEXT NOT NULL,  -- ID del banco (ej: 'galicia', 'macro', 'bbva')
  bank_name TEXT NOT NULL, -- Nombre completo (ej: 'Banco Galicia')

  -- Identificador único del template
  template_hash TEXT NOT NULL UNIQUE, -- Hash MD5 de column_mapping para detectar duplicados

  -- Metadata de detección
  detection_patterns JSONB NOT NULL, -- Patrones para detectar este formato
  /*
    {
      "required_columns": ["fecha", "importe", "saldo"],
      "optional_columns": ["concepto", "referencia"],
      "column_patterns": {
        "fecha": ["FECHA", "DATE", "Fecha Mov."],
        "importe": ["IMPORTE", "AMOUNT", "Monto"],
        "saldo": ["SALDO", "BALANCE", "Saldo Final"]
      }
    }
  */

  -- Estructura de columnas (mapeo)
  column_mapping JSONB NOT NULL, -- Mapeo de columnas a campos estándar
  /*
    {
      "date_column": "Fecha",
      "description_column": "Concepto",
      "amount_column": "Importe",
      "reference_column": "Referencia",
      "balance_column": "Saldo",
      "debit_column": null,
      "credit_column": null
    }
  */

  -- Formato de datos
  date_format TEXT NOT NULL DEFAULT 'DD/MM/YYYY', -- Formato de fecha detectado
  amount_format TEXT NOT NULL DEFAULT 'argentine', -- 'argentine' (1.234,56) o 'standard' (1,234.56)

  -- Patrones de descripción y categorización
  description_patterns JSONB, -- Patrones comunes en descripciones
  /*
    {
      "prefixes": ["Compra en", "Transferencia a", "Pago de"],
      "keywords": ["CUOTA", "REVERSO", "DEBITO AUTOMATICO"],
      "merchant_extraction_regex": "^(.+?)\\s+-\\s+"
    }
  */

  -- Metadata adicional del documento
  document_metadata JSONB, -- Información adicional del documento
  /*
    {
      "account_number_pattern": "CTE $ ****\\d{4}",
      "statement_date_pattern": "Movimientos del .+ al (.+)",
      "has_header_row": true,
      "skip_rows": 0
    }
  */

  -- Estadísticas de uso
  usage_count INTEGER DEFAULT 0, -- Cantidad de veces usado exitosamente
  success_rate DECIMAL(5,2) DEFAULT 100.00, -- Tasa de éxito (0.00-100.00)
  avg_confidence DECIMAL(5,2) DEFAULT 85.00, -- Confianza promedio
  last_used_at TIMESTAMPTZ, -- Última vez usado

  -- Metadata de creación
  created_from_file_id UUID REFERENCES files(id), -- Archivo del cual se aprendió
  created_by_user_id UUID, -- Usuario que subió el archivo original
  learned_by TEXT DEFAULT 'claude', -- 'claude' o 'manual'

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para búsqueda rápida
CREATE INDEX idx_bank_templates_bank_id ON bank_templates(bank_id);
CREATE INDEX idx_bank_templates_template_hash ON bank_templates(template_hash);
CREATE INDEX idx_bank_templates_usage_count ON bank_templates(usage_count DESC);
CREATE INDEX idx_bank_templates_success_rate ON bank_templates(success_rate DESC);

-- Índice GIN para búsqueda en JSONB
CREATE INDEX idx_bank_templates_detection_patterns_gin ON bank_templates USING GIN (detection_patterns);
CREATE INDEX idx_bank_templates_column_mapping_gin ON bank_templates USING GIN (column_mapping);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_bank_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_bank_templates_updated_at
  BEFORE UPDATE ON bank_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_bank_templates_updated_at();

-- Comentarios
COMMENT ON TABLE bank_templates IS 'Templates bancarios aprendidos automáticamente por Claude AI';
COMMENT ON COLUMN bank_templates.template_hash IS 'Hash MD5 de column_mapping para evitar duplicados';
COMMENT ON COLUMN bank_templates.detection_patterns IS 'Patrones para detectar si un archivo matchea este template';
COMMENT ON COLUMN bank_templates.column_mapping IS 'Mapeo de columnas del archivo a campos estándar';
COMMENT ON COLUMN bank_templates.usage_count IS 'Incrementa cada vez que el template se usa exitosamente';
COMMENT ON COLUMN bank_templates.success_rate IS 'Porcentaje de éxito en extracciones (actualizado dinámicamente)';
