require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verifyProduction() {
  console.log('\n✅ PRODUCTION VERIFICATION');
  console.log('========================\n');

  // 1. Check bank_templates table exists
  console.log('1️⃣  Checking bank_templates table...');
  const { data: templates, error: templatesError } = await supabase
    .from('bank_templates')
    .select('*')
    .limit(1);

  if (templatesError) {
    console.log(`   ❌ bank_templates table not found: ${templatesError.message}`);
    console.log('   ⚠️  Run migrations 007 and 008 in Supabase SQL Editor\n');
  } else {
    console.log('   ✅ bank_templates table exists\n');
  }

  // 2. Check transactions normalization
  console.log('2️⃣  Checking transaction amounts...');
  const { count: negativeCount } = await supabase
    .from('transactions')
    .select('*', { count: 'exact', head: true })
    .lt('amount', 0);

  if ((negativeCount || 0) === 0) {
    console.log('   ✅ All amounts are positive (normalized)\n');
  } else {
    console.log(`   ⚠️  Found ${negativeCount} negative amounts\n`);
  }

  // 3. Check recent files
  console.log('3️⃣  Recent files processed:');
  const { data: files, error: filesError } = await supabase
    .from('files')
    .select('original_name, bank_name, processing_method, transaction_count, confidence_score')
    .order('created_at', { ascending: false })
    .limit(5);

  if (filesError || !files) {
    console.log(`   ⚠️  Could not fetch files: ${filesError?.message || 'Unknown error'}\n`);
  } else {
    files.forEach(f => {
      console.log(`   📄 ${f.original_name}`);
      console.log(`      Bank: ${f.bank_name || 'Unknown'} | Method: ${f.processing_method} | Txs: ${f.transaction_count} | Confidence: ${f.confidence_score}%`);
    });
  }

  console.log('\n========================');
  console.log('✅ VERIFICATION COMPLETE\n');
}

verifyProduction();
