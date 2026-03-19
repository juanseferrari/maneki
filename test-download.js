// Test download endpoint
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testDownload() {
  const fileId = '9790fd94-27c4-4562-a8af-2d12f6927ed9';
  
  console.log('\n🔍 Testing download for file:', fileId, '\n');
  
  // Get file metadata
  const { data: file, error } = await supabase
    .from('files')
    .select('*')
    .eq('id', fileId)
    .single();
  
  if (error) {
    console.error('Error getting file:', error);
    return;
  }
  
  console.log('File metadata:');
  console.log('  Original name:', file.original_name);
  console.log('  Stored name:', file.stored_name);
  console.log('  Storage path:', file.storage_path);
  console.log('  Mime type:', file.mime_type);
  console.log('  User ID:', file.user_id);
  
  // Try to download from Supabase Storage
  console.log('\nAttempting download from storage...');
  const { data: fileData, error: downloadError } = await supabase
    .storage
    .from('conciliaciones')
    .download(file.storage_path);
  
  if (downloadError) {
    console.error('❌ Error downloading:', downloadError);
  } else {
    console.log('✅ Download successful!');
    console.log('   File size:', fileData.size, 'bytes');
    console.log('   File type:', fileData.type);
  }
}

testDownload()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
