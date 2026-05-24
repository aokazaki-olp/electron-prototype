import type { SalesforceApi } from '../ipc/contract.js';

declare global {
  interface Window {
    salesforce: SalesforceApi;
  }
}

export {};
