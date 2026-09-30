import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: ['node_modules/**', 'coverage/**', 'dist/**', 'scripts/migrations/**']
  },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'commonjs',
      globals: { ...globals.node }
    },
    rules: {
      'no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_'
      }],
      'no-console': 'warn',
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      'prefer-const': 'error',
      'no-return-await': 'error'
    }
  },
  {
    files: ['__tests__/**/*.js', '**/*.test.js'],
    languageOptions: {
      globals: { ...globals.node, ...globals.jest }
    },
    rules: { 'no-console': 'off' }
  }
];
