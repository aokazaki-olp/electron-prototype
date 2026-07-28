// @vitest-environment happy-dom
/**
 * SObjectBrowser.tsx のコンポーネントテスト。
 * - 検索 filter (useMemo)
 * - 一覧読み込み エラー表示
 * - 定義書出力 エラー表示
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react';
import { SObjectBrowser } from '../../../apps/explorer/src/renderer/components/SObjectBrowser.js';
import { ToastContainer } from '../../../apps/explorer/src/renderer/components/Toast.js';
import { useAppStore } from '../../../apps/explorer/src/renderer/store.js';
import { makeSObjectSummary, makeSObjectDescribe } from '../../fixtures/contract.js';

const resetStore = () => {
  useAppStore.setState({
    sobjects: [],
    selectedObject: null,
    sobjectsLoading: false,
    tabs: [{ id: 't1', name: 'クエリ 1', soql: '', result: null, fetchAll: false }],
    activeTabId: 't1',
  });
};

beforeEach(() => {
  resetStore();
  cleanup();
});

// toast 表示は store ベースで Provider 不要。表示確認用に ToastContainer をペアで mount する。
const renderBrowser = () => render(
  <>
    <SObjectBrowser />
    <ToastContainer />
  </>,
);

describe('SObjectBrowser — 初期表示と読み込み', () => {
  it('マウント時に listSObjects を呼ぶ (sobjects が空のとき)', async () => {
    (window.sfx.listSObjects as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeSObjectSummary({ name: 'Account', label: 'アカウント' }),
    ]);

    await act(async () => {
      renderBrowser();
    });

    await waitFor(() => {
      expect(window.sfx.listSObjects).toHaveBeenCalled();
    });
  });

  it('listSObjects 失敗で role=alert を表示', async () => {
    (window.sfx.listSObjects as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('API down'));

    await act(async () => {
      renderBrowser();
    });
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('API down');
    });
  });
});

describe('SObjectBrowser — 検索フィルタ', () => {
  beforeEach(() => {
    useAppStore.setState({
      sobjects: [
        makeSObjectSummary({ name: 'Account', label: 'アカウント' }),
        makeSObjectSummary({ name: 'Contact', label: '取引先責任者' }),
        makeSObjectSummary({ name: 'Opportunity', label: '商談' }),
      ],
    });
  });

  it('label の部分一致でフィルタ', async () => {
    (window.sfx.listSObjects as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    await act(async () => {
      renderBrowser();
    });
    fireEvent.change(screen.getByLabelText('オブジェクト検索'), { target: { value: '取引' } });
    expect(screen.getByText('取引先責任者')).toBeInTheDocument();
    expect(screen.queryByText('アカウント')).not.toBeInTheDocument();
  });

  it('name (API 名) の部分一致でも引っかかる', async () => {
    (window.sfx.listSObjects as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    await act(async () => {
      renderBrowser();
    });
    fireEvent.change(screen.getByLabelText('オブジェクト検索'), { target: { value: 'opp' } });
    expect(screen.getByText('商談')).toBeInTheDocument();
    expect(screen.queryByText('アカウント')).not.toBeInTheDocument();
  });

  it('検索クリアで全件再表示', async () => {
    (window.sfx.listSObjects as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    await act(async () => {
      renderBrowser();
    });
    const input = screen.getByLabelText('オブジェクト検索');
    fireEvent.change(input, { target: { value: 'opp' } });
    fireEvent.change(input, { target: { value: '' } });
    expect(screen.getByText('アカウント')).toBeInTheDocument();
    expect(screen.getByText('商談')).toBeInTheDocument();
  });
});

describe('SObjectBrowser — 一括MD出力', () => {
  beforeEach(() => {
    useAppStore.setState({
      sobjects: [
        makeSObjectSummary({ name: 'Account', label: 'アカウント' }),
        makeSObjectSummary({ name: 'Contact', label: '取引先責任者' }),
      ],
    });
  });

  const clickMdFolderButton = async () => {
    await waitFor(() => {
      expect(screen.getByLabelText('フィルタ結果をMarkdown定義書として一括出力')).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByLabelText('フィルタ結果をMarkdown定義書として一括出力'));
    });
  };

  it('一部失敗した場合はトーストで通知する', async () => {
    (window.sfx.listSObjects as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (window.sfx.exportObjectDefinitionsMdFolder as ReturnType<typeof vi.fn>).mockResolvedValue({
      succeeded: 1,
      total: 2,
    });

    await act(async () => {
      renderBrowser();
    });
    await clickMdFolderButton();

    await waitFor(() => {
      expect(screen.getByText(/1\/2件のみ成功/)).toBeInTheDocument();
    });
  });

  it('全件成功した場合はトーストを出さない', async () => {
    (window.sfx.listSObjects as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (window.sfx.exportObjectDefinitionsMdFolder as ReturnType<typeof vi.fn>).mockResolvedValue({
      succeeded: 2,
      total: 2,
    });

    await act(async () => {
      renderBrowser();
    });
    await clickMdFolderButton();

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('ダイアログをキャンセル (null) した場合はトーストを出さない', async () => {
    (window.sfx.listSObjects as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (window.sfx.exportObjectDefinitionsMdFolder as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await act(async () => {
      renderBrowser();
    });
    await clickMdFolderButton();

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('例外発生時はトーストで通知する', async () => {
    (window.sfx.listSObjects as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (window.sfx.exportObjectDefinitionsMdFolder as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('disk full'),
    );

    await act(async () => {
      renderBrowser();
    });
    await clickMdFolderButton();

    await waitFor(() => {
      expect(screen.getByText(/一括MD定義書出力に失敗しました.*disk full/)).toBeInTheDocument();
    });
  });
});

describe('SObjectBrowser — 定義書出力エラー', () => {
  it('exportObjectDefinition 失敗で alert 表示', async () => {
    const sobj = makeSObjectSummary({ name: 'Account', label: 'アカウント' });
    useAppStore.setState({
      sobjects: [sobj],
      selectedObject: 'Account',
    });
    (window.sfx.listSObjects as ReturnType<typeof vi.fn>).mockResolvedValue([sobj]);
    (window.sfx.describeObject as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSObjectDescribe({ name: 'Account' }),
    );
    (window.sfx.exportObjectDefinition as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('disk full'));

    await act(async () => {
      renderBrowser();
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Excel' })).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Excel' }));
    });
    await waitFor(() => {
      expect(screen.getByText(/disk full/)).toBeInTheDocument();
    });
  });
});
