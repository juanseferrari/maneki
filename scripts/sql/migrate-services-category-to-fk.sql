-- =============================================
-- MIGRATION: Add category_id FK to recurring_services
-- This migration adds a foreign key relationship between
-- recurring_services and the categories table
-- =============================================

-- Step 1: Add category_id column (nullable initially for safe migration)
ALTER TABLE recurring_services
ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES categories(id) ON DELETE SET NULL;

-- Step 2: Add index for performance
CREATE INDEX IF NOT EXISTS idx_recurring_services_category_id
ON recurring_services(category_id);

-- Step 3: Add comment explaining the columns
COMMENT ON COLUMN recurring_services.category IS 'DEPRECATED: Old category field (text). Use category_id instead.';
COMMENT ON COLUMN recurring_services.category_id IS 'Foreign key to categories table. Preferred over old category field.';

-- =============================================
-- NOTES FOR MANUAL DATA MIGRATION:
-- =============================================
-- After running this migration, you can manually update existing services
-- to map their old category text values to category_id UUIDs.
--
-- Example manual update query:
-- UPDATE recurring_services
-- SET category_id = (
--   SELECT id FROM categories
--   WHERE user_id = recurring_services.user_id
--   AND lower(name) = 'entretenimiento'
-- )
-- WHERE user_id = 'YOUR_USER_ID'
-- AND category = 'streaming';
--
-- You can do this for each service individually or in batches.
-- =============================================

-- Show current state
SELECT
  id,
  name,
  category as old_category_text,
  category_id as new_category_id,
  user_id
FROM recurring_services
ORDER BY created_at DESC
LIMIT 20;
