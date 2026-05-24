import { contextBridge, ipcRenderer } from 'electron';
import type { SalesforceApi, ConnectParams, ConnectResult, QueryResult } from '../ipc/contract.js';

contextBridge.exposeInMainWorld('salesforce', {
  connect: (params: ConnectParams): Promise<ConnectResult> =>
    ipcRenderer.invoke('sf:connect', params),
  query: (soql: string): Promise<QueryResult> =>
    ipcRenderer.invoke('sf:query', soql),
  disconnect: (): Promise<void> =>
    ipcRenderer.invoke('sf:disconnect'),
} satisfies SalesforceApi);
