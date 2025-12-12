// Test parseArgentineAmount function

function parseArgentineAmount(value) {
    if (typeof value === 'number') return value;
    if (!value || value.toString().trim() === '') return 0;

    let cleaned = value.toString().trim();
    cleaned = cleaned.replace(/[$\s]/g, '');
    const isNegative = cleaned.startsWith('-') || (cleaned.startsWith('(') && cleaned.endsWith(')'));
    cleaned = cleaned.replace(/[-()]/g, '');
    cleaned = cleaned.replace(/\./g, '');
    cleaned = cleaned.replace(',', '.');

    const amount = parseFloat(cleaned);
    if (isNaN(amount)) return 0;
    return isNegative ? -amount : amount;
}

// Test with different inputs
const tests = [
    '-343,65',
    '-1.332,00',
    '-9.324,00',
    '-2.220,00',
    '-44.400,00',
    -343.65,       // as number
    -1332.00,      // as number
];

console.log('Testing parseArgentineAmount:');
tests.forEach(t => {
    console.log('Input:', JSON.stringify(t), '(type:', typeof t, ') -> Output:', parseArgentineAmount(t));
});
