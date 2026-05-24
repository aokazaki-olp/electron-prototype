/**
 * scripts/gen-builder-yml.mjs と packages/main-core/src/buildInfo.ts の
 * BUILD_INFO_BY_TARGET 定数が一致していることを保証する。
 *
 * CODING_RULES §10.1 の「ここを変更するだけで切り替えられる」を物理的に DRY 違反で実装している分、
 * テストで整合を保証する。片方を更新して片方を忘れる事故を CI で検出する。
 */
import { describe, expect, it } from 'vitest';
import { BUILD_INFO_BY_TARGET as FROM_GENERATOR } from '../../../scripts/gen-builder-yml.mjs';
import { BUILD_INFO_BY_TARGET as FROM_CODE } from '../../../packages/main-core/src/buildInfo.js';

describe('BUILD_INFO_BY_TARGET 整合性', () => {
  it('Explorer の定数が一致する', () => {
    expect(FROM_GENERATOR.explorer).toEqual(FROM_CODE.explorer);
  });

  it('Compass の定数が一致する', () => {
    expect(FROM_GENERATOR.compass).toEqual(FROM_CODE.compass);
  });

  it('ターゲット集合が一致する', () => {
    expect(Object.keys(FROM_GENERATOR).sort()).toEqual(Object.keys(FROM_CODE).sort());
  });
});
