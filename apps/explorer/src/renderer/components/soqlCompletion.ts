/**
 * soqlCompletion.ts
 * @description CodeMirror 用の SOQL 補完ソース。
 *   SELECT / FROM 位置を解析して、それぞれフィールド名と sObject 名を優先候補に出す。
 *   常時候補として SF 予約語・関数・日付リテラルも投入する。
 *
 *   補完ソースはピュア関数として書き、useReactStore からの最新スナップショットを毎回参照する。
 *   こうすることで CodeMirror 拡張をレンダ毎に作り直さなくて済む（CM_EXTENSIONS と同じ理由）。
 */
import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { useAppStore } from '../store.js';

// SOQL 予約語。SOQL は SQL のサブセットで、これ以外のキーワード (e.g. JOIN, UNION) は許されない。
const SOQL_KEYWORDS: readonly string[] = [
  'SELECT', 'FROM', 'WHERE', 'WITH', 'GROUP BY', 'HAVING', 'ORDER BY',
  'LIMIT', 'OFFSET', 'FOR UPDATE', 'FOR VIEW', 'FOR REFERENCE',
  'TYPEOF', 'WHEN', 'THEN', 'ELSE', 'END', 'USING SCOPE',
  'AND', 'OR', 'NOT', 'IN', 'LIKE', 'NULL', 'TRUE', 'FALSE',
  'ASC', 'DESC', 'NULLS FIRST', 'NULLS LAST',
];

// 集約関数 + 日付関数 + その他組み込み
const SOQL_FUNCTIONS: readonly string[] = [
  'COUNT', 'COUNT_DISTINCT', 'MIN', 'MAX', 'SUM', 'AVG',
  'CALENDAR_YEAR', 'CALENDAR_MONTH', 'CALENDAR_QUARTER',
  'DAY_IN_MONTH', 'DAY_IN_WEEK', 'DAY_IN_YEAR',
  'FISCAL_YEAR', 'FISCAL_QUARTER',
  'HOUR_IN_DAY', 'WEEK_IN_MONTH', 'WEEK_IN_YEAR',
  'FORMAT', 'CONVERTCURRENCY',
  'INCLUDES', 'EXCLUDES',
  'DISTANCE', 'GEOLOCATION',
];

// 日付リテラル (Salesforce 独自の動的日付値)
const DATE_LITERALS: readonly string[] = [
  'YESTERDAY', 'TODAY', 'TOMORROW',
  'LAST_WEEK', 'THIS_WEEK', 'NEXT_WEEK',
  'LAST_MONTH', 'THIS_MONTH', 'NEXT_MONTH',
  'LAST_90_DAYS', 'NEXT_90_DAYS',
  'LAST_N_DAYS:N', 'NEXT_N_DAYS:N',
  'LAST_N_WEEKS:N', 'NEXT_N_WEEKS:N',
  'LAST_N_MONTHS:N', 'NEXT_N_MONTHS:N',
  'LAST_QUARTER', 'THIS_QUARTER', 'NEXT_QUARTER',
  'LAST_FISCAL_YEAR', 'THIS_FISCAL_YEAR', 'NEXT_FISCAL_YEAR',
  'LAST_FISCAL_QUARTER', 'THIS_FISCAL_QUARTER', 'NEXT_FISCAL_QUARTER',
];

const toCompletion = (type: Completion['type']) => (label: string): Completion => ({
  label,
  type,
});

const KEYWORD_COMPLETIONS = SOQL_KEYWORDS.map(toCompletion('keyword'));
const FUNCTION_COMPLETIONS = SOQL_FUNCTIONS.map(toCompletion('function'));
const DATE_LITERAL_COMPLETIONS = DATE_LITERALS.map(toCompletion('constant'));

/**
 * カーソル位置までの SOQL を解析して「SELECT 句のフィールド位置」「FROM 直後の sObject 位置」を雑に判定する。
 * 副問い合わせまで含めて厳密にパースしない (CodeMirror の lang-sql は SOQL を理解しないため、ヒューリスティック)。
 *
 * @param textBeforeCursor - カーソル直前までのテキスト
 * @returns 推定したコンテキスト
 */
export type SoqlPosition = 'select' | 'from' | 'other';

export const detectSoqlPosition = (textBeforeCursor: string): SoqlPosition => {
  const upper = textBeforeCursor.toUpperCase();
  // 最後に出てきた SELECT / FROM の位置でざっくり分類する。
  const lastSelect = upper.lastIndexOf('SELECT');
  const lastFrom = upper.lastIndexOf('FROM');
  const lastWhere = upper.lastIndexOf('WHERE');

  if (lastFrom > lastSelect && lastFrom > lastWhere) {
    return 'from';
  }
  if (lastSelect >= 0 && (lastFrom < 0 || lastSelect > lastFrom)) {
    return 'select';
  }
  return 'other';
};

/**
 * SoqlEditor から渡される describe / sobjects は時刻変動するため、毎回 store のスナップショットを取る。
 * CodeMirror 拡張の reconfigure を避けるため、補完ソースは引数なし。
 */
export const soqlCompletionSource = (context: CompletionContext): CompletionResult | null => {
  const match = context.matchBefore(/[A-Za-z_][A-Za-z0-9_]*/);
  if (!match) return null;
  // 明示トリガでない & 空 token のときは何も出さない（過剰なポップアップを避ける）
  if (match.from === match.to && !context.explicit) return null;

  const textBefore = context.state.doc.sliceString(0, context.pos);
  const position = detectSoqlPosition(textBefore);

  const store = useAppStore.getState();
  const fields = store.selectedObjectDescribe?.fields ?? [];
  const sobjects = store.sobjects;

  const options: Completion[] = [];

  if (position === 'from') {
    // FROM 直後 → sObject 名を優先
    for (const o of sobjects) {
      options.push({ label: o.name, type: 'class', detail: o.label });
    }
  } else if (position === 'select') {
    // SELECT 句 → 選択中 sObject のフィールド名を優先
    for (const f of fields) {
      options.push({ label: f.name, type: 'property', detail: `${f.type}${f.label !== f.name ? ` · ${f.label}` : ''}` });
    }
    // 関数も SELECT 句で使えるので追加
    options.push(...FUNCTION_COMPLETIONS);
  } else {
    // WHERE 等の他位置でもフィールド名と関数を候補に
    for (const f of fields) {
      options.push({ label: f.name, type: 'property', detail: f.type });
    }
    options.push(...FUNCTION_COMPLETIONS);
    options.push(...DATE_LITERAL_COMPLETIONS);
  }

  // 予約語は常時末尾に
  options.push(...KEYWORD_COMPLETIONS);

  return {
    from: match.from,
    options,
    validFor: /^[A-Za-z_][A-Za-z0-9_]*$/,
  };
};
