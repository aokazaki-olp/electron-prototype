/**
 * buildInfo.ts
 * @description ビルドターゲット別の定数を集約。
 *   各種設定は build-time 環境変数 BUILD_TARGET で切り替わる。
 *   既定値は 'explorer'（フル版）。Compass ビルドは BUILD_TARGET=compass を指定する。
 *
 * @remarks
 *   このファイルが唯一の真ソースであり、`scripts/gen-builder-yml.mjs` が
 *   ここから `apps/*\/electron-builder.yml` を生成する。CODING_RULES §10.1 準拠。
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

const EXPLORER = {
  target: 'explorer',
  appId: 'com.example.salesforce-explorer',
  productName: 'Salesforce Explorer',
  urlScheme: 'salesforce-explorer',
  storeName: 'salesforce-explorer',
} as const satisfies BuildInfo;

const COMPASS = {
  target: 'compass',
  appId: 'com.example.salesforce-compass',
  productName: 'Salesforce Compass',
  urlScheme: 'salesforce-compass',
  storeName: 'salesforce-compass',
} as const satisfies BuildInfo;

/** 全ビルドターゲットの定数表（generator スクリプトから参照する） */
export const BUILD_INFO_BY_TARGET = {
  explorer: EXPLORER,
  compass: COMPASS,
} as const satisfies Record<BuildTarget, BuildInfo>;

const resolveTarget = (): BuildTarget => {
  const raw = process.env['BUILD_TARGET'];
  if (raw === 'compass') {
    return 'compass';
  }
  return 'explorer';
};

/**
 * 現在のビルドターゲット。
 *
 * @remarks 型を Union リテラル (`typeof EXPLORER | typeof COMPASS`) に narrow しているため、
 *   `switch (BUILD.target)` の網羅性チェックが効く。
 */
export const BUILD: typeof EXPLORER | typeof COMPASS =
  resolveTarget() === 'compass' ? COMPASS : EXPLORER;

/** OAuth コールバック URL（Connected App の Callback URL に登録する文字列と一致する必要がある） */
export const OAUTH_CALLBACK_URL: string = `${BUILD.urlScheme}://callback`;
