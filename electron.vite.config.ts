import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

// ビルドターゲットの解決。BUILD_TARGET 環境変数で切り替える。
// 既定は 'explorer'（フル版）。Compass ビルドは BUILD_TARGET=compass を指定する。
// renderer の分岐は将来 src/renderer-compass/ を追加した時点で有効になる。
// 現時点（基盤段階）では Compass ビルドも src/renderer/ を使う。
const target = process.env['BUILD_TARGET'] === 'compass' ? 'compass' : 'explorer';
const rendererDir = target === 'compass' ? 'src/renderer' : 'src/renderer';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: resolve('src/main/index.ts'),
        output: {
          format: 'es',
          entryFileNames: '[name].js',
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: resolve('src/preload/index.ts'),
        output: {
          format: 'cjs',
          entryFileNames: '[name].js',
        },
      },
    },
  },
  renderer: {
    root: resolve(rendererDir),
    plugins: [react()],
    build: {
      rollupOptions: {
        input: resolve(`${rendererDir}/index.html`),
      },
    },
  },
});
