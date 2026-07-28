/**
 * export.ts
 * @description CSV・Excel出力（保存ダイアログ付き）。
 *   大容量 SOQL 結果（書き戻しバッチ companion 用途で数十万件規模）に対応するため、
 *   CSV は csv-stringify のストリーム + fs WriteStream、Excel は exceljs の
 *   `stream.xlsx.WorkbookWriter` を使い、ヒープに全件展開しない。
 */

import { dialog } from 'electron';
import { createWriteStream } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { stringify, stringify as stringifySync } from 'csv-stringify/sync';
import { stringify as stringifyStream } from 'csv-stringify';
import type { Options as CsvStringifyOptions } from 'csv-stringify';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import ExcelJS from 'exceljs';
import { log } from './logger.js';
import { describeObject } from './sfApi.js';
import type { CsvExportOptions, ObjectDefinitionsMdFolderResult, SObjectDescribe } from '@app/ipc-contract';

// stringify (sync) は単体テストで使う公開 API のため import を残す
void stringify;

// ============================================================================
// CSV
// ============================================================================

/**
 * JS の `Number#toString`（`String(number)` が内部で使う変換）は `|v| < 1e-6` または
 * `|v| >= 1e21` で指数表記 (`"1e-7"` 等) になる。Salesforce の Percent/Number 項目は
 * 小数桁数が大きくなることがあり、指数表記のまま出力すると一般的な表計算ソフトで
 * 誤読・誤解を招くため、常に非指数表記の10進文字列へ展開する。
 */
const numberToPlainString = (value: number): string => {
  if (Object.is(value, -0)) {
    return '0';
  }
  const str = String(value);
  if (!/e/i.test(str)) {
    return str;
  }
  const sign = str.startsWith('-') ? '-' : '';
  const abs = sign ? str.slice(1) : str;
  const [mantissa = '', expPart = '0'] = abs.split(/e/i);
  const exponent = Number(expPart);
  const [intPart = '', fracPart = ''] = mantissa.split('.');

  if (exponent > 0) {
    // 正指数（|v|>=1e21）は double の有効桁数（最大17桁程度）を大きく超えるため、
    // 実際には fracPart.length <= exponent の分岐にしかならない。
    // else 分岐は仕様上あり得る形として防御的に残す。
    if (fracPart.length <= exponent) {
      return sign + intPart + fracPart.padEnd(exponent, '0');
    }
    return sign + intPart + fracPart.slice(0, exponent) + '.' + fracPart.slice(exponent);
  }
  return sign + '0.' + '0'.repeat(-exponent - 1) + intPart + fracPart;
};

// CSVインジェクション対策（Excel等でセル値が数式として実行されるのを防ぐ）の対象文字。
// csv-stringify 標準の `escape_formulas` オプションと同じ文字集合を使うが、そのオプション自体は
// 採用しない（下記 buildCsvStringifyOptions のコメント参照）。
const FORMULA_TRIGGER_CHARS = new Set([
  '=', '+', '-', '@', '\t', '\r',
  '＝', '＋', '－', '＠', // 全角 ＝＋－＠（Unicode正規化トリック対策）
]);

/** 文字列セル値が数式実行トリガー文字で始まる場合、先頭に `'` を付与して text 扱いにする */
const escapeFormulaPrefix = (v: string): string =>
  FORMULA_TRIGGER_CHARS.has(v.charAt(0)) ? `'${v}` : v;

/**
 * CSV 出力の cast・エスケープ設定を一元化する。`toCsvBuffer`（同期）と `exportCsv`
 * （ストリーミング、実運用で IPC 経由に呼ばれる本体）の両方から参照することで、
 * 実装が乖離してどちらか一方だけ古いバグを残す事故を防ぐ。
 *
 * - `string`: セル値が `=`/`+`/`-`/`@`（全角含む）等で始まる場合に先頭へ `'` を付与し、
 *   Excel 等で数式として実行されるのを防ぐ（CSVインジェクション対策）。csv-stringify 標準の
 *   `escape_formulas` オプションは cast 後の**全ての値**（number/boolean/date cast の結果も
 *   含む）に無差別適用されるため、それを使うと負の通貨額（例: `cast.number` が返す `"-100"`）
 *   まで text セルに落ちてしまい、Excel で SUM・ソート等の数値演算が効かなくなる副作用がある
 *   （検証済み）。そのため `escape_formulas` オプション自体は使わず、文字列型の元値
 *   （Salesforce の Name/Phone/Description 等の自由入力項目）にのみ限定して自前で適用する
 * - `boolean`: csv-stringify の既定は `true→"1"` / `false→""` で、false と空欄の
 *   区別がつかなくなるため `'true'`/`'false'` 文字列に固定する
 * - `number`: 指数表記を避け常に10進文字列にする（{@link numberToPlainString} 参照）
 * - `date`: 既定はミリ秒タイムスタンプの数値文字列になるため ISO 8601 文字列に固定する
 *   （SF REST API のレスポンスは日時を文字列で返すため通常は通らない経路だが、
 *   将来 Date インスタンスが紛れ込んだ場合の防御として明示する）
 * - `object`: csv-stringify は `null`/`undefined` をこの cast に渡さず既定で空文字化するため
 *   ここで null チェックは不要。サブクエリの関係項目（例: `(SELECT Id FROM Contacts)`）は
 *   flattenRecord で配列のまま残ることがあるため JSON 文字列化する
 *   （既定のまま `String(array)` に任せると `"[object Object],[object Object]"`
 *   のような無意味な文字列になる）。それ以外の非対応オブジェクトは `String()` に委譲する
 */
const buildCsvStringifyOptions = (options: CsvExportOptions): CsvStringifyOptions => ({
  record_delimiter: options.lineEnding === 'CRLF' ? '\r\n' : '\n',
  cast: {
    string: (v: string) => escapeFormulaPrefix(v),
    boolean: (v: boolean) => v ? 'true' : 'false',
    number: (v: number) => Number.isFinite(v) ? numberToPlainString(v) : '',
    date: (v: Date) => v.toISOString(),
    object: (v: unknown) => Array.isArray(v) ? JSON.stringify(v) : String(v),
  },
});

/**
 * レコード配列と列名から CSV バイナリを生成する。BOM 付与・改行コード切替に対応。
 *
 * @param records - 出力対象レコード（キーは列名と一致するもの）
 * @param columns - 出力する列名（順序通り）
 * @param options - BOM・改行コード等の CSV 出力オプション
 * @returns UTF-8 エンコードされた CSV バッファ
 */
export const toCsvBuffer = (
  records: Record<string, unknown>[],
  columns: string[],
  options: CsvExportOptions,
): Buffer => {
  const rows = [
    columns,
    ...records.map(r => columns.map(col => r[col])),
  ];

  const csv = stringifySync(rows, buildCsvStringifyOptions(options));

  const content = options.bom ? '﻿' + csv : csv;
  return Buffer.from(content, 'utf-8');
};

/**
 * 保存ダイアログを開いて CSV をディスクへ書き出す。ストリーミング書き込みのため
 * 数十万件規模でもヒープを占有しない。ユーザーがキャンセルした場合は何もしない。
 *
 * @param records - 出力対象レコード
 * @param columns - 出力する列名（順序通り）
 * @param options - BOM・改行コード等の CSV 出力オプション
 */
export const exportCsv = async (
  records: Record<string, unknown>[],
  columns: string[],
  options: CsvExportOptions,
): Promise<void> => {
  const result = await dialog.showSaveDialog({
    title: 'CSVとして保存',
    defaultPath: 'export.csv',
    filters: [{ name: 'CSV', extensions: ['csv'] }],
  });

  if (result.canceled || !result.filePath) {
    return;
  }

  // ストリーミング: csv-stringify → fs WriteStream
  // BOM は最初にダイレクトに書き込み、その後 stringifier の出力を流し込む。
  const fileStream = createWriteStream(result.filePath, { encoding: 'utf-8' });
  if (options.bom) {
    fileStream.write('﻿');
  }

  const stringifier = stringifyStream({
    header: true,
    columns,
    ...buildCsvStringifyOptions(options),
  });

  // レコード配列を pull 型 Readable に変換して pipeline で繋ぐ
  // (records は in-memory のため Readable.from で十分。大容量化は呼び出し側の責任)
  await pipeline(Readable.from(records), stringifier, fileStream);

  log.info(`[Export] CSV保存完了: ${result.filePath} (${records.length}件)`);
};

// ============================================================================
// Excel — クエリ結果（ストリーミング）
// ============================================================================

/**
 * 保存ダイアログを開いてクエリ結果を Excel ファイルへ書き出す。
 * `WorkbookWriter` でストリーミング書き込みするためヒープに全件展開しない。
 * ユーザーがキャンセルした場合は何もしない。
 *
 * @param records - 出力対象レコード
 * @param columns - 出力する列名（順序通り）
 */
export const exportQueryExcel = async (
  records: Record<string, unknown>[],
  columns: string[],
): Promise<void> => {
  const result = await dialog.showSaveDialog({
    title: 'Excelとして保存',
    defaultPath: 'export.xlsx',
    filters: [{ name: 'Excel', extensions: ['xlsx'] }],
  });

  if (result.canceled || !result.filePath) {
    return;
  }

  const wb = new ExcelJS.stream.xlsx.WorkbookWriter({
    filename: result.filePath,
    useStyles: true,
  });
  const ws = wb.addWorksheet('クエリ結果');

  const headerRow = ws.addRow(columns);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFD9E1F2' },
  };
  headerRow.commit();

  for (const record of records) {
    const row = ws.addRow(columns.map(col => record[col] ?? ''));
    row.commit();
  }

  for (const col of ws.columns) {
    col.width = 20;
  }

  ws.commit();
  await wb.commit();
  log.info(`[Export] Excel保存完了: ${result.filePath} (${records.length}件)`);
};

// ============================================================================
// Excel — オブジェクト定義書
// ============================================================================

const TYPE_JA: Record<string, string> = {
  id: 'ID',
  string: 'テキスト',
  textarea: '長いテキストエリア',
  email: 'メール',
  phone: '電話',
  url: 'URL',
  boolean: 'チェックボックス',
  date: '日付',
  datetime: '日付/時間',
  time: '時間',
  int: '数値(整数)',
  double: '数値(小数)',
  currency: '通貨',
  percent: 'パーセント',
  picklist: '選択リスト',
  multipicklist: '複数選択リスト',
  reference: '参照関係',
  lookup: '参照関係',
  masterdetail: '主従関係',
  base64: 'Base64',
  encryptedstring: '暗号化テキスト',
  combobox: 'コンボボックス',
  anyType: '任意型',
};

/**
 * 指定 sObject の定義書（フィールド一覧 + メタ情報）を Excel として書き出す。
 * 保存ダイアログでユーザーがキャンセルした場合は何もしない。
 * 定義書はフィールド数が高々数千なので通常の Workbook で十分（ストリーミング不要）。
 *
 * @param profileId - 対象プロファイル ID
 * @param objectName - sObject API 名（例: `Account`）
 */
export const exportObjectDefinition = async (
  profileId: string,
  objectName: string,
): Promise<void> => {
  const result = await dialog.showSaveDialog({
    title: 'オブジェクト定義書として保存',
    defaultPath: `${objectName}_definition.xlsx`,
    filters: [{ name: 'Excel', extensions: ['xlsx'] }],
  });

  if (result.canceled || !result.filePath) {
    return;
  }

  const describe = await describeObject(profileId, objectName);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('フィールド定義');

  // ヘッダー
  const headers = [
    '項目名(API)', '項目ラベル', 'データ型', '長さ', '精度', '小数桁',
    '必須', 'ユニーク', '外部ID', 'カスタム', '参照先', '選択リスト値',
  ];
  ws.addRow(headers);
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFD9E1F2' },
  };

  for (const field of describe.fields) {
    const picklistStr = field.picklistValues
      .filter(p => p.active)
      .map(p => p.value)
      .join(', ');

    ws.addRow([
      field.name,
      field.label,
      TYPE_JA[field.type] ?? field.type,
      // `||` だと length=0 / precision=0 / scale=0 が空欄になる (boolean / 整数 decimal 等)。
      // `??` で「null/undefined のときだけ空欄」に絞ることで 0 を意味のある情報として残す。
      field.length ?? '',
      field.precision ?? '',
      field.scale ?? '',
      field.nillable ? '' : '●',
      field.unique ? '●' : '',
      field.externalId ? '●' : '',
      field.custom ? '●' : '',
      field.referenceTo.join(', '),
      picklistStr,
    ]);
  }

  // 列幅調整
  const widths = [30, 30, 20, 8, 8, 8, 8, 8, 8, 8, 30, 60];
  for (let i = 0; i < ws.columns.length; i++) {
    const col = ws.columns[i];
    if (col == null) {
      continue;
    }
    col.width = widths[i] ?? 15;
  }

  // オブジェクト情報シート
  const infoWs = wb.addWorksheet('オブジェクト情報');
  infoWs.addRow(['項目', '値']);
  infoWs.getRow(1).font = { bold: true };
  infoWs.addRow(['API名', describe.name]);
  infoWs.addRow(['ラベル', describe.label]);
  infoWs.addRow(['ラベル(複数)', describe.labelPlural]);
  infoWs.addRow(['フィールド数', describe.fields.length]);
  infoWs.columns = [{ width: 20 }, { width: 40 }];

  // 単発書き出し（buffer 経由でなく writeFile で完結）
  const buffer = await wb.xlsx.writeBuffer();
  await writeFile(result.filePath, Buffer.from(buffer));
  log.info(`[Export] 定義書保存完了: ${result.filePath} (${describe.fields.length}フィールド)`);
};

// ============================================================================
// Markdown — オブジェクト定義書
// ============================================================================

// Salesforce sObject API名（標準・カスタム・namespace付き）に許可される文字パターン
const SOBJECT_NAME_PATTERN = /^[A-Za-z0-9_]+$/;

/** Markdown テーブルセル内の `|` と改行をエスケープ */
const escapeMdCell = (v: unknown): string => {
  if (v == null || v === '') {
    return '';
  }
  return String(v).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
};

/** 1 オブジェクトの定義書 Markdown 行配列を生成する（単体・一括共用） */
const buildObjectMdLines = (describe: SObjectDescribe): string[] => {
  const lines: string[] = [];
  lines.push(`# ${describe.label}（${describe.name}）`);
  lines.push('');
  lines.push('| 項目 | 値 |');
  lines.push('|---|---|');
  lines.push(`| API名 | \`${describe.name}\` |`);
  lines.push(`| ラベル | ${escapeMdCell(describe.label)} |`);
  lines.push(`| ラベル(複数) | ${escapeMdCell(describe.labelPlural)} |`);
  lines.push(`| フィールド数 | ${describe.fields.length} |`);
  lines.push('');
  lines.push('## フィールド定義');
  lines.push('');
  lines.push('| 項目名(API) | 項目ラベル | データ型 | 長さ | 必須 | ユニーク | 外部ID | カスタム | 参照先 | 選択リスト値 |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|');

  for (const field of describe.fields) {
    const picklistStr = field.picklistValues
      .filter(p => p.active)
      .map(p => p.value)
      .join(', ');

    lines.push(
      `| ${escapeMdCell(field.name)} | ${escapeMdCell(field.label)} | ${escapeMdCell(TYPE_JA[field.type] ?? field.type)} | ${field.length ?? ''} | ${field.nillable ? '' : '●'} | ${field.unique ? '●' : ''} | ${field.externalId ? '●' : ''} | ${field.custom ? '●' : ''} | ${escapeMdCell(field.referenceTo.join(', '))} | ${escapeMdCell(picklistStr)} |`,
    );
  }

  return lines;
};

/**
 * 指定 sObject の定義書を Markdown ファイルとして書き出す。
 * 保存ダイアログでユーザーがキャンセルした場合は何もしない。
 *
 * @param profileId - 対象プロファイル ID
 * @param objectName - sObject API 名（例: `Account`）
 */
export const exportObjectDefinitionMarkdown = async (
  profileId: string,
  objectName: string,
): Promise<void> => {
  const result = await dialog.showSaveDialog({
    title: 'Markdown定義書として保存',
    defaultPath: `${objectName}_definition.md`,
    filters: [{ name: 'Markdown', extensions: ['md'] }],
  });

  if (result.canceled || !result.filePath) {
    return;
  }

  const describe = await describeObject(profileId, objectName);
  await writeFile(result.filePath, buildObjectMdLines(describe).join('\n'), 'utf-8');
  log.info(`[Export] Markdown定義書保存完了: ${result.filePath} (${describe.fields.length}フィールド)`);
};

// ============================================================================
// Markdown — 複数オブジェクト一括定義書（フォルダ出力 + README.md TOC）
// ============================================================================

/**
 * 指定オブジェクト群の定義書をフォルダに一括出力する。
 * 各オブジェクトを `${objectName}.md` として書き出し、
 * `README.md` に全オブジェクトへのリンク付き TOC を生成する。
 * フォルダ選択でユーザーがキャンセルした場合は null を返す。
 *
 * @param profileId - 対象プロファイル ID
 * @param objectNames - 出力対象の sObject API 名リスト
 * @returns 成功件数と対象総数。呼び出し元は `succeeded < total` で部分失敗を検知できる
 * @throws {Error} 全件失敗した場合
 */
export const exportObjectDefinitionsMdFolder = async (
  profileId: string,
  objectNames: string[],
): Promise<ObjectDefinitionsMdFolderResult | null> => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Markdown定義書の出力先フォルダを選択',
    properties: ['openDirectory', 'createDirectory'],
  });

  if (canceled || filePaths.length === 0 || !filePaths[0]) {
    return null;
  }

  const outDir = filePaths[0];
  const total = objectNames.length;
  log.info(`[Export] Markdown一括定義書出力開始: ${total}件 → ${outDir}`);

  const tocRows: string[] = [];
  let succeeded = 0;

  // describeObject を Promise.all で並列化せず逐次実行する。多数のオブジェクトを
  // 一括選択した場合に describe API を同時多重発行すると Salesforce のレート制限
  // (REQUEST_LIMIT_EXCEEDED 等) に触れやすいため、1件ずつ確実に処理する方針とする。
  for (let i = 0; i < objectNames.length; i++) {
    const objectName = objectNames[i];
    if (!objectName) {
      continue;
    }
    // Salesforce sObject API名は英数字・アンダースコアのみ（namespace__Object__c 等含む）。
    // ファイル名として join() に渡す前に検証し、パストラバーサル文字列（../ 等）の混入を防ぐ。
    if (!SOBJECT_NAME_PATTERN.test(objectName)) {
      log.warn(`[Export] MD定義書スキップ (不正なオブジェクト名): ${objectName}`);
      continue;
    }
    try {
      const describe = await describeObject(profileId, objectName);
      await writeFile(join(outDir, `${objectName}.md`), buildObjectMdLines(describe).join('\n'), 'utf-8');
      tocRows.push(
        `| [${escapeMdCell(describe.name)}](./${describe.name}.md) | ${escapeMdCell(describe.label)} | ${describe.fields.length} | ${describe.custom ? '●' : ''} |`,
      );
      succeeded++;
      log.info(`[Export] MD定義書 ${i + 1}/${total}: ${objectName}`);
    } catch (e) {
      log.warn(`[Export] MD定義書スキップ (${objectName}): ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (succeeded === 0 && total > 0) {
    throw new Error(`Markdown定義書の出力に全件失敗しました（対象 ${total}件）`);
  }

  const now = new Date();
  const readmeLines = [
    '# Salesforce オブジェクト定義書',
    '',
    `出力日時: ${now.toLocaleString('ja-JP')}  `,
    `オブジェクト数: ${succeeded}/${total}件`,
    '',
    '| API名 | ラベル | フィールド数 | カスタム |',
    '|---|---|---|---|',
    ...tocRows,
  ];
  await writeFile(join(outDir, 'README.md'), readmeLines.join('\n'), 'utf-8');

  log.info(`[Export] Markdown一括定義書出力完了: ${succeeded}/${total}件 → ${outDir}`);
  return { succeeded, total };
};

// ============================================================================
// JSON — オブジェクト定義書
// ============================================================================

/**
 * 指定 sObject の定義書を JSON ファイルとして書き出す。
 * 保存ダイアログでユーザーがキャンセルした場合は何もしない。
 *
 * @param profileId - 対象プロファイル ID
 * @param objectName - sObject API 名（例: `Account`）
 */
export const exportObjectDefinitionJson = async (
  profileId: string,
  objectName: string,
): Promise<void> => {
  const result = await dialog.showSaveDialog({
    title: 'JSON定義書として保存',
    defaultPath: `${objectName}_definition.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });

  if (result.canceled || !result.filePath) {
    return;
  }

  const describe = await describeObject(profileId, objectName);
  await writeFile(result.filePath, JSON.stringify(describe, null, 2), 'utf-8');
  log.info(`[Export] JSON定義書保存完了: ${result.filePath} (${describe.fields.length}フィールド)`);
};
