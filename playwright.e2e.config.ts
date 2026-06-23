import { defineConfig } from '@playwright/test';
import path from 'path';

export default defineConfig({
  testDir: path.join(__dirname, 'src/test/e2e'),
  timeout: 120_000,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    // Screenshots are taken manually in each test
    screenshot: 'only-on-failure',
    trace: 'off',
  },
});
