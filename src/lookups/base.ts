import type { SuiClient } from '@mysten/sui/client';

import type { OffchainLookup } from '../types/index.js';

/**
 * Base interface for offchain lookup handlers
 */
export interface OffchainLookupHandler<T extends OffchainLookup = OffchainLookup> {
  // Resolve a lookup by fetching data from SUI RPC
  resolve(lookup: T, client: SuiClient): Promise<Uint8Array>;
}

export class LookupResolutionError extends Error {
  constructor(
    public readonly lookupType: string,
    public readonly reason: string,
    public readonly details?: unknown
  ) {
    super(`${lookupType} lookup failed: ${reason}`);
    this.name = 'LookupResolutionError';
  }
}
