// @ts-check
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');

/** @type {import('eslint').Linter.Config[]} */
module.exports = [
  {
    // Generated/downloaded directories that must never be walked: bare `eslint`
    // (no path args) scans the whole CWD, and .vscode-test/ in particular ships
    // vendored extensions with their own eslint.config.mjs files that import
    // devDependencies not installed in this project, crashing the whole run.
    ignores: [
      'out/**',
      'dist/**',
      '**/*.d.ts',
      '.vscode-test/**',
      'coverage/**',
      'reports/**',
      'test-results/**',
      'playwright-report/**',
    ],
  },
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      '@typescript-eslint/naming-convention': 'warn',
      'curly': 'warn',
      'eqeqeq': 'warn',
      'no-throw-literal': 'warn',
      'semi': 'off',
    },
  },
];
