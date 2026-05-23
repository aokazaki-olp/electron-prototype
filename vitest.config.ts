import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@main': path.resolve(__dirname, 'src/main'),
      '@renderer': path.resolve(__dirname, 'src/renderer'),
      '@ipc': path.resolve(__dirname, 'src/ipc'),
      '@libs': path.resolve(__dirname, 'src/libs'),
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
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/libs/**',
        'src/**/*.d.ts',
        'src/renderer/index.tsx',
        'src/preload/**',
        'src/main/index.ts',
      ],
    },
  },
});
