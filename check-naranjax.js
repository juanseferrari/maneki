// Check NaranjaX file processing
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkNaranjaX() {
  console.log('\n🔍 Checking NaranjaX files...\n');

  // Find most recent NaranjaX files
  const { data: files, error } = await supabase
    .from('files')
    .select('*')
    .or('bank_name.ilike.%naranja%,original_name.ilike.%naranja%')
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) {
    console.error('Error:', error);
    return;
  }

  if (!files || files.length === 0) {
    console.log('No NaranjaX files found');
    return;
  }

  console.log(`Found ${files.length} NaranjaX file(s):\n`);

  for (const file of files) {
    console.log(`📄 File: ${file.original_name}`);
    console.log(`   ID: ${file.id}`);
    console.log(`   Bank: ${file.bank_name} (${file.bank_id || 'no ID'})`);
    console.log(`   Status: ${file.processing_status}`);
    console.log(`   Method: ${file.processing_method}`);
    console.log(`   Confidence: ${file.confidence_score}%`);
    console.log(`   User: ${file.user_id}`);
    console.log(`   Created: ${file.created_at}`);
    console.log('');

    // Get transactions for this file
    const { data: transactions } = await supabase
      .from('transactions')
      .select('id, transaction_date, description, amount, transaction_type')
      .eq('file_id', file.id)
      .order('transaction_date', { ascending: true })
      .limit(5);

    if (transactions && transactions.length > 0) {
      console.log(`   ✅ Transactions: ${transactions.length}`);
      console.log(`   First transaction: ${transactions[0].transaction_date} - ${transactions[0].description.substring(0, 40)}`);
    } else {
      console.log(`   ❌ No transactions found`);
    }
    console.log('---\n');
  }

  // Check if there's a template for NaranjaX
  console.log('🧠 Checking for NaranjaX template...\n');
  const { data: templates } = await supabase
    .from('bank_templates')
    .select('*')
    .ilike('bank_name', '%naranja%');

  if (templates && templates.length > 0) {
    console.log(`✅ Found ${templates.length} template(s):`);
    templates.forEach(t => {
      console.log(`   - Bank: ${t.bank_name}`);
      console.log(`   - Usage: ${t.usage_count} times`);
      console.log(`   - Success rate: ${t.success_rate}%`);
      console.log(`   - Created: ${t.created_at}`);
    });
  } else {
    console.log('❌ No templates found for NaranjaX');
  }
}

checkNaranjaX().then(() => process.exit(0));
