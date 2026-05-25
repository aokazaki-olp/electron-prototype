// @vitest-environment happy-dom
/**
 * Header.tsx のテスト。
 *   - detectEnvironment が公式の Salesforce ホスト名パターンを正しく分類すること。
 *   - Header コンポーネントが activeProfile に応じて適切なバッジを描画すること。
 *
 * 事故防止の中核ロジックなので、ホスト名パターンごとに固定して regress を防ぐ。
 */
import { describe, it, expect } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Header, detectEnvironment } from '../../../apps/explorer/src/renderer/components/Header.js';
import { makeProfile } from '../../fixtures/contract.js';

describe('detectEnvironment', () => {
  // 既知の限界: `login.salesforce.com` は本番組織だけでなく **Developer Edition org** や
  // Trailhead Playground もログインエンドポイントとして共有する。loginUrl だけからは両者を
  // 原理的に区別できないため、ここでは安全側に倒して Production バッジを出す。
  // 誤って書き込み許可するリスクは増えない (= 赤バッジで警戒する側に倒れる)。
  // 厳密に区別したい場合は instance_url 経由の再判定が必要 (将来課題)。
  it('login.salesforce.com は production (DE / Trailhead Playground も含む — 安全側)', () => {
    expect(detectEnvironment('https://login.salesforce.com')).toBe('production');
  });

  it('test.salesforce.com は sandbox', () => {
    expect(detectEnvironment('https://test.salesforce.com')).toBe('sandbox');
  });

  it('本番 MyDomain (*.my.salesforce.com) は production', () => {
    expect(detectEnvironment('https://acme.my.salesforce.com')).toBe('production');
    expect(detectEnvironment('https://acme-corp.my.salesforce.com')).toBe('production');
  });

  it('sandbox MyDomain (*.sandbox.my.salesforce.com) は sandbox', () => {
    expect(detectEnvironment('https://acme--dev.sandbox.my.salesforce.com')).toBe('sandbox');
    expect(detectEnvironment('https://acme--uat.sandbox.my.salesforce.com')).toBe('sandbox');
  });

  it('scratch / develop / trailblaze / demo / free / patch は全て scratch 扱い (非本番系)', () => {
    expect(detectEnvironment('https://abc.scratch.my.salesforce.com')).toBe('scratch');
    expect(detectEnvironment('https://abc.develop.my.salesforce.com')).toBe('scratch');
    expect(detectEnvironment('https://abc.trailblaze.my.salesforce.com')).toBe('scratch');
    expect(detectEnvironment('https://abc.demo.my.salesforce.com')).toBe('scratch');
    expect(detectEnvironment('https://abc.free.my.salesforce.com')).toBe('scratch');
    expect(detectEnvironment('https://abc.patch.my.salesforce.com')).toBe('scratch');
  });

  it('判定順: partition suffix が my.salesforce.com より先に評価される (sandbox の本番誤判定を防ぐ)', () => {
    // 順序を逆にすると "endsWith('.my.salesforce.com')" が先にマッチして production になる事故が起きる
    expect(detectEnvironment('https://acme--dev.sandbox.my.salesforce.com')).toBe('sandbox');
    expect(detectEnvironment('https://abc.scratch.my.salesforce.com')).toBe('scratch');
  });

  it('大文字混在のホスト名でも正しく判定する', () => {
    expect(detectEnvironment('https://Login.Salesforce.com')).toBe('production');
    expect(detectEnvironment('https://Acme.My.Salesforce.com')).toBe('production');
    expect(detectEnvironment('https://Acme--Dev.Sandbox.My.Salesforce.com')).toBe('sandbox');
  });

  it('Salesforce 以外のホスト (社内 reverse proxy 等) は custom', () => {
    expect(detectEnvironment('https://sf.example.com')).toBe('custom');
    expect(detectEnvironment('https://salesforce.example.co.jp')).toBe('custom');
  });

  it('不正な URL は custom にフォールバック', () => {
    expect(detectEnvironment('not a url')).toBe('custom');
    expect(detectEnvironment('')).toBe('custom');
  });

  it('*.salesforce.com サブドメインだが my. が付かないものは custom', () => {
    // Visualforce / Site URL 等。ログインには使わない想定だが念のため
    expect(detectEnvironment('https://acme.lightning.force.com')).toBe('custom');
  });
});

describe('Header コンポーネント', () => {
  afterEach(() => cleanup());

  it('activeProfile なしならアプリ名のみ表示', () => {
    render(<Header activeProfile={undefined} onSettings={() => {}} onDisconnect={() => {}} />);
    expect(screen.getByText('Salesforce Explorer')).toBeInTheDocument();
    expect(screen.queryByText('Production')).not.toBeInTheDocument();
    expect(screen.queryByText('Sandbox')).not.toBeInTheDocument();
  });

  it('本番 MyDomain で Production バッジが出る', () => {
    const profile = makeProfile({ loginUrl: 'https://acme.my.salesforce.com', mode: 'readonly' });
    render(<Header activeProfile={profile} onSettings={() => {}} onDisconnect={() => {}} />);
    expect(screen.getByText('Production')).toBeInTheDocument();
  });

  it('sandbox MyDomain で Sandbox バッジが出る', () => {
    const profile = makeProfile({ loginUrl: 'https://acme--dev.sandbox.my.salesforce.com' });
    render(<Header activeProfile={profile} onSettings={() => {}} onDisconnect={() => {}} />);
    expect(screen.getByText('Sandbox')).toBeInTheDocument();
  });

  it('readwrite モードなら「書き込み可」バッジが出る', () => {
    const profile = makeProfile({ loginUrl: 'https://acme.my.salesforce.com', mode: 'readwrite' });
    render(<Header activeProfile={profile} onSettings={() => {}} onDisconnect={() => {}} />);
    expect(screen.getByText('書き込み可')).toBeInTheDocument();
  });

  it('readonly モードなら「読み取り専用」バッジが出る', () => {
    const profile = makeProfile({ loginUrl: 'https://acme.my.salesforce.com', mode: 'readonly' });
    render(<Header activeProfile={profile} onSettings={() => {}} onDisconnect={() => {}} />);
    expect(screen.getByText('読み取り専用')).toBeInTheDocument();
  });
});
