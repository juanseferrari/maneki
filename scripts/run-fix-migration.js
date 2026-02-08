/**
 * Run the foreign key fix migration
 * This fixes the issue where claude_usage_tracking references non-existent public.users
 * Instead, it should reference auth.users (Supabase Auth table)
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runMigration() {
  console.log('='.repeat(60));
  console.log('🔧 Running Foreign Key Fix Migration');
  console.log('='.repeat(60));
  console.log('');
  console.log('Issue: claude_usage_tracking.user_id references non-existent public.users');
  console.log('Fix: Change reference to auth.users (Supabase Auth table)');
  console.log('');

  const migrationPath = path.join(__dirname, '..', 'db', 'migrations', '005-fix-claude-usage-tracking-fkey.sql');

  console.log('📄 Migration file:', migrationPath);
  console.log('');

  if (!fs.existsSync(migrationPath)) {
    console.error('❌ Migration file not found!');
    return;
  }

  const sql = fs.readFileSync(migrationPath, 'utf8');

  console.log('📝 Migration content:');
  console.log('-'.repeat(60));
  console.log(sql);
  console.log('-'.repeat(60));
  console.log('');

  console.log('⚠️  MANUAL STEP REQUIRED:');
  console.log('');
  console.log('1. Go to your Supabase Dashboard:');
  console.log('   https://supabase.com/dashboard/project/adgxouvmnkhcqfyyfrfo');
  console.log('');
  console.log('2. Navigate to: SQL Editor > New Query');
  console.log('');
  console.log('3. Copy the SQL above and paste it into the editor');
  console.log('');
  console.log('4. Click "Run" to execute the migration');
  console.log('');
  console.log('5. Verify success by checking for green checkmark ✅');
  console.log('');

  console.log('='.repeat(60));
  console.log('After running this migration:');
  console.log('- File uploads will work correctly');
  console.log('- Claude quota tracking will function properly');
  console.log('- No more foreign key constraint violations');
  console.log('='.repeat(60));
}

runMigration().then(() => process.exit(0));
