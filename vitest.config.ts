import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@main': path.resolve(__dirname, 'packages/main-core/src'),
      '@renderer': path.resolve(__dirname, 'apps/explorer/src/renderer'),
      '@tests': path.resolve(__dirname, 'tests'),
    },
  },
  test: {
    globals: true,
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
    // 環境戦略: vitest のデフォルト ('node') を main プロセス用テストに採用し、renderer 用のテストは
    // ファイル先頭の `// @vitest-environment happy-dom` プラグマで明示的に happy-dom を指定する。
    // (vitest v4 で environmentMatchGlobs が deprecate されたため、プラグマ方式に統一)
    setupFiles: ['tests/setup/vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['apps/*/src/**/*.{ts,tsx}', 'packages/*/src/**/*.{ts,tsx}'],
      exclude: [
        'packages/libs/**',
        '**/*.d.ts',
        'apps/*/src/renderer/main.tsx',
        'apps/*/src/preload/**',
        'apps/*/src/main/index.ts',
      ],
    },
  },
});
