// Check file with negative amounts issue
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkFile() {
  const fileId = 'da510ac3-76d8-47a5-918c-22105de1dbb9';

  console.log('\n🔍 Checking file with negative amounts...\n');

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
  console.log(`Method: ${file.processing_method}`);
  console.log(`Confidence: ${file.confidence_score}%`);
  console.log(`Created: ${file.created_at}`);
  console.log('');

  // Get transactions with negative amounts
  const { data: transactions } = await supabase
    .from('transactions')
    .select('*')
    .eq('file_id', fileId)
    .order('transaction_date', { ascending: true });

  if (transactions && transactions.length > 0) {
    console.log(`✅ Found ${transactions.length} transactions\n`);

    const negativeAmounts = transactions.filter(t => t.amount < 0);
    console.log(`❌ Transactions with NEGATIVE amounts: ${negativeAmounts.length}\n`);

    if (negativeAmounts.length > 0) {
      console.log('First 10 negative amount transactions:');
      negativeAmounts.slice(0, 10).forEach((tx, i) => {
        console.log(`${i + 1}. ${tx.transaction_date} | ${tx.description.substring(0, 40)}`);
        console.log(`   Amount: ${tx.amount} (NEGATIVE!) | Type: ${tx.transaction_type}`);
        console.log('');
      });
    }

    const positiveAmounts = transactions.filter(t => t.amount >= 0);
    console.log(`✅ Transactions with positive amounts: ${positiveAmounts.length}\n`);

    // Check transaction_type distribution
    const credits = transactions.filter(t => t.transaction_type === 'credit');
    const debits = transactions.filter(t => t.transaction_type === 'debit');
    console.log(`Credits: ${credits.length}`);
    console.log(`Debits: ${debits.length}`);
  }

  console.log('\n📝 Parsed text (first 500 chars):');
  console.log(file.parsed_text ? file.parsed_text.substring(0, 500) : 'NO TEXT');

  console.log('\n📊 Structured data (first 3 rows):');
  if (file.structured_data) {
    const data = typeof file.structured_data === 'string'
      ? JSON.parse(file.structured_data)
      : file.structured_data;
    console.log(`Total rows: ${data.length}`);
    if (data.length > 0) {
      console.log('\nFirst 3 rows:');
      data.slice(0, 3).forEach((row, i) => {
        console.log(`Row ${i + 1}:`, JSON.stringify(row, null, 2));
      });
    }
  }
}

checkFile().then(() => process.exit(0));
