// Check files that generated wrong amounts
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkFiles() {
  console.log('\n🔍 Checking files with incorrect amounts\n');
  
  const problemFileIds = [
    'c021a3c2-6f0b-4e70-91cd-3620092a744e',
    '7ccd6c74-74f4-4836-a568-a4966bef73b8'
  ];
  
  for (const fileId of problemFileIds) {
    const { data: file, error } = await supabase
      .from('files')
      .select('*')
      .eq('id', fileId)
      .single();
    
    if (file) {
      console.log(`\n📄 ${file.original_name}`);
      console.log(`   Bank: ${file.bank_name}`);
      console.log(`   Method: ${file.processing_method}`);
      console.log(`   Status: ${file.processing_status}`);
      console.log(`   Created: ${new Date(file.created_at).toLocaleString()}`);
      
      // Get all transactions for this file
      const { data: txs } = await supabase
        .from('transactions')
        .select('amount, description, transaction_date')
        .eq('file_id', fileId)
        .order('amount', { ascending: false })
        .limit(10);
      
      if (txs) {
        console.log(`\n   Top amounts:`);
        txs.forEach(tx => {
          console.log(`   - $${tx.amount.toLocaleString()} - ${tx.description?.substring(0, 40)}`);
        });
      }
    }
  }
}

checkFiles()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
