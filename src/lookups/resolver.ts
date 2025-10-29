/**
 * Offchain Lookup Resolver
 *
 * Generic orchestrator that dispatches lookup requests to appropriate handlers.
 */

import type { SuiClient } from '@mysten/sui/client';

import type { OffchainLookup } from '../types/index.js';
import { LookupResolutionError } from './base.js';
import { DynamicFieldHandler } from './dynamic-field.js';
import { DynamicFieldByTypeHandler } from './dynamic-field-by-type.js';
import { DynamicObjectFieldHandler } from './dynamic-object-field.js';
import { ObjectFieldHandler } from './object-field.js';
import { TableItemHandler } from './table-item.js';
export class OffchainLookupResolver {
  private handlers = {
    DynamicFieldByType: new DynamicFieldByTypeHandler(),
    TableItem: new TableItemHandler(),
    DynamicField: new DynamicFieldHandler(),
    ObjectField: new ObjectFieldHandler(),
    DynamicObjectField: new DynamicObjectFieldHandler(),
  };

  /**
   * Resolve an offchain lookup
   * @param lookup - Lookup specification
   * @param client - SUI client for RPC calls
   * @returns Resolved value as bytes
   * @throws LookupResolutionError if lookup fails
   */
  async resolve(lookup: OffchainLookup, client: SuiClient): Promise<Uint8Array> {
    const variant = lookup.variant;

    switch (variant) {
      case 'DynamicFieldByType': {
        return this.handlers.DynamicFieldByType.resolve(lookup, client);
      }

      case 'TableItem': {
        return this.handlers.TableItem.resolve(lookup, client);
      }

      case 'DynamicField': {
        return this.handlers.DynamicField.resolve(lookup, client);
      }

      case 'ObjectField': {
        return this.handlers.ObjectField.resolve(lookup, client);
      }

      case 'DynamicObjectField': {
        return this.handlers.DynamicObjectField.resolve(lookup, client);
      }

      default: {
        // TypeScript exhaustiveness check
        const _exhaustive: never = variant;
        throw new LookupResolutionError('Unknown', `Unknown lookup variant: ${_exhaustive}`, {
          lookup,
        });
      }
    }
  }
}
