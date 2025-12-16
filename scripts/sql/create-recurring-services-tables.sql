-- =============================================
-- RECURRING SERVICES MODULE
-- Tables for tracking recurring payments/subscriptions
-- =============================================

-- =============================================
-- TABLE: recurring_services
-- Stores service/subscription definitions
-- =============================================
CREATE TABLE IF NOT EXISTS recurring_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Service identification
  name VARCHAR(255) NOT NULL,
  normalized_name VARCHAR(255), -- Lowercase, no special chars for matching
  description TEXT,
  category VARCHAR(100),

  -- Recurrence settings
  frequency VARCHAR(50) NOT NULL DEFAULT 'monthly', -- monthly, bimonthly, quarterly, semiannual, annual, weekly
  typical_day_of_month INTEGER, -- 1-31, day when payment typically occurs
  typical_day_of_week INTEGER, -- 0-6 for weekly payments (0=Sunday)

  -- Amount prediction
  estimated_amount DECIMAL(15, 2), -- Average/expected amount
  amount_varies BOOLEAN DEFAULT false, -- True for utilities, false for fixed subscriptions
  min_amount DECIMAL(15, 2), -- Historical minimum
  max_amount DECIMAL(15, 2), -- Historical maximum
  currency VARCHAR(10) DEFAULT 'ARS',

  -- Payment method
  payment_method VARCHAR(100), -- debit_auto, credit_card, manual, transfer

  -- Status and tracking
  status VARCHAR(50) DEFAULT 'active', -- active, paused, cancelled
  is_auto_detected BOOLEAN DEFAULT false, -- True if detected by algorithm
  auto_detection_confidence DECIMAL(5, 2), -- 0-100 confidence score

  -- Dates
  first_payment_date DATE, -- First known payment
  last_payment_date DATE, -- Most recent payment
  next_expected_date DATE, -- Predicted next payment

  -- Metadata
  merchant_patterns TEXT[], -- Array of merchant name patterns for matching
  notes TEXT,
  color VARCHAR(7), -- Hex color for calendar display
  icon VARCHAR(50), -- Icon identifier

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- TABLE: service_payments
-- Links transactions to recurring services
-- =============================================
CREATE TABLE IF NOT EXISTS service_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID NOT NULL REFERENCES recurring_services(id) ON DELETE CASCADE,
  transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Payment details (copied from transaction or manual entry)
  payment_date DATE NOT NULL,
  amount DECIMAL(15, 2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'ARS',

  -- Status
  status VARCHAR(50) DEFAULT 'paid', -- paid, pending, skipped, predicted
  is_predicted BOOLEAN DEFAULT false, -- True for future predicted payments

  -- Matching info
  match_confidence DECIMAL(5, 2), -- How confident we are this transaction belongs to this service
  matched_by VARCHAR(50), -- 'auto', 'manual', 'prediction'

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- INDEXES
-- =============================================

-- recurring_services indexes
CREATE INDEX IF NOT EXISTS idx_recurring_services_user_id ON recurring_services(user_id);
CREATE INDEX IF NOT EXISTS idx_recurring_services_status ON recurring_services(status);
CREATE INDEX IF NOT EXISTS idx_recurring_services_next_expected ON recurring_services(next_expected_date);
CREATE INDEX IF NOT EXISTS idx_recurring_services_normalized_name ON recurring_services(normalized_name);

-- service_payments indexes
CREATE INDEX IF NOT EXISTS idx_service_payments_service_id ON service_payments(service_id);
CREATE INDEX IF NOT EXISTS idx_service_payments_user_id ON service_payments(user_id);
CREATE INDEX IF NOT EXISTS idx_service_payments_transaction_id ON service_payments(transaction_id);
CREATE INDEX IF NOT EXISTS idx_service_payments_payment_date ON service_payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_service_payments_status ON service_payments(status);

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================

ALTER TABLE recurring_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_payments ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own services
CREATE POLICY recurring_services_user_policy ON recurring_services
  FOR ALL USING (auth.uid() = user_id);

-- Policy: Users can only see their own service payments
CREATE POLICY service_payments_user_policy ON service_payments
  FOR ALL USING (auth.uid() = user_id);

-- =============================================
-- TRIGGERS
-- =============================================

-- Auto-update updated_at on recurring_services
CREATE OR REPLACE FUNCTION update_recurring_services_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_recurring_services_updated_at
  BEFORE UPDATE ON recurring_services
  FOR EACH ROW
  EXECUTE FUNCTION update_recurring_services_updated_at();

-- Auto-update updated_at on service_payments
CREATE OR REPLACE FUNCTION update_service_payments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_service_payments_updated_at
  BEFORE UPDATE ON service_payments
  FOR EACH ROW
  EXECUTE FUNCTION update_service_payments_updated_at();

-- =============================================
-- HELPER FUNCTIONS
-- =============================================

-- Function to normalize merchant names for matching
CREATE OR REPLACE FUNCTION normalize_merchant_name(name TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN LOWER(
    REGEXP_REPLACE(
      REGEXP_REPLACE(
        COALESCE(name, ''),
        '[^a-zA-Z0-9áéíóúñ ]', '', 'g'
      ),
      '\s+', ' ', 'g'
    )
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to calculate next payment date based on frequency
CREATE OR REPLACE FUNCTION calculate_next_payment_date(
  last_date DATE,
  freq VARCHAR(50),
  typical_day INTEGER DEFAULT NULL
)
RETURNS DATE AS $$
DECLARE
  next_date DATE;
  target_day INTEGER;
BEGIN
  target_day := COALESCE(typical_day, EXTRACT(DAY FROM last_date)::INTEGER);

  CASE freq
    WHEN 'weekly' THEN
      next_date := last_date + INTERVAL '7 days';
    WHEN 'biweekly' THEN
      next_date := last_date + INTERVAL '14 days';
    WHEN 'monthly' THEN
      next_date := (DATE_TRUNC('month', last_date) + INTERVAL '1 month')::DATE;
      -- Adjust to typical day
      next_date := LEAST(
        next_date + (target_day - 1) * INTERVAL '1 day',
        (DATE_TRUNC('month', next_date) + INTERVAL '1 month' - INTERVAL '1 day')::DATE
      );
    WHEN 'bimonthly' THEN
      next_date := (DATE_TRUNC('month', last_date) + INTERVAL '2 months')::DATE;
      next_date := LEAST(
        next_date + (target_day - 1) * INTERVAL '1 day',
        (DATE_TRUNC('month', next_date) + INTERVAL '1 month' - INTERVAL '1 day')::DATE
      );
    WHEN 'quarterly' THEN
      next_date := (DATE_TRUNC('month', last_date) + INTERVAL '3 months')::DATE;
      next_date := LEAST(
        next_date + (target_day - 1) * INTERVAL '1 day',
        (DATE_TRUNC('month', next_date) + INTERVAL '1 month' - INTERVAL '1 day')::DATE
      );
    WHEN 'semiannual' THEN
      next_date := (DATE_TRUNC('month', last_date) + INTERVAL '6 months')::DATE;
      next_date := LEAST(
        next_date + (target_day - 1) * INTERVAL '1 day',
        (DATE_TRUNC('month', next_date) + INTERVAL '1 month' - INTERVAL '1 day')::DATE
      );
    WHEN 'annual' THEN
      next_date := (DATE_TRUNC('month', last_date) + INTERVAL '12 months')::DATE;
      next_date := LEAST(
        next_date + (target_day - 1) * INTERVAL '1 day',
        (DATE_TRUNC('month', next_date) + INTERVAL '1 month' - INTERVAL '1 day')::DATE
      );
    ELSE
      -- Default to monthly
      next_date := (DATE_TRUNC('month', last_date) + INTERVAL '1 month')::DATE;
  END CASE;

  RETURN next_date;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =============================================
-- SAMPLE CATEGORIES AND COLORS
-- =============================================
COMMENT ON TABLE recurring_services IS 'Common categories: streaming, utilities, insurance, telecommunications, subscriptions, memberships, rent, loans';
COMMENT ON COLUMN recurring_services.color IS 'Suggested colors: #E91E63 (entertainment), #4CAF50 (utilities), #2196F3 (telecom), #FF9800 (insurance), #9C27B0 (subscriptions)';
