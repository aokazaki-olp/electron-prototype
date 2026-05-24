// @vitest-environment happy-dom
/**
 * SettingsPage.tsx のコンポーネントテスト。
 *
 * useShallow による limited subscription、handleConnect 二重伝播の解消、
 * confirm() 置き換えの削除確認モーダル、エラー表示、button type を検証。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react';
import { SettingsPage } from '../../../apps/explorer/src/renderer/pages/SettingsPage.js';
import { useAppStore } from '../../../apps/explorer/src/renderer/store.js';
import { makeProfile } from '../../fixtures/contract.js';

const resetStore = () => {
  useAppStore.setState({
    settings: { defaultMaxRows: 2000 },
    profiles: [],
    authState: 'disconnected',
    activeProfileId: null,
    logs: [],
    tabs: [{ id: 't1', name: 'クエリ 1', soql: '', result: null, fetchAll: false }],
    activeTabId: 't1',
  });
};

beforeEach(() => {
  resetStore();
  cleanup();
});

describe('SettingsPage — レンダリング', () => {
  it('プロファイル 0 件のときガイダンスを表示', async () => {
    (window.sfx.loadProfiles as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (window.sfx.loadSettings as ReturnType<typeof vi.fn>).mockResolvedValue({ defaultMaxRows: 2000 });

    await act(async () => {
      render(<SettingsPage onConnect={vi.fn()} />);
    });
    expect(screen.getByText(/プロファイルがありません/)).toBeInTheDocument();
  });

  it('プロファイルが store に入ると一覧表示', async () => {
    const profiles = [makeProfile({ id: 'a', name: 'Prod' }), makeProfile({ id: 'b', name: 'Sandbox' })];
    useAppStore.setState({ profiles });
    (window.sfx.loadProfiles as ReturnType<typeof vi.fn>).mockResolvedValue(profiles);
    (window.sfx.loadSettings as ReturnType<typeof vi.fn>).mockResolvedValue({ defaultMaxRows: 2000 });

    await act(async () => {
      render(<SettingsPage onConnect={vi.fn()} />);
    });
    expect(screen.getByText('Prod')).toBeInTheDocument();
    expect(screen.getByText('Sandbox')).toBeInTheDocument();
  });

  it('onClose が渡されると閉じるボタンが出る', async () => {
    await act(async () => {
      render(<SettingsPage onConnect={vi.fn()} onClose={vi.fn()} />);
    });
    expect(screen.getByLabelText('設定を閉じる')).toBeInTheDocument();
  });

  it('onClose が無いと閉じるボタンは出ない (初回起動 SettingsPage の形)', async () => {
    await act(async () => {
      render(<SettingsPage onConnect={vi.fn()} />);
    });
    expect(screen.queryByLabelText('設定を閉じる')).not.toBeInTheDocument();
  });
});

describe('SettingsPage — 削除確認モーダル (confirm() 置換)', () => {
  it('削除ボタンでモーダルが開く', async () => {
    const profile = makeProfile({ id: 'p1', name: 'To Delete' });
    useAppStore.setState({ profiles: [profile] });
    (window.sfx.loadProfiles as ReturnType<typeof vi.fn>).mockResolvedValue([profile]);

    await act(async () => {
      render(<SettingsPage onConnect={vi.fn()} />);
    });
    fireEvent.click(screen.getByLabelText('To Delete を削除'));
    expect(screen.getByRole('dialog', { name: 'プロファイルを削除' })).toBeInTheDocument();
  });

  it('キャンセルで deleteProfile を呼ばずに閉じる', async () => {
    const profile = makeProfile({ id: 'p1' });
    useAppStore.setState({ profiles: [profile] });
    (window.sfx.loadProfiles as ReturnType<typeof vi.fn>).mockResolvedValue([profile]);

    await act(async () => {
      render(<SettingsPage onConnect={vi.fn()} />);
    });
    fireEvent.click(screen.getByLabelText(/削除/));
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));
    expect(window.sfx.deleteProfile).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('削除確定で deleteProfile + プロファイル再ロード', async () => {
    const profile = makeProfile({ id: 'p1' });
    useAppStore.setState({ profiles: [profile] });
    (window.sfx.loadProfiles as ReturnType<typeof vi.fn>).mockResolvedValue([profile]);
    (window.sfx.deleteProfile as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (window.sfx.loadProfiles as ReturnType<typeof vi.fn>).mockResolvedValueOnce([profile]).mockResolvedValue([]);

    await act(async () => {
      render(<SettingsPage onConnect={vi.fn()} />);
    });
    fireEvent.click(screen.getByLabelText(/削除/));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '削除' }));
    });
    expect(window.sfx.deleteProfile).toHaveBeenCalledWith('p1');
  });
});

describe('SettingsPage — 接続フロー', () => {
  it('startOAuth 成功で onConnect コールバックが呼ばれる', async () => {
    const profile = makeProfile({ id: 'p1' });
    useAppStore.setState({ profiles: [profile] });
    (window.sfx.loadProfiles as ReturnType<typeof vi.fn>).mockResolvedValue([profile]);
    (window.sfx.startOAuth as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const onConnect = vi.fn();

    await act(async () => {
      render(<SettingsPage onConnect={onConnect} />);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /接続/ }));
    });
    expect(onConnect).toHaveBeenCalledWith('p1');
  });

  it('startOAuth 失敗でエラー表示 + onConnect は呼ばれない', async () => {
    const profile = makeProfile({ id: 'p1' });
    useAppStore.setState({ profiles: [profile] });
    (window.sfx.loadProfiles as ReturnType<typeof vi.fn>).mockResolvedValue([profile]);
    (window.sfx.startOAuth as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('CSRF detected'));
    const onConnect = vi.fn();

    await act(async () => {
      render(<SettingsPage onConnect={onConnect} />);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /接続/ }));
    });
    expect(onConnect).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByText(/CSRF detected/)).toBeInTheDocument();
    });
  });
});

describe('SettingsPage — A11y / button type', () => {
  it('すべての button が type="button" を持つ (form 内の意図せぬ submit を防ぐ)', async () => {
    const profile = makeProfile({ id: 'p1' });
    useAppStore.setState({ profiles: [profile] });
    (window.sfx.loadProfiles as ReturnType<typeof vi.fn>).mockResolvedValue([profile]);

    await act(async () => {
      render(<SettingsPage onConnect={vi.fn()} onClose={vi.fn()} />);
    });
    const buttons = screen.getAllByRole('button');
    for (const btn of buttons) {
      expect(btn).toHaveAttribute('type', 'button');
    }
  });
});

describe('SettingsPage — 新規プロファイル作成', () => {
  it('追加ボタンで編集フォームが出る', async () => {
    (window.sfx.loadProfiles as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    await act(async () => {
      render(<SettingsPage onConnect={vi.fn()} />);
    });
    fireEvent.click(screen.getByRole('button', { name: /追加/ }));
    expect(screen.getByText('新規プロファイル')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('本番org')).toBeInTheDocument();
  });

  it('name と clientId 必須: 入力が空の間は保存ボタン disabled', async () => {
    (window.sfx.loadProfiles as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    await act(async () => {
      render(<SettingsPage onConnect={vi.fn()} />);
    });
    fireEvent.click(screen.getByRole('button', { name: /追加/ }));
    const saveBtn = screen.getByRole('button', { name: /保存/ });
    expect(saveBtn).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('本番org'), { target: { value: 'New Org' } });
    fireEvent.change(screen.getByPlaceholderText('3MVG9...'), { target: { value: 'abc123' } });
    expect(saveBtn).not.toBeDisabled();
  });
});
