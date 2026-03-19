// Check recent users and their file deletion attempts
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkRecentActivity() {
  console.log('\n🔍 Checking recent user activity\n');
  
  // Get users who uploaded files recently
  const { data: recentFiles, error } = await supabase
    .from('files')
    .select('user_id, original_name, created_at')
    .order('created_at', { ascending: false })
    .limit(20);
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  // Get unique user IDs
  const userIds = [...new Set(recentFiles.map(f => f.user_id))];
  
  console.log(`Found ${userIds.length} recent users:\n`);
  
  for (const userId of userIds) {
    // Get user info
    const { data: { user }, error: userError } = await supabase.auth.admin.getUserById(userId);
    
    const userName = user?.email || user?.user_metadata?.name || 'Unknown';
    const userFiles = recentFiles.filter(f => f.user_id === userId);
    
    console.log(`👤 User: ${userName}`);
    console.log(`   ID: ${userId}`);
    console.log(`   Recent files: ${userFiles.length}`);
    console.log(`   Last activity: ${new Date(userFiles[0].created_at).toLocaleString()}`);
    
    // Check if name matches "Carina"
    if (userName.toLowerCase().includes('carina') || userName.toLowerCase().includes('veppo')) {
      console.log(`   ⭐ MATCH: This could be the user!`);
      console.log(`   Recent files:`);
      userFiles.slice(0, 5).forEach(f => {
        console.log(`     - ${f.original_name} (${new Date(f.created_at).toLocaleString()})`);
      });
    }
    console.log('');
  }
}

checkRecentActivity()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
