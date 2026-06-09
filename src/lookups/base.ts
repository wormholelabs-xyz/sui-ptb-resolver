import type { SuiGrpcClient } from '@mysten/sui/grpc';

import type { OffchainLookup } from '../types/index.js';

/**
 * Base interface for offchain lookup handlers
 */
export interface OffchainLookupHandler<T extends OffchainLookup = OffchainLookup> {
  // Resolve a lookup by fetching data from Sui via gRPC
  resolve(lookup: T, client: SuiGrpcClient): Promise<Uint8Array>;
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
