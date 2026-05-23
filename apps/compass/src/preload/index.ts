/**
 * apps/compass/src/preload/index.ts
 * @description Salesforce Compass の preload エントリ (現状スケルトン)。
 *   将来は @app/ipc-contract の LiteApi 型に絞って公開する。
 *   現状は何も露出しない (window.sfx は undefined のまま)。
 */

import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('sfx', {});
