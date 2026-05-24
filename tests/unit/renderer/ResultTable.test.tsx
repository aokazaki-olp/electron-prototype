// @vitest-environment happy-dom
/**
 * ResultTable.tsx のコンポーネントテスト。
 *
 * 結果なし / 大量行 / ソート / フィルタ debounce / モーダル A11y を含む。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { ResultTable } from '../../../apps/explorer/src/renderer/components/ResultTable.js';
import { ToastContainer } from '../../../apps/explorer/src/renderer/components/Toast.js';
import { useAppStore } from '../../../apps/explorer/src/renderer/store.js';
import { makeQueryResult } from '../../fixtures/contract.js';
import type { QueryResult } from '@app/ipc-contract';

// ResultTable は store の queryLoading を購読するようになったので、各テストで明示的に false に戻す
beforeEach(() => {
  cleanup();
  useAppStore.setState({ queryLoading: false });
});

// toast 表示確認には ToastContainer をペアで mount する必要がある（store ベースなので Provider 不要）
const renderTable = (result: QueryResult | null) => render(
  <>
    <ResultTable result={result} />
    <ToastContainer />
  </>,
);

describe('ResultTable — レンダリング', () => {
  it('result=null の場合はプレースホルダ表示', () => {
    renderTable(null);
    expect(screen.getByText(/SOQLを実行すると結果が表示されます/)).toBeInTheDocument();
  });

  it('レコードがある場合は件数表示 + テーブルヘッダ + ボタン', () => {
    const result = makeQueryResult({
      totalSize: 2, fetchedCount: 2,
      records: [
        { Id: '001', Name: 'Acme' },
        { Id: '002', Name: 'Globex' },
      ],
    });
    renderTable(result);

    expect(screen.getByText(/2件取得/)).toBeInTheDocument();
    expect(screen.getByText('Id')).toBeInTheDocument();
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /CSV/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Excel/ })).toBeInTheDocument();
  });

  it('totalSize > fetchedCount で「全体」表示', () => {
    const result = makeQueryResult({
      totalSize: 100, fetchedCount: 50,
      records: Array.from({ length: 50 }, (_, i) => ({ Id: `r${i}` })),
    });
    renderTable(result);
    expect(screen.getByText(/全体: 100件/)).toBeInTheDocument();
  });

  it('null 値は "null" として表示', () => {
    const result = makeQueryResult({
      totalSize: 1, fetchedCount: 1,
      records: [{ Id: '001', Name: null }],
    });
    renderTable(result);
    expect(screen.getByText('null')).toBeInTheDocument();
  });

  it('object 値は "[object]" として表示', () => {
    const result = makeQueryResult({
      totalSize: 1, fetchedCount: 1,
      records: [{ Id: '001', Meta: { x: 1 } }],
    });
    renderTable(result);
    expect(screen.getByText('[object]')).toBeInTheDocument();
  });
});

describe('ResultTable — CSV エクスポートダイアログ', () => {
  it('CSV ボタンでモーダルが開く', () => {
    const result = makeQueryResult({ totalSize: 1, fetchedCount: 1, records: [{ a: 1 }] });
    renderTable(result);

    fireEvent.click(screen.getByRole('button', { name: /CSV/ }));
    expect(screen.getByRole('dialog', { name: 'CSV エクスポート設定' })).toBeInTheDocument();
    expect(screen.getByText(/BOM を付与する/)).toBeInTheDocument();
  });

  it('Esc キーでモーダルを閉じる (a11y)', () => {
    const result = makeQueryResult({ totalSize: 1, fetchedCount: 1, records: [{ a: 1 }] });
    renderTable(result);

    fireEvent.click(screen.getByRole('button', { name: /CSV/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('キャンセルボタンでモーダルを閉じる', () => {
    const result = makeQueryResult({ totalSize: 1, fetchedCount: 1, records: [{ a: 1 }] });
    renderTable(result);

    fireEvent.click(screen.getByRole('button', { name: /CSV/ }));
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('改行コードを LF に切り替えできる', () => {
    const result = makeQueryResult({ totalSize: 1, fetchedCount: 1, records: [{ a: 1 }] });
    renderTable(result);

    fireEvent.click(screen.getByRole('button', { name: /CSV/ }));
    const lfRadio = screen.getByRole('radio', { name: 'LF' });
    fireEvent.click(lfRadio);
    expect(lfRadio).toBeChecked();
  });
});

describe('ResultTable — エラーハンドリング', () => {
  it('exportCsv の失敗で role=alert が出る', async () => {
    const result = makeQueryResult({ totalSize: 1, fetchedCount: 1, records: [{ a: 1 }] });
    (window.sfx.exportCsv as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('write failed'));
    renderTable(result);

    fireEvent.click(screen.getByRole('button', { name: /CSV/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '保存' }));
    });
    expect(screen.getByRole('alert')).toHaveTextContent(/write failed/);
  });

  it('Excel エクスポートの失敗で role=alert が出る', async () => {
    const result = makeQueryResult({ totalSize: 1, fetchedCount: 1, records: [{ a: 1 }] });
    (window.sfx.exportQueryExcel as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('xlsx failed'));
    renderTable(result);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Excel/ }));
    });
    expect(screen.getByRole('alert')).toHaveTextContent(/xlsx failed/);
  });
});

describe('ResultTable — 実行中 (queryLoading)', () => {
  it('queryLoading=true かつ result=null で skeleton + 経過秒数バーを表示', () => {
    useAppStore.setState({ queryLoading: true });
    renderTable(null);
    expect(screen.getByTestId('result-skeleton')).toBeInTheDocument();
    // 経過秒数バー（toolbar の「実行中...」とは別）。起動直後は 0 秒。
    expect(screen.getByText(/実行中\.\.\. 0秒経過/)).toBeInTheDocument();
    // 空状態スニペットは表示しない
    expect(screen.queryByText(/SOQLを実行すると結果が表示されます/)).not.toBeInTheDocument();
  });

  it('queryLoading=true かつ既存 result あり で既存テーブルを skeleton で覆う', () => {
    useAppStore.setState({ queryLoading: true });
    const result = makeQueryResult({
      totalSize: 1, fetchedCount: 1, records: [{ Id: '001', Name: 'Old' }],
    });
    renderTable(result);
    // 旧テーブルの値は隠れている
    expect(screen.queryByText('Old')).not.toBeInTheDocument();
    expect(screen.getByTestId('result-skeleton')).toBeInTheDocument();
  });
});

describe('ResultTable — フィルタ debounce', () => {
  it('入力直後はフィルタ未反映、200ms 後に反映', async () => {
    vi.useFakeTimers();
    const result = makeQueryResult({
      totalSize: 2, fetchedCount: 2,
      records: [{ Id: '001', Name: 'Acme' }, { Id: '002', Name: 'Globex' }],
    });
    renderTable(result);

    fireEvent.change(screen.getByLabelText('結果テーブルをフィルタ'), {
      target: { value: 'Acme' },
    });

    // debounce 前: 両方残る
    expect(screen.getByText('Acme')).toBeInTheDocument();
    expect(screen.getByText('Globex')).toBeInTheDocument();

    // 200ms 経過
    await act(async () => {
      vi.advanceTimersByTime(250);
    });

    // debounce 後: Globex は filter で消える
    expect(screen.getByText('Acme')).toBeInTheDocument();
    expect(screen.queryByText('Globex')).not.toBeInTheDocument();
    vi.useRealTimers();
  });
});
