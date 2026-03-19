// Check latest file processing details
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkLatestFile() {
  const fileId = 'e53a691d-cfbe-4c8d-a507-c5d8b90ba8b8'; // Latest NaranjaX file

  console.log('\n🔍 Checking latest file processing...\n');

  // Get file details
  const { data: file, error } = await supabase
    .from('files')
    .select('*')
    .eq('id', fileId)
    .single();

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`📄 File: ${file.original_name}`);
  console.log(`Bank: ${file.bank_name} (${file.bank_id || 'no ID'})`);
  console.log(`Status: ${file.processing_status}`);
  console.log(`Method: ${file.processing_method} ✅`);
  console.log(`Confidence: ${file.confidence_score}%`);
  console.log(`Created: ${file.created_at}`);
  console.log('');

  // Get transactions
  const { data: transactions } = await supabase
    .from('transactions')
    .select('*')
    .eq('file_id', fileId)
    .order('transaction_date', { ascending: true });

  if (transactions && transactions.length > 0) {
    console.log(`✅ Found ${transactions.length} transactions:\n`);
    transactions.forEach((tx, i) => {
      console.log(`${i + 1}. ${tx.transaction_date} | ${tx.description}`);
      console.log(`   Amount: $${tx.amount} | Type: ${tx.transaction_type}`);
      console.log(`   Needs review: ${tx.needs_review}`);
      console.log('');
    });
  } else {
    console.log('❌ No transactions found');
  }

  console.log('\n📊 File metadata:');
  if (file.document_metadata) {
    const meta = typeof file.document_metadata === 'string'
      ? JSON.parse(file.document_metadata)
      : file.document_metadata;
    console.log(JSON.stringify(meta, null, 2));
  }

  console.log('\n📝 Parsed text (first 500 chars):');
  console.log(file.parsed_text ? file.parsed_text.substring(0, 500) : 'NO TEXT');
}

checkLatestFile().then(() => process.exit(0));
