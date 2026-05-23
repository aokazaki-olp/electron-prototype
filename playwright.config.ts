import { defineConfig } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: path.join(__dirname, 'tests/e2e/specs'),
  timeout: 60_000,
  retries: process.env['CI'] ? 2 : 0,
  // CDP ポート (19222) を共有するため workers を 1 に固定
  workers: 1,
  fullyParallel: false,
  reporter: [['html', { outputFolder: 'tests/e2e/report' }], ['list']],
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'electron',
      testMatch: '**/*.spec.ts',
    },
  ],
});
