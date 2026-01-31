-- Migración: Crear tabla transaction_splits para subdividir transacciones
-- Fecha: 2026-01-31
-- Propósito: Permitir dividir una transacción en múltiples partes con diferentes categorías y montos

-- Crear tabla transaction_splits
CREATE TABLE IF NOT EXISTS transaction_splits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,

  -- Campos específicos de cada split
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  amount DECIMAL(12,2) NOT NULL, -- Debe ser <= transaction.amount
  description TEXT, -- Descripción específica del split (ej: "Factura A")

  -- Metadata
  split_order INTEGER NOT NULL DEFAULT 1, -- Orden de visualización
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Constraints
  CONSTRAINT amount_positive CHECK (amount > 0),
  CONSTRAINT valid_user CHECK (user_id IS NOT NULL)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_transaction_splits_transaction ON transaction_splits(transaction_id);
CREATE INDEX IF NOT EXISTS idx_transaction_splits_user ON transaction_splits(user_id);
CREATE INDEX IF NOT EXISTS idx_transaction_splits_category ON transaction_splits(category_id);

-- RLS (Row Level Security) para multi-tenant
ALTER TABLE transaction_splits ENABLE ROW LEVEL SECURITY;

-- Policy: Los usuarios solo pueden ver sus propios splits
DROP POLICY IF EXISTS transaction_splits_user_policy ON transaction_splits;
CREATE POLICY transaction_splits_user_policy ON transaction_splits
  FOR ALL
  USING (user_id = auth.uid());

-- Trigger para updated_at
-- Nota: Asumimos que la función update_updated_at_column() ya existe
CREATE TRIGGER update_transaction_splits_updated_at
  BEFORE UPDATE ON transaction_splits
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Función de validación: Los splits no pueden exceder el monto total
CREATE OR REPLACE FUNCTION validate_splits_sum()
RETURNS TRIGGER AS $$
DECLARE
  transaction_amount DECIMAL(12,2);
  splits_sum DECIMAL(12,2);
BEGIN
  -- Obtener el monto total de la transacción (valor absoluto)
  SELECT ABS(amount) INTO transaction_amount
  FROM transactions
  WHERE id = NEW.transaction_id;

  -- Calcular suma de todos los splits (incluyendo el nuevo)
  SELECT COALESCE(SUM(amount), 0) INTO splits_sum
  FROM transaction_splits
  WHERE transaction_id = NEW.transaction_id;

  -- Validar que no exceda el total
  IF splits_sum > transaction_amount THEN
    RAISE EXCEPTION 'La suma de subdivisiones (%) excede el monto total de la transacción (%)',
      splits_sum, transaction_amount;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger de validación
DROP TRIGGER IF EXISTS check_splits_sum_before_insert ON transaction_splits;
CREATE TRIGGER check_splits_sum_before_insert
  BEFORE INSERT OR UPDATE ON transaction_splits
  FOR EACH ROW
  EXECUTE FUNCTION validate_splits_sum();

-- Vista auxiliar para queries simplificados
CREATE OR REPLACE VIEW transactions_with_splits AS
SELECT
  t.*,
  COUNT(ts.id) as split_count,
  COALESCE(SUM(ts.amount), 0) as splits_sum,
  CASE
    WHEN COUNT(ts.id) > 0 THEN true
    ELSE false
  END as has_splits
FROM transactions t
LEFT JOIN transaction_splits ts ON t.id = ts.transaction_id
GROUP BY t.id;

-- Comentarios para documentación
COMMENT ON TABLE transaction_splits IS 'Subdivisiones de transacciones que permiten dividir una transacción en múltiples categorías/montos';
COMMENT ON COLUMN transaction_splits.split_order IS 'Orden de visualización de los splits (1, 2, 3, ...)';
COMMENT ON COLUMN transaction_splits.description IS 'Descripción específica del split (ej: Factura A, Factura B)';
