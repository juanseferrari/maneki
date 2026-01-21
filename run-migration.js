const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://adgxouvmnkhcqfyyfrfo.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFkZ3hvdXZtbmtoY3FmeXlmcmZvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDI3NzA4MSwiZXhwIjoyMDc1ODUzMDgxfQ.FF_qsqM5PDpuwVUG0lvZEoecyJ2jF5H9sms5Vnhma7Y'
);

async function runMigration() {
  console.log('🔄 Running migration: Add category_id to recurring_services...\n');

  try {
    // Check current schema
    console.log('📋 Checking current recurring_services schema...');
    const { data: beforeServices } = await supabase
      .from('recurring_services')
      .select('*')
      .limit(1);

    if (beforeServices && beforeServices[0]) {
      const hasOldField = 'category' in beforeServices[0];
      const hasNewField = 'category_id' in beforeServices[0];

      console.log(`  - Has 'category' field: ${hasOldField}`);
      console.log(`  - Has 'category_id' field: ${hasNewField}`);

      if (hasNewField) {
        console.log('\n✅ Migration already applied! category_id column exists.\n');
      } else {
        console.log('\n⚠️  Migration needed: category_id column does NOT exist.');
        console.log('\n📝 Please run this SQL in Supabase SQL Editor:');
        console.log('   https://supabase.com/dashboard/project/adgxouvmnkhcqfyyfrfo/sql\n');
        console.log('--- Copy and paste this SQL: ---\n');
        console.log(`
ALTER TABLE recurring_services
ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_recurring_services_category_id
ON recurring_services(category_id);

COMMENT ON COLUMN recurring_services.category IS 'DEPRECATED: Old category field (text). Use category_id instead.';
COMMENT ON COLUMN recurring_services.category_id IS 'Foreign key to categories table. Preferred over old category field.';
        `);
        console.log('--- End of SQL ---\n');
      }
    }

    // Show current state
    const { data: services } = await supabase
      .from('recurring_services')
      .select('id, name, category, category_id, user_id')
      .order('created_at', { ascending: false })
      .limit(10);

    console.log('📊 Current state of services (last 10):');
    if (services) {
      services.forEach(s => {
        console.log(`  - ${s.name}: category="${s.category}" | category_id=${s.category_id || 'null'}`);
      });
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

runMigration().then(() => {
  console.log('\n✅ Done!');
  process.exit(0);
}).catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
