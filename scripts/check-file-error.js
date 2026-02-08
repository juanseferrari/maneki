/**
 * Check file processing error for specific file ID
 * Usage: node scripts/check-file-error.js
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const FILE_ID = 'ea4e7a58-2b37-4ead-a6e5-f51e5bb36e9b';

async function checkFileError() {
  console.log('='.repeat(60));
  console.log('🔍 Investigating File Processing Error');
  console.log('='.repeat(60));
  console.log(`File ID: ${FILE_ID}\n`);

  try {
    // 1. Get file details
    console.log('1️⃣  Fetching file details...');
    const { data: file, error: fileError } = await supabase
      .from('files')
      .select('*')
      .eq('id', FILE_ID)
      .single();

    if (fileError) {
      console.error('❌ Error fetching file:', fileError.message);
      return;
    }

    if (!file) {
      console.error('❌ File not found in database');
      return;
    }

    console.log('✅ File found:');
    console.log(`   - Original name: ${file.original_name}`);
    console.log(`   - Uploaded: ${file.uploaded_at}`);
    console.log(`   - Status: ${file.status || 'N/A'}`);
    console.log(`   - Processing method: ${file.processing_method || 'N/A'}`);
    console.log(`   - Metadata: ${JSON.stringify(file.metadata || {}, null, 2)}`);
    console.log(`   - File path: ${file.file_path || 'N/A'}`);
    console.log('');

    // 2. Get transactions for this file
    console.log('2️⃣  Fetching transactions...');
    const { data: transactions, error: txError } = await supabase
      .from('transactions')
      .select('*')
      .eq('file_id', FILE_ID);

    if (txError) {
      console.error('❌ Error fetching transactions:', txError.message);
    } else {
      console.log(`✅ Found ${transactions?.length || 0} transactions`);
      if (transactions && transactions.length > 0) {
        console.log(`   - First transaction: ${transactions[0].description}`);
        console.log(`   - Needs review: ${transactions.filter(t => t.needs_review).length}`);
        console.log(`   - Processed by Claude: ${transactions.filter(t => t.processed_by_claude).length}`);
      }
      console.log('');
    }

    // 3. Check file existence in storage
    console.log('3️⃣  Checking file in storage...');
    const { data: fileData, error: storageError } = await supabase
      .storage
      .from(process.env.SUPABASE_BUCKET_NAME || 'uploads')
      .download(file.file_path);

    if (storageError) {
      console.error('❌ Error accessing file in storage:', storageError.message);
    } else {
      console.log(`✅ File exists in storage (${fileData.size} bytes)`);
    }
    console.log('');

    // 4. Check Claude usage for this user
    console.log('4️⃣  Checking Claude usage...');
    const { data: claudeUsage, error: claudeError } = await supabase
      .from('claude_usage_tracking')
      .select('*')
      .eq('user_id', file.user_id)
      .order('month_year', { ascending: false })
      .limit(1);

    if (claudeError) {
      console.error('❌ Error fetching Claude usage:', claudeError.message);
    } else if (claudeUsage && claudeUsage.length > 0) {
      const usage = claudeUsage[0];
      console.log(`✅ Claude usage for ${usage.month_year}:`);
      console.log(`   - Used: ${usage.usage_count}/${usage.monthly_limit}`);
      console.log(`   - Remaining: ${usage.monthly_limit - usage.usage_count}`);
    } else {
      console.log('ℹ️  No Claude usage records found');
    }
    console.log('');

    // 5. Summary
    console.log('='.repeat(60));
    console.log('📊 SUMMARY');
    console.log('='.repeat(60));

    if (file.status === 'error' || file.status === 'failed') {
      console.log('❌ File processing FAILED');
      console.log('   Possible reasons:');
      console.log('   - Parser error (PDF/CSV/XLSX parsing failed)');
      console.log('   - Template matching error');
      console.log('   - Claude API error');
      console.log('   - Database save error');
    } else if (transactions && transactions.length > 0) {
      console.log('✅ File processed successfully');
      console.log(`   - ${transactions.length} transactions extracted`);
      console.log(`   - Method: ${file.processing_method || 'template'}`);
    } else if (file.status === 'processing') {
      console.log('⏳ File is still being processed...');
    } else {
      console.log('⚠️  File exists but no transactions found');
      console.log('   This could indicate an extraction error');
    }

  } catch (error) {
    console.error('💥 Unexpected error:', error);
  }
}

checkFileError().then(() => process.exit(0));
