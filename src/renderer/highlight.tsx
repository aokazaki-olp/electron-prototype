/**
 * highlight.tsx
 * @description テーブルセル内の検索ワードをハイライトするユーティリティ。
 */

import type { JSX } from 'react';

const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * text 内の query にマッチする部分を <mark> で囲んだ JSX を返す。
 * query が空の場合はそのままテキストノードを返す。
 */
export const highlightText = (text: string, query: string, caseSensitive: boolean): JSX.Element => {
  if (!query) return <>{text}</>;
  const parts = text.split(new RegExp(`(${escapeRegex(query)})`, caseSensitive ? 'g' : 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="bg-yellow-200 text-slate-900 rounded-sm">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
};

/** text が query を含むかどうかを返す（ページをまたいだ一致数カウント用）。 */
export const testMatch = (text: string, query: string, caseSensitive: boolean): boolean => {
  if (!query) return false;
  return new RegExp(escapeRegex(query), caseSensitive ? '' : 'i').test(text);
};
