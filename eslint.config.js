const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.es2021,
        ...globals.jest
      }
    },
    rules: {
      // Error prevention
      'no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_'
      }],
      'no-console': 'off', // Allow console.log for server logging
      'no-undef': 'error',

      // Best practices
      'eqeqeq': ['error', 'always'],
      'no-var': 'error',
      'prefer-const': 'error',
      'prefer-arrow-callback': 'warn',

      // Code style
      'semi': ['error', 'always'],
      'quotes': ['error', 'single', { avoidEscape: true }],
      'comma-dangle': ['error', 'never'],
      'indent': ['error', 2, { SwitchCase: 1 }],

      // Async/await
      'require-await': 'warn',
      'no-async-promise-executor': 'error'
    },
    ignores: [
      'node_modules/**',
      'coverage/**',
      '*.min.js',
      'public/**',
      'views/**'
    ]
  }
];
