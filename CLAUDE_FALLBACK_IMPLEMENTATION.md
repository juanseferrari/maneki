# Claude API Fallback System - Implementation Summary

## Overview
Successfully implemented an intelligent fallback system that uses Claude API when template matching fails (confidence < 60%). The system includes smart categorization, document metadata extraction, installment detection, and cost controls (20 analyses/month per user).

## ✅ Implementation Complete

All planned features have been implemented successfully:

### Phase 1: Database Schema ✅
Created 4 SQL migrations in `db/migrations/`:

1. **001-create-claude-usage-tracking.sql**
   - Quota tracking table with RLS policies
   - Atomic `increment_claude_usage()` RPC function
   - Tracks monthly usage per user

2. **002-create-installments.sql**
   - Installments table for cuotas (1/12, 2/12, etc.)
   - Links related installments via `group_id`
   - Helper function `get_installment_group()`

3. **003-alter-files-table.sql**
   - Added `metadata` JSONB column for document info
   - Added `processing_method` column (template/claude/hybrid)
   - Indexed for performance

4. **004-alter-transactions-table.sql**
   - Added `needs_review` flag for user confirmation
   - Added `processed_by_claude` flag for tracking
   - Helper function `get_file_transactions_for_review()`

**Status**: ✅ Migrations already run in Supabase

### Phase 2: Backend Services ✅

#### New Services Created:

**[services/claude-usage-tracking.service.js](services/claude-usage-tracking.service.js)** - Complete quota management
- `checkQuota(userId)` - Returns available quota
- `incrementUsage(userId)` - Atomic increment after API call
- `getUsageHistory(userId, months)` - Monthly stats
- Admin functions: `resetUsage()`, `updateLimit()`, `getUsersOverQuota()`, `getGlobalStats()`

#### Enhanced Existing Services:

**[services/claude.service.js](services/claude.service.js)** - Added enhanced extraction
- `extractTransactionsEnhanced(textContent, fileName, userId)`
  - Fetches user's categories for smart matching
  - Truncates text to 50K chars (cost optimization)
  - Advanced prompt engineering with category context
  - Detects installment patterns (Cuota 1/12, 1 de 12, etc.)
  - Groups related installments with UUID
  - Extracts document metadata (bank, account, period, balances)

**[services/processor.service.js](services/processor.service.js)** - Decision tree logic
- After template extraction, checks confidence score
- If < 60%: Check user's Claude quota
- If quota available: Call Claude API
- Falls back to templates on error
- Marks transactions for review when needed
- Saves metadata and installments

**[services/supabase.service.js](services/supabase.service.js)** - Database operations
- `getUserCategories(userId)` - Fetch for Claude matching
- `saveInstallments(transactions, userId)` - Store cuota data
- `getFileTransactionsForReview(fileId, userId)` - Preview data
- `confirmReviewedTransactions(transactions, userId)` - Finalize
- `deleteTransaction(transactionId, userId)` - Remove

### Phase 3: API Endpoints ✅

Added 4 new endpoints in [server-supabase.js](server-supabase.js):

1. **`GET /api/claude/usage`**
   - Returns user's current quota status
   - Response: `{ used, limit, remaining, monthYear, resetDate }`

2. **`GET /api/files/:fileId/transactions/preview`**
   - Gets transactions needing review
   - Returns file info, transactions, and metadata

3. **`POST /api/files/:fileId/confirm-transactions`**
   - Confirms reviewed transactions
   - Marks `needs_review = false`
   - Updates edited fields

4. **`POST /api/files/:fileId/reprocess-with-claude`**
   - Manual reprocessing trigger
   - Checks quota, downloads file, calls Claude
   - Saves new transactions and installments

### Phase 4: Frontend Components ✅

**[public/js/claude-components.js](public/js/claude-components.js)** - New comprehensive component file

#### 1. ClaudeUsageIndicator
- Shows "IA: 15/20" with color coding
- Green (>10), Yellow (5-10), Red (<5)
- Tooltip with detailed quota info
- Auto-loads on page load

#### 2. TransactionPreviewModal
- Editable table for transaction review
- Inline editing: date, description, amount, category, type
- Delete transaction button per row
- Shows document metadata (bank, account, period)
- Processing method badge (IA/Híbrido/Plantilla)
- Validates before save
- "Confirmar Todo" button

#### 3. File List Enhancements
Updated [public/js/upload-supabase.js](public/js/upload-supabase.js):
- Processing method badges on file names
  - IA (purple gradient) - Claude processed
  - Híbrido (pink gradient) - Fallback
  - Plantilla (green) - Template only
- "Revisar" button for files needing review
- `openTransactionReview(fileId)` helper function

### Phase 5: UI Integration ✅

Updated [views/index-supabase.ejs](views/index-supabase.ejs):
- Added `<script src="/js/claude-components.js"></script>`
- Loaded before upload-supabase.js for proper initialization

## How It Works

### Automatic Fallback Flow

```
User uploads file
     ↓
Parser extracts text
     ↓
Template matching (extractor.service.js)
     ↓
Confidence < 60%? → Yes
     ↓
Check user quota (20/month)
     ↓
Quota available? → Yes
     ↓
Claude API call (extractTransactionsEnhanced)
  • Fetches user categories
  • Sends enhanced prompt
  • Receives JSON: transactions + metadata + installments
     ↓
Increment quota counter (atomic)
     ↓
Save transactions (mark needs_review=true)
     ↓
Save installments (if detected)
     ↓
Save file metadata (processing_method='claude')
     ↓
User sees "Revisar" button in file list
     ↓
User clicks → TransactionPreviewModal opens
     ↓
User edits/confirms → Transactions finalized
```

### Enhanced Prompt Features

The Claude prompt includes:
- User's existing categories with keywords
- Instructions for smart semantic matching
- Installment pattern detection (Cuota X/Y, X de Y)
- Document metadata extraction (bank, account, period, balances)
- Structured JSON output format
- Validation rules and edge cases

### Cost Optimization

- **Text truncation**: Max 50,000 characters
- **Quota enforcement**: 20 analyses/month per user
- **Atomic operations**: Prevent race conditions
- **Model selection**: Sonnet 4.5 → 3.5 fallback
- **Error handling**: Graceful fallback to templates

**Estimated cost**: <$1/month per user

## Testing

### Before Production Deployment:

1. **Upload a file with unsupported bank** (low confidence expected)
   - Should trigger Claude automatically
   - Check console logs for decision tree
   - Verify quota incremented

2. **Review modal test**
   - Click "Revisar" button
   - Edit transaction details
   - Confirm and verify database updated

3. **Quota limit test**
   - Upload 20 files (exhaust quota)
   - 21st file should use templates only
   - Check quota indicator shows 20/20

4. **Installments test**
   - Upload file with "Cuota 1/12" patterns
   - Verify installments table populated
   - Check group_id links related transactions

5. **Metadata test**
   - Upload bank statement
   - Verify files.metadata JSONB populated
   - Check preview modal shows bank info

### Database Verification

```sql
-- Check quota tracking
SELECT * FROM claude_usage_tracking WHERE user_id = 'your-user-id';

-- Check installments
SELECT * FROM installments WHERE user_id = 'your-user-id';

-- Check transactions with Claude processing
SELECT id, description, needs_review, processed_by_claude
FROM transactions
WHERE processed_by_claude = TRUE;

-- Check file metadata
SELECT id, original_name, processing_method, metadata
FROM files
WHERE processing_method IN ('claude', 'hybrid');
```

## Configuration

### Environment Variables

Ensure these are set in your `.env`:

```env
# Claude API (required for fallback)
ANTHROPIC_API_KEY=sk-ant-xxxxx

# Supabase (already configured)
SUPABASE_URL=your_url
SUPABASE_ANON_KEY=your_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### Optional: Adjust Quota Limits

To change the default 20 analyses/month limit for a user:

```javascript
const claudeUsageTrackingService = require('./services/claude-usage-tracking.service');
await claudeUsageTrackingService.updateLimit('user-id', 50); // New limit
```

### Optional: Mock Mode for Testing

To test without burning API credits, create a mock service:

```javascript
// services/claude.service.mock.js
// Returns realistic mock data without API calls
// Toggle via: USE_MOCK_CLAUDE=true in .env
```

## Rollback Plan

If issues arise:

1. **Disable Claude API calls**
   - Remove or comment out ANTHROPIC_API_KEY
   - System will continue with templates only

2. **Revert processor.service.js**
   - Remove decision tree logic (lines ~70-120)
   - System reverts to template-only processing

3. **Database changes are backward compatible**
   - New columns have default values
   - Existing functionality unaffected
   - No data loss risk

## Maintenance

### Monitor Quota Usage

```javascript
// Get global stats
const claudeUsageTrackingService = require('./services/claude-usage-tracking.service');
const stats = await claudeUsageTrackingService.getGlobalStats();
console.log(stats);
// { totalUsage: 150, avgUsage: 7.5, usersOverQuota: 2, totalUsers: 20 }
```

### Reset User Quota (if needed)

```javascript
await claudeUsageTrackingService.resetUsage('user-id', '2026-02');
```

## Success Metrics

Target metrics (to be measured after deployment):

- **Claude success rate**: >90%
- **Average confidence**: >85% with Claude
- **User review acceptance**: >95%
- **Processing time**: <30s per file
- **Cost per user**: <$1/month

## Files Changed/Created

### New Files (8):
- ✅ `db/migrations/001-create-claude-usage-tracking.sql`
- ✅ `db/migrations/002-create-installments.sql`
- ✅ `db/migrations/003-alter-files-table.sql`
- ✅ `db/migrations/004-alter-transactions-table.sql`
- ✅ `services/claude-usage-tracking.service.js`
- ✅ `public/js/claude-components.js`
- ✅ `CLAUDE_FALLBACK_IMPLEMENTATION.md` (this file)

### Modified Files (5):
- ✅ `services/claude.service.js` - Added extractTransactionsEnhanced()
- ✅ `services/processor.service.js` - Added decision tree logic
- ✅ `services/supabase.service.js` - Added 5 new methods
- ✅ `server-supabase.js` - Added 4 API endpoints
- ✅ `public/js/upload-supabase.js` - Enhanced file list display
- ✅ `views/index-supabase.ejs` - Added script reference

## Next Steps

1. ✅ **All implementation complete**
2. 🔄 **Test in development** (recommended before production)
3. 📊 **Monitor first week** of production usage
4. 🎯 **Measure success metrics** after 1 month
5. 🔧 **Adjust quota limits** based on usage patterns

## Support

If you encounter issues:

1. Check browser console for errors
2. Verify ANTHROPIC_API_KEY is set correctly
3. Check Supabase logs for database errors
4. Review server logs for API errors
5. Test with mock mode first (USE_MOCK_CLAUDE=true)

## Credits

- **Claude API**: Anthropic Claude Sonnet 4.5
- **Database**: Supabase PostgreSQL
- **Frontend**: Vanilla JavaScript with custom components
- **Implementation**: Completed 2026-02-06
