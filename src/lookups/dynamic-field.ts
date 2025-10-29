import type { SuiClient } from '@mysten/sui/client';

import { addressToBytes, bytesToAddress, bytesToHex, stringToBytes } from '../bcs/converters';
import type { OffchainLookup } from '../types';
import { LookupResolutionError, type OffchainLookupHandler } from './base';

/**
 * Handler for DynamicField lookups
 *
 * Process:
 * 1. Fetch dynamic field from parent object using key
 * 2. Extract value from the field
 * 3. Return value as bytes (type depends on expected_value_type)
 */
export class DynamicFieldHandler
  implements OffchainLookupHandler<Extract<OffchainLookup, { variant: 'DynamicField' }>>
{
  async resolve(
    lookup: Extract<OffchainLookup, { variant: 'DynamicField' }>,
    client: SuiClient
  ): Promise<Uint8Array> {
    const { parent_object, key, placeholder_name } = lookup.fields;

    const parentAddress = bytesToAddress(parent_object);

    try {
      // fetch the dynamic field
      const field = await client.getDynamicFieldObject({
        parentId: parentAddress,
        name: {
          type: 'vector<u8>',
          value: Array.from(key),
        },
      });

      if (field.data?.content?.dataType !== 'moveObject') {
        throw new LookupResolutionError('DynamicField', 'Dynamic field is not a Move object', {
          parentAddress,
          keyHex: bytesToHex(key),
        });
      }

      // get the value
      const fields = field.data.content.fields as Record<string, unknown>;
      const value = fields.value;

      if (value === undefined || value === null) {
        throw new LookupResolutionError('DynamicField', 'Dynamic field has no value', {
          availableFields: Object.keys(fields),
        });
      }

      return this.valueToBytes(value);
    } catch (error) {
      if (error instanceof LookupResolutionError) {
        throw error;
      }

      throw new LookupResolutionError('DynamicField', 'RPC call failed', {
        error: error instanceof Error ? error.message : String(error),
        placeholder_name,
        parentAddress,
      });
    }
  }

  private valueToBytes(value: unknown): Uint8Array {
    // String (address or coin type)
    if (typeof value === 'string') {
      if (value.startsWith('0x')) {
        return addressToBytes(value);
      }
      return stringToBytes(value);
    }

    if (Array.isArray(value)) {
      return new Uint8Array(value);
    }

    if (value instanceof Uint8Array) {
      return value;
    }

    throw new LookupResolutionError(
      'DynamicField',
      `Cannot convert value to bytes: ${typeof value}`,
      {
        value,
      }
    );
  }
}
