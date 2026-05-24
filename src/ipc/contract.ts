/**
 * contract.ts
 * @description main / preload / renderer 三者で共有する IPC 型契約
 */

export interface ConnectParams {
  consumerKey: string;
  username: string;
  privateKey: string;
  tokenHost: string;
}

export interface ConnectResult {
  instanceUrl: string;
}

export interface QueryResult {
  totalSize: number;
  done: boolean;
  records: Record<string, unknown>[];
}

export interface SalesforceApi {
  connect(params: ConnectParams): Promise<ConnectResult>;
  query(soql: string): Promise<QueryResult>;
  disconnect(): Promise<void>;
}
