---
title: Phase 4 後 リポジトリ徹底レビュー（設計 + コード）
date: 2026-05-24
branch: claude/review-repo-structure-ZIazz
base_commit: 2488cbe
scope: 設計 / main / renderer / テスト / ビルド
tags:
  - review
  - architecture
  - electron
  - typescript
---

# Phase 4 後 リポジトリ徹底レビュー

直近の Phase 1〜4 モノリポ化（`packages/libs`, `packages/ipc-contract`, `packages/main-core`, `apps/explorer`, `apps/compass`）完了時点と、未コミット 13 ファイルの差分に対する徹底レビュー。

並列 3 エージェントで「設計」「main 側コード」「renderer 側コード」を分担し、結果を統合した。

---

## 総評

- Phase 1〜4 の **モノリポ分割の骨格**は健全。`apps/*` と `packages/*` の責務分離、`@app/*` バレル設計は機能している。
- **CODING_RULES §7（プロセス境界）の主要事項**（`sandbox: true` / `contextIsolation: true` / `nodeIntegration: false` / preload 経由 API 公開 / トークン main 限定保持 / CSP）は両アプリで死守されている。
- **IPC contract の型集約**（`IPC` as const + `SalesforceExplorerApi`）の方向性は綺麗。
- **直近未コミット 13 ファイル**はすべて `as` 排除・`unknown` + 型ガード化・`async/await` 統一・`!` 除去の方向で CODING_RULES §4 / §5 に寄せた良改善。取り下げ推奨はゼロ。

一方で、CODING_RULES §10（マルチビルド規律）・§11（セキュリティ多層防御）と現実装の **乖離**が複数残っており、マージ前に詰めるべき。

重大度別件数：**Critical 1 / Major 9 / Minor 30 程度 / Nit 多数**

---

## Critical / Major（緊急度高）

### C1. `tests/mocks/sfx.ts` に `rendererLog` 欠落 — Critical

**所在**: `tests/mocks/sfx.ts:8-41`

`SalesforceExplorerApi`（contract.ts:185）には `rendererLog(level, text): void` が定義されているが、`makeMockSfx()` の戻り値に存在しない。TypeScript が現状通っているのは、どこかで `as` キャストが効いている疑い（あるいは未使用）。将来 renderer コンポーネントのユニットテストを追加した瞬間に壊れる。

**修正**: `rendererLog: vi.fn(),` を 1 行追加。

---

### C2. `handle()` の catch で main 側ログが残らない — Major

**所在**: `apps/explorer/src/main/index.ts:164-175`

`try/catch` で `throw serializeError(e)` するだけで `log.error` を呼んでいない。renderer には `message` のみ届き、main の `app.log` にも残らない → 本番障害の解析手段が消える。

**修正**:
```ts
const handle = <T>(channel: string, fn: (...args: unknown[]) => Promise<T>): void => {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      return await fn(...args);
    } catch (e) {
      log.error(`[IPC] ${channel} 失敗`, e);  // ← 1 行追加
      throw serializeError(e);
    }
  });
};
```

---

### C3. `shell.openExternal` の scheme 無検証 — Major

**所在**: `apps/explorer/src/main/index.ts:136`

```ts
mainWindow.webContents.setWindowOpenHandler(({ url }) => {
  shell.openExternal(url);  // ← 無検証
  return { action: 'deny' };
});
```

`javascript:` / `vbscript:` / `file:` が来ると OS デフォルトハンドラに直渡し。CSP は `window.open` を制限しない。Electron docs も「`openExternal` 前に scheme allowlist せよ」と推奨。

**修正**:
```ts
mainWindow.webContents.setWindowOpenHandler(({ url }) => {
  try {
    const u = new URL(url);
    if (u.protocol === 'http:' || u.protocol === 'https:') {
      void shell.openExternal(url);
    }
  } catch { /* 不正 URL 無視 */ }
  return { action: 'deny' };
});

// 併せて多層防御
app.on('web-contents-created', (_e, contents) => {
  contents.on('will-navigate', (e) => e.preventDefault());
});
```

---

### C4. `appId` / `urlScheme` / `productName` の二重定義 — Major

**所在**: `packages/main-core/src/buildInfo.ts:24-38` と `apps/{explorer,compass}/electron-builder.yml`

同じ識別子（`com.example.salesforce-explorer`, `Salesforce Explorer`, `salesforce-explorer`）がコードと YAML の 2 箇所に書かれている。CODING_RULES §10.1「ここを変更するだけで appId / URL スキーム / electron-store name / productName を切り替えられる」に違反。`OAUTH_CALLBACK_URL` が Connected App と silent にズレると OAuth が壊れる。

**修正方針（いずれか）**:
- `buildInfo.ts` を真として `scripts/gen-builder-yml.ts` を `prebuild` に挟む（最小実装）
- YAML を真として、`electron-vite` の `define` 機能でビルド時に `import.meta.env.BUILD_APP_ID` を埋め込み、`buildInfo.ts` を compile-time constant に変える

---

### C5. `tsconfig.node.json` が Explorer/Compass 混在 — Major

**所在**: `tsconfig.node.json:19-29`

```json
"include": [
  "apps/explorer/src/main/**/*.ts",
  "apps/explorer/src/preload/**/*.ts",
  "apps/compass/src/main/**/*.ts",
  "apps/compass/src/preload/**/*.ts",
  ...
]
```

CODING_RULES §10.4 / §10.5 が前提とする「ビルドごとに到達可能ファイルを物理分離」が成立しない。Compass の preload から Explorer の symbol を import しても typecheck で検知できず、§10.4 の「書き込み系 IPC を Compass で登録しない」を compile-time で保証する経路が消える。

**修正**:
- `tsconfig.node.explorer.json` / `tsconfig.node.compass.json` に分割、それぞれ片方の main/preload のみ include
- ルート `tsconfig.node.json` は `files: []` + `references: [...]` で束ねる役に
- 併せて `apps/*/tsconfig.json` を作って各アプリ独立 typecheck できるようにする

---

### C6. §11.3 起動時 API 公開面 assertion 未実装 / §11.4 Compass 境界 e2e 不在 — Major

**所在**: 
- `apps/{explorer,compass}/src/preload/index.ts`（assertion 無し）
- `tests/e2e/specs/`（Compass spec 無し）

§11.3 が要求する「ビルドターゲット別の期待 API キーセット vs 実 `exposeInMainWorld` の照合」が無い → Explorer preload を Compass バイナリに同梱する事故を起動時に検出できない。§11.4 は「CI 必須」と明記されているが、Compass 用 spec が存在せず `window.sfx.createRecord === undefined` の境界 assertion も無い。

**修正**: 
1. preload に 30 行程度の assertion を追加
   ```ts
   const EXPECTED_KEYS: Record<BuildTarget, ReadonlySet<string>> = {
     explorer: new Set([... 全API名 ...]),
     compass:  new Set([... LiteApi のみ ...]),
   };
   // 起動時に actualKeys と差分があれば throw
   ```
2. `tests/e2e/fixtures/electron.ts` に `useCompassBuild` フラグ追加、`apps/compass/out/main/index.js` を spawn できるようにする
3. `tests/e2e/specs/compass-boundary.spec.ts` 新設、書き込み系 API が undefined であることを assert

---

### C7. renderer で `localStorage` を使用 — Major

**所在**: `apps/explorer/src/renderer/components/SoqlEditor.tsx:53-86`

SOQL タブ状態を `localStorage.setItem` で保存。CODING_RULES §7.3「renderer / preload に置かない。`localStorage` / `sessionStorage` も使わない」に **規約として明確に違反**。SOQL クエリ文はテナント情報を含み得る業務文字列で機密度ゼロとは言えない。

**修正方針（いずれか）**:
- IPC 経由で main プロセスに移し、`electron-store` の同一/別ストアに書く
- もしくは規約 §7.3 に「renderer の UI 状態（SOQL/タブ/フィルタ等の非秘匿）は localStorage 利用を許容」例外条項を明記し、コメントで根拠を残す

---

### C8. `SettingsPage` が引数なし `useAppStore()` で全 store 購読 — Major

**所在**: `apps/explorer/src/renderer/pages/SettingsPage.tsx:25`

```ts
const { profiles, setProfiles, settings, setSettings, setActiveProfileId, setAuthState } = useAppStore();
```

引数なし呼びは store 全体を返すので、**store の任意フィールドが変わるたびに SettingsPage 全体が再レンダリング**する。ログがストリーミングで頻繁に更新されるため、設定モーダルが開いている間は毎ログで再レンダリングが走る → もっさり体感の主犯。

**修正**:
```ts
import { useShallow } from 'zustand/react/shallow';

const { profiles, setProfiles, settings, setSettings, setActiveProfileId, setAuthState } = useAppStore(
  useShallow(s => ({
    profiles: s.profiles,
    setProfiles: s.setProfiles,
    settings: s.settings,
    setSettings: s.setSettings,
    setActiveProfileId: s.setActiveProfileId,
    setAuthState: s.setAuthState,
  })),
);
```

---

### C9. `LogViewer` の `key={i}` — Major

**所在**: `apps/explorer/src/renderer/components/LogViewer.tsx:86-96`

```tsx
{filtered.map((entry, i) => (
  <div key={i} ...>...</div>
))}
```

フィルタ条件が変わると同じ index に異なる entry が割り当てられ、React の reconciliation が壊れる。`autoScroll` 時のスクロール位置・選択状態が失われる。

**修正**: `LogEntry` に一意 `id` を持たせるのが理想。最低でも `entry.date + i` の複合キー、あるいは `entry.date + entry.text` のハッシュ。

---

### C10. IPC `handle` での `as` キャスト常用 — Major

**所在**: `apps/explorer/src/main/index.ts:181-186, 220, 312, 326, 332` 他

```ts
handle(IPC.SAVE_SETTINGS, async (settings) => {
  saveSettings(settings as Parameters<typeof saveSettings>[0]);  // 多用
});
```

「契約レベルで保証される」コメント付きで多用。一方 `apps/explorer/src/preload/index.ts:10,62` は `const api: SalesforceExplorerApi = ...` で **`satisfies` ではなく型注釈**であり、コメントの根拠と実装がズレている。

IPC は CODING_RULES §4.3 が「外部入力は `unknown` + 型ガード」と規定する典型例。preload 信頼前提でも、多層防御として 1 段挟むべき。

**修正**:
- `packages/ipc-contract` に `assertProfile`, `assertSettings` 等の型ガード関数を切り出す
- main 側 `handle` の冒頭で 1 行 `assertX(arg)` を通す
- 併せて preload を `... satisfies SalesforceExplorerApi` に書き換えてコメント根拠と一致させる

---

## Minor（積み残し可、要 backlog 化）

### 設計 / ビルド

| 所在 | 内容 |
|---|---|
| `packages/libs/SOURCE.md` 不在 | CODING_RULES §9 違反。コピー元 commit hash の追跡が消滅 |
| `tsbuildinfo` を git 管理中 | git log に「ビルドキャッシュ更新」chore が多発。`.gitignore` に `*.tsbuildinfo` 追加 + `git rm --cached` |
| `packages/main-core/package.json` / `packages/ipc-contract/package.json` の `dependencies` 一切宣言なし | `electron-builder` の依存解決を運に頼っている |
| `packages/ipc-contract/src/contract.ts:188-192` の `declare global { Window { sfx: SalesforceExplorerApi } }` | Compass renderer でも型上 `window.sfx.query` が通ってしまう。各アプリの `global.d.ts` に分離、`LiteApi` 型を切る |
| `apps/explorer/src/preload/index.ts:10,62` | `const api: SalesforceExplorerApi = ...` を `... satisfies SalesforceExplorerApi` に |
| `apps/compass/package.json:17` の `@app/libs` 依存 | 未使用、Compass からは外す |
| ルート `package.json` の `dependencies` | main 専用ライブラリ（`got`/`exceljs`/`csv-stringify`/`electron-log`/`electron-store`）は `packages/main-core` に下げる、renderer 専用は `apps/explorer` に下げる |
| `tsconfig.test.json` の `paths` と `include` | 現構造と齟齬。`@main/*` エイリアスは未使用 |

### main

| 所在 | 内容 |
|---|---|
| `packages/main-core/src/logger.ts:15-17` | `LOG_LEVELS` に `silly`/`verbose` があるが `contract.LogLevel` Union に無い → 型ガード `isLogLevel` が嘘をつく。`as const satisfies readonly LogLevel[]` で揃える |
| `apps/explorer/src/main/index.ts:399-406` | `setAsDefaultProtocolClient(scheme, execPath, [resolve(process.argv[1] ?? '')])` は本番 portable ビルドで CWD をスキームターゲットに登録する事故余地。`process.defaultApp` で開発/本番分岐 |
| `packages/main-core/src/sfOAuth.ts:113-167` | `startOAuth` の `shell.openExternal` 例外時に `pendingCallback` が 90 秒 leak。try/catch + cleanup |
| `packages/main-core/src/settings.ts` | `safeStorage.isEncryptionAvailable() === false` のとき warn ログが無い（Linux libsecret 不在環境のサイレント失敗） |
| `packages/main-core/src/logger.ts:12-13` | `MASK_PATTERN` の `code` が広すぎる（`error_code: 12345` も全マスク）/ `session_id` 系が未マスク |
| `packages/main-core/src/sfApi.ts:85` と `apps/explorer/src/main/index.ts:188` | `currentProfileId` と `activeProfileId` が二重管理 → main-core に集約 |
| `packages/main-core/src/export.ts:55-120` | 全件メモリ展開。100 万件 SOQL では落ちる。バッチ companion 用途を考えるとストリーミング書き出しは中期的に必須 |
| `apps/explorer/src/renderer/index.html:6` | CSP に `img-src` / `font-src` / `connect-src` / `object-src` / `base-uri` / `frame-ancestors` を追加して `default-src 'none'` ベースに |
| `apps/explorer/src/main/index.ts:85-88` | `if (!app.requestSingleInstanceLock()) { app.quit(); }` の後に処理続行余地。`app.exit(0)` に変えて確実に抜ける |
| `apps/explorer/src/main/index.ts:411-421` の hook 二重登録 | `initLogger` 側の hook と `whenReady` 後の hook で同じメッセージが 2 回処理される。`initLogger(broadcaster)` で集約 |
| `apps/explorer/src/main/index.ts:351-352` | `dialog.showSaveDialog({ defaultPath: \`${String(defaultName)}.soql\` })` で path 区切り文字未サニタイズ |
| `apps/explorer/src/main/index.ts:381-388` の `IPC.RENDERER_LOG` | if/else if/else 分岐。CODING_RULES §5.1 に従い switch + default |

### renderer

| 所在 | 内容 |
|---|---|
| 全コンポーネントの `useEffect` 依存配列 | Zustand setter が未指定（react-hooks/exhaustive-deps 違反、現状無害だが明示化） |
| `apps/explorer/src/renderer/components/SObjectBrowser.tsx:77-80` | フィルタを `useMemo` 化、`search.toLowerCase()` を 1 回に |
| `apps/explorer/src/renderer/components/ResultTable.tsx:50-126` | `getColumns(result.records)` が 4 箇所で再計算。`useMemo` 1 回に集約 |
| `apps/explorer/src/renderer/components/LogViewer.tsx:85-96` | 1000 件全描画。`@tanstack/react-virtual` で仮想化 |
| モーダル（`App.tsx:72-83` Settings、`ResultTable.tsx:215-260` CSV エクスポート） | `role="dialog"` / `aria-modal` / Esc 閉じ / フォーカストラップが無い |
| エクスポート系・ファイル系 catch | `console.error` のみで失敗がユーザーに伝わらない。toast or `setError` |
| `apps/explorer/src/renderer/components/SoqlEditor.tsx:153-162` | IME composition 中 Enter で SOQL 暴発の余地。`isComposing` ガード追加 |
| `apps/explorer/src/renderer/pages/MainPage.tsx:98` | `as { key: BottomTab; label: string }[]` キャストは型注釈で代替可能 |
| 全コンポーネント | `(): JSX.Element` は React 19 で `React.JSX.Element` or `ReactElement` への移行が必要 |
| `apps/explorer/src/renderer/pages/MainPage.tsx:37-41` | `handleDisconnect` で `disconnect()` 例外時に `onDisconnect()` が呼ばれず UI が固まる。try/finally |
| `apps/explorer/src/renderer/pages/SettingsPage.tsx:90-95` | `saveAppSettings` の race（連打で順序保証なし） |
| `apps/explorer/src/renderer/pages/SettingsPage.tsx:73-88` | `handleConnect` で store 更新 + `onConnect` 経由の再更新の二重伝播 |
| `apps/explorer/src/renderer/components/LogViewer.tsx:30-34` | `scrollIntoView({ behavior: 'smooth' })` が大量ログでカクつく。`'auto'` か rAF debounce |
| `tests/unit/renderer/store.test.ts` | `setSoql` の同値スキップ最適化・`setSoqlAndRun` の `runTrigger` 増分・`closeTab` の末尾削除復元のテストなし |

---

## 未コミット 13 ファイルの評価

| ファイル | 評価 | 主な変更 |
|---|---|---|
| `apps/compass/src/main/index.ts` | 妥当 | `whenReady().then(...)` → `void (async () => {...})()` でスタイル統一 |
| `apps/explorer/src/main/index.ts` | 妥当 | async/await 化 + `toLogLevel` 採用 + payload narrowing 強化 + 詳細コメント |
| `packages/main-core/src/buildInfo.ts` | 妥当 | `as const satisfies BuildInfo` で §3.2 / §4 に合致 |
| `packages/main-core/src/export.ts` | 妥当 | `forEach` → `for...of` 置換、TSDoc 追加、未使用 import 削除 |
| `packages/main-core/src/index.ts` | 妥当 | `toLogLevel` の export 追加 |
| `packages/main-core/src/logger.ts` | 妥当 | `toLogLevel` 導入で `as LogEntry['level']` を排除 |
| `packages/main-core/src/settings.ts` | 妥当 | TSDoc 追加（`@param name - description` ダッシュ必須形式に準拠） |
| `packages/main-core/src/sfApi.ts` | 妥当（模範） | `isPlainObject` 共通化、`as { id: string }` を unknown narrowing へ |
| `packages/main-core/src/sfOAuth.ts` | 妥当 | `parsed as TokenResponse` を型ガード化、TSDoc |
| `apps/explorer/src/renderer/components/LogViewer.tsx` | 妥当 | `as LogLevel[]` を `as const satisfies readonly LogLevel[]` へ |
| `apps/explorer/src/renderer/components/ResultTable.tsx` | 妥当 | `virtualItems.at(-1)!` の `!` を `lastItem != null` ガードへ |
| `apps/explorer/src/renderer/components/SoqlEditor.tsx` | 妥当 | localStorage 復元を `unknown` + 型ガード化 |
| `apps/explorer/src/renderer/pages/SettingsPage.tsx` | 妥当 | `then` チェーンを `async/await` + `Promise.all` 化、`as` を `toMode()` ガードへ |

**総じて全 13 ファイルが CODING_RULES §4 / §5 への準拠を高める方向の改善。取り下げ推奨はゼロ。**

---

## 強み（このまま継続）

1. Phase 1〜4 のモノリポ分割の骨格。`apps/*` と `packages/*` の役割分離、`@app/*` バレル設計は機能している。
2. §7 プロセス境界の主要事項（sandbox / contextIsolation / nodeIntegration / preload 経由 API / トークンの main 限定保持 / CSP）両アプリで死守。
3. IPC contract の型集約（`IPC` as const + `SalesforceExplorerApi` interface）。
4. 直近の安全側修正（`buildInfo.ts` の `as const satisfies`、`sfApi.ts` の `isPlainObject` 共通化、testMock 一次ソース化、`toLogLevel` の Union 絞り込み）が CODING_RULES §4 に寄せた模範実装。
5. エラーシリアライズ + マスク（`logger.ts` の `maskSensitive` + `serializeError`）が §11.5 の土台。
6. Phase 4 後追い fix（345ac39）「ビルド成果物の workspace package を bundle に取り込む」の対処が適切。
7. コミット 2488cbe「testMock を一次ソースに」は健全。E2E が OS の `electron-store` を汚染する事故を構造的に防ぐ。
8. `SObjectBrowser` の virtualization、CodeMirror の `runQueryRef` + `lastRunTriggerRef` 二段防御など、Zustand v5 フリーズ修正（96682b0）が適切に反映されている。

---

## マージ前にやるべき Top 7

順序は「工数 ÷ リスク削減効果」。

| # | 内容 | 工数 | 効果 |
|---|---|---|---|
| 1 | `tests/mocks/sfx.ts` に `rendererLog: vi.fn()` 追加（C1） | 5 秒 | 契約整合性回復 |
| 2 | `handle()` の catch に `log.error` 1 行追加（C2） | 5 秒 | 障害解析の救命綱 |
| 3 | `shell.openExternal` を `http(s):` allowlist で囲む + `will-navigate` 防御（C3） | 10 行 | XSS → RCE 経路の塞ぎ |
| 4 | `LogViewer` の `key={i}` を一意キーに変更（C9） | 1 行 + contract 微修正 | ログ表示の reconciliation 修復 |
| 5 | `SettingsPage` の `useAppStore()` を `useShallow` 化（C8） | 5 行 | UI のもっさり感解消 |
| 6 | `logger.ts` の `LOG_LEVELS` を `LogLevel` Union と整合（Minor） | 3 行 | 型契約の握り直し |
| 7 | `.gitignore` に `*.tsbuildinfo` + `git rm --cached`（Minor） | 5 分 | 今後の git log の汚染停止 |

**C4 〜 C7** は規約と実装の整理を伴うため、別 PR で「規約と実装の乖離整理」としてまとめて消化するのが効率的：
- C4 `appId` 二重定義 → 単一ソース化
- C5 tsconfig 分割
- C6 §11.3 起動時 assertion + §11.4 Compass 境界 e2e
- C7 renderer `localStorage` → IPC 経由 main 永続化、または規約 §7.3 例外条項追記

---

## レビューメタ情報

- レビュー手法: 3 並列エージェント（設計 / main / renderer）→ 統合
- 対象範囲: 
  - `apps/explorer/**`, `apps/compass/**`
  - `packages/main-core/**`, `packages/ipc-contract/**`, `packages/libs/**`
  - `tests/**`, ルート設定（`tsconfig*.json`, `package.json`, `electron-vite`, `electron-builder.yml`, `playwright.config.ts`, `vitest.config.ts`）
- 未コミット差分: `git diff` で内容を確認した上で個別評価
- 関連 CODING_RULES 節: §4（型）、§5（構文）、§6（エラー）、§7（プロセス境界）、§9（libs）、§10（マルチビルド）、§11（セキュリティ）
