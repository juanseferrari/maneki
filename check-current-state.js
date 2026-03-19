require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkState() {
  console.log('📊 Checking current state of transactions...\n');
  
  // Count negative amounts
  const { count: negativeCount } = await supabase
    .from('transactions')
    .select('*', { count: 'exact', head: true })
    .lt('amount', 0);
  
  console.log(`Transactions with NEGATIVE amounts: ${negativeCount || 0}`);
  
  // Count positive amounts
  const { count: positiveCount } = await supabase
    .from('transactions')
    .select('*', { count: 'exact', head: true })
    .gt('amount', 0);
    
  console.log(`Transactions with POSITIVE amounts: ${positiveCount || 0}\n`);
  
  // Sample of negative transactions
  if (negativeCount > 0) {
    console.log('Sample of transactions with NEGATIVE amounts:');
    const { data: negativeTx } = await supabase
      .from('transactions')
      .select('amount, transaction_type, description, bank_name')
      .lt('amount', 0)
      .limit(5);
      
    negativeTx.forEach(tx => {
      console.log(`  ${tx.amount} | ${tx.transaction_type} | ${tx.bank_name} | ${tx.description.substring(0, 40)}`);
    });
    console.log('');
  }
  
  // Sample by source
  console.log('Sample by source:');
  const { data: mpTx } = await supabase
    .from('transactions')
    .select('amount, transaction_type, source, description')
    .eq('source', 'mercadopago')
    .order('created_at', { ascending: false })
    .limit(3);
    
  console.log('MercadoPago:');
  mpTx.forEach(tx => {
    console.log(`  ${tx.amount} | ${tx.transaction_type} | ${tx.description.substring(0, 40)}`);
  });
  
  const { data: claudeTx } = await supabase
    .from('transactions')
    .select('amount, transaction_type, source, description')
    .is('source', null)
    .order('created_at', { ascending: false })
    .limit(3);
    
  console.log('\nClaude/Bank files:');
  claudeTx.forEach(tx => {
    console.log(`  ${tx.amount} | ${tx.transaction_type} | ${tx.description.substring(0, 40)}`);
  });
}

checkState();
