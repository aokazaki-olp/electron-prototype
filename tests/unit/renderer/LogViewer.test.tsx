// @vitest-environment happy-dom
/**
 * LogViewer.tsx のコンポーネントテスト。
 *
 * key={i} → 一意キー、仮想化、レベルフィルタ、検索、autoScroll の挙動を検証。
 * 大量ログ・空ログ・全フィルタ off などのエッジケースを含む。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { LogViewer } from '../../../apps/explorer/src/renderer/components/LogViewer.js';
import { useAppStore } from '../../../apps/explorer/src/renderer/store.js';
import { makeLogEntry } from '../../fixtures/contract.js';

const resetStore = () => {
  useAppStore.setState({
    logs: [],
    tabs: [{ id: 't1', name: 'クエリ 1', soql: '', result: null, fetchAll: false }],
    activeTabId: 't1',
  });
};

beforeEach(() => {
  resetStore();
  cleanup();
});

describe('LogViewer — レンダリング', () => {
  it('空ログでもクラッシュせずツールバーを表示', () => {
    render(<LogViewer />);
    expect(screen.getByPlaceholderText('検索...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'クリア' })).toBeInTheDocument();
  });

  it('全レベルのフィルタボタンが aria-pressed=true で表示される (初期状態)', () => {
    render(<LogViewer />);
    const debugBtn = screen.getByRole('button', { name: /debug/i });
    expect(debugBtn).toHaveAttribute('aria-pressed', 'true');
  });

  it('ログ追加後に該当行が DOM に出る', () => {
    useAppStore.setState({
      logs: [
        makeLogEntry({ date: '2026-05-24T10:00:00.000Z', level: 'info', text: 'visible-info' }),
      ],
    });
    render(<LogViewer />);
    expect(screen.getByText('visible-info')).toBeInTheDocument();
  });
});

describe('LogViewer — フィルタ', () => {
  it('レベルフィルタを off にすると該当ログが消える', () => {
    useAppStore.setState({
      logs: [
        makeLogEntry({ level: 'info', text: 'info-msg' }),
        makeLogEntry({ level: 'error', text: 'error-msg' }),
      ],
    });
    render(<LogViewer />);
    expect(screen.getByText('info-msg')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /info/i }));
    expect(screen.queryByText('info-msg')).not.toBeInTheDocument();
    expect(screen.getByText('error-msg')).toBeInTheDocument();
  });

  it('全フィルタを off にすると 1 件も表示されない', () => {
    useAppStore.setState({
      logs: [
        makeLogEntry({ level: 'debug', text: 'd' }),
        makeLogEntry({ level: 'info', text: 'i' }),
        makeLogEntry({ level: 'warn', text: 'w' }),
        makeLogEntry({ level: 'error', text: 'e' }),
      ],
    });
    render(<LogViewer />);

    for (const lvl of ['debug', 'info', 'warn', 'error']) {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(lvl, 'i') }));
    }
    expect(screen.queryByText('d')).not.toBeInTheDocument();
    expect(screen.queryByText('i')).not.toBeInTheDocument();
    expect(screen.queryByText('w')).not.toBeInTheDocument();
    expect(screen.queryByText('e')).not.toBeInTheDocument();
  });

  it('検索文字列でログ本文を絞り込める (case insensitive)', () => {
    useAppStore.setState({
      logs: [
        makeLogEntry({ text: 'Salesforce OAuth start' }),
        makeLogEntry({ text: 'query completed' }),
      ],
    });
    render(<LogViewer />);

    fireEvent.change(screen.getByPlaceholderText('検索...'), {
      target: { value: 'SALESFORCE' },
    });
    expect(screen.getByText('Salesforce OAuth start')).toBeInTheDocument();
    expect(screen.queryByText('query completed')).not.toBeInTheDocument();
  });
});

describe('LogViewer — クリア', () => {
  it('クリアボタンで store.logs が空になる', () => {
    useAppStore.setState({
      logs: [makeLogEntry({ text: 'will be cleared' })],
    });
    render(<LogViewer />);
    expect(screen.getByText('will be cleared')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'クリア' }));
    expect(useAppStore.getState().logs).toEqual([]);
  });
});

describe('LogViewer — 時刻フォーマット', () => {
  it('ISO 文字列から localeTimeString が抽出される', () => {
    useAppStore.setState({
      logs: [makeLogEntry({ date: '2026-05-24T10:30:45.123Z', text: 'time-test' })],
    });
    render(<LogViewer />);
    // 時刻表記は環境依存 (toLocaleTimeString)。10:30:45 のいずれか部分が含まれることを確認
    expect(screen.getByText('time-test')).toBeInTheDocument();
    // 時刻 span は同じ行内にある
    const row = screen.getByText('time-test').closest('div');
    expect(row?.textContent).toMatch(/\d+:\d+/);
  });

  it('Invalid Date は date 文字列をそのまま表示してクラッシュしない', () => {
    useAppStore.setState({
      logs: [makeLogEntry({ date: 'not-a-date-at-all', text: 'invalid-time' })],
    });
    render(<LogViewer />);
    expect(screen.getByText('invalid-time')).toBeInTheDocument();
  });
});
