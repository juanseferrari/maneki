// Fix transactions with negative amounts
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixNegativeAmounts() {
  console.log('\n🔧 Fixing transactions with negative amounts...\n');

  // Get all transactions with negative amounts
  const { data: transactions, error } = await supabase
    .from('transactions')
    .select('*')
    .lt('amount', 0);

  if (error) {
    console.error('Error fetching transactions:', error);
    return;
  }

  console.log(`Found ${transactions.length} transactions with negative amounts\n`);

  if (transactions.length === 0) {
    console.log('✅ No transactions to fix!');
    return;
  }

  // Show sample before fixing
  console.log('Sample transactions BEFORE fix:');
  transactions.slice(0, 3).forEach(tx => {
    console.log(`  - ${tx.transaction_date} | ${tx.description.substring(0, 30)} | Amount: ${tx.amount} | Type: ${tx.transaction_type}`);
  });
  console.log('');

  // Fix each transaction
  let fixed = 0;
  let errors = 0;

  for (const tx of transactions) {
    const { error: updateError } = await supabase
      .from('transactions')
      .update({
        amount: Math.abs(tx.amount),
        // Ensure transaction_type is correct (should already be debit for negative amounts)
        transaction_type: tx.amount < 0 ? 'debit' : 'credit'
      })
      .eq('id', tx.id);

    if (updateError) {
      console.error(`Error updating transaction ${tx.id}:`, updateError);
      errors++;
    } else {
      fixed++;
    }
  }

  console.log(`\n✅ Fixed ${fixed} transactions`);
  if (errors > 0) {
    console.log(`❌ ${errors} errors`);
  }

  // Verify the fix
  const { data: remaining, error: checkError } = await supabase
    .from('transactions')
    .select('id')
    .lt('amount', 0);

  if (!checkError) {
    console.log(`\n📊 Remaining transactions with negative amounts: ${remaining.length}`);
  }

  console.log('\n✅ Done!');
}

fixNegativeAmounts().then(() => process.exit(0));
