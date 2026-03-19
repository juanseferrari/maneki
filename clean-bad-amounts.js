// Clean transactions with absurdly high amounts
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function cleanBadAmounts() {
  console.log('\n🧹 Cleaning transactions with incorrect amounts\n');
  
  // Define threshold: amounts over 100 million are clearly wrong
  const threshold = 100000000;
  
  // Get transactions with amounts over threshold
  const { data: badTransactions, error } = await supabase
    .from('transactions')
    .select('id, file_id, amount, description, transaction_date')
    .gt('amount', threshold);
  
  if (error) {
    console.error('Error fetching bad transactions:', error);
    return;
  }
  
  if (!badTransactions || badTransactions.length === 0) {
    console.log('✅ No transactions with bad amounts found!');
    return;
  }
  
  console.log(`Found ${badTransactions.length} transactions with amount > $${threshold.toLocaleString()}:\n`);
  
  // Group by file_id
  const byFile = {};
  badTransactions.forEach(tx => {
    if (!byFile[tx.file_id]) byFile[tx.file_id] = [];
    byFile[tx.file_id].push(tx);
  });
  
  console.log(`Affected files: ${Object.keys(byFile).length}\n`);
  
  for (const fileId in byFile) {
    const txs = byFile[fileId];
    console.log(`\n📁 File: ${fileId}`);
    console.log(`   Transactions to delete: ${txs.length}`);
    txs.slice(0, 3).forEach(tx => {
      console.log(`   - $${tx.amount.toLocaleString()} - ${tx.description?.substring(0, 40)}`);
    });
    if (txs.length > 3) {
      console.log(`   ... and ${txs.length - 3} more`);
    }
  }
  
  console.log(`\n⚠️  Total transactions to delete: ${badTransactions.length}`);
  console.log(`\nProceed with deletion? (This will permanently delete these transactions)`);
  console.log(`Run with DELETE=yes to confirm\n`);
  
  if (process.env.DELETE !== 'yes') {
    console.log('❌ Deletion cancelled. Set DELETE=yes to proceed.');
    return;
  }
  
  console.log('\n🗑️  Deleting transactions...\n');
  
  const transactionIds = badTransactions.map(tx => tx.id);
  const { error: deleteError } = await supabase
    .from('transactions')
    .delete()
    .in('id', transactionIds);
  
  if (deleteError) {
    console.error('❌ Error deleting transactions:', deleteError);
    return;
  }
  
  console.log(`✅ Successfully deleted ${badTransactions.length} transactions with bad amounts!`);
  
  // Mark affected files as failed so they can be reprocessed
  const fileIds = Object.keys(byFile);
  console.log(`\n🔄 Marking ${fileIds.length} affected files for reprocessing...\n`);
  
  const { error: updateError } = await supabase
    .from('files')
    .update({
      processing_status: 'failed',
      processing_error: 'Incorrect amount parsing - needs reprocessing with Claude'
    })
    .in('id', fileIds);
  
  if (updateError) {
    console.error('❌ Error updating files:', updateError);
  } else {
    console.log(`✅ Files marked as failed. Users can re-upload for correct processing.`);
  }
}

cleanBadAmounts()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
