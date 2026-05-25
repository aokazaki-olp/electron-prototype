import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

// このアプリは Compass 専用ビルド (apps/compass/)。
// BUILD_TARGET 環境変数は package.json scripts 経由で 'compass' が設定される。
// 現状は最小スケルトン (UI 未実装)。
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
    // Explorer と対称化: UI 実装時に JSX/TSX を扱うため React plugin を先行配置する。
    // 現状はスケルトン HTML のみだが、配置を忘れていると UI 着手と同時にビルドエラーになる。
    plugins: [react()],
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/renderer/index.html'),
      },
    },
  },
});
