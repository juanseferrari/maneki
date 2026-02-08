/**
 * Get detailed file information
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const FILE_ID = 'ea4e7a58-2b37-4ead-a6e5-f51e5bb36e9b';

async function checkFile() {
  console.log('Checking file:', FILE_ID);

  const { data, error } = await supabase
    .from('files')
    .select('*')
    .eq('id', FILE_ID)
    .single();

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('\n=== FILE RECORD ===');
  console.log(JSON.stringify(data, null, 2));
}

checkFile().then(() => process.exit(0));
