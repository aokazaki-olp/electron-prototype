---
tags:
  - salesforce
  - connected-app
  - oauth
  - setup
date: 2026-05-20
---

# Salesforce Connected App 設定手順

Salesforce Explorer（本プロトタイプ）用の Connected App を作成・設定する手順。

---

## 1. Connected App 作成

**Setup → App Manager → New Connected App**

### Basic Information

| 項目 | 値 |
|------|-----|
| Connected App Name | Salesforce Explorer（任意） |
| API Name | 自動生成（変更不要） |
| Contact Email | 管理者メールアドレス |

### OAuth Settings

- **Enable OAuth Settings**: ✅ チェック
- **Enable for Device Flow**: ❌ チェックしない（2025年9月廃止済み）
- **Callback URL**:
  ```
  http://localhost:8787/callback
  ```
- **Selected OAuth Scopes**:
  - `api` — Manage user data via APIs (api)
  - `refresh_token, offline_access` — Perform requests at any time
- **Require Proof Key for Code Exchange (PKCE) Extension for Supported Authorization Flows**: ✅ チェック
- **Require Secret for Web Server Flow**: ❌ **チェックしない**（PKCE使用時は不要）
- **Require Secret for Refresh Token Flow**: ❌ チェックしない

> **注意**: 本アプリはPKCE（S256）を使用しており、client_secret は不要。
> チェックを外すことで secret 不要のフローが成立する。

### 保存

Save → **10分待つ**（設定が伝播するまで時間がかかる）

---

## 2. OAuth Policies 設定

作成後: **App Manager → アプリを探す → ▼ → Manage → Edit Policies**

| 項目 | 推奨設定 |
|------|---------|
| Permitted Users | All users may self-authorize |
| IP Relaxation | Relax IP restrictions（ローカル開発向け） |
| Refresh Token Policy | Refresh token is valid until revoked |

---

## 3. Connected App をインストールする（2025年9月以降必須）

### 背景

2025年9月リリース (Summer '25) で仕様変更:

- **未インストールの Connected App はデフォルトでブロック**
- 一般ユーザーが自己認証しようとすると `insufficient_access` エラー
- 新権限「**Approve Uninstalled Connected Apps**」が追加されたが、通常ユーザーには付与されない

### 対応手順

**Setup → Installed Packages** または **App Manager → Install** からインストールする。

あるいは Connected App の管理画面から:

```
Setup → App Manager → [アプリ名] → Manage → Install in this Org
```

開発者組織 (Developer Edition) では通常インストール不要だが、本番・Sandbox では必須。

---

## 4. Client ID の取得

**Setup → App Manager → [アプリ名] → View**

「Consumer Key」の値が `clientId`。

> Consumer Secret は本アプリでは使用しない（PKCE フローのため）。

---

## 5. 2026年5月11日の必須化対応状況

| 要件 | 状況 |
|------|------|
| PKCE (S256) | ✅ 対応済み（`sfOAuth.ts` で実装） |
| Refresh Token Rotation | ✅ 対応済み（`refreshAccessToken` で新トークンを上書き保存） |
| state パラメータ (CSRF) | ✅ 対応済み（`crypto.randomUUID()` で生成・検証） |

---

## 6. 接続プロファイルの設定値まとめ

| 設定項目 | 値 |
|---------|-----|
| ログインURL | `https://login.salesforce.com`（本番） / `https://test.salesforce.com`（Sandbox） |
| Client ID | Connected App の Consumer Key |
| モード | 読み取り専用 / 読み書き |
| 書き込みセッション有効時間 | 任意（0=毎回再認証） |

---

## 7. よくあるエラーと対処

| エラー | 原因 | 対処 |
|--------|------|------|
| `redirect_uri_mismatch` | Callback URL が一致しない | Connected App の Callback URL を `http://localhost:8787/callback` に設定 |
| `insufficient_access` | App が未インストール | §3 の手順でインストール |
| `invalid_client` | Client ID が間違い | Consumer Key を再確認 |
| `invalid_grant` | Refresh Token が失効 | 再認証（startOAuth）を実行 |
| PKCE エラー | `Require Secret` がオンになっている | Connected App で「Require Secret for Web Server Flow」をオフに |

---

## 参考

- [Salesforce OAuth 2.0 Web Server Flow](https://help.salesforce.com/s/articleView?id=sf.remoteaccess_oauth_web_server_flow.htm)
- [PKCE for Connected Apps](https://help.salesforce.com/s/articleView?id=sf.remoteaccess_pkce.htm)
- [Summer '25 Release Notes - Uninstalled Connected Apps](https://help.salesforce.com/s/articleView?id=release-notes.rn_security_connected_apps_uninstalled.htm&release=252)
