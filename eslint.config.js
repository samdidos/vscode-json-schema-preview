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
      // docs/ is a separate VitePress project (own devDependencies, own build
      // output/dep-cache under docs/node_modules and docs/.vitepress/{cache,dist},
      // already .gitignore'd) — never meant to be linted by this config.
      'docs/**',
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
      // The default option set, widened where this codebase has a legitimate
      // convention: PascalCase variables (classes/enum-like mocks bound to
      // consts), UPPER_CASE static readonly class constants, PascalCase or
      // UPPER_CASE object-literal members (VS Code enum mocks, yaml visitor
      // callbacks), snake_case type properties (external wire formats, e.g.
      // json-schema-for-humans config), and no format at all for keys that
      // require quotes (kebab-case rule ids, header names, draft names, …).
      '@typescript-eslint/naming-convention': ['warn',
        { selector: 'default', format: ['camelCase'], leadingUnderscore: 'allow', trailingUnderscore: 'allow' },
        { selector: 'import', format: ['camelCase', 'PascalCase'] },
        { selector: 'variable', format: ['camelCase', 'PascalCase', 'UPPER_CASE'], leadingUnderscore: 'allow', trailingUnderscore: 'allow' },
        { selector: 'parameter', format: ['camelCase', 'PascalCase'], leadingUnderscore: 'allow' },
        { selector: 'typeLike', format: ['PascalCase'] },
        { selector: 'enumMember', format: ['PascalCase', 'UPPER_CASE'] },
        { selector: 'classProperty', modifiers: ['static', 'readonly'], format: ['camelCase', 'UPPER_CASE'] },
        { selector: 'objectLiteralProperty', format: ['camelCase', 'PascalCase', 'UPPER_CASE'], leadingUnderscore: 'allowSingleOrDouble' },
        { selector: 'objectLiteralMethod', format: ['camelCase', 'PascalCase'] },
        { selector: 'typeProperty', format: ['camelCase', 'PascalCase', 'snake_case'] },
        {
          selector: ['objectLiteralProperty', 'objectLiteralMethod', 'typeProperty'],
          modifiers: ['requiresQuotes'],
          format: null,
        },
      ],
      'curly': 'warn',
      'eqeqeq': 'warn',
      'no-throw-literal': 'warn',
      'semi': 'off',
    },
  },
];
