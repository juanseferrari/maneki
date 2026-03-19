// Test different download methods
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testDownload() {
  const fileId = '9790fd94-27c4-4562-a8af-2d12f6927ed9';
  
  console.log('\n🔍 Testing different download methods\n');
  
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
  
  console.log('File info:');
  console.log('  Storage path:', file.storage_path);
  console.log('  Public URL:', file.public_url);
  
  // Method 1: Try public URL
  console.log('\n1. Testing public URL access...');
  try {
    const response = await fetch(file.public_url);
    console.log('   Status:', response.status);
    console.log('   Status text:', response.statusText);
    if (response.ok) {
      console.log('   ✅ Public URL works!');
    } else {
      console.log('   ❌ Public URL blocked');
    }
  } catch (err) {
    console.log('   ❌ Error:', err.message);
  }
  
  // Method 2: Try authenticated download
  console.log('\n2. Testing authenticated download...');
  const { data: fileData, error: downloadError } = await supabase
    .storage
    .from('conciliaciones')
    .download(file.storage_path);
  
  if (downloadError) {
    console.log('   ❌ Error:', downloadError.message || downloadError);
  } else {
    console.log('   ✅ Authenticated download works!');
  }
  
  // Method 3: Try createSignedUrl
  console.log('\n3. Testing signed URL...');
  const { data: signedUrlData, error: signedError } = await supabase
    .storage
    .from('conciliaciones')
    .createSignedUrl(file.storage_path, 60); // 60 seconds expiry
  
  if (signedError) {
    console.log('   ❌ Error:', signedError.message || signedError);
  } else {
    console.log('   ✅ Signed URL created!');
    console.log('   URL:', signedUrlData.signedUrl);
  }
}

testDownload()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
