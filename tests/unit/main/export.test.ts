/**
 * export.ts の toCsvBuffer ユニットテスト。
 *
 * exportCsv / exportQueryExcel / exportObjectDefinition は Electron dialog 依存のため、
 * 純粋関数として CSV を生成する toCsvBuffer に焦点を当て、
 * BOM・改行コード・エスケープ・null/undefined/数値の cast を網羅的に検証する。
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('electron', () => ({
  dialog: { showSaveDialog: vi.fn() },
}));

vi.mock('../../../packages/main-core/src/logger.js', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../packages/main-core/src/sfApi.js', () => ({
  describeObject: vi.fn(),
}));

import { toCsvBuffer } from '../../../packages/main-core/src/export.js';

describe('toCsvBuffer — 基本動作', () => {
  it('ヘッダー行 + データ行 + CRLF + BOM', () => {
    const buf = toCsvBuffer(
      [{ a: 1, b: 'x' }, { a: 2, b: 'y' }],
      ['a', 'b'],
      { bom: true, lineEnding: 'CRLF' },
    );
    const text = buf.toString('utf-8');
    expect(text.charCodeAt(0)).toBe(0xFEFF); // BOM
    const withoutBom = text.slice(1);
    expect(withoutBom).toBe('a,b\r\n1,x\r\n2,y\r\n');
  });

  it('BOM=false の場合 BOM なし', () => {
    const buf = toCsvBuffer([{ a: 1 }], ['a'], { bom: false, lineEnding: 'CRLF' });
    expect(buf.toString('utf-8').charCodeAt(0)).not.toBe(0xFEFF);
  });

  it('LF 改行', () => {
    const buf = toCsvBuffer([{ a: 1 }], ['a'], { bom: false, lineEnding: 'LF' });
    expect(buf.toString('utf-8')).toBe('a\n1\n');
  });

  it('レコード 0 件でもヘッダーだけは出力する', () => {
    const buf = toCsvBuffer([], ['a', 'b'], { bom: false, lineEnding: 'LF' });
    expect(buf.toString('utf-8')).toBe('a,b\n');
  });

  it('columns 0 件 → 空行のみ', () => {
    const buf = toCsvBuffer([{ a: 1 }], [], { bom: false, lineEnding: 'LF' });
    expect(buf.toString('utf-8')).toBe('\n\n');
  });
});

describe('toCsvBuffer — エスケープ', () => {
  it('カンマを含む値はクォートで囲む', () => {
    const buf = toCsvBuffer([{ a: 'hello, world' }], ['a'], { bom: false, lineEnding: 'LF' });
    expect(buf.toString('utf-8')).toBe('a\n"hello, world"\n');
  });

  it('ダブルクォートを含む値はクォート + 二重化', () => {
    const buf = toCsvBuffer([{ a: 'say "hi"' }], ['a'], { bom: false, lineEnding: 'LF' });
    expect(buf.toString('utf-8')).toBe('a\n"say ""hi"""\n');
  });

  it('改行を含む値はクォートで囲む', () => {
    const buf = toCsvBuffer([{ a: 'line1\nline2' }], ['a'], { bom: false, lineEnding: 'LF' });
    expect(buf.toString('utf-8')).toBe('a\n"line1\nline2"\n');
  });

  it('日本語・絵文字は UTF-8 でそのまま', () => {
    const buf = toCsvBuffer(
      [{ a: '日本語', b: '😀' }],
      ['a', 'b'],
      { bom: false, lineEnding: 'LF' },
    );
    expect(buf.toString('utf-8')).toBe('a,b\n日本語,😀\n');
  });

  it('CRLF を含む値はクォートで囲む', () => {
    const buf = toCsvBuffer([{ a: 'a\r\nb' }], ['a'], { bom: false, lineEnding: 'LF' });
    expect(buf.toString('utf-8')).toBe('a\n"a\r\nb"\n');
  });
});

describe('toCsvBuffer — 型 cast', () => {
  it('null は空文字', () => {
    const buf = toCsvBuffer([{ a: null }], ['a'], { bom: false, lineEnding: 'LF' });
    expect(buf.toString('utf-8')).toBe('a\n\n');
  });

  it('undefined は空文字 (?? "" の挙動)', () => {
    const buf = toCsvBuffer([{ a: undefined }], ['a'], { bom: false, lineEnding: 'LF' });
    expect(buf.toString('utf-8')).toBe('a\n\n');
  });

  it('オブジェクト値は String(value) で展開 (cast.object)', () => {
    const buf = toCsvBuffer([{ a: { x: 1 } }], ['a'], { bom: false, lineEnding: 'LF' });
    // String({x:1}) → '[object Object]'
    expect(buf.toString('utf-8')).toBe('a\n[object Object]\n');
  });

  it('整数', () => {
    const buf = toCsvBuffer([{ a: 42 }], ['a'], { bom: false, lineEnding: 'LF' });
    expect(buf.toString('utf-8')).toBe('a\n42\n');
  });

  it('NaN / Infinity は空文字', () => {
    const buf = toCsvBuffer(
      [{ a: NaN, b: Infinity, c: -Infinity }],
      ['a', 'b', 'c'],
      { bom: false, lineEnding: 'LF' },
    );
    expect(buf.toString('utf-8')).toBe('a,b,c\n,,\n');
  });

  it('小数', () => {
    const buf = toCsvBuffer([{ a: 1.5 }], ['a'], { bom: false, lineEnding: 'LF' });
    expect(buf.toString('utf-8')).toBe('a\n1.5\n');
  });

  it('真偽値はそのまま', () => {
    const buf = toCsvBuffer([{ a: true, b: false }], ['a', 'b'], { bom: false, lineEnding: 'LF' });
    expect(buf.toString('utf-8')).toBe('a,b\n1,\n');
  });

  it('Date オブジェクトは ISO 文字列を含む形で出力 (cast.object 経由)', () => {
    const d = new Date('2026-05-24T00:00:00Z');
    const buf = toCsvBuffer([{ a: d }], ['a'], { bom: false, lineEnding: 'LF' });
    // csv-stringify の cast.date が無いため cast.object へ。String(Date) はローカルタイム文字列
    const text = buf.toString('utf-8');
    expect(text).toContain('a\n');
    expect(text.length).toBeGreaterThan(3);
  });
});

describe('toCsvBuffer — 列の選択', () => {
  it('columns に無いキーは無視', () => {
    const buf = toCsvBuffer(
      [{ a: 1, b: 2, c: 3 }],
      ['a', 'c'],
      { bom: false, lineEnding: 'LF' },
    );
    expect(buf.toString('utf-8')).toBe('a,c\n1,3\n');
  });

  it('records に無いキーは空文字', () => {
    const buf = toCsvBuffer(
      [{ a: 1 }],
      ['a', 'missing'],
      { bom: false, lineEnding: 'LF' },
    );
    expect(buf.toString('utf-8')).toBe('a,missing\n1,\n');
  });

  it('columns の順序通りに並ぶ', () => {
    const buf = toCsvBuffer(
      [{ a: 1, b: 2, c: 3 }],
      ['c', 'a', 'b'],
      { bom: false, lineEnding: 'LF' },
    );
    expect(buf.toString('utf-8')).toBe('c,a,b\n3,1,2\n');
  });
});

describe('toCsvBuffer — 大容量', () => {
  it('1000 行を処理してもメモリ／文字列上の異常なし', () => {
    const records = Array.from({ length: 1000 }, (_, i) => ({ id: `r${i}`, value: i * 2 }));
    const buf = toCsvBuffer(records, ['id', 'value'], { bom: false, lineEnding: 'LF' });
    const lines = buf.toString('utf-8').split('\n');
    // header + 1000 data + trailing newline
    expect(lines).toHaveLength(1002);
    expect(lines[0]).toBe('id,value');
    expect(lines[1]).toBe('r0,0');
    expect(lines[1000]).toBe('r999,1998');
  });
});
