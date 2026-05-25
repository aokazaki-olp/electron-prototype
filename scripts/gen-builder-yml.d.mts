/**
 * gen-builder-yml.mjs の型定義 (Node から TypeScript ファイルを直接 import できないため、
 * .mjs を JavaScript として書きつつ TypeScript 側から型付きで参照できるように declaration を提供する)。
 *
 * このファイルの BuildInfo / BUILD_INFO_BY_TARGET の形は
 * packages/main-core/src/buildInfo.ts と一致しなければならない。整合は
 * tests/unit/main/build-targets-consistency.test.ts で実行時にも保証される。
 */
export interface BuildInfo {
  target: 'explorer' | 'compass';
  appId: string;
  productName: string;
  urlScheme: string;
  storeName: string;
}

export const BUILD_INFO_BY_TARGET: Readonly<Record<'explorer' | 'compass', Readonly<BuildInfo>>>;
