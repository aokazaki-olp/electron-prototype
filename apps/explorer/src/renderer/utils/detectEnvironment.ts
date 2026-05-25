/**
 * detectEnvironment.ts
 * @description Salesforce loginUrl から org の環境種別を推定するユーティリティ。
 *   Header のバッジ表示に使う事故防止の中核ロジック。Header に閉じていたが、将来
 *   SettingsPage 等で同じ判定が必要になる想定で utils に切り出した。
 */

export type Environment = 'production' | 'sandbox' | 'scratch' | 'custom';

/**
 * Salesforce の "partitioned domains" サフィックス。本番 MyDomain と区別するため、
 * `.my.salesforce.com` 判定より先にこれらを除外する必要がある。
 *
 * @remarks 公式 Help より:
 * - sandbox / scratch / develop (Developer Edition) / trailblaze (Trailhead Playground)
 * - demo / free / patch
 */
const SANDBOX_LIKE_SUFFIXES = ['.sandbox.my.salesforce.com'] as const;
const NON_PRODUCTION_PARTITION_SUFFIXES = [
  '.scratch.my.salesforce.com',
  '.develop.my.salesforce.com',
  '.trailblaze.my.salesforce.com',
  '.demo.my.salesforce.com',
  '.free.my.salesforce.com',
  '.patch.my.salesforce.com',
] as const;

/**
 * loginUrl からおおまかな org 環境種別を推定する。
 *
 * 判定順は「partition suffix を先に除外 → 残る `.my.salesforce.com` を本番」とする。
 * 順序を逆にすると `acme--dev.sandbox.my.salesforce.com` のような sandbox が
 * 本番 (production) に誤分類されて事故防止バッジが効かなくなる。
 *
 * - `login.salesforce.com` → production (旧ログインエンドポイント)
 * - `test.salesforce.com` → sandbox (旧 sandbox ログインエンドポイント)
 * - `*.sandbox.my.salesforce.com` → sandbox
 * - `*.scratch / develop / trailblaze / demo / free / patch.my.salesforce.com` → scratch (非本番系をまとめて)
 * - 上記以外の `*.my.salesforce.com` → production (本番 MyDomain)
 * - それ以外 → custom (社内 reverse proxy 等、断定不能)
 *
 * @remarks 既知の限界:
 *   `login.salesforce.com` は本番組織だけでなく **Developer Edition org** や
 *   Trailhead Playground もログインエンドポイントとして共有する。loginUrl だけからは
 *   両者を原理的に区別できないため、ここでは安全側に倒して Production バッジを出す
 *   (赤バッジで警戒する = 事故防止過剰側)。
 *   厳密に区別したい場合はログイン後の `instance_url` (例: `*.develop.my.salesforce.com`)
 *   で再判定する必要があるが、現状は loginUrl ベースで割り切る。
 */
export const detectEnvironment = (loginUrl: string): Environment => {
  try {
    const host = new URL(loginUrl).hostname.toLowerCase();
    if (host === 'login.salesforce.com') {
      return 'production';
    }
    if (host === 'test.salesforce.com') {
      return 'sandbox';
    }
    if (SANDBOX_LIKE_SUFFIXES.some(s => host.endsWith(s))) {
      return 'sandbox';
    }
    if (NON_PRODUCTION_PARTITION_SUFFIXES.some(s => host.endsWith(s))) {
      return 'scratch';
    }
    if (host.endsWith('.my.salesforce.com')) {
      return 'production';
    }
    return 'custom';
  } catch {
    return 'custom';
  }
};
