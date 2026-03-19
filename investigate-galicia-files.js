// Investigate Galicia files issue
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function investigate() {
  console.log('\n🔍 Investigating Galicia files issue\n');
  
  const fileIds = [
    '390a4041-c19c-4cdc-a7da-de6d611dbaad',
    '91a47e90-924e-4f48-b313-cfe3d7cb33d6'
  ];
  
  for (const fileId of fileIds) {
    console.log(`\n📄 File ID: ${fileId}`);
    console.log('='.repeat(80));
    
    // Get file metadata
    const { data: file, error: fileError } = await supabase
      .from('files')
      .select('*')
      .eq('id', fileId)
      .single();
    
    if (fileError) {
      console.log(`❌ Error getting file: ${fileError.message}`);
      continue;
    }
    
    console.log(`\nFile Info:`);
    console.log(`  Name: ${file.original_name}`);
    console.log(`  Bank: ${file.bank_name}`);
    console.log(`  Status: ${file.processing_status}`);
    console.log(`  Method: ${file.processing_method}`);
    console.log(`  Created: ${new Date(file.created_at).toLocaleString()}`);
    console.log(`  Error: ${file.processing_error || 'None'}`);
    
    // Get transactions
    const { data: transactions, error: txError } = await supabase
      .from('transactions')
      .select('*')
      .eq('file_id', fileId)
      .order('transaction_date', { ascending: true });
    
    if (txError) {
      console.log(`\n❌ Error getting transactions: ${txError.message}`);
    } else {
      console.log(`\nTransactions: ${transactions ? transactions.length : 0}`);
      
      if (transactions && transactions.length > 0) {
        console.log(`\nSample transactions:`);
        transactions.slice(0, 5).forEach((tx, i) => {
          console.log(`  ${i + 1}. ${tx.transaction_date} - ${tx.description?.substring(0, 40)}...`);
          console.log(`     Amount: ${tx.amount} (${tx.transaction_type})`);
          console.log(`     Currency: ${tx.currency}`);
        });
        
        // Check for unusual amounts
        const largeAmounts = transactions.filter(tx => tx.amount > 1000000);
        if (largeAmounts.length > 0) {
          console.log(`\n⚠️  Found ${largeAmounts.length} transactions with amount > 1,000,000:`);
          largeAmounts.forEach(tx => {
            console.log(`  - ${tx.transaction_date}: ${tx.amount} - ${tx.description?.substring(0, 50)}`);
          });
        }
        
        // Check for very small amounts
        const tinyAmounts = transactions.filter(tx => tx.amount < 0.01 && tx.amount > 0);
        if (tinyAmounts.length > 0) {
          console.log(`\n⚠️  Found ${tinyAmounts.length} transactions with amount < 0.01:`);
          tinyAmounts.forEach(tx => {
            console.log(`  - ${tx.transaction_date}: ${tx.amount} - ${tx.description?.substring(0, 50)}`);
          });
        }
      }
    }
    
    // Get metadata if available
    if (file.metadata) {
      console.log(`\nMetadata:`);
      console.log(JSON.stringify(file.metadata, null, 2));
    }
  }
  
  // Check if there are other Galicia files
  console.log(`\n\n📊 Checking all Galicia files in database...\n`);
  const { data: galiciaFiles, error: galiciaError } = await supabase
    .from('files')
    .select('id, original_name, bank_name, processing_status, processing_method, created_at')
    .ilike('bank_name', '%galicia%')
    .order('created_at', { ascending: false });
  
  if (!galiciaError && galiciaFiles) {
    console.log(`Found ${galiciaFiles.length} Galicia files:\n`);
    galiciaFiles.forEach((f, i) => {
      console.log(`${i + 1}. ${f.original_name}`);
      console.log(`   ID: ${f.id}`);
      console.log(`   Status: ${f.processing_status} | Method: ${f.processing_method}`);
      console.log(`   Date: ${new Date(f.created_at).toLocaleString()}`);
      console.log('');
    });
  }
}

investigate()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
