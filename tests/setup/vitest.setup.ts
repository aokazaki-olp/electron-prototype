import '@testing-library/jest-dom';
import { vi, afterEach } from 'vitest';

// 各テスト後にモックをリセット
afterEach(() => {
  vi.restoreAllMocks();
});
