// @vitest-environment happy-dom
/**
 * SoqlEditor.tsx のコンポーネントテスト。
 * - タブ管理 (追加・閉じる・rename・切替)
 * - エラー表示
 * - localStorage は使わない (CODING_RULES §7.3)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react';
import { SoqlEditor } from '../../../apps/explorer/src/renderer/components/SoqlEditor.js';
import { useAppStore } from '../../../apps/explorer/src/renderer/store.js';

// @uiw/react-codemirror は重い + happy-dom で動かないため、軽量モックする
vi.mock('@uiw/react-codemirror', () => ({
  default: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea
      data-testid="cm-editor"
      value={value}
      onChange={e => onChange(e.target.value)}
    />
  ),
}));

const resetStore = () => {
  useAppStore.setState({
    tabs: [{ id: 't1', name: 'クエリ 1', soql: '', result: null, fetchAll: false }],
    activeTabId: 't1',
    queryLoading: false,
    runTrigger: 0,
  });
};

beforeEach(() => {
  resetStore();
  cleanup();
});

describe('SoqlEditor — タブバー', () => {
  it('初期表示でデフォルトタブが 1 件あり、追加ボタンを持つ', () => {
    render(<SoqlEditor settings={{ defaultMaxRows: 2000 }} />);
    expect(screen.getByText('クエリ 1')).toBeInTheDocument();
    expect(screen.getByLabelText('新しいタブを追加')).toBeInTheDocument();
  });

  it('追加ボタンでタブが増える', () => {
    render(<SoqlEditor settings={{ defaultMaxRows: 2000 }} />);
    fireEvent.click(screen.getByLabelText('新しいタブを追加'));
    expect(useAppStore.getState().tabs).toHaveLength(2);
    expect(screen.getByText('クエリ 2')).toBeInTheDocument();
  });

  it('タブが 2 件以上のとき閉じるボタンが出る', () => {
    useAppStore.setState({
      tabs: [
        { id: 't1', name: 'A', soql: '', result: null, fetchAll: false },
        { id: 't2', name: 'B', soql: '', result: null, fetchAll: false },
      ],
      activeTabId: 't1',
    });
    render(<SoqlEditor settings={{ defaultMaxRows: 2000 }} />);
    expect(screen.getByLabelText('A を閉じる')).toBeInTheDocument();
    expect(screen.getByLabelText('B を閉じる')).toBeInTheDocument();
  });

  it('タブが 1 件のとき閉じるボタンは出ない', () => {
    render(<SoqlEditor settings={{ defaultMaxRows: 2000 }} />);
    expect(screen.queryByLabelText(/閉じる/)).not.toBeInTheDocument();
  });

  it('タブクリックで activeTabId が切り替わる', () => {
    useAppStore.setState({
      tabs: [
        { id: 't1', name: 'A', soql: '', result: null, fetchAll: false },
        { id: 't2', name: 'B', soql: '', result: null, fetchAll: false },
      ],
      activeTabId: 't1',
    });
    render(<SoqlEditor settings={{ defaultMaxRows: 2000 }} />);
    fireEvent.click(screen.getByText('B'));
    expect(useAppStore.getState().activeTabId).toBe('t2');
  });

  it('aria-selected がアクティブタブに付与される', () => {
    useAppStore.setState({
      tabs: [
        { id: 't1', name: 'A', soql: '', result: null, fetchAll: false },
        { id: 't2', name: 'B', soql: '', result: null, fetchAll: false },
      ],
      activeTabId: 't1',
    });
    render(<SoqlEditor settings={{ defaultMaxRows: 2000 }} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[1]).toHaveAttribute('aria-selected', 'false');
  });
});

describe('SoqlEditor — クエリ実行', () => {
  it('「実行」ボタンで window.sfx.query が呼ばれる', async () => {
    useAppStore.setState({
      tabs: [{ id: 't1', name: 'A', soql: 'SELECT Id FROM Account', result: null, fetchAll: false }],
      activeTabId: 't1',
    });
    (window.sfx.query as ReturnType<typeof vi.fn>).mockResolvedValue({
      totalSize: 0, done: true, records: [], fetchedCount: 0,
    });

    render(<SoqlEditor settings={{ defaultMaxRows: 2000 }} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /実行/ }));
    });
    expect(window.sfx.query).toHaveBeenCalledWith('SELECT Id FROM Account', 2000);
  });

  it('クエリ失敗で role=alert + rendererLog 呼び出し', async () => {
    useAppStore.setState({
      tabs: [{ id: 't1', name: 'A', soql: 'SELECT Id FROM Account', result: null, fetchAll: false }],
      activeTabId: 't1',
    });
    (window.sfx.query as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('soql error'));

    render(<SoqlEditor settings={{ defaultMaxRows: 2000 }} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /実行/ }));
    });
    expect(screen.getByRole('alert')).toHaveTextContent('soql error');
    expect(window.sfx.rendererLog).toHaveBeenCalledWith('error', expect.stringContaining('soql error'));
  });

  it('SOQL が空 (trim 後) なら実行ボタン disabled', () => {
    useAppStore.setState({
      tabs: [{ id: 't1', name: 'A', soql: '   ', result: null, fetchAll: false }],
      activeTabId: 't1',
    });
    render(<SoqlEditor settings={{ defaultMaxRows: 2000 }} />);
    expect(screen.getByRole('button', { name: /実行/ })).toBeDisabled();
  });

  it('fetchAll チェックで maxRows=0 で呼ばれる', async () => {
    useAppStore.setState({
      tabs: [{ id: 't1', name: 'A', soql: 'SELECT Id FROM Account', result: null, fetchAll: true }],
      activeTabId: 't1',
    });
    (window.sfx.query as ReturnType<typeof vi.fn>).mockResolvedValue({
      totalSize: 0, done: true, records: [], fetchedCount: 0,
    });

    render(<SoqlEditor settings={{ defaultMaxRows: 2000 }} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /実行/ }));
    });
    expect(window.sfx.query).toHaveBeenCalledWith('SELECT Id FROM Account', 0);
  });
});

describe('SoqlEditor — ファイル操作', () => {
  it('「保存」ボタンで saveSoqlFile を呼ぶ', async () => {
    useAppStore.setState({
      tabs: [{ id: 't1', name: 'マイクエリ', soql: 'SELECT Id FROM Account', result: null, fetchAll: false }],
      activeTabId: 't1',
    });
    (window.sfx.saveSoqlFile as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    render(<SoqlEditor settings={{ defaultMaxRows: 2000 }} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /保存/ }));
    });
    expect(window.sfx.saveSoqlFile).toHaveBeenCalledWith('SELECT Id FROM Account', 'マイクエリ');
  });

  it('「開く」で openSoqlFile 結果から addTabWithContent', async () => {
    (window.sfx.openSoqlFile as ReturnType<typeof vi.fn>).mockResolvedValue({
      name: '読み込みクエリ',
      soql: 'SELECT Id FROM Lead',
    });
    render(<SoqlEditor settings={{ defaultMaxRows: 2000 }} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /開く/ }));
    });
    await waitFor(() => {
      expect(useAppStore.getState().tabs.find(t => t.name === '読み込みクエリ')).toBeDefined();
    });
  });

  it('ファイル保存失敗でエラー表示', async () => {
    useAppStore.setState({
      tabs: [{ id: 't1', name: 'A', soql: 'SELECT Id FROM Account', result: null, fetchAll: false }],
      activeTabId: 't1',
    });
    (window.sfx.saveSoqlFile as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('disk full'));

    render(<SoqlEditor settings={{ defaultMaxRows: 2000 }} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /保存/ }));
    });
    expect(screen.getByRole('alert')).toHaveTextContent('disk full');
  });
});

describe('SoqlEditor — localStorage 不使用 (§7.3)', () => {
  it('マウント時に localStorage.getItem を呼ばない', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem');
    render(<SoqlEditor settings={{ defaultMaxRows: 2000 }} />);
    expect(spy).not.toHaveBeenCalledWith('sfx-soql-tabs');
    spy.mockRestore();
  });

  it('タブ変更時に localStorage.setItem を呼ばない', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem');
    render(<SoqlEditor settings={{ defaultMaxRows: 2000 }} />);
    fireEvent.click(screen.getByLabelText('新しいタブを追加'));
    expect(spy).not.toHaveBeenCalledWith('sfx-soql-tabs', expect.any(String));
    spy.mockRestore();
  });
});
