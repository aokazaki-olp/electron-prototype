#!/usr/bin/env node
/**
 * gen-builder-yml.mjs
 * @description packages/main-core/src/buildInfo.ts の値から
 *   apps/<target>/electron-builder.yml を再生成する。
 *
 *   CODING_RULES §10.1 が要求する「ここを変更するだけで appId / URL スキーム /
 *   electron-store name / productName を切り替えられる」を実装上担保するため、
 *   YAML を手書きせずコード起点で生成する。
 *
 *   ※Node から TypeScript ファイルを直接読めないため、以下の定数表は
 *   packages/main-core/src/buildInfo.ts と同じ値を保持する DRY 違反になっている。
 *   整合性は tests/unit/main/build-targets-consistency.test.ts で CI 保証する。
 *
 *   BUILD_TARGET=explorer|compass を環境変数で受け取り、対応する yml を上書きする。
 */

import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

/**
 * @typedef {{ target: 'explorer' | 'compass', appId: string, productName: string, urlScheme: string, storeName: string }} BuildInfo
 */

/** @type {Record<'explorer' | 'compass', BuildInfo>} */
export const BUILD_INFO_BY_TARGET = Object.freeze({
  explorer: Object.freeze({
    target: 'explorer',
    appId: 'com.example.salesforce-explorer',
    productName: 'Salesforce Explorer',
    urlScheme: 'salesforce-explorer',
    storeName: 'salesforce-explorer',
  }),
  compass: Object.freeze({
    target: 'compass',
    appId: 'com.example.salesforce-compass',
    productName: 'Salesforce Compass',
    urlScheme: 'salesforce-compass',
    storeName: 'salesforce-compass',
  }),
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');

const run = () => {
  const target = process.env['BUILD_TARGET'] === 'compass' ? 'compass' : 'explorer';
  const info = BUILD_INFO_BY_TARGET[target];

  const config = {
    appId: info.appId,
    productName: info.productName,
    directories: { output: 'dist' },
    files: ['out/**', 'package.json'],
    protocols: [{ name: info.productName, schemes: [info.urlScheme] }],
    win: { target: 'portable' },
    ...(target === 'compass' ? { extraMetadata: { name: info.storeName } } : {}),
  };

  const header =
    '# AUTO-GENERATED from packages/main-core/src/buildInfo.ts via scripts/gen-builder-yml.mjs\n' +
    '# Do not edit manually. Run `npm run gen-builder-yml -w @app/<target>` to regenerate.\n';
  const yamlBody = yaml.dump(config, { lineWidth: 120 });

  const outPath = resolve(REPO_ROOT, `apps/${target}/electron-builder.yml`);
  writeFileSync(outPath, header + yamlBody, 'utf-8');
  console.log(`[gen-builder-yml] wrote ${outPath} (target=${target})`);
};

// このファイルが直接実行された場合のみ生成を走らせる。
// import 経由で BUILD_INFO_BY_TARGET を参照する（整合性テスト等）場合は何もしない。
if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  run();
}
