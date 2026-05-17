# コーディング規約 (CODING_RULES.md) — Electron / TypeScript

> このドキュメントは Electron プロトタイプアプリのコーディング規則を定義します。
> ベースは TypeScript ライブラリ向け規約（旧 `libraries/nodejs/CODING_RULES.md`）から、ライブラリ・プラグイン設計の節（§7 / §8）を外し、Electron プロセス境界の規律を加えたものです。

---

## 1. 基本思想 (Philosophy)

ハイブリッドな二本柱で書きます。

1. **Javaライクな堅牢性**: 明示的なブロック、厳密なエラーハンドリング、役割の分離（モジュール・プロセス境界・型による契約）。型システムは Java のインターフェース・ジェネリクス的な発想で使い、コンパイラをペアプログラマーとして扱う。
2. **TS/ES 文化の積極活用**: 型推論・Utility Types・async/await・ESM など、TypeScript/ES のイディオムを積極的に採用し、冗長な記述を避ける。

**重要**: TypeScript の型はコンパイル時のみ有効。外部入力（APIレスポンス・設定値・IPC payload 等）は**型があってもランタイムガードを残す**。

この二本柱は具体的には次の節で展開される：

- 明示的なブロック → §5.1（ブロックスタイル必須）
- 厳密なエラーハンドリング → §6（TypeError / Error / カスタムエラー）
- 役割の分離（モジュール）→ §2（ES Modules）
- 役割の分離（プロセス境界）→ §7（main / preload / renderer）
- 型による契約 → §4（`any` 禁止・公開関数の戻り値型明示・`unknown` + 型ガード）

迷った場合は「**可読性**」と「**実行時の堅牢性**」を優先する。

---

## 2. モジュール構造とファイル構成

### 2.1 モジュールパターン

ES Modules の `export` を使う。

```typescript
// ✅ ES Modules
export const HttpCore = {
  createTransport,
  withRetry,
  withLogger,
};

// ❌ IIFE（Node.js/TSでは不要）
const HttpCore = (() => { ... })();
```

### 2.2 ESM インポート規則

#### `.js` 拡張子を明記する

TypeScript + ESM では、`.ts` ファイルのインポートにも `.js` 拡張子を書く。TypeScript はコンパイル時にパスを書き換えないため、実行時パスに合わせる必要がある。

```typescript
// ✅ .js 拡張子を明記
import { HttpCore } from './HttpCore.js';
import type { Transport } from './httpTypes.js';

// ❌ 拡張子なし（Node.js ESM では解決できない）
import { HttpCore } from './HttpCore';
```

#### 型のみのインポートは `import type` を使う

値を伴わない型・インターフェースのインポートは `import type` を使う。循環参照の回避、バンドル時のツリーシェイキング改善、意図の明確化につながる。

```typescript
// ✅ 型のみ → import type
import type { Logger } from './LoggerFacade.js';
import type { Transport, FetchOptions, RawResponse } from './httpTypes.js';

// ✅ 値を伴う → 通常の import
import { HttpCore } from './HttpCore.js';
import { HttpError, RetryExhaustedError } from './httpTypes.js';

// ❌ 型のみなのに通常 import
import { Logger } from './LoggerFacade.js';
```

### 2.3 ファイルヘッダー

`'use strict'` は ESM では不要のため記載しない。ヘッダーはシンプルに。

```typescript
/**
 * HttpCore.ts
 * @description HTTP通信の共通基盤（Transport・デコレータ・ユーティリティ）
 */
```

---

## 3. 命名規則 (Naming Conventions)

### 3.1 変数・定数命名

| スコープ / 役割 | 命名規則 | 詳細・例 |
|---|---|---|
| **「真の定数」** | `UPPER_SNAKE_CASE` | `const MAX_RETRY_COUNT = 5;` |
| **「設定値オブジェクト」** | `UPPER_SNAKE_CASE` + `as const` | `const HTTP_STATUS = { OK: 200 } as const;`（`Object.freeze` の代わり） |
| **「名前空間・モジュールオブジェクト」** | `PascalCase` | `HttpCore`, `GBizInfoService` |
| **「再代入不可な変数」** | `camelCase` | `const currentUser = auth.getUser();` |
| **型・インターフェース** | `PascalCase` | `interface Transport`, `type HttpMethod` |
| **型パラメータ（ジェネリクス）** | `T`, `TResult`, `TOptions` 等 | 単純な場合は `T`、意味が必要な場合は `TXxx` |
| 短いスコープ（1〜3行） | **1文字変数 (推奨)** | `k`, `v`, `e`, `n` |
| 通常スコープ | **省略禁止** | `options` (not `opts`) |

```typescript
// 名前空間オブジェクト → PascalCase
export const HttpCore = { createTransport, withRetry, withLogger };

// 設定値オブジェクト → UPPER_SNAKE_CASE + as const
const HTTP_STATUS = { OK: 200, TOO_MANY_REQUESTS: 429 } as const;
```

### 3.2 `as const` vs `Object.freeze`

`as const` を優先する（コンパイル時の型情報が得られるため）。

```typescript
// ✅ as const（TypeScriptイディオム）
const CONFIG = {
  DEFAULT_MAX_RETRIES: 3,
  DEFAULT_BASE_DELAY_MS: 500,
} as const;
```

---

## 4. 型システムの規則

### 4.1 必須事項

| 対象 | ルール | 詳細 |
|---|---|---|
| **`tsconfig`** | **`"strict": true` 必須** | 全ての厳格チェックを有効にする。これなしの TypeScript は型チェックが緩く意味が薄い。 |
| **`any`** | **使用禁止** | 外部データは `unknown` で受け、型ガードで絞る。やむを得ない場合は `// eslint-disable-next-line @typescript-eslint/no-explicit-any` とコメントで意図を明示。 |
| **`as`（型キャスト）** | **原則禁止** | fail-fast バリデーションで弾いていれば `as` は不要なはず。使う場合はコメントで理由を明示。 |
| **`!`（非nullアサーション）** | **原則禁止** | `?.` や事前チェックで対処する。 |
| **公開関数の戻り値型** | **明示必須** | `export` する関数・メソッドは戻り値型を必ず書く。内部実装は推論に任せてよい。 |

### 4.2 `interface` vs `type` の使い分け

| 用途 | 使うもの | 理由 |
|---|---|---|
| **公開APIの契約** | `interface` | Java のインターフェース的な発想。拡張・実装を想定。 |
| **Union 型** | `type` | `type HttpMethod = 'GET' \| 'POST' \| ...` |
| **Utility Types の組み合わせ** | `type` | `type Options = Partial<Config> & { logger?: Logger }` |
| **関数型** | `type` | `type Filter = (v: unknown) => unknown` |

```typescript
// 公開契約 → interface
export interface Transport {
  fetch(url: string, options: FetchOptions): Promise<RawResponse>;
}

// Union・内部表現 → type
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
```

### 4.3 外部データの扱い

APIレスポンス・JSON.parse・IPC payload 等の外部データは `unknown` で受け、型ガードで絞る。

```typescript
// ✅ unknown + 型ガード
const body: unknown = JSON.parse(text);
if (typeof body === 'object' && body !== null && 'access_token' in body) {
  // ここでは body.access_token にアクセス可能
}

// ❌ any（型チェックを完全に無効化）
const body: any = JSON.parse(text);
```

### 4.4 `enum` の禁止

TypeScript の `enum` は使用しない。`as const` で継続する。

```typescript
// ✅ as const + Union型
const HTTP_STATUS = {
  OK: 200,
  TOO_MANY_REQUESTS: 429,
} as const;
type HttpStatus = typeof HTTP_STATUS[keyof typeof HTTP_STATUS];

// ❌ enum（ランタイム挙動が紛らわしい）
enum HttpStatus { OK = 200 }
```

---

## 5. 構文・スタイル規則

### 5.1 必須事項

| 対象 | ルール |
|---|---|
| **ブロックスタイル** | 必須 `{ ... }` + 改行（アロー関数の単一式は除く） |
| `forEach` | **使用禁止**。`for...of` を使う（`await` が使えるため特に重要） |
| `var` | **使用禁止** |
| **`switch` の `default`** | **必須** |
| **`switch` の `break`/`return`** | **必須** |
| **Yoda 条件** | **使用禁止**（`null === x` 等は禁止） |

### 5.2 async/await 規則

| 対象 | ルール | 詳細 |
|---|---|---|
| **非同期関数** | `async/await` に統一 | `Promise.then()` チェーンは使わない |
| **`Promise` の直接 `return`** | `await` 不要な場合は省略可 | `return transport.fetch(...)` で十分な場合に `await` を足さない |
| **並列実行** | `Promise.all` を使う | 独立した非同期処理は逐次にしない |
| **エラーハンドリング** | `try/catch` で明示的に | Promise を握りつぶさない |

```typescript
// ✅ async/await
const call = async (request: RequestOptions): Promise<unknown> => {
  const response = await transport.fetch(url, options);
  return responseHandler(response);
};

// ✅ 並列実行
const [users, channels] = await Promise.all([
  fetchUsers(client),
  fetchChannels(client),
]);

// ❌ .then() チェーン
transport.fetch(url, options).then(response => { ... });
```

### 5.3 推奨事項

| 対象 | アクション |
|---|---|
| **`== null`** | null/undefined 一括チェックに積極活用 |
| **Null 合体演算子 `??`** | 推奨 |
| **オプショナルチェーン `?.`** | 推奨 |
| **分割代入** | 推奨 |
| **デフォルト引数** | 推奨 |
| **スプレッド構文** | 推奨 |
| **アロー関数** | 積極活用 |
| **一時変数の排除** | 推奨 |

---

## 6. エラー戦略と TSDoc

### 6.1 公開関数の TSDoc 必須項目

型情報は TypeScript の型定義で表現するため、`@param` の型注釈は不要。以下を記述する。

- `@param name - description` — 引数の**意味・制約**（**ダッシュ ` - ` 必須**、型注釈は不要）
- `@returns` — 戻り値の意味
- `@throws` — 例外を送出する場合
- 設計上の制限事項（該当する場合）

```typescript
// ✅ ダッシュあり・型注釈なし
@param instanceUrl - 組織固有の My Domain URL (例: https://yourorg.my.salesforce.com)

// ❌ ダッシュなし
@param instanceUrl 組織固有の My Domain URL

// ❌ 型注釈あり（TypeScript では型は型定義側に書く）
@param {string} instanceUrl - 組織固有の My Domain URL
```

```typescript
/**
 * gBizINFO API クライアントを作成する
 *
 * @param token - gBizINFO API トークン
 * @param options - オプション設定
 * @returns クライアント
 * @throws {TypeError} token が空文字または string 以外の場合
 */
export const create = (
  token: string,
  options: GBizInfoClientOptions = {},
): BaseClient => { ... };
```

### 6.2 エラーの投げ分け

#### [A] 型バリデーションエラー (`TypeError`)
関数冒頭の fail-fast バリデーション用。**型があってもランタイムガードは省略しない**。

```typescript
if (!instanceUrl) {
  throw new TypeError('instanceUrl には空でない string を指定してください');
}
```

#### [B] ドメインエラー (`Error`)
API通信の失敗・期待するリソースが見つからない等、業務ロジック上のエラー用。

```typescript
throw new Error('gBizINFO レスポンスに hojin-infos が含まれません');
```

#### [C] カスタムエラークラス
HTTP エラー等、エラーに追加情報を持たせたい場合。`name` はクラスフィールド（`override readonly`）で宣言する。

```typescript
class HttpError extends Error {
  override readonly name = 'HttpError';

  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
  }
}
```

---

## 7. Electron プロセス境界の規律

Electron は **main / preload / renderer の3プロセス** で動く。プロトタイプであっても、この境界は最初から守ること。後から直すコストが大きい。

### 7.1 プロセス別の責任

| プロセス | 責任 | 触ってよいもの |
|---|---|---|
| **main** | Node.js API・ファイルI/O・外部HTTP・APIトークン保持 | `fs`, `net`, ライブラリ層 (`src/libs/`) |
| **preload** | main ↔ renderer の橋渡し | `contextBridge`, `ipcRenderer.invoke` |
| **renderer** | UI（DOM / React 等）のみ | DOM・UI フレームワーク・preload が露出した API |

### 7.2 必須セキュリティ設定

`BrowserWindow` 生成時に以下を**死守**する。プロトタイプでも例外なし。

```typescript
new BrowserWindow({
  webPreferences: {
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,             // 可能ならtrue
    preload: path.join(__dirname, 'preload.js'),
  },
});
```

理由: renderer に Node.js API を直接見せると、UIで読み込んだ任意のリソース（将来 npm パッケージ・SVG埋め込み画像等を含む）からファイルシステム・ネットワークに到達できてしまう。

### 7.3 APIトークン・秘匿情報の置き場所

- **renderer / preload に置かない**。`localStorage` / `sessionStorage` も使わない
- main プロセス内のメモリ、または OS の安全ストレージ（`safeStorage` API）を使う
- renderer からは「**操作を依頼する**」だけで、トークン値そのものを取得する経路を作らない

```typescript
// ✅ 操作を依頼する
const result = await window.gbiz.searchByCorporateNumber('1234567890123');

// ❌ トークンを renderer に渡す
const token = await window.gbiz.getToken();  // 作らない
```

### 7.4 IPC は型付きで contract 化する

`ipcMain.handle` の引数・戻り値の型を1ヶ所にまとめ、main / preload / renderer 三者で共有する。

```typescript
// src/ipc/contract.ts — 三者で共有
export interface GBizApi {
  searchByCorporateNumber(num: string): Promise<HojinInfo>;
  searchByName(name: string, limit?: number): Promise<HojinInfo[]>;
}

// preload.ts — contextBridge で露出
contextBridge.exposeInMainWorld('gbiz', {
  searchByCorporateNumber: (num) => ipcRenderer.invoke('gbiz:byNumber', num),
  searchByName: (name, limit) => ipcRenderer.invoke('gbiz:byName', name, limit),
} satisfies GBizApi);

// renderer/global.d.ts
declare global {
  interface Window { gbiz: GBizApi }
}
```

`as unknown as` などの強引なキャストが必要な場合は **preload 内に閉じ込める**。renderer 側のコードは型が綺麗に通る状態を維持する。

### 7.5 IPC 経由のデータは構造化クローン可能なものに限る

Electron の IPC は構造化クローンで値を渡す。以下は渡らないので注意：

- 関数・クラスインスタンス・`Date` 以外のホスト型
- `Error` インスタンスは name/message/stack のみ転送される（カスタムプロパティは消える）

カスタムエラー（`HttpError` 等）の情報を renderer まで届けたい場合は、main 側で **plain object に変換**してから throw / return する。

```typescript
// main 側
try {
  return await client.get('/hojin/' + num);
} catch (e) {
  if (e instanceof HttpError) {
    throw new Error(`HTTP ${e.status}: ${e.message}`);  // status を message に畳む
  }
  throw e;
}
```

### 7.6 ライブラリ層は main プロセスからのみ使う

`src/libs/` のコード（`GBizInfoApiClient` 等）は **main プロセスからのみ import** する。renderer から直接呼ばない。

理由: ライブラリは `got` 等の Node.js 依存を持つため renderer (=ブラウザ環境) では動かない。仮にバンドラが解決しても、上記 7.2 / 7.3 のセキュリティ前提を壊す。

---

## 8. プロトタイプ運用の規律

このアプリは配布しない・プロトタイプという前提なので、**やらないこと**を明示する。

- **コードサイニング不要**: `electron-builder` の `win.target: portable`、署名なし
- **自動アップデート不要**: 配布しないため
- **多言語化不要**: 日本語ハードコードで OK
- **包括的なテスト不要**: ライブラリ層 (`src/libs/`) はコピー元リポでテスト済み。アプリ固有ロジックのみ、必要に応じて

ただし以下は**プロトタイプでも守る**：

- §7 のプロセス境界・セキュリティ設定（後から直すと全面改修になる）
- 型システムの規則（§4）
- 構文・スタイル規則（§5）

---

## 9. ライブラリ層のコード追従

`src/libs/` 配下は外部リポジトリ（`github.com/aokazaki-olp/libraries` の `nodejs/src/`）からコピーしたもの。

- コピー元のコミットハッシュは `src/libs/SOURCE.md` に記録する
- 元リポ側で修正が入った場合は手動同期。**ローカルで `src/libs/` を直接編集しない**（同期時に消える）
- 編集が必要になったら、まず元リポ側に PR を出してマージしてから同期する
