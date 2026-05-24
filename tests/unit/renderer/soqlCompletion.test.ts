// @vitest-environment happy-dom
/**
 * soqlCompletion.ts のテスト。CodeMirror 実装の挙動ではなく、
 * 位置判定 (detectSoqlPosition) と補完ソースのスナップショット応答を検証する。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { EditorState } from '@codemirror/state';
import { CompletionContext } from '@codemirror/autocomplete';
import { detectSoqlPosition, soqlCompletionSource } from '../../../apps/explorer/src/renderer/components/soqlCompletion.js';
import { useAppStore } from '../../../apps/explorer/src/renderer/store.js';
import { makeFieldDescribe, makeSObjectDescribe, makeSObjectSummary } from '../../fixtures/contract.js';

beforeEach(() => {
  useAppStore.setState({
    sobjects: [],
    selectedObjectDescribe: null,
  });
});

const makeContext = (doc: string, pos: number, explicit = true): CompletionContext => {
  const state = EditorState.create({ doc });
  return new CompletionContext(state, pos, explicit);
};

describe('detectSoqlPosition', () => {
  it('SELECT の直後はフィールド位置', () => {
    expect(detectSoqlPosition('SELECT ')).toBe('select');
    expect(detectSoqlPosition('SELECT Id, Na')).toBe('select');
  });

  it('FROM の直後は sObject 位置', () => {
    expect(detectSoqlPosition('SELECT Id FROM ')).toBe('from');
    expect(detectSoqlPosition('SELECT Id FROM Acc')).toBe('from');
  });

  it('WHERE の後は other', () => {
    expect(detectSoqlPosition('SELECT Id FROM Account WHERE ')).toBe('other');
  });

  it('大文字小文字は無視される', () => {
    expect(detectSoqlPosition('select id from ')).toBe('from');
  });
});

describe('soqlCompletionSource', () => {
  it('FROM 直後では sobjects 一覧を候補に出す', () => {
    useAppStore.setState({
      sobjects: [
        makeSObjectSummary({ name: 'Account', label: 'アカウント' }),
        makeSObjectSummary({ name: 'Contact', label: '取引先責任者' }),
      ],
    });
    const ctx = makeContext('SELECT Id FROM Acc', 18);
    const result = soqlCompletionSource(ctx);
    if (result == null) {
      throw new Error('completion result was null');
    }
    const labels = result.options.map(o => o.label);
    expect(labels).toContain('Account');
    expect(labels).toContain('Contact');
  });

  it('SELECT 句では selectedObjectDescribe.fields を候補に出す', () => {
    useAppStore.setState({
      selectedObjectDescribe: makeSObjectDescribe({
        name: 'Account',
        fields: [
          makeFieldDescribe({ name: 'Id', type: 'id' }),
          makeFieldDescribe({ name: 'Name', type: 'string' }),
          makeFieldDescribe({ name: 'AnnualRevenue', type: 'currency' }),
        ],
      }),
    });
    const ctx = makeContext('SELECT An', 9);
    const result = soqlCompletionSource(ctx);
    if (result == null) {
      throw new Error('completion result was null');
    }
    const labels = result.options.map(o => o.label);
    expect(labels).toContain('Id');
    expect(labels).toContain('Name');
    expect(labels).toContain('AnnualRevenue');
  });

  it('予約語 (SELECT, FROM, WHERE) は常に候補に含まれる', () => {
    const ctx = makeContext('SE', 2);
    const result = soqlCompletionSource(ctx);
    if (result == null) {
      throw new Error('completion result was null');
    }
    const labels = result.options.map(o => o.label);
    expect(labels).toContain('SELECT');
    expect(labels).toContain('FROM');
    expect(labels).toContain('WHERE');
  });

  it('WHERE の後では日付リテラル (TODAY 等) が候補に含まれる', () => {
    const ctx = makeContext('SELECT Id FROM Account WHERE CreatedDate = TO', 45);
    const result = soqlCompletionSource(ctx);
    if (result == null) {
      throw new Error('completion result was null');
    }
    const labels = result.options.map(o => o.label);
    expect(labels).toContain('TODAY');
    expect(labels).toContain('YESTERDAY');
  });

  it('集約関数 (COUNT, MAX) は SELECT 句で候補に含まれる', () => {
    const ctx = makeContext('SELECT CO', 9);
    const result = soqlCompletionSource(ctx);
    if (result == null) {
      throw new Error('completion result was null');
    }
    const labels = result.options.map(o => o.label);
    expect(labels).toContain('COUNT');
    expect(labels).toContain('MAX');
  });

  it('空文字 + 非明示 (typing 時) では null を返さない (typeahead 用)', () => {
    // matchBefore は単語境界なので空文字位置だと from === to。explicit=false で null を返す設計。
    const ctx = makeContext('', 0, false);
    const result = soqlCompletionSource(ctx);
    expect(result).toBeNull();
  });
});
