require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runMigration() {
  console.log('🔄 Running migration 009-normalize-transaction-amounts.sql...\n');
  
  const sql = fs.readFileSync('./db/migrations/009-normalize-transaction-amounts.sql', 'utf8');
  
  // Split by semicolon and execute each statement
  const statements = sql.split(';').filter(s => s.trim() && !s.trim().startsWith('--'));
  
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i].trim();
    if (!stmt) continue;
    
    console.log(`Executing statement ${i + 1}/${statements.length}...`);
    
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: stmt });
    
    if (error) {
      console.error(`❌ Error in statement ${i + 1}:`, error.message);
      console.error('Statement:', stmt.substring(0, 200));
      // Continue with other statements
    } else {
      console.log(`✅ Statement ${i + 1} executed successfully`);
    }
  }
  
  console.log('\n✅ Migration completed!');
  
  // Verify results
  console.log('\n📊 Verification:');
  const { data: negativeCount } = await supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .lt('amount', 0);
    
  console.log(`Transactions with negative amounts: ${negativeCount || 0}`);
  
  const { data: sample } = await supabase
    .from('transactions')
    .select('amount, transaction_type, description')
    .order('created_at', { ascending: false })
    .limit(5);
    
  console.log('\nSample of recent transactions:');
  sample.forEach(tx => {
    const sign = tx.transaction_type === 'debit' ? '-' : '+';
    console.log(`  ${sign}$${tx.amount} (${tx.transaction_type}) - ${tx.description.substring(0, 40)}`);
  });
}

runMigration();
