/**
 * Check if user exists
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const USER_ID = 'f2aed59f-54dd-4d7b-91e0-8070b78eeb55';

async function checkUser() {
  console.log('Checking user:', USER_ID);

  // Check in auth.users (Supabase Auth table)
  const { data: authData, error: authError } = await supabase.auth.admin.getUserById(USER_ID);

  console.log('\n=== AUTH.USERS ===');
  if (authError) {
    console.error('Error fetching from auth.users:', authError.message);
  } else {
    console.log('User exists in auth.users:',  authData ? 'YES' : 'NO');
    if (authData) {
      console.log('Email:', authData.user?.email);
      console.log('Created:', authData.user?.created_at);
    }
  }

  // Check in public.users (custom users table if it exists)
  const { data: publicData, error: publicError } = await supabase
    .from('users')
    .select('*')
    .eq('id', USER_ID)
    .single();

  console.log('\n=== PUBLIC.USERS ===');
  if (publicError) {
    if (publicError.code === '42P01') {
      console.log('Table "users" does not exist');
    } else if (publicError.code === 'PGRST116') {
      console.log('User NOT found in public.users table');
    } else {
      console.error('Error:', publicError.message, '(code:', publicError.code, ')');
    }
  } else {
    console.log('User found in public.users:', publicData ? 'YES' : 'NO');
    if (publicData) {
      console.log(JSON.stringify(publicData, null, 2));
    }
  }

  // Check file ownership
  const { data: filesData, error: filesError } = await supabase
    .from('files')
    .select('id, original_name, created_at')
    .eq('user_id', USER_ID)
    .order('created_at', { ascending: false })
    .limit(5);

  console.log('\n=== FILES FOR THIS USER ===');
  if (filesError) {
    console.error('Error:', filesError.message);
  } else {
    console.log(`Found ${filesData?.length || 0} files`);
    if (filesData && filesData.length > 0) {
      filesData.forEach(f => {
        console.log(`  - ${f.original_name} (${f.created_at})`);
      });
    }
  }
}

checkUser().then(() => process.exit(0));
