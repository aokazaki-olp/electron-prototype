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
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import ExcelJS from 'exceljs';
import { log } from './logger.js';
import { describeObject } from './sfApi.js';
import type { CsvExportOptions, SObjectDescribe } from '@app/ipc-contract';

// stringify (sync) は単体テストで使う公開 API のため import を残す
void stringify;

// ============================================================================
// CSV
// ============================================================================

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
    ...records.map(r => columns.map(col => r[col] ?? '')),
  ];

  const csv = stringifySync(rows, {
    record_delimiter: options.lineEnding === 'CRLF' ? '\r\n' : '\n',
    cast: {
      object: (v: unknown) => v == null ? '' : String(v),
      number: (v) => Number.isFinite(v) ? String(v) : '',
    },
  });

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
    record_delimiter: options.lineEnding === 'CRLF' ? '\r\n' : '\n',
    cast: {
      object: (v: unknown) => v == null ? '' : String(v),
      number: (v) => Number.isFinite(v) ? String(v) : '',
    },
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
const escMd = (v: unknown): string => {
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
  lines.push(`| ラベル | ${escMd(describe.label)} |`);
  lines.push(`| ラベル(複数) | ${escMd(describe.labelPlural)} |`);
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
      `| ${escMd(field.name)} | ${escMd(field.label)} | ${escMd(TYPE_JA[field.type] ?? field.type)} | ${field.length ?? ''} | ${field.nillable ? '' : '●'} | ${field.unique ? '●' : ''} | ${field.externalId ? '●' : ''} | ${field.custom ? '●' : ''} | ${escMd(field.referenceTo.join(', '))} | ${escMd(picklistStr)} |`,
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
): Promise<{ succeeded: number; total: number } | null> => {
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
        `| [${escMd(describe.name)}](./${describe.name}.md) | ${escMd(describe.label)} | ${describe.fields.length} | ${describe.custom ? '●' : ''} |`,
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
