/**
 * Discovered Data Store
 *
 * Manages discovered data from offchain lookups and provides BCS serialization
 * for passing data back to Move resolver functions.
 */

import { DiscoveredDataBCS } from '../bcs/schemas.js';
import type { KeyValue } from '../types/index.js';

export class DiscoveredDataStore {
  private entries: Map<string, Uint8Array> = new Map();

  set(key: string, value: Uint8Array): void {
    this.entries.set(key, value);
  }

  getAll(): Map<string, Uint8Array> {
    return new Map(this.entries);
  }

  serialize(): Uint8Array {
    if (this.entries.size === 0) {
      return new Uint8Array();
    }

    const entries: KeyValue[] = Array.from(this.entries.entries()).map(([key, value]) => ({
      key,
      value,
    }));

    const serialized = DiscoveredDataBCS.serialize({ entries });
    return serialized.toBytes();
  }
}
