import type { SuiGrpcClient } from '@mysten/sui/grpc';

import { addressToBytes, bytesToAddress, stringToBytes } from '../bcs/converters.js';
import type { OffchainLookup } from '../types/index.js';
import { LookupResolutionError, type OffchainLookupHandler } from './base.js';

/**
 * Handler for ObjectField lookups (gRPC).
 *
 * Process:
 * 1. Fetch the parent object's JSON content.
 * 2. Navigate the field_path (e.g. "metadata.symbol").
 * 3. Convert the final value to bytes.
 *
 * NOTE: not exercised by the production resolver. Implemented for completeness;
 * unverified against live mainnet. Uses json for field navigation.
 */
export class ObjectFieldHandler
  implements OffchainLookupHandler<Extract<OffchainLookup, { variant: 'ObjectField' }>>
{
  async resolve(
    lookup: Extract<OffchainLookup, { variant: 'ObjectField' }>,
    client: SuiGrpcClient
  ): Promise<Uint8Array> {
    const { parent_object, field_path, placeholder_name } = lookup.fields;

    const parentAddress = bytesToAddress(parent_object);

    try {
      const { object } = await client.getObject({
        objectId: parentAddress,
        include: { json: true },
      });

      const content = object.json as Record<string, unknown> | null;
      if (!content) {
        throw new LookupResolutionError('ObjectField', 'Object has no JSON content', {
          parentAddress,
        });
      }

      const pathParts = field_path.split('.').filter(Boolean);
      let currentValue: unknown = content;

      for (let i = 0; i < pathParts.length; i++) {
        const part = pathParts[i]!;
        if (typeof currentValue !== 'object' || currentValue === null) {
          throw new LookupResolutionError(
            'ObjectField',
            `Cannot navigate path: '${part}' is not an object`,
            { path: field_path, currentStep: i }
          );
        }

        currentValue = (currentValue as Record<string, unknown>)[part];
        if (currentValue === undefined) {
          throw new LookupResolutionError('ObjectField', `Path component '${part}' not found`, {
            path: field_path,
            currentStep: i,
          });
        }
      }

      return this.valueToBytes(currentValue);
    } catch (error) {
      if (error instanceof LookupResolutionError) {
        throw error;
      }

      throw new LookupResolutionError('ObjectField', 'gRPC call failed', {
        error: error instanceof Error ? error.message : String(error),
        placeholder_name,
        parentAddress,
        field_path,
      });
    }
  }

  private valueToBytes(value: unknown): Uint8Array {
    if (typeof value === 'string') {
      if (value.startsWith('0x')) {
        return addressToBytes(value);
      }
      return stringToBytes(value);
    }
    if (typeof value === 'number' || typeof value === 'bigint') {
      const bytes = new Uint8Array(8);
      new DataView(bytes.buffer).setBigUint64(0, BigInt(value), true); // little-endian
      return bytes;
    }
    if (Array.isArray(value)) {
      return new Uint8Array(value as number[]);
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
