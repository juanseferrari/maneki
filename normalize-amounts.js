require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function normalizeAmounts() {
  console.log('🔄 Normalizing transaction amounts...\n');
  
  // Get all transactions with negative amounts
  const { data: negativeTx, error: fetchError } = await supabase
    .from('transactions')
    .select('id, amount, transaction_type')
    .lt('amount', 0);
  
  if (fetchError) {
    console.error('Error fetching transactions:', fetchError);
    return;
  }
  
  console.log(`Found ${negativeTx.length} transactions with negative amounts\n`);
  
  let updated = 0;
  let errors = 0;
  
  // Update in batches of 100
  for (let i = 0; i < negativeTx.length; i += 100) {
    const batch = negativeTx.slice(i, i + 100);
    
    console.log(`Processing batch ${Math.floor(i/100) + 1}/${Math.ceil(negativeTx.length/100)}...`);
    
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
    console.log(`❌ ${errors} errors`);
  }
  
  // Verify
  const { count: remaining } = await supabase
    .from('transactions')
    .select('*', { count: 'exact', head: true })
    .lt('amount', 0);
  
  console.log(`\n📊 Remaining negative amounts: ${remaining || 0}`);
  
  // Show sample
  const { data: sample } = await supabase
    .from('transactions')
    .select('amount, transaction_type, description, source')
    .order('created_at', { ascending: false })
    .limit(10);
  
  console.log('\nSample of recent transactions:');
  sample.forEach(tx => {
    const sign = tx.transaction_type === 'debit' ? '-' : '+';
    const source = tx.source || 'bank_file';
    console.log(`  ${sign}$${tx.amount} (${tx.transaction_type}) [${source}] - ${tx.description.substring(0, 35)}`);
  });
}

normalizeAmounts();
