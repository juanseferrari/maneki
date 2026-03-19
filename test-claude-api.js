// Test Claude API availability
require('dotenv').config();
const ClaudeService = require('./services/claude.service');

async function testClaudeAPI() {
  console.log('\n🔍 Testing Claude API...\n');

  // Check env var
  console.log('1. Environment variable check:');
  console.log(`   ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? '✅ Set (' + process.env.ANTHROPIC_API_KEY.substring(0, 10) + '...)' : '❌ NOT SET'}`);
  console.log('');

  // Initialize service (it's a singleton)
  console.log('2. Claude service initialization:');
  const claudeService = ClaudeService;
  console.log(`   Is available: ${claudeService.isClaudeAvailable() ? '✅ Yes' : '❌ No'}`);
  console.log('');

  if (!claudeService.isClaudeAvailable()) {
    console.log('❌ Claude API is not available. Please configure ANTHROPIC_API_KEY in .env');
    return;
  }

  // Test simple extraction
  console.log('3. Testing simple extraction:');
  const testText = `
    BANCO NARANJA X
    Resumen de Cuenta

    01/02/2026 - Compra en supermercado - $150.00
    05/02/2026 - Pago de servicios - $75.50
  `;

  try {
    console.log('   Sending test request...');
    const result = await claudeService.extractTransactionsEnhanced(testText, 'test.txt', 'f2aed59f-54dd-4d7b-91e0-8070b78eeb55');
    console.log('   ✅ Claude API responded successfully!');
    console.log(`   Transactions found: ${result.totalTransactions}`);
    console.log(`   Confidence: ${result.confidenceScore}%`);
  } catch (error) {
    console.log('   ❌ Error calling Claude API:');
    console.log(`   ${error.message}`);
    if (error.stack) {
      console.log('   Stack trace:');
      console.log(error.stack);
    }
  }
}

testClaudeAPI().then(() => process.exit(0)).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
