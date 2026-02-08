# Error Diagnosis Report - File Upload Failure

**Date**: 2026-02-08
**File ID**: `ea4e7a58-2b37-4ead-a6e5-f51e5bb36e9b`
**File Name**: `1760495651707_0090161662_30-Sep-2025 (1).pdf`
**User ID**: `f2aed59f-54dd-4d7b-91e0-8070b78eeb55`

---

## Summary

File upload failed with a **foreign key constraint violation** error. The typo in the template filename (`Sandander.pdf` → `Santander.pdf`) was NOT the root cause. The real issue is a database schema problem.

---

## Root Cause Analysis

### Error Message
```
Failed to check quota: insert or update on table "claude_usage_tracking"
violates foreign key constraint "claude_usage_tracking_user_id_fkey"
```

### Investigation Steps

1. **File Record Check**:
   ```json
   {
     "id": "ea4e7a58-2b37-4ead-a6e5-f51e5bb36e9b",
     "processing_status": "failed",
     "processing_error": "Failed to check quota: insert or update on table \"claude_usage_tracking\" violates foreign key constraint \"claude_usage_tracking_user_id_fkey\"",
     "user_id": "f2aed59f-54dd-4d7b-91e0-8070b78eeb55"
   }
   ```

2. **User Existence Check**:
   - ✅ User EXISTS in `auth.users` (Supabase Auth table)
   - ❌ User DOES NOT EXIST in `public.users` table
   - Email: `juansegundoferrari@gmail.com`
   - Created: `2025-11-09T05:58:53.56137Z`

3. **Database Schema Issue**:
   - Migration `001-create-claude-usage-tracking.sql` line 7:
     ```sql
     user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     ```
   - This references `public.users(id)` which doesn't exist
   - Should reference `auth.users(id)` (Supabase Auth table)

### Affected Tables
- `claude_usage_tracking` (line 7 in migration 001)
- `installments` (line in migration 002)

---

## Solution

### Migration Fix: `005-fix-claude-usage-tracking-fkey.sql`

This migration performs the following:

1. **Drop existing foreign key constraints**:
   ```sql
   ALTER TABLE claude_usage_tracking
     DROP CONSTRAINT IF EXISTS claude_usage_tracking_user_id_fkey;

   ALTER TABLE installments
     DROP CONSTRAINT IF EXISTS installments_user_id_fkey;
   ```

2. **Add corrected foreign key constraints**:
   ```sql
   ALTER TABLE claude_usage_tracking
     ADD CONSTRAINT claude_usage_tracking_user_id_fkey
     FOREIGN KEY (user_id)
     REFERENCES auth.users(id)
     ON DELETE CASCADE;

   ALTER TABLE installments
     ADD CONSTRAINT installments_user_id_fkey
     FOREIGN KEY (user_id)
     REFERENCES auth.users(id)
     ON DELETE CASCADE;
   ```

### How to Apply the Fix

**Option 1: Run in Supabase SQL Editor (Recommended)**
1. Go to [Supabase Dashboard](https://supabase.com/dashboard/project/adgxouvmnkhcqfyyfrfo)
2. Navigate to: **SQL Editor** > **New Query**
3. Copy content from `db/migrations/005-fix-claude-usage-tracking-fkey.sql`
4. Paste and click **Run**
5. Verify success message: ✅ claude_usage_tracking foreign key constraint updated successfully

**Option 2: Run via Script**
```bash
node scripts/run-fix-migration.js
```
This will display the SQL and instructions.

---

## Verification Steps

After running the migration, verify the fix:

1. **Test File Upload**:
   - Upload a new file through the web interface
   - Confirm it processes without foreign key errors

2. **Check Constraints**:
   ```sql
   SELECT
     tc.table_name,
     tc.constraint_name,
     ccu.table_name AS foreign_table_name,
     ccu.column_name AS foreign_column_name
   FROM information_schema.table_constraints AS tc
   JOIN information_schema.constraint_column_usage AS ccu
     ON tc.constraint_name = ccu.constraint_name
   WHERE tc.constraint_type = 'FOREIGN KEY'
     AND tc.table_name IN ('claude_usage_tracking', 'installments');
   ```

   Expected result:
   - `claude_usage_tracking.user_id` → `auth.users.id`
   - `installments.user_id` → `auth.users.id`

3. **Retry Failed File**:
   - File `ea4e7a58-2b37-4ead-a6e5-f51e5bb36e9b` should be reprocessed
   - Or upload the same PDF again

---

## Impact Assessment

### Current State
- **Files affected**: All files uploaded since Claude fallback was deployed
- **User impact**: File uploads fail when template confidence < 60%
- **Severity**: HIGH (blocks core functionality)

### After Fix
- File uploads will work correctly for all confidence levels
- Claude quota tracking will function as designed
- No data loss (failed files can be reprocessed)

---

## Lessons Learned

1. **Always check foreign key references** when creating migrations
2. In Supabase:
   - User data lives in `auth.users` (Auth table)
   - NOT in `public.users` (unless you create it with triggers)
3. **Test migrations thoroughly** before deploying to production
4. Foreign key constraints should match the actual table structure

---

## Related Files

**Migrations**:
- `db/migrations/001-create-claude-usage-tracking.sql` (original - had bug)
- `db/migrations/002-create-installments.sql` (original - had bug)
- `db/migrations/005-fix-claude-usage-tracking-fkey.sql` (fix)

**Diagnostic Scripts**:
- `scripts/check-file-error.js` - Investigate file processing errors
- `scripts/check-file-details.js` - Get file record details
- `scripts/check-user.js` - Check user existence in auth/public schemas
- `scripts/run-fix-migration.js` - Display migration instructions

**Services**:
- `services/claude-usage-tracking.service.js` - Quota management (affected)
- `services/processor.service.js` - File processing (where error occurs)

---

## Timeline

1. **2026-02-06**: Claude fallback system implemented
2. **2026-02-07 23:09:05**: First file upload fails with FK constraint error
3. **2026-02-08**: Root cause identified, migration fix created
4. **Next**: Run migration 005 in production

---

## Action Items

- [ ] Run migration `005-fix-claude-usage-tracking-fkey.sql` in Supabase
- [ ] Verify foreign key constraints are correct
- [ ] Test file upload with low confidence file
- [ ] Reprocess failed file ID `ea4e7a58-2b37-4ead-a6e5-f51e5bb36e9b` (optional)
- [ ] Monitor file uploads for next 24 hours
- [ ] Update migrations 001 and 002 in repo for future reference (optional)

---

## Contact

If issues persist after applying the fix:
1. Check Supabase logs for new errors
2. Verify migrations were applied successfully
3. Run diagnostic scripts to investigate further
