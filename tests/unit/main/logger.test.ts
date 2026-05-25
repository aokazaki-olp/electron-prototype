/**
 * logger.ts のユニットテスト。
 * §11.5 機密マスクが壊れたら本番障害になるため、回帰検出を CI で効かせる。
 * electron / electron-log を全モックして maskSensitive / toLogLevel / getRecentLogs を検証する。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/logs'),
  },
}));

const mockLog = vi.hoisted(() => ({
  transports: {
    file: { resolvePathFn: undefined as unknown, level: '' },
    console: { level: '' as string | false },
  },
  hooks: [] as Array<(m: { date: Date; level: string; data: unknown[] }) => unknown>,
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  create: vi.fn(() => ({
    transports: {
      file: { resolvePathFn: undefined, level: '' },
      console: { level: '' as string | false },
    },
    info: vi.fn(),
  })),
}));

vi.mock('electron-log', () => ({ default: mockLog }));

import {
  toLogLevel,
  maskSensitive,
  initLogger,
  getRecentLogs,
  _resetLogBufferForTest,
} from '../../../packages/main-core/src/logger.js';

beforeEach(() => {
  vi.clearAllMocks();
  mockLog.hooks.length = 0;
  _resetLogBufferForTest();
});

describe('toLogLevel', () => {
  it('既知レベルはそのまま返す', () => {
    expect(toLogLevel('debug')).toBe('debug');
    expect(toLogLevel('info')).toBe('info');
    expect(toLogLevel('warn')).toBe('warn');
    expect(toLogLevel('error')).toBe('error');
  });

  it('silly / verbose は debug にフォールバック', () => {
    expect(toLogLevel('silly')).toBe('debug');
    expect(toLogLevel('verbose')).toBe('debug');
  });

  it('未知文字列も debug にフォールバック', () => {
    expect(toLogLevel('totally-unknown')).toBe('debug');
  });
});

describe('maskSensitive', () => {
  it('access_token を伏字にする', () => {
    expect(maskSensitive('access_token=abcdef')).toBe('access_token=***');
  });

  it('refresh_token を伏字にする', () => {
    expect(maskSensitive('refresh_token: 5Aep861')).toBe('refresh_token=***');
  });

  it('Authorization ヘッダを伏字にする', () => {
    expect(maskSensitive('Authorization: Bearer abc.def.ghi')).toBe('Authorization=***');
  });

  it('clientSecret を伏字にする', () => {
    expect(maskSensitive('clientSecret="xyz123"')).toBe('clientSecret=***');
  });

  it('OAuth 認可 code (code=...) を伏字にする', () => {
    expect(maskSensitive('grant_type=authorization_code&code=aPx.RES')).toBe('grant_type=authorization_code&code=***');
  });

  it('session_id / sid を伏字にする', () => {
    expect(maskSensitive('session_id=abc123')).toBe('session_id=***');
    expect(maskSensitive('sid="00DXX0000004C92!ARE"')).toBe('sid=***');
  });

  it('error_code 等のデバッグ情報は伏字にしない (code に negative lookahead)', () => {
    // negative lookahead `(?!_)` により error_code は対象外
    expect(maskSensitive('error_code: 12345')).toBe('error_code: 12345');
  });

  it('Error オブジェクトの message と stack をマスクする', () => {
    // stack のような複数語混在行では「アクセストークン以降全部マスク」になる。
    // 機密漏えい防止が目的なので「マスク済み文字列が含まれる」「元の秘匿値は残らない」を assert する。
    const e = new Error('access_token=secret-value');
    e.stack = 'at access_token=secret-value line 1';
    const masked = maskSensitive(e);
    expect(masked).toBeInstanceOf(Error);
    if (masked instanceof Error) {
      expect(masked.message).toContain('access_token=***');
      expect(masked.message).not.toContain('secret-value');
      expect(masked.stack).toContain('access_token=***');
      expect(masked.stack).not.toContain('secret-value');
    }
  });

  it('object / number / null はそのまま返す', () => {
    const obj = { a: 1 };
    expect(maskSensitive(obj)).toBe(obj);
    expect(maskSensitive(42)).toBe(42);
    expect(maskSensitive(null)).toBeNull();
  });
});

describe('initLogger + getRecentLogs', () => {
  const flushHook = (level: string, data: unknown[]): void => {
    const hook = mockLog.hooks[0];
    if (!hook) {
      throw new Error('hook is not registered');
    }
    hook({ date: new Date('2026-05-24T10:00:00Z'), level, data });
  };

  it('hook がリングバッファに追記する', () => {
    initLogger();
    flushHook('info', ['hello']);
    const recent = getRecentLogs();
    expect(recent).toHaveLength(1);
    expect(recent[0].text).toBe('hello');
    expect(recent[0].level).toBe('info');
  });

  it('hook がマスクを通す', () => {
    initLogger();
    flushHook('warn', ['oauth callback', 'access_token=xyz']);
    const recent = getRecentLogs();
    expect(recent[0].text).toContain('access_token=***');
  });

  it('broadcaster コールバックに LogEntry を渡す', () => {
    const broadcaster = vi.fn();
    initLogger(broadcaster);
    flushHook('error', ['oops']);
    expect(broadcaster).toHaveBeenCalledTimes(1);
    expect(broadcaster.mock.calls[0][0].text).toBe('oops');
    expect(broadcaster.mock.calls[0][0].level).toBe('error');
  });

  it('broadcaster が throw しても hook 全体は壊れない', () => {
    const broadcaster = vi.fn(() => {
      throw new Error('boom');
    });
    initLogger(broadcaster);
    expect(() => flushHook('info', ['ok'])).not.toThrow();
    expect(getRecentLogs()).toHaveLength(1);
  });

  it('リングバッファは LOG_BUFFER_SIZE (200) を超えると古いものから破棄', () => {
    initLogger();
    for (let i = 0; i < 250; i++) {
      flushHook('debug', [`msg ${i}`]);
    }
    const recent = getRecentLogs();
    expect(recent.length).toBe(200);
    // 古いものから順に並ぶ。最古は msg 50、最新は msg 249。
    expect(recent[0].text).toBe('msg 50');
    expect(recent[recent.length - 1].text).toBe('msg 249');
  });

  it('未知レベル (silly) は debug にフォールバックして保存される', () => {
    initLogger();
    flushHook('silly', ['細かい話']);
    expect(getRecentLogs()[0].level).toBe('debug');
  });

  it('data が空配列でも entry を生成する (text は空文字)', () => {
    initLogger();
    flushHook('info', []);
    expect(getRecentLogs()[0].text).toBe('');
  });

  it('複数 data 要素はスペース区切りで join される', () => {
    initLogger();
    flushHook('info', ['first', 'second', 'third']);
    expect(getRecentLogs()[0].text).toBe('first second third');
  });

  it('日本語・絵文字を含むメッセージもマスク regex を抜けて保存される', () => {
    initLogger();
    flushHook('info', ['日本語メッセージ 😀', 'access_token=secret']);
    const text = getRecentLogs()[0].text;
    expect(text).toContain('日本語メッセージ');
    expect(text).toContain('access_token=***');
    expect(text).not.toContain('secret');
  });

  it('1 行に複数の機密フィールドがあっても全部マスク', () => {
    initLogger();
    flushHook('info', ['access_token=a&refresh_token=b&sid=c']);
    const text = getRecentLogs()[0].text;
    expect(text).toContain('access_token=***');
    expect(text).toContain('refresh_token=***');
    expect(text).toContain('sid=***');
    expect(text).not.toContain('=a');
    expect(text).not.toContain('=b');
    expect(text).not.toContain('=c');
  });
});

describe('maskSensitive — 追加エッジケース', () => {
  it('空文字はそのまま', () => {
    expect(maskSensitive('')).toBe('');
  });

  it('機密語が含まれない文字列はそのまま', () => {
    expect(maskSensitive('hello world')).toBe('hello world');
  });

  it('URL クエリ複数パラメータの中で対象だけマスク', () => {
    const result = maskSensitive('grant_type=authorization_code&code=auth123&client_id=public');
    expect(result).toBe('grant_type=authorization_code&code=***&client_id=public');
  });

  it('Session-Id ヘッダ形式 (ハイフン) も対象', () => {
    expect(maskSensitive('Session-Id: 00DXX000')).toBe('Session-Id=***');
  });

  it('改行を含むテキストは行ごとに独立してマスク', () => {
    const result = maskSensitive('access_token=a\nnormal text\nrefresh_token=b') as string;
    const lines = result.split('\n');
    expect(lines[0]).toBe('access_token=***');
    expect(lines[1]).toBe('normal text');
    expect(lines[2]).toBe('refresh_token=***');
  });

  it('配列・null・undefined・数値はそのまま返す (再帰しない)', () => {
    const arr = ['access_token=secret'];
    expect(maskSensitive(arr)).toBe(arr); // 参照同一
    expect(maskSensitive(undefined)).toBeUndefined();
  });

  it('JWT 形式 (eyJ.... 三つドット区切り) も値部分としてマスク', () => {
    // Salesforce の access_token は JWT 形式で配信される場合がある (3 セグメント・base64url)
    const jwt = 'eyJhbGciOiJSUzI1NiIsImtpZCI6IjEifQ.eyJzdWIiOiJ1c2VyIn0.SignaturePart';
    const result = maskSensitive(`access_token=${jwt}&state=abc`) as string;
    expect(result).toContain('access_token=***');
    expect(result).not.toContain('eyJhbGciOiJSUzI1NiIsImtpZCI6IjEifQ');
    expect(result).not.toContain('SignaturePart');
    expect(result).toContain('state=abc'); // state は機密でないため残る
  });

  it('Authorization ヘッダの Bearer トークンもマスク', () => {
    const result = maskSensitive('Authorization: Bearer eyJabc.def.ghi xyz123') as string;
    expect(result).toContain('Authorization=***');
    expect(result).not.toContain('eyJabc');
    expect(result).not.toContain('ghi xyz123');
  });

  it('URL encoded フォームの値もマスク (=%3D / 空白 は値の一部としてマスク対象に含まれる)', () => {
    // SF の token エンドポイントは application/x-www-form-urlencoded を使う
    const result = maskSensitive('access_token=abc%3Ddef%26extra&grant_type=password') as string;
    expect(result).toContain('access_token=***');
    expect(result).not.toContain('abc%3D');
    expect(result).toContain('grant_type=password'); // grant_type は機密でない
  });

  it('refresh_token と access_token を JSON ボディに併記してもどちらもマスク', () => {
    // OAuth token エンドポイントのレスポンス想定
    const json = '{"access_token":"eyJabc.def","refresh_token":"5Aep861","instance_url":"https://x.com"}';
    const result = maskSensitive(json) as string;
    expect(result).toContain('access_token=***');
    expect(result).toContain('refresh_token=***');
    expect(result).not.toContain('eyJabc');
    expect(result).not.toContain('5Aep861');
    expect(result).toContain('instance_url'); // instance_url は公開情報なのでマスクしない
  });

  it('clientSecret も大文字小文字を問わずマスク (URL クエリ後続パラメータは残る)', () => {
    // & は値の終端として扱われるので、後続の foo=bar は別パラメータとして残る
    expect(maskSensitive('clientSecret=topsecret&foo=bar')).toBe('clientSecret=***&foo=bar');
    expect(maskSensitive('ClientSecret: TopSecret')).toBe('ClientSecret=***');
  });
});
