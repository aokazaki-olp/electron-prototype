/**
 * A2: ヘッダー org シグナルの E2E テスト。
 *   - loginUrl からの環境推定: production / sandbox / scratch / custom (My Domain)
 *   - 書き込み可モードでヘッダー帯がオレンジ化する事故防止 UI
 */
import { test, expect, setupTestState } from '../fixtures/electron.js';
import { MainPagePOM } from '../pages/MainPage.js';
import { makeProfile } from '../../fixtures/contract.js';

const setupWithProfile = async (
  page: import('@playwright/test').Page,
  overrides: { loginUrl?: string; mode?: 'readonly' | 'readwrite' } = {},
) => {
  const profile = makeProfile({
    id: 'p1',
    name: 'テスト組織',
    loginUrl: overrides.loginUrl ?? 'https://login.salesforce.com',
    mode: overrides.mode ?? 'readonly',
  });
  await setupTestState(page, {
    profiles: [profile],
    activeProfileId: profile.id,
    sobjects: [],
    describe: {},
  });
};

test.describe('A2 ヘッダー org シグナル — 環境バッジ', () => {
  test('login.salesforce.com → PRODUCTION バッジ', async ({ window }) => {
    await setupWithProfile(window, { loginUrl: 'https://login.salesforce.com' });
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await expect(window.locator('header').getByText('Production')).toBeVisible();
  });

  test('test.salesforce.com → SANDBOX バッジ', async ({ window }) => {
    await setupWithProfile(window, { loginUrl: 'https://test.salesforce.com' });
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await expect(window.locator('header').getByText('Sandbox')).toBeVisible();
  });

  test('*.sandbox.my.salesforce.com (My Domain Sandbox) → SANDBOX バッジ', async ({ window }) => {
    await setupWithProfile(window, { loginUrl: 'https://acme--qa.sandbox.my.salesforce.com' });
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await expect(window.locator('header').getByText('Sandbox')).toBeVisible();
  });

  test('*.scratch.my.salesforce.com → SCRATCH バッジ', async ({ window }) => {
    await setupWithProfile(window, { loginUrl: 'https://power-energy-1234.scratch.my.salesforce.com' });
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await expect(window.locator('header').getByText('Scratch')).toBeVisible();
  });

  test('*.develop.my.salesforce.com → SCRATCH バッジ (develop org も scratch 同等)', async ({ window }) => {
    await setupWithProfile(window, { loginUrl: 'https://acme-dev-ed.develop.my.salesforce.com' });
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await expect(window.locator('header').getByText('Scratch')).toBeVisible();
  });

  test('カスタム My Domain (sandbox/scratch でない) → My Domain バッジ', async ({ window }) => {
    await setupWithProfile(window, { loginUrl: 'https://acme.my.salesforce.com' });
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await expect(window.locator('header').getByText('My Domain')).toBeVisible();
  });

  test('不正な URL でもクラッシュせず My Domain にフォールバック', async ({ window }) => {
    await setupWithProfile(window, { loginUrl: 'not-a-valid-url' });
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await expect(window.locator('header').getByText('My Domain')).toBeVisible();
  });
});

test.describe('A2 ヘッダー org シグナル — 書き込みモード色分け', () => {
  test('読み取り専用モードでヘッダーは slate (bg-slate-800)', async ({ window }) => {
    await setupWithProfile(window, { mode: 'readonly' });
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await expect(main.header).toHaveClass(/bg-slate-800/);
    await expect(window.locator('header').getByText('読み取り専用')).toBeVisible();
  });

  test('書き込み可モードでヘッダーがオレンジ (bg-orange-800)', async ({ window }) => {
    await setupWithProfile(window, { mode: 'readwrite' });
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await expect(main.header).toHaveClass(/bg-orange-800/);
    await expect(window.locator('header').getByText('書き込み可')).toBeVisible();
  });

  test('書き込み可モードのバッジは事故防止のため強調色 (bg-orange-200)', async ({ window }) => {
    await setupWithProfile(window, { mode: 'readwrite' });
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    const badge = window.locator('header').getByText('書き込み可');
    await expect(badge).toHaveClass(/bg-orange-200/);
  });
});
