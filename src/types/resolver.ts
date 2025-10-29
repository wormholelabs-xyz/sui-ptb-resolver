import type { Transaction } from '@mysten/sui/transactions';

import type { NetworkConfig } from './network.js';
export interface SuiPTBResolverConfig {
  network: NetworkConfig;
  maxIterations?: number;
  debug?: boolean;
  dryRunTimeout?: number;
}

export interface ResolverOutput {
  transaction: Transaction;
  iterations: number;
  discoveredData: Map<string, Uint8Array>;
  requiredObjects: string[];
  requiredTypes: string[];
}
