// Temporary script to get/create a test user and access token
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function getOrCreateTestUser() {
  try {
    // 1. Check if there are any users
    const { data: users, error: listError } = await supabase.auth.admin.listUsers();

    if (listError) {
      console.error('Error listing users:', listError);
      return;
    }

    console.log(`\n📊 Total users in database: ${users.users.length}\n`);

    if (users.users.length > 0) {
      console.log('Existing users:');
      users.users.forEach((user, index) => {
        console.log(`${index + 1}. Email: ${user.email || 'N/A'}`);
        console.log(`   ID: ${user.id}`);
        console.log(`   Created: ${user.created_at}`);
        console.log('');
      });

      // Get access token for first user
      const firstUser = users.users[0];
      console.log('🔑 Generating access token for first user...\n');

      const { data: session, error: sessionError } = await supabase.auth.admin.createSession({
        user_id: firstUser.id
      });

      if (sessionError) {
        console.error('Error creating session:', sessionError);
        return;
      }

      console.log('✅ SUCCESS! Copy this access token:\n');
      console.log('━'.repeat(80));
      console.log(session.access_token);
      console.log('━'.repeat(80));
      console.log('\n📋 To use it:');
      console.log('1. Open browser DevTools (F12)');
      console.log('2. Go to Application → Local Storage → http://localhost:3002');
      console.log('3. Add a new key: sb-adgxouvmnkhcqfyyfrfo-auth-token');
      console.log('4. Paste this JSON as value:\n');
      console.log(JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: firstUser
      }, null, 2));
      console.log('\n5. Refresh the page\n');

    } else {
      console.log('⚠️  No users found. Creating a test user...\n');

      const testEmail = 'test@maneki.local';
      const testPassword = 'TestPassword123!';

      const { data, error } = await supabase.auth.admin.createUser({
        email: testEmail,
        password: testPassword,
        email_confirm: true
      });

      if (error) {
        console.error('Error creating user:', error);
        return;
      }

      console.log('✅ Test user created!');
      console.log(`Email: ${testEmail}`);
      console.log(`Password: ${testPassword}`);
      console.log(`User ID: ${data.user.id}\n`);

      // Get session for new user
      const { data: session, error: sessionError } = await supabase.auth.admin.createSession({
        user_id: data.user.id
      });

      if (!sessionError) {
        console.log('🔑 Access Token:\n');
        console.log('━'.repeat(80));
        console.log(session.access_token);
        console.log('━'.repeat(80));
      }
    }

  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

getOrCreateTestUser();
