/**
 * JsonViewer.tsx
 * @description react-json-view-lite を使い、単一レスポンスをシンタックスハイライト付きで表示する。
 */

import type { JSX } from 'react';
import { JsonView, darkStyles } from 'react-json-view-lite';
import 'react-json-view-lite/dist/index.css';

export const JsonViewer = ({ data }: { data: unknown }): JSX.Element => {
  const json: object =
    typeof data === 'object' && data !== null ? data : { value: data };
  return (
    <div className="rounded overflow-x-auto max-h-96 text-xs">
      <JsonView data={json} shouldExpandNode={() => true} style={darkStyles} />
    </div>
  );
};
