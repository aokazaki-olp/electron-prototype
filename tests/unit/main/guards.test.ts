/**
 * @app/ipc-contract の型ガード（IPC 境界の runtime バリデーション）テスト。
 * CODING_RULES §4.3 が要求する「外部入力は unknown + 型ガード」の核となる関数群。
 * これが壊れると preload を信頼しすぎる多層防御の穴になる。
 */
import { describe, it, expect } from 'vitest';
import {
  assertAppSettings,
  assertCsvExportOptions,
  assertLogLevel,
  assertNumber,
  assertProfile,
  assertRecord,
  assertRecordArray,
  assertSoqlTabsState,
  assertString,
  assertStringArray,
  isLogLevel,
} from '../../../packages/ipc-contract/src/guards.js';

describe('isLogLevel / assertLogLevel', () => {
  it('既知レベルを通す', () => {
    expect(isLogLevel('debug')).toBe(true);
    expect(isLogLevel('info')).toBe(true);
    expect(isLogLevel('warn')).toBe(true);
    expect(isLogLevel('error')).toBe(true);
  });
  it('silly / verbose は不正扱い', () => {
    expect(isLogLevel('silly')).toBe(false);
    expect(isLogLevel('verbose')).toBe(false);
  });
  it('assertLogLevel が不正値で TypeError を投げる', () => {
    expect(() => assertLogLevel('silly')).toThrow(TypeError);
    expect(() => assertLogLevel(null)).toThrow(TypeError);
  });
});

describe('assertAppSettings', () => {
  const validPaneSizes = { leftPanel: 18, soqlPanel: 40 };
  const validBase = {
    defaultMaxRows: 2000,
    logBufferSize: 1000,
    paneSizes: validPaneSizes,
    theme: 'system' as const,
  };

  it('正常な settings を通す', () => {
    expect(() => assertAppSettings(validBase)).not.toThrow();
    expect(() => assertAppSettings({ ...validBase, theme: 'light' })).not.toThrow();
    expect(() => assertAppSettings({ ...validBase, theme: 'dark' })).not.toThrow();
  });
  it('defaultMaxRows が無いと TypeError', () => {
    expect(() => assertAppSettings({ logBufferSize: 1000, paneSizes: validPaneSizes, theme: 'system' })).toThrow(TypeError);
  });
  it('logBufferSize が無いと TypeError', () => {
    expect(() => assertAppSettings({ defaultMaxRows: 2000, paneSizes: validPaneSizes, theme: 'system' })).toThrow(TypeError);
  });
  it('defaultMaxRows が非数値だと TypeError', () => {
    expect(() => assertAppSettings({ ...validBase, defaultMaxRows: '2000' })).toThrow(TypeError);
  });
  it('logBufferSize が非数値だと TypeError', () => {
    expect(() => assertAppSettings({ ...validBase, logBufferSize: '1000' })).toThrow(TypeError);
  });
  it('paneSizes が無いと TypeError', () => {
    expect(() => assertAppSettings({ defaultMaxRows: 2000, logBufferSize: 1000, theme: 'system' })).toThrow(TypeError);
  });
  it('paneSizes の各軸が数値でないと TypeError', () => {
    expect(() => assertAppSettings({ ...validBase, paneSizes: { leftPanel: '18', soqlPanel: 40 } })).toThrow(TypeError);
    expect(() => assertAppSettings({ ...validBase, paneSizes: { leftPanel: 18 } })).toThrow(TypeError);
  });
  it('theme が想定外の値だと TypeError', () => {
    expect(() => assertAppSettings({ ...validBase, theme: 'auto' })).toThrow(TypeError);
    expect(() => assertAppSettings({ ...validBase, theme: 42 })).toThrow(TypeError);
  });
  it('theme が無いと TypeError', () => {
    expect(() => assertAppSettings({ defaultMaxRows: 2000, logBufferSize: 1000, paneSizes: validPaneSizes })).toThrow(TypeError);
  });
  it('null / array / プリミティブを弾く', () => {
    expect(() => assertAppSettings(null)).toThrow(TypeError);
    expect(() => assertAppSettings([])).toThrow(TypeError);
    expect(() => assertAppSettings('')).toThrow(TypeError);
  });
});

describe('assertProfile', () => {
  const valid = {
    id: 'p1',
    name: 'テスト',
    loginUrl: 'https://login.salesforce.com',
    clientId: 'abc',
    mode: 'readonly',
    writeSessionTimeoutMin: 15,
  };

  it('正常な profile を通す', () => {
    expect(() => assertProfile(valid)).not.toThrow();
    expect(() => assertProfile({ ...valid, mode: 'readwrite' })).not.toThrow();
  });

  it('mode が想定外なら TypeError', () => {
    expect(() => assertProfile({ ...valid, mode: 'admin' })).toThrow(TypeError);
  });

  it('必須プロパティが欠けると TypeError', () => {
    const { id: _id, ...withoutId } = valid;
    expect(() => assertProfile(withoutId)).toThrow(TypeError);
  });

  it('writeSessionTimeoutMin が数値でなければ TypeError', () => {
    expect(() => assertProfile({ ...valid, writeSessionTimeoutMin: '15' })).toThrow(TypeError);
  });
});

describe('assertCsvExportOptions', () => {
  it('CRLF と LF を通す', () => {
    expect(() => assertCsvExportOptions({ bom: true, lineEnding: 'CRLF' })).not.toThrow();
    expect(() => assertCsvExportOptions({ bom: false, lineEnding: 'LF' })).not.toThrow();
  });

  it('lineEnding が想定外なら TypeError', () => {
    expect(() => assertCsvExportOptions({ bom: true, lineEnding: 'CR' })).toThrow(TypeError);
  });

  it('bom が非 boolean なら TypeError', () => {
    expect(() => assertCsvExportOptions({ bom: 'true', lineEnding: 'CRLF' })).toThrow(TypeError);
  });
});

describe('assertRecord / assertRecordArray', () => {
  it('プレーンオブジェクトを通す', () => {
    expect(() => assertRecord({ a: 1 })).not.toThrow();
  });

  it('配列・null・プリミティブを弾く', () => {
    expect(() => assertRecord([])).toThrow(TypeError);
    expect(() => assertRecord(null)).toThrow(TypeError);
    expect(() => assertRecord('x')).toThrow(TypeError);
  });

  it('Record の配列を通す', () => {
    expect(() => assertRecordArray([{ a: 1 }, { b: 2 }])).not.toThrow();
    expect(() => assertRecordArray([])).not.toThrow();
  });

  it('配列要素にプリミティブが混じると TypeError', () => {
    expect(() => assertRecordArray([{ a: 1 }, 'oops'])).toThrow(TypeError);
  });
});

describe('assertStringArray / assertString / assertNumber', () => {
  it('正常値を通す', () => {
    expect(() => assertStringArray(['a', 'b'])).not.toThrow();
    expect(() => assertString('x')).not.toThrow();
    expect(() => assertNumber(42)).not.toThrow();
  });

  it('不正値は TypeError', () => {
    expect(() => assertStringArray(['a', 1])).toThrow(TypeError);
    expect(() => assertString(42)).toThrow(TypeError);
    expect(() => assertNumber('42')).toThrow(TypeError);
    expect(() => assertNumber(NaN)).toThrow(TypeError);
    expect(() => assertNumber(Infinity)).toThrow(TypeError);
  });
});

describe('assertSoqlTabsState', () => {
  const valid = {
    tabs: [
      { id: 't1', name: 'A', soql: '', fetchAll: false },
      { id: 't2', name: 'B', soql: 'SELECT Id FROM Account', fetchAll: true },
    ],
    activeTabId: 't1',
  };

  it('正常な state を通す', () => {
    expect(() => assertSoqlTabsState(valid)).not.toThrow();
  });

  it('tabs に余計なフィールドが混じっていても通す（過剰プロパティは無視）', () => {
    expect(() => assertSoqlTabsState({
      ...valid,
      tabs: [{ ...valid.tabs[0], extra: 'ok' }],
    })).not.toThrow();
  });

  it('tab に fetchAll が無いと TypeError', () => {
    expect(() => assertSoqlTabsState({
      ...valid,
      tabs: [{ id: 't1', name: 'A', soql: '' }],
    })).toThrow(TypeError);
  });

  it('activeTabId が無い・非文字列だと TypeError', () => {
    expect(() => assertSoqlTabsState({ tabs: valid.tabs })).toThrow(TypeError);
    expect(() => assertSoqlTabsState({ ...valid, activeTabId: 123 })).toThrow(TypeError);
  });

  it('tabs が空配列でも通す (アプリ側で空チェックする責務)', () => {
    expect(() => assertSoqlTabsState({ tabs: [], activeTabId: 'x' })).not.toThrow();
  });

  it('tabs の中に 1 件でも不正があれば TypeError', () => {
    expect(() => assertSoqlTabsState({
      ...valid,
      tabs: [...valid.tabs, { id: 1, name: 'C', soql: '', fetchAll: false }],
    })).toThrow(TypeError);
  });
});

// ============================================================
// 境界値・防御テスト
// ============================================================

describe('assertNumber — 境界値', () => {
  it('0 / 負数 / MAX_SAFE_INTEGER は通す', () => {
    expect(() => assertNumber(0)).not.toThrow();
    expect(() => assertNumber(-1)).not.toThrow();
    expect(() => assertNumber(Number.MAX_SAFE_INTEGER)).not.toThrow();
    expect(() => assertNumber(Number.MIN_SAFE_INTEGER)).not.toThrow();
  });

  it('小数も通す', () => {
    expect(() => assertNumber(1.5)).not.toThrow();
  });

  it('NaN / Infinity / -Infinity は TypeError', () => {
    expect(() => assertNumber(NaN)).toThrow(TypeError);
    expect(() => assertNumber(Infinity)).toThrow(TypeError);
    expect(() => assertNumber(-Infinity)).toThrow(TypeError);
  });

  it('Number 型ではないオブジェクトは TypeError', () => {
    expect(() => assertNumber(new Number(5))).toThrow(TypeError);
    expect(() => assertNumber({ valueOf: () => 5 })).toThrow(TypeError);
    expect(() => assertNumber(true)).toThrow(TypeError);
  });
});

describe('assertString — 境界値', () => {
  it('空文字も通す (アプリ側で空チェックする責務)', () => {
    expect(() => assertString('')).not.toThrow();
  });

  it('日本語 / 絵文字 / 制御文字も通す', () => {
    expect(() => assertString('日本語')).not.toThrow();
    expect(() => assertString('😀')).not.toThrow();
    expect(() => assertString('a\nb\tc')).not.toThrow();
  });

  it('String オブジェクトラッパーは TypeError', () => {
    expect(() => assertString(new String('x'))).toThrow(TypeError);
  });
});

describe('assertRecord — prototype 汚染防御', () => {
  it('JSON.parse 由来の __proto__ プロパティを持つオブジェクトを通すが、Object.prototype は汚染されない', () => {
    const malicious = JSON.parse('{"__proto__": {"polluted": true}, "id": "x"}');
    expect(() => assertRecord(malicious)).not.toThrow();
    // JSON.parse は __proto__ を own プロパティとして扱うので Object.prototype は汚染されない
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('null prototype のオブジェクトも通す', () => {
    const obj = Object.create(null);
    obj.foo = 'bar';
    expect(() => assertRecord(obj)).not.toThrow();
  });

  it('Map / Set のような特殊オブジェクトは通す (typeof object かつ非配列だから)', () => {
    // Map は配列ではないので isPlainObject 上は通る (用途として渡してはいけないが、ガード対象外)
    expect(() => assertRecord(new Map())).not.toThrow();
  });
});

describe('assertProfile — 防御層', () => {
  it('mode が __proto__ 由来でも文字列でなければ通らない', () => {
    const malicious = JSON.parse('{"id":"a","name":"n","loginUrl":"u","clientId":"c","writeSessionTimeoutMin":15,"mode":{"toString":"readonly"}}');
    expect(() => assertProfile(malicious)).toThrow(TypeError);
  });

  it('id にプリミティブ以外を入れると TypeError', () => {
    const bad = {
      id: 123, name: 'n', loginUrl: 'u', clientId: 'c',
      mode: 'readonly', writeSessionTimeoutMin: 15,
    };
    expect(() => assertProfile(bad)).toThrow(TypeError);
  });

  it('writeSessionTimeoutMin が NaN だと TypeError', () => {
    const bad = {
      id: 'a', name: 'n', loginUrl: 'u', clientId: 'c',
      mode: 'readonly', writeSessionTimeoutMin: NaN,
    };
    expect(() => assertProfile(bad)).toThrow(TypeError);
  });

  it('追加フィールドが混じっていても通す (余剰プロパティ無視)', () => {
    const ok = {
      id: 'a', name: 'n', loginUrl: 'u', clientId: 'c',
      mode: 'readonly', writeSessionTimeoutMin: 15,
      extra: 'ignored',
    };
    expect(() => assertProfile(ok)).not.toThrow();
  });
});

describe('assertStringArray / assertRecordArray — エッジ', () => {
  it('空配列は通す', () => {
    expect(() => assertStringArray([])).not.toThrow();
    expect(() => assertRecordArray([])).not.toThrow();
  });

  it('文字列配列に空文字が混じってもエラーにしない', () => {
    expect(() => assertStringArray(['a', '', 'c'])).not.toThrow();
  });

  it('文字列配列に null が混じると TypeError', () => {
    expect(() => assertStringArray(['a', null, 'c'])).toThrow(TypeError);
  });

  it('Record 配列に空オブジェクトが含まれてもエラーにしない', () => {
    expect(() => assertRecordArray([{}, { a: 1 }])).not.toThrow();
  });
});
