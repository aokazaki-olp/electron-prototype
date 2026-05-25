import { defineConfig } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: path.join(__dirname, 'tests/e2e/specs'),
  timeout: 60_000,
  retries: process.env['CI'] ? 2 : 0,
  // workers=1 / fullyParallel=false の設計理由:
  //   - tests/e2e/fixtures/electron.ts が固定の CDP ポート (19222) で Electron に接続するため、
  //     並列実行すると 2 つ目以降のワーカーがポート衝突で起動失敗する。
  //   - testMock 状態を持つメインプロセスをワーカー毎に立ち上げ直す設計なので、
  //     並列ワーカー間で port を動的に分けることは可能だが、Electron 起動コスト (~3-5 秒) で
  //     見かけ上の高速化メリットが限定的。現状は安定性優先で単一ワーカー固定。
  //   - 将来高速化が必要なら CDP_PORT を per-worker で動的割り当て + ファイル単位の分散へ。
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
