// Check Claude quota in production
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkQuota() {
  console.log('\n🔍 Checking Claude API quota...\n');

  // Get all users with their quota
  const { data: quotas, error } = await supabase
    .from('claude_usage_tracking')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error:', error);
    return;
  }

  if (!quotas || quotas.length === 0) {
    console.log('No quota records found');
    return;
  }

  console.log('User Quotas:\n');
  for (const quota of quotas) {
    const remaining = Math.max(0, quota.monthly_limit - quota.usage_count);
    const status = remaining > 0 ? '✅ Available' : '❌ Exceeded';

    console.log(`User: ${quota.user_id}`);
    console.log(`Month: ${quota.month_year}`);
    console.log(`Usage: ${quota.usage_count}/${quota.monthly_limit}`);
    console.log(`Remaining: ${remaining}`);
    console.log(`Status: ${status}`);
    console.log(`Last updated: ${quota.updated_at}`);
    console.log('---\n');
  }

  // Get user email for context
  const { data: users } = await supabase.auth.admin.listUsers();
  if (users) {
    console.log('\nUser emails:');
    users.users.forEach(u => {
      console.log(`${u.id}: ${u.email}`);
    });
  }
}

checkQuota().then(() => process.exit(0));
