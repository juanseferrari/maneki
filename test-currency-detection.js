// Test currency detection in Claude prompt
require('dotenv').config();
const ClaudeService = require('./services/claude.service');

async function testCurrencyDetection() {
  console.log('\n🪙 Testing Currency Detection\n');
  
  const testCases = [
    {
      name: 'Brubank Argentina',
      text: `
        BRUBANK
        Estado de Cuenta
        Fecha: 01/02/2026 - 28/02/2026
        
        Movimientos:
        05/02/2026 - Compra en supermercado - $1,500.00
        10/02/2026 - Transferencia recibida - $5,000.00
      `,
      expectedCurrency: 'ARS'
    },
    {
      name: 'Mercado Pago Argentina',
      text: `
        Mercado Pago
        Resumen de Actividad
        
        15/02/2026 - Pago recibido - $2,300.50
        20/02/2026 - Retiro a cuenta bancaria - $1,000.00
      `,
      expectedCurrency: 'ARS'
    },
    {
      name: 'Banamex México',
      text: `
        BANAMEX
        Estado de Cuenta
        
        01/02/2026 - Compra en tienda - $850.00
        10/02/2026 - Pago de servicios - $350.00
      `,
      expectedCurrency: 'MXN'
    }
  ];
  
  for (const testCase of testCases) {
    console.log(`\n📄 Testing: ${testCase.name}`);
    console.log(`   Expected currency: ${testCase.expectedCurrency}`);
    
    try {
      const result = await ClaudeService.extractTransactionsEnhanced(
        testCase.text,
        `${testCase.name.toLowerCase().replace(/\s+/g, '-')}.txt`,
        'test-user-id'
      );
      
      if (result.transactions && result.transactions.length > 0) {
        const detectedCurrency = result.transactions[0].currency;
        const match = detectedCurrency === testCase.expectedCurrency ? '✅' : '❌';
        console.log(`   ${match} Detected: ${detectedCurrency}`);
        console.log(`   Transactions: ${result.transactions.length}`);
      } else {
        console.log('   ⚠️  No transactions extracted');
      }
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }
  }
  
  console.log('\n✅ Currency detection test complete!\n');
}

testCurrencyDetection()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
