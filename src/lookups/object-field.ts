import type { SuiClient } from '@mysten/sui/client';

import { addressToBytes, bytesToAddress, stringToBytes } from '../bcs/converters.js';
import type { OffchainLookup } from '../types/index.js';
import { LookupResolutionError, type OffchainLookupHandler } from './base.js';

/**
 * Handler for ObjectField lookups
 *
 * Process:
 * 1. Fetch the parent object
 * 2. Navigate the field_path (e.g., "metadata.symbol")
 * 3. Extract and return the value as bytes
 */
export class ObjectFieldHandler
  implements OffchainLookupHandler<Extract<OffchainLookup, { variant: 'ObjectField' }>>
{
  async resolve(
    lookup: Extract<OffchainLookup, { variant: 'ObjectField' }>,
    client: SuiClient
  ): Promise<Uint8Array> {
    const { parent_object, field_path, placeholder_name } = lookup.fields;

    const parentAddress = bytesToAddress(parent_object);

    try {
      // get the object
      const obj = await client.getObject({
        id: parentAddress,
        options: { showContent: true },
      });

      if (obj.data?.content?.dataType !== 'moveObject') {
        throw new LookupResolutionError('ObjectField', 'Object is not a Move object', {
          parentAddress,
        });
      }

      // Navigate the field path
      const pathParts = field_path.split('.');
      let currentValue: unknown = obj.data.content.fields;

      for (let i = 0; i < pathParts.length; i++) {
        const part = pathParts[i];
        if (!part) continue;

        if (typeof currentValue !== 'object' || currentValue === null) {
          throw new LookupResolutionError(
            'ObjectField',
            `Cannot navigate path: '${part}' is not an object`,
            {
              path: field_path,
              currentStep: i,
              currentValue,
            }
          );
        }

        const obj = currentValue as Record<string, unknown>;
        currentValue = obj[part];

        if (currentValue === undefined) {
          throw new LookupResolutionError('ObjectField', `Path component '${part}' not found`, {
            path: field_path,
            currentStep: i,
            availableFields: Object.keys(obj),
          });
        }
      }

      // Convert final value to bytes
      return this.valueToBytes(currentValue);
    } catch (error) {
      if (error instanceof LookupResolutionError) {
        throw error;
      }

      throw new LookupResolutionError('ObjectField', 'RPC call failed', {
        error: error instanceof Error ? error.message : String(error),
        placeholder_name,
        parentAddress,
        field_path,
      });
    }
  }
  private valueToBytes(value: unknown): Uint8Array {
    if (typeof value === 'string') {
      // Check if it looks like an address
      if (value.startsWith('0x')) {
        return addressToBytes(value);
      }
      return stringToBytes(value);
    }

    if (typeof value === 'number' || typeof value === 'bigint') {
      const bytes = new Uint8Array(8);
      const view = new DataView(bytes.buffer);
      view.setBigUint64(0, BigInt(value), true); // little-endian
      return bytes;
    }

    if (Array.isArray(value)) {
      return new Uint8Array(value);
    }

    if (value instanceof Uint8Array) {
      return value;
    }

    if (typeof value === 'boolean') {
      return new Uint8Array([value ? 1 : 0]);
    }

    throw new LookupResolutionError(
      'ObjectField',
      `Cannot convert value to bytes: ${typeof value}`,
      {
        value,
      }
    );
  }
}
