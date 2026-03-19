// Script to run migration 009 in production
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runProductionMigration() {
  console.log('\n🚀 RUNNING MIGRATION 009 IN PRODUCTION');
  console.log('====================================\n');

  // 1. Check current state
  console.log('📊 Step 1: Checking current state...\n');

  const { count: negativeCount } = await supabase
    .from('transactions')
    .select('*', { count: 'exact', head: true })
    .lt('amount', 0);

  const { count: totalCount } = await supabase
    .from('transactions')
    .select('*', { count: 'exact', head: true });

  console.log(`Total transactions: ${totalCount}`);
  console.log(`Transactions with negative amounts: ${negativeCount || 0}\n`);

  if ((negativeCount || 0) === 0) {
    console.log('✅ No negative amounts found. Migration may have already run.');
    console.log('Verifying data integrity...\n');
  } else {
    console.log(`⚠️  Found ${negativeCount} transactions with negative amounts`);
    console.log('Starting normalization...\n');

    // 2. Normalize amounts
    console.log('🔄 Step 2: Normalizing amounts...\n');

    const { data: negativeTx } = await supabase
      .from('transactions')
      .select('id, amount, transaction_type')
      .lt('amount', 0);

    let updated = 0;
    let errors = 0;

    // Update in batches
    for (let i = 0; i < negativeTx.length; i += 100) {
      const batch = negativeTx.slice(i, i + 100);
      const batchNum = Math.floor(i/100) + 1;
      const totalBatches = Math.ceil(negativeTx.length/100);

      console.log(`Processing batch ${batchNum}/${totalBatches} (${batch.length} transactions)...`);

      for (const tx of batch) {
        const { error } = await supabase
          .from('transactions')
          .update({
            amount: Math.abs(tx.amount),
            transaction_type: 'debit' // Negative amounts are always debits
          })
          .eq('id', tx.id);

        if (error) {
          console.error(`  ❌ Error updating ${tx.id}:`, error.message);
          errors++;
        } else {
          updated++;
        }
      }
    }

    console.log(`\n✅ Updated ${updated} transactions`);
    if (errors > 0) {
      console.log(`❌ ${errors} errors\n`);
    } else {
      console.log('');
    }
  }

  // 3. Verify results
  console.log('🔍 Step 3: Verifying results...\n');

  const { count: remainingNegative } = await supabase
    .from('transactions')
    .select('*', { count: 'exact', head: true })
    .lt('amount', 0);

  console.log(`Remaining negative amounts: ${remainingNegative || 0}`);

  if ((remainingNegative || 0) === 0) {
    console.log('✅ All amounts normalized successfully!\n');
  } else {
    console.log(`⚠️  Still ${remainingNegative} negative amounts remaining\n`);
  }

  // 4. Show sample
  console.log('📋 Sample of transactions:\n');

  const { data: sample } = await supabase
    .from('transactions')
    .select('amount, transaction_type, description, source, bank_name')
    .order('created_at', { ascending: false })
    .limit(10);

  sample.forEach(tx => {
    const sign = tx.transaction_type === 'debit' ? '-' : '+';
    const source = tx.source || 'file';
    const bank = tx.bank_name || 'Unknown';
    console.log(`  ${sign}$${tx.amount} (${tx.transaction_type}) [${source}] [${bank}]`);
    console.log(`    ${tx.description.substring(0, 60)}`);
  });

  console.log('\n====================================');
  console.log('✅ MIGRATION COMPLETED SUCCESSFULLY!');
  console.log('====================================\n');
}

runProductionMigration().catch(err => {
  console.error('\n❌ MIGRATION FAILED:', err);
  process.exit(1);
});
