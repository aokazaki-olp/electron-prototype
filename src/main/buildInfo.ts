/**
 * buildInfo.ts
 * @description ビルドターゲット別の定数を集約。
 *   各種設定は build-time 環境変数 BUILD_TARGET で切り替わる。
 *   既定値は 'explorer'（フル版）。Compass ビルドは BUILD_TARGET=compass を指定する。
 *   ここを変更するだけで appId / URL スキーム / electron-store name / productName を切り替えられる。
 */

export type BuildTarget = 'explorer' | 'compass';

export interface BuildInfo {
  /** ビルドターゲット識別子（コード内で参照する） */
  target: BuildTarget;
  /** electron-builder の appId（OS にアプリを識別させる ID） */
  appId: string;
  /** OS に表示されるアプリ名 */
  productName: string;
  /** カスタム URL スキーム（OAuth コールバック等で使用、`://` は含まない） */
  urlScheme: string;
  /** electron-store のストア名（OS ユーザーデータ配下のファイル名のベース） */
  storeName: string;
}

const EXPLORER: BuildInfo = {
  target: 'explorer',
  appId: 'com.example.salesforce-explorer',
  productName: 'Salesforce Explorer',
  urlScheme: 'salesforce-explorer',
  storeName: 'salesforce-explorer',
};

const COMPASS: BuildInfo = {
  target: 'compass',
  appId: 'com.example.salesforce-compass',
  productName: 'Salesforce Compass',
  urlScheme: 'salesforce-compass',
  storeName: 'salesforce-compass',
};

const resolveTarget = (): BuildTarget => {
  const raw = process.env['BUILD_TARGET'];
  if (raw === 'compass') return 'compass';
  return 'explorer';
};

export const BUILD: BuildInfo = resolveTarget() === 'compass' ? COMPASS : EXPLORER;

/** OAuth コールバック URL（Connected App の Callback URL に登録する文字列と一致する必要がある） */
export const OAUTH_CALLBACK_URL = `${BUILD.urlScheme}://callback`;
