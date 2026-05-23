/**
 * export.ts
 * @description CSV・Excel出力（保存ダイアログ付き）
 */

import { dialog } from 'electron';
import { writeFile } from 'node:fs/promises';
import { stringify } from 'csv-stringify/sync';
import ExcelJS from 'exceljs';
import { log } from './logger.js';
import { describeObject } from './sfApi.js';
import type { CsvExportOptions, FieldDescribe } from '../ipc/contract.js';

// ============================================================================
// CSV
// ============================================================================

export const toCsvBuffer = (
  records: Record<string, unknown>[],
  columns: string[],
  options: CsvExportOptions,
): Buffer => {
  const rows = [
    columns,
    ...records.map(r => columns.map(col => r[col] ?? '')),
  ];

  const csv = stringify(rows, {
    record_delimiter: options.lineEnding === 'CRLF' ? '\r\n' : '\n',
    cast: {
      object: (v) => v == null ? '' : String(v),
      number: (v) => Number.isFinite(v) ? String(v) : '',
    },
  });

  const content = options.bom ? '\uFEFF' + csv : csv;
  return Buffer.from(content, 'utf-8');
};

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

  const buffer = toCsvBuffer(records, columns, options);
  await writeFile(result.filePath, buffer);
  log.info(`[Export] CSV保存完了: ${result.filePath} (${records.length}件)`);
};

// ============================================================================
// Excel — クエリ結果
// ============================================================================

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

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('クエリ結果');

  ws.addRow(columns);
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFD9E1F2' },
  };

  for (const record of records) {
    ws.addRow(columns.map(col => record[col] ?? ''));
  }

  ws.columns.forEach(col => {
    col.width = 20;
  });

  await wb.xlsx.writeFile(result.filePath);
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
      field.length || '',
      field.precision || '',
      field.scale || '',
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
  ws.columns.forEach((col, i) => {
    col.width = widths[i] ?? 15;
  });

  // オブジェクト情報シート
  const infoWs = wb.addWorksheet('オブジェクト情報');
  infoWs.addRow(['項目', '値']);
  infoWs.getRow(1).font = { bold: true };
  infoWs.addRow(['API名', describe.name]);
  infoWs.addRow(['ラベル', describe.label]);
  infoWs.addRow(['ラベル(複数)', describe.labelPlural]);
  infoWs.addRow(['フィールド数', describe.fields.length]);
  infoWs.columns = [{ width: 20 }, { width: 40 }];

  await wb.xlsx.writeFile(result.filePath);
  log.info(`[Export] 定義書保存完了: ${result.filePath} (${describe.fields.length}フィールド)`);
};
