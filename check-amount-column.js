// Check the amount column data type
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkColumn() {
  console.log('\n🔍 Checking amount column definition\n');
  
  // Query PostgreSQL information_schema
  const { data, error } = await supabase.rpc('get_column_info', {});
  
  if (error) {
    console.log('RPC not available, using direct query...\n');
    
    // Alternative: query a transaction to see the schema
    const { data: sample, error: sampleError } = await supabase
      .from('transactions')
      .select('amount')
      .limit(1);
    
    console.log('Sample query result:', sample);
  }
  
  console.log('\n📊 Checking for extremely large amounts in database...\n');
  
  const { data: maxAmounts, error: maxError } = await supabase
    .from('transactions')
    .select('amount, description, file_id, transaction_date')
    .order('amount', { ascending: false })
    .limit(10);
  
  if (maxAmounts) {
    console.log('Top 10 largest amounts in database:');
    maxAmounts.forEach((tx, i) => {
      console.log(`${i + 1}. Amount: ${tx.amount.toLocaleString()}`);
      console.log(`   Description: ${tx.description?.substring(0, 50)}`);
      console.log(`   File: ${tx.file_id}`);
      console.log('');
    });
  }
  
  console.log('\n💡 PostgreSQL NUMERIC type limits:');
  console.log('   - NUMERIC without precision: up to 131072 digits before decimal');
  console.log('   - NUMERIC(12,2): max value is 9,999,999,999.99 (10 billion)');
  console.log('   - DECIMAL is alias for NUMERIC');
  console.log('\nIf amount is NUMERIC(12,2), any value >= 10,000,000,000 will overflow!');
}

checkColumn()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
