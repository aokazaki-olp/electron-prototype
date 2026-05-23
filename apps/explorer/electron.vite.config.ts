import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

// このアプリは Explorer 専用ビルド (apps/explorer/)。
// BUILD_TARGET 環境変数は package.json scripts 経由で 'explorer' が設定される
// (packages/main-core/buildInfo.ts が参照する)。
const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['@app/main-core', '@app/ipc-contract', '@app/libs'] })],
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/main/index.ts'),
        output: {
          format: 'es',
          entryFileNames: '[name].js',
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ['@app/main-core', '@app/ipc-contract', '@app/libs'] })],
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/preload/index.ts'),
        output: {
          format: 'cjs',
          entryFileNames: '[name].js',
        },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react()],
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/renderer/index.html'),
      },
    },
  },
});
