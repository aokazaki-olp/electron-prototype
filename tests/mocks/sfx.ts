/**
 * window.sfx の完全モック。
 * renderer テストで window.sfx を差し替えるために使う。
 */
import { vi } from 'vitest';
import type { SalesforceExplorerApi } from '@app/ipc-contract';

export const makeMockSfx = (): SalesforceExplorerApi => ({
  loadSettings: vi.fn().mockResolvedValue({
    defaultMaxRows: 2000,
    logBufferSize: 1000,
    paneSizes: { leftPanel: 18, soqlPanel: 40 },
  }),
  saveSettings: vi.fn().mockResolvedValue(undefined),
  loadProfiles: vi.fn().mockResolvedValue([]),
  saveProfile: vi.fn().mockResolvedValue(undefined),
  deleteProfile: vi.fn().mockResolvedValue(undefined),

  startOAuth: vi.fn().mockResolvedValue(undefined),
  reauthForWrite: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
  getAuthState: vi.fn().mockResolvedValue('disconnected'),

  listSObjects: vi.fn().mockResolvedValue([]),
  describeObject: vi.fn().mockResolvedValue({
    name: '', label: '', labelPlural: '', fields: [], childRelationships: [],
  }),
  query: vi.fn().mockResolvedValue({
    totalSize: 0, done: true, records: [], fetchedCount: 0,
  }),
  bulkQuery: vi.fn().mockResolvedValue({
    totalSize: 0, done: true, records: [], fetchedCount: 0,
  }),

  createRecord: vi.fn().mockResolvedValue('new-id'),
  updateRecord: vi.fn().mockResolvedValue(undefined),
  deleteRecord: vi.fn().mockResolvedValue(undefined),

  saveSoqlFile: vi.fn().mockResolvedValue(undefined),
  openSoqlFile: vi.fn().mockResolvedValue(null),

  loadTabs: vi.fn().mockResolvedValue(null),
  saveTabs: vi.fn().mockResolvedValue(undefined),

  loadColumnSizes: vi.fn().mockResolvedValue({}),
  saveColumnSizes: vi.fn().mockResolvedValue(undefined),

  exportCsv: vi.fn().mockResolvedValue(undefined),
  exportQueryExcel: vi.fn().mockResolvedValue(undefined),
  exportObjectDefinition: vi.fn().mockResolvedValue(undefined),
  exportLogFile: vi.fn().mockResolvedValue(undefined),

  getRecentLogs: vi.fn().mockResolvedValue([]),
  onLogEntry: vi.fn().mockReturnValue(() => {}),
  rendererLog: vi.fn(),
});
