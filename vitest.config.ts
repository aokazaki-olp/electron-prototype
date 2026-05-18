import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // テストは main プロセス向け（Node.js 環境）のみ。
    // renderer テストを追加する場合は environment: 'jsdom' で別プロジェクトを切る。
    environment: 'node',
    include: ['src/main/**/*.test.ts'],
    globals: false,
  },
});
