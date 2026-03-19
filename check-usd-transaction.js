// Check USD transaction with wrong currency
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkTransaction() {
  console.log('\n🔍 Checking USD transaction\n');
  
  const txId = '25c3d13c-e9b6-443c-bb54-97b3d6381de8';
  
  const { data: tx, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('id', txId)
    .single();
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log('Transaction Details:');
  console.log('  ID:', tx.id);
  console.log('  Description:', tx.description);
  console.log('  Amount:', tx.amount);
  console.log('  Currency:', tx.currency);
  console.log('  Date:', tx.transaction_date);
  console.log('  Type:', tx.transaction_type);
  console.log('  File ID:', tx.file_id);
  console.log('');
  
  // Get file info
  const { data: file } = await supabase
    .from('files')
    .select('*')
    .eq('id', tx.file_id)
    .single();
  
  if (file) {
    console.log('File Info:');
    console.log('  Name:', file.original_name);
    console.log('  Bank:', file.bank_name);
    console.log('  Method:', file.processing_method);
    console.log('  Currency from metadata:', file.metadata?.currency);
    console.log('');
  }
  
  // Check raw_data
  if (tx.raw_data) {
    console.log('Raw Data:');
    console.log(JSON.stringify(tx.raw_data, null, 2));
  }
}

checkTransaction()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
