-- =====================================================
-- MIGRATION: Migrate category (text) to category_id (UUID)
-- Purpose: Move existing category UUIDs from text column to foreign key column
-- =====================================================

-- Step 1: Update category_id with values from category column
-- Only update where category is a valid UUID and matches a category id
UPDATE transactions
SET category_id = category::uuid
WHERE
  category IS NOT NULL
  AND category ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND EXISTS (
    SELECT 1 FROM categories WHERE id = category::uuid
  );

-- Step 2: Verify the migration
SELECT
  COUNT(*) as total_transactions,
  COUNT(category) as transactions_with_old_category,
  COUNT(category_id) as transactions_with_new_category_id,
  COUNT(CASE WHEN category IS NOT NULL AND category_id IS NULL THEN 1 END) as unmigrated_with_category,
  COUNT(CASE WHEN category IS NULL AND category_id IS NULL THEN 1 END) as uncategorized
FROM transactions;

-- Optional Step 3: Clear the old category column (run this after verifying migration worked)
-- Uncomment the line below only after confirming everything looks good
-- UPDATE transactions SET category = NULL WHERE category_id IS NOT NULL;
