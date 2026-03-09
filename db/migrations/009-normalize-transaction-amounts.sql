-- Migration: 009-normalize-transaction-amounts.sql
-- Normalizar todos los montos a positivos y usar transaction_type para dirección

-- 1. Actualizar transacciones con montos negativos
UPDATE transactions
SET
  amount = ABS(amount),
  transaction_type = CASE
    WHEN amount < 0 THEN 'debit'
    WHEN amount > 0 THEN 'credit'
    ELSE transaction_type -- Mantener si amount = 0
  END
WHERE amount < 0;

-- 2. Verificar que no haya valores NULL en transaction_type
UPDATE transactions
SET transaction_type = CASE
  WHEN amount >= 0 THEN 'credit'
  ELSE 'debit'
END
WHERE transaction_type IS NULL;

-- 3. Crear constraint para asegurar que amount sea siempre >= 0
ALTER TABLE transactions
ADD CONSTRAINT check_amount_positive CHECK (amount >= 0);

-- 4. Comentario explicativo
COMMENT ON COLUMN transactions.amount IS 'Amount is always stored as positive. Use transaction_type to determine if it is income (credit) or expense (debit).';
COMMENT ON COLUMN transactions.transaction_type IS 'Type of transaction: credit (income/deposit) or debit (expense/withdrawal). Combined with amount to determine final sign.';
