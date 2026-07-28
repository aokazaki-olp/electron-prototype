/**
 * export.ts の CSV 出力ユニットテスト。
 *
 * toCsvBuffer（同期・純粋関数）と exportCsv（ストリーミング・実運用でIPC経由に呼ばれる本体）の
 * 両方を対象にする。過去に toCsvBuffer だけをテストして exportCsv 側の cast 設定が
 * 乖離したまま放置されるバグがあったため、cast・エスケープに関するテストケースは
 * 可能な限り両関数で同一の入力・期待値を共有し、実装の乖離を機械的に検出できるようにする。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'csv-parse/sync';
import type { CsvExportOptions } from '@app/ipc-contract';

const showSaveDialog = vi.fn();

vi.mock('electron', () => ({
  dialog: { showSaveDialog: (...args: unknown[]) => showSaveDialog(...args) },
}));

vi.mock('../../../packages/main-core/src/logger.js', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../packages/main-core/src/sfApi.js', () => ({
  describeObject: vi.fn(),
}));

import { toCsvBuffer, exportCsv } from '../../../packages/main-core/src/export.js';

// ============================================================================
// exportCsv (実運用のストリーミング関数) 用テストヘルパー
// ============================================================================

let workDir: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'sfx-csv-test-'));
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
  vi.clearAllMocks();
});

/**
 * exportCsv を実際に実行し、書き出されたファイルの中身を Buffer で返す。
 * dialog.showSaveDialog はテスト用一時ディレクトリ内のパスを返すよう差し替える。
 */
const runExportCsv = async (
  records: Record<string, unknown>[],
  columns: string[],
  options: CsvExportOptions,
): Promise<Buffer> => {
  const filePath = join(workDir, 'export.csv');
  showSaveDialog.mockResolvedValue({ canceled: false, filePath });
  await exportCsv(records, columns, options);
  return readFileSync(filePath);
};

// ============================================================================
// toCsvBuffer / exportCsv 共通の cast・エスケープ挙動
// (同一ケースを両関数に対して走らせ、実装の乖離を検出する)
// ============================================================================

interface CastCase {
  name: string;
  records: Record<string, unknown>[];
  columns: string[];
  expected: string; // BOM/改行コード確定後の本文 (LF, BOMなし)
}

const CAST_CASES: CastCase[] = [
  {
    name: 'boolean は true/false 文字列 (false が空文字と区別できることを保証)',
    records: [{ a: true, b: false }],
    columns: ['a', 'b'],
    expected: 'a,b\ntrue,false\n',
  },
  {
    name: 'null は空文字',
    records: [{ a: null }],
    columns: ['a'],
    expected: 'a\n\n',
  },
  {
    name: 'undefined は空文字',
    records: [{ a: undefined }],
    columns: ['a'],
    expected: 'a\n\n',
  },
  {
    name: 'キー自体が存在しない場合も空文字',
    records: [{ a: 1 }],
    columns: ['a', 'missing'],
    expected: 'a,missing\n1,\n',
  },
  {
    name: '整数',
    records: [{ a: 42 }],
    columns: ['a'],
    expected: 'a\n42\n',
  },
  {
    name: '小数',
    records: [{ a: 1.5 }],
    columns: ['a'],
    expected: 'a\n1.5\n',
  },
  {
    name: 'NaN / Infinity は空文字',
    records: [{ a: NaN, b: Infinity, c: -Infinity }],
    columns: ['a', 'b', 'c'],
    expected: 'a,b,c\n,,\n',
  },
  {
    name: '極小の小数 (1e-7 相当) は指数表記にせず10進展開する',
    records: [{ a: 0.0000001 }],
    columns: ['a'],
    expected: 'a\n0.0000001\n',
  },
  {
    name: '極大の整数 (1e21 相当) は指数表記にせず10進展開する',
    records: [{ a: 1e21 }],
    columns: ['a'],
    expected: 'a\n1000000000000000000000\n',
  },
  {
    name: 'カンマを含む値はクォートで囲む',
    records: [{ a: 'hello, world' }],
    columns: ['a'],
    expected: 'a\n"hello, world"\n',
  },
  {
    name: 'ダブルクォートを含む値はクォート + 二重化',
    records: [{ a: 'say "hi"' }],
    columns: ['a'],
    expected: 'a\n"say ""hi"""\n',
  },
  {
    name: '改行を含む値はクォートで囲む (Salesforce 長文テキストエリア想定)',
    records: [{ a: 'line1\nline2' }],
    columns: ['a'],
    expected: 'a\n"line1\nline2"\n',
  },
  {
    name: 'CRLF を含む値はクォートで囲む',
    records: [{ a: 'a\r\nb' }],
    columns: ['a'],
    expected: 'a\n"a\r\nb"\n',
  },
  {
    name: '日本語・絵文字は UTF-8 でそのまま',
    records: [{ a: '日本語', b: '😀' }],
    columns: ['a', 'b'],
    expected: 'a,b\n日本語,😀\n',
  },
  {
    name: '"=" で始まる値は数式実行を防ぐため先頭に \' が付く (CSVインジェクション対策)',
    records: [{ a: '=1+1' }],
    columns: ['a'],
    expected: "a\n'=1+1\n",
  },
  {
    name: '日本の携帯電話番号 (先頭 "+") も数式実行を防ぐため \' が付く',
    records: [{ a: '+81-90-1234-5678' }],
    columns: ['a'],
    expected: "a\n'+81-90-1234-5678\n",
  },
  {
    name: '"@" で始まる値も対象',
    records: [{ a: '@mention' }],
    columns: ['a'],
    expected: "a\n'@mention\n",
  },
  {
    name: '全角の "＝"（Unicode正規化トリック対策）も対象',
    records: [{ a: '＝1+1' }],
    columns: ['a'],
    expected: "a\n'＝1+1\n",
  },
  {
    name: '数式インジェクション対策とカンマエスケープが両立する',
    records: [{ a: '=SUM(A1,B1)' }],
    columns: ['a'],
    expected: 'a\n"\'=SUM(A1,B1)"\n',
  },
  {
    name: 'Date インスタンスは ISO 8601 文字列になる (タイムスタンプ数値化を防ぐ)',
    records: [{ a: new Date('2026-05-24T00:00:00.000Z') }],
    columns: ['a'],
    expected: 'a\n2026-05-24T00:00:00.000Z\n',
  },
  {
    name: 'サブクエリ関係項目 (配列値) は JSON 文字列化する ([object Object] を防ぐ)',
    records: [{ a: [{ Id: '003a', Name: '田中' }] }],
    columns: ['a'],
    expected: `a\n"${JSON.stringify([{ Id: '003a', Name: '田中' }]).replace(/"/g, '""')}"\n`,
  },
  {
    name: 'columns の順序通りに並ぶ',
    records: [{ a: 1, b: 2, c: 3 }],
    columns: ['c', 'a', 'b'],
    expected: 'c,a,b\n3,1,2\n',
  },
  {
    name: 'columns に無いキーは無視',
    records: [{ a: 1, b: 2, c: 3 }],
    columns: ['a', 'c'],
    expected: 'a,c\n1,3\n',
  },
];

describe.each(CAST_CASES)('CSV cast/escape: $name', ({ records, columns, expected }) => {
  it('toCsvBuffer', () => {
    const buf = toCsvBuffer(records, columns, { bom: false, lineEnding: 'LF' });
    expect(buf.toString('utf-8')).toBe(expected);
  });

  it('exportCsv (実運用のストリーミング関数)', async () => {
    const buf = await runExportCsv(records, columns, { bom: false, lineEnding: 'LF' });
    expect(buf.toString('utf-8')).toBe(expected);
  });
});

// ============================================================================
// toCsvBuffer 固有: 基本動作・0件系
// ============================================================================

describe('toCsvBuffer — 基本動作', () => {
  it('ヘッダー行 + データ行 + CRLF + BOM', () => {
    const buf = toCsvBuffer(
      [{ a: 1, b: 'x' }, { a: 2, b: 'y' }],
      ['a', 'b'],
      { bom: true, lineEnding: 'CRLF' },
    );
    const text = buf.toString('utf-8');
    expect(text.charCodeAt(0)).toBe(0xFEFF);
    expect(text.slice(1)).toBe('a,b\r\n1,x\r\n2,y\r\n');
  });

  it('BOM=false の場合 BOM なし', () => {
    const buf = toCsvBuffer([{ a: 1 }], ['a'], { bom: false, lineEnding: 'CRLF' });
    expect(buf.toString('utf-8').charCodeAt(0)).not.toBe(0xFEFF);
  });

  it('レコード 0 件でもヘッダーだけは出力する', () => {
    const buf = toCsvBuffer([], ['a', 'b'], { bom: false, lineEnding: 'LF' });
    expect(buf.toString('utf-8')).toBe('a,b\n');
  });

  it('columns 0 件 → 空行のみ', () => {
    const buf = toCsvBuffer([{ a: 1 }], [], { bom: false, lineEnding: 'LF' });
    expect(buf.toString('utf-8')).toBe('\n\n');
  });

  it('1000 行を処理してもメモリ／文字列上の異常なし', () => {
    const records = Array.from({ length: 1000 }, (_, i) => ({ id: `r${i}`, value: i * 2 }));
    const buf = toCsvBuffer(records, ['id', 'value'], { bom: false, lineEnding: 'LF' });
    const lines = buf.toString('utf-8').split('\n');
    expect(lines).toHaveLength(1002);
    expect(lines[0]).toBe('id,value');
    expect(lines[1]).toBe('r0,0');
    expect(lines[1000]).toBe('r999,1998');
  });
});

// ============================================================================
// exportCsv 固有: dialog・ファイルI/O・BOMバイト列・大容量ストリーミング
// ============================================================================

describe('exportCsv — dialog / ファイルI/O', () => {
  it('キャンセル時は何も書き出さず正常終了する', async () => {
    showSaveDialog.mockResolvedValue({ canceled: true, filePath: undefined });
    await expect(exportCsv([{ a: 1 }], ['a'], { bom: false, lineEnding: 'LF' })).resolves.toBeUndefined();
  });

  it('BOM は UTF-8 の EF BB BF として書き出される', async () => {
    const buf = await runExportCsv([{ a: 1 }], ['a'], { bom: true, lineEnding: 'LF' });
    expect(buf.subarray(0, 3)).toEqual(Buffer.from([0xEF, 0xBB, 0xBF]));
    expect(buf.subarray(3).toString('utf-8')).toBe('a\n1\n');
  });

  it('CRLF 改行で書き出される', async () => {
    const buf = await runExportCsv([{ a: 1 }, { a: 2 }], ['a'], { bom: false, lineEnding: 'CRLF' });
    expect(buf.toString('utf-8')).toBe('a\r\n1\r\n2\r\n');
  });

  it('5000件のストリーミング書き出しで行の欠落・重複・順序崩れが無い', async () => {
    const records = Array.from({ length: 5000 }, (_, i) => ({ id: i, value: `v${i}` }));
    const buf = await runExportCsv(records, ['id', 'value'], { bom: false, lineEnding: 'LF' });
    const rows = parse(buf, { columns: true }) as Array<{ id: string; value: string }>;
    expect(rows).toHaveLength(5000);
    expect(rows[0]).toEqual({ id: '0', value: 'v0' });
    expect(rows[4999]).toEqual({ id: '4999', value: 'v4999' });
  });
});

// ============================================================================
// Salesforce API から取得しうる実データ形状の統合検証
// (実パーサー csv-parse で読み戻し、構造的に有効な CSV であることを検証する)
// ============================================================================

describe('exportCsv — Salesforce レコードの実データ形状（ラウンドトリップ検証）', () => {
  it('多様な型を含む1レコードが正しく読み戻せる', async () => {
    const record = {
      Id: '001xx000003DGb2AAG',
      Name: 'サンプル株式会社, Inc.',
      IsActive: true,
      IsDeleted: false,
      'Owner.Name': '山田太郎',
      Amount: 1234567.89,
      SmallPercent: 0.0000005,
      Phone: '+81-90-1234-5678',
      Description: '複数行の\nメモです。\r\n特記事項あり。',
      CreatedDate: '2026-05-24T00:00:00.000Z',
      MultiPicklist: 'Option1;Option2;Option3',
      EmptyField: null,
      MissingField: undefined,
      Note: '=cmd|/c calc',
    };
    const columns = Object.keys(record);
    const buf = await runExportCsv([record], columns, { bom: true, lineEnding: 'CRLF' });

    // BOM を除いた本文を実パーサーで読み戻す (csv-parse は BOM を透過的に無視する)
    const rows = parse(buf, { columns: true, bom: true }) as Array<Record<string, string>>;
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row['Id']).toBe('001xx000003DGb2AAG');
    expect(row['Name']).toBe('サンプル株式会社, Inc.');
    expect(row['IsActive']).toBe('true');
    expect(row['IsDeleted']).toBe('false');
    expect(row['Owner.Name']).toBe('山田太郎');
    expect(row['Amount']).toBe('1234567.89');
    expect(row['SmallPercent']).toBe('0.0000005');
    // 数式インジェクション対策で先頭に ' が付くため、電話番号は "'+81-..." になる
    expect(row['Phone']).toBe("'+81-90-1234-5678");
    expect(row['Description']).toBe('複数行の\nメモです。\r\n特記事項あり。');
    expect(row['CreatedDate']).toBe('2026-05-24T00:00:00.000Z');
    expect(row['MultiPicklist']).toBe('Option1;Option2;Option3');
    expect(row['EmptyField']).toBe('');
    expect(row['MissingField']).toBe('');
    expect(row['Note']).toBe("'=cmd|/c calc");
  });

  it('レコード間で列の有無が異なっても (null関係項目 vs 展開された関係項目) 全行が同じ列数で出力される', async () => {
    // flattenRecord は Owner が null の行では 'Owner' キー、
    // populate されている行では 'Owner.Name' キーを生成しうる。
    // getColumns() 側で全キーの和集合を取る前提で、CSV側は欠落キーを空欄として扱えることを確認する。
    const records = [
      { Id: '001', 'Owner.Name': '山田太郎', Owner: undefined },
      { Id: '002', Owner: null, 'Owner.Name': undefined },
    ];
    const columns = ['Id', 'Owner.Name', 'Owner'];
    const buf = await runExportCsv(records, columns, { bom: false, lineEnding: 'LF' });
    const rows = parse(buf, { columns: true }) as Array<Record<string, string>>;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ Id: '001', 'Owner.Name': '山田太郎', Owner: '' });
    expect(rows[1]).toEqual({ Id: '002', 'Owner.Name': '', Owner: '' });
  });
});
