# Agent Directives

- すべてのユーザー向け出力を日本語で書くこと。
- Always respond in Japanese（日本語）.

## Electron 起動時の必須事項

Claude Code は VSCode 拡張内で動作するため、シェルに `ELECTRON_RUN_AS_NODE=1` が継承されている。これが設定されたまま `electron .` を実行すると、Electron バイナリが Node.js として起動し、`import { app } from 'electron'` が `undefined` を返す（`process.type` も `undefined` になる）。

**Electron を起動するコマンドは必ず `env -u ELECTRON_RUN_AS_NODE` でラップすること**：

```bash
env -u ELECTRON_RUN_AS_NODE bash -c '"node_modules/electron/dist/electron.exe" .'
env -u ELECTRON_RUN_AS_NODE npm run dev
env -u ELECTRON_RUN_AS_NODE npm run test:e2e
```

`npm run build` 等の Electron バイナリを直接起動しないコマンドは影響を受けないが、起動・テスト系は常に env クリアを徹底する。

## コーディング規約

@CODING_RULES.md
