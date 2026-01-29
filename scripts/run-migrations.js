/**
 * Run SQL migrations on Supabase
 * Usage: node scripts/run-migrations.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase with service role key (bypasses RLS)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runMigration(filePath) {
  console.log(`\n📄 Running migration: ${path.basename(filePath)}`);

  try {
    // Read SQL file
    const sql = fs.readFileSync(filePath, 'utf8');

    // Execute SQL
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });

    if (error) {
      // If exec_sql doesn't exist, try direct query
      console.log('   Trying direct query execution...');
      const { error: queryError } = await supabase.from('_').select('*').limit(0);

      // Split SQL into individual statements and execute
      const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));

      console.log(`   Found ${statements.length} SQL statements`);

      // Note: Direct SQL execution via Supabase client is limited
      // You'll need to run these in the Supabase SQL Editor
      console.log('\n⚠️  Cannot execute SQL directly via API.');
      console.log('   Please run this migration manually in Supabase SQL Editor:');
      console.log(`   Dashboard > SQL Editor > New Query > Paste the content of ${path.basename(filePath)}\n`);

      return false;
    }

    console.log('✅ Migration completed successfully');
    return true;
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    return false;
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('🚀 Running Supabase Migrations');
  console.log('='.repeat(60));

  const migrations = [
    path.join(__dirname, 'sql', 'create-exchange-rates-table.sql'),
    path.join(__dirname, 'sql', 'add-usd-fields-to-transactions.sql')
  ];

  console.log('\n📋 Instructions:');
  console.log('1. Go to your Supabase Dashboard');
  console.log('2. Navigate to: SQL Editor > New Query');
  console.log('3. Copy and paste the content of each file below');
  console.log('4. Run each query\n');

  for (const migrationFile of migrations) {
    console.log('-'.repeat(60));
    console.log(`\n📁 File: ${path.basename(migrationFile)}`);
    console.log(`   Path: ${migrationFile}`);

    if (!fs.existsSync(migrationFile)) {
      console.log('❌ File not found!');
      continue;
    }

    const content = fs.readFileSync(migrationFile, 'utf8');
    console.log(`   Lines: ${content.split('\n').length}`);
    console.log('\n   Content preview:');
    console.log('   ' + content.split('\n').slice(0, 10).join('\n   '));
    console.log('   ...\n');
  }

  console.log('='.repeat(60));
  console.log('✅ Migration files ready');
  console.log('   Run them manually in Supabase SQL Editor');
  console.log('='.repeat(60));
}

main().catch(console.error);
