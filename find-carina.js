// Find Carina Veppo user
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function findCarina() {
  console.log('\n🔍 Searching for Carina Veppo\n');
  
  // Search in auth.users metadata
  const { data: { users }, error } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000
  });
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log(`Total users: ${users.length}\n`);
  
  const carinaUsers = users.filter(u => {
    const email = u.email?.toLowerCase() || '';
    const name = u.user_metadata?.name?.toLowerCase() || '';
    const fullName = u.user_metadata?.full_name?.toLowerCase() || '';
    
    return email.includes('carina') || 
           email.includes('veppo') || 
           name.includes('carina') || 
           name.includes('veppo') ||
           fullName.includes('carina') ||
           fullName.includes('veppo');
  });
  
  if (carinaUsers.length === 0) {
    console.log('❌ No users found matching "Carina" or "Veppo"\n');
    console.log('Showing all users for reference:\n');
    users.slice(0, 15).forEach(u => {
      console.log(`- ${u.email || 'No email'} | ${u.user_metadata?.name || u.user_metadata?.full_name || 'No name'}`);
    });
    return;
  }
  
  console.log(`✅ Found ${carinaUsers.length} matching user(s):\n`);
  
  for (const user of carinaUsers) {
    console.log(`👤 User: ${user.email}`);
    console.log(`   ID: ${user.id}`);
    console.log(`   Name: ${user.user_metadata?.name || user.user_metadata?.full_name || 'N/A'}`);
    console.log(`   Created: ${new Date(user.created_at).toLocaleString()}`);
    console.log(`   Last sign in: ${user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString() : 'Never'}`);
    
    // Get files for this user
    const { data: files } = await supabase
      .from('files')
      .select('id, original_name, created_at, processing_status')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    
    if (files && files.length > 0) {
      console.log(`\n   📁 Files (${files.length} total):`);
      files.slice(0, 5).forEach(f => {
        console.log(`     - ${f.original_name} (${f.processing_status}) - ${new Date(f.created_at).toLocaleString()}`);
      });
    } else {
      console.log(`\n   No files found`);
    }
    console.log('');
  }
}

findCarina()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
