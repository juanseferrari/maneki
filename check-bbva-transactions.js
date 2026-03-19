// Quick script to check BBVA transactions
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkBBVA() {
  // Find BBVA file
  const { data: files } = await supabase
    .from('files')
    .select('*')
    .ilike('original_name', '%bbva%')
    .order('created_at', { ascending: false })
    .limit(1);

  if (!files || files.length === 0) {
    console.log('No BBVA files found');
    return;
  }

  const file = files[0];
  console.log(`\n📄 File: ${file.original_name}`);
  console.log(`ID: ${file.id}`);
  console.log(`Bank: ${file.bank_name}`);
  console.log(`Method: ${file.processing_method}\n`);

  // Get transactions
  const { data: transactions } = await supabase
    .from('transactions')
    .select('*')
    .eq('file_id', file.id)
    .order('transaction_date', { ascending: true })
    .limit(10);

  console.log(`First 10 transactions:\n`);
  transactions.forEach((tx, i) => {
    console.log(`${i + 1}. ${tx.transaction_date} | ${tx.description.substring(0, 40)}`);
    console.log(`   Amount: ${tx.amount} | Type: ${tx.transaction_type}`);
    console.log(`   Sign should be: ${tx.transaction_type === 'debit' ? 'NEGATIVE' : 'POSITIVE'}`);
    console.log('');
  });
}

checkBBVA();
