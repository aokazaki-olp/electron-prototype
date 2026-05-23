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
    environmentMatchGlobs: [
      ['tests/unit/renderer/**', 'happy-dom'],
      ['tests/unit/main/**', 'node'],
    ],
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
