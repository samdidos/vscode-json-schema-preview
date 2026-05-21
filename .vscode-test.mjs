import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  files: 'out/test/suite/**/*.test.js',
  mocha: { timeout: 20_000 },
  coverage: {
    includeAll: true,
    srcDir: 'src',
    exclude: ['src/test/**'],
    reporter: ['text', 'json-summary'],
  },
});
