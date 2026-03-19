// Check currency of Brubank and MercadoPago files
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkCurrency() {
  console.log('\n🔍 Checking currency of Brubank and Mercado Pago files...\n');
  
  // Get recent files
  const { data: files, error } = await supabase
    .from('files')
    .select('id, original_name, bank_name, created_at')
    .or('bank_name.ilike.%brubank%,bank_name.ilike.%mercado%pago%')
    .order('created_at', { ascending: false })
    .limit(10);
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  if (!files || files.length === 0) {
    console.log('❌ No Brubank or Mercado Pago files found.');
    console.log('\nSearching in all files for these banks...\n');
    
    // Try broader search
    const { data: allFiles } = await supabase
      .from('files')
      .select('id, original_name, bank_name, created_at')
      .order('created_at', { ascending: false })
      .limit(20);
    
    const filtered = allFiles.filter(f => 
      f.original_name?.toLowerCase().includes('brubank') ||
      f.original_name?.toLowerCase().includes('mercado') ||
      f.original_name?.toLowerCase().includes('meli')
    );
    
    if (filtered.length === 0) {
      console.log('No files with Brubank or Mercado Pago in name.');
      return;
    }
    
    files.push(...filtered);
  }
  
  console.log(`Found ${files.length} files:\n`);
  
  for (const file of files) {
    console.log(`📄 ${file.original_name}`);
    console.log(`   Bank: ${file.bank_name || 'Not detected'}`);
    console.log(`   ID: ${file.id}`);
    console.log(`   Date: ${new Date(file.created_at).toLocaleString()}`);
    
    // Get transactions for this file
    const { data: transactions, error: txError } = await supabase
      .from('transactions')
      .select('currency, amount, description')
      .eq('file_id', file.id)
      .limit(3);
    
    if (txError) {
      console.log(`   ❌ Error getting transactions: ${txError.message}`);
    } else if (transactions && transactions.length > 0) {
      const currency = transactions[0].currency || 'NULL';
      const currencyIcon = currency === 'MXN' ? '🇲🇽' : currency === 'ARS' ? '🇦🇷' : '❓';
      console.log(`   ${currencyIcon} Currency: ${currency}`);
      console.log(`   Transactions: ${transactions.length}`);
      console.log(`   Sample: ${transactions[0].description?.substring(0, 50)}... (${transactions[0].amount})`);
    } else {
      console.log(`   ⚠️  No transactions found`);
    }
    console.log('');
  }
}

checkCurrency()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
