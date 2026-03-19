// Check file content
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkFile() {
  const fileId = '3eb76047-50be-47aa-a56e-85c54ab34f10'; // NaranjaX.pdf that failed

  console.log('\n🔍 Checking file content...\n');

  // Get file details
  const { data: file, error } = await supabase
    .from('files')
    .select('*')
    .eq('id', fileId)
    .single();

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`📄 File: ${file.original_name}`);
  console.log(`Bank detected: ${file.bank_name} (${file.bank_id || 'no ID'})`);
  console.log(`Status: ${file.processing_status}`);
  console.log(`Method: ${file.processing_method}`);
  console.log(`Confidence: ${file.confidence_score}%`);
  console.log('');

  console.log('📝 Parsed text content (first 1000 chars):');
  console.log('---');
  console.log(file.parsed_text ? file.parsed_text.substring(0, 1000) : 'NO TEXT');
  console.log('---');
  console.log('');

  if (file.structured_data) {
    console.log('📊 Structured data:');
    const data = typeof file.structured_data === 'string'
      ? JSON.parse(file.structured_data)
      : file.structured_data;

    console.log(`Rows: ${data.length}`);
    if (data.length > 0) {
      console.log('First row:', data[0]);
      console.log('Headers:', Object.keys(data[0]));
    }
  } else {
    console.log('❌ No structured data');
  }

  console.log('');
  console.log('🔍 Classification metadata:');
  if (file.document_metadata) {
    const meta = typeof file.document_metadata === 'string'
      ? JSON.parse(file.document_metadata)
      : file.document_metadata;
    console.log(JSON.stringify(meta, null, 2));
  } else {
    console.log('No metadata');
  }
}

checkFile().then(() => process.exit(0));
