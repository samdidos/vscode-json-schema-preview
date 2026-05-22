import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  files: 'out/test/suite/**/*.test.js',
  mocha: { timeout: 20_000 },
  coverage: {
    includeAll: true,
    srcDir: 'src',
    exclude: [
      'src/test/**',
      // Excluded: require a live Python subprocess — no unit-testable logic.
      'src/python.ts',
      // Excluded: pure VS Code WebviewPanel + postMessage UI — no unit-testable logic.
      'src/SchemaEditorPanel.ts',
      // Excluded: VS Code WebviewPanel + Python subprocess at runtime — no unit-testable logic.
      'src/ConfigWebPanel.ts',
    ],
    reporter: ['text', 'json-summary'],
  },
});
