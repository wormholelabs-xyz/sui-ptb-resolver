import type { SuiClient } from '@mysten/sui/client';

import { addressToBytes, bytesToAddress, bytesToHex, packObjectRef } from '../bcs/converters.js';
import type { OffchainLookup } from '../types/index.js';
import { LookupResolutionError, type OffchainLookupHandler } from './base.js';

/**
 * Handler for DynamicObjectField lookups
 *
 * Process:
 * 1. Fetch dynamic object field from parent using key
 * 2. Extract ObjectRef (object_id, version, digest)
 * 3. Return packed ObjectRef as bytes
 */
export class DynamicObjectFieldHandler
  implements OffchainLookupHandler<Extract<OffchainLookup, { variant: 'DynamicObjectField' }>>
{
  async resolve(
    lookup: Extract<OffchainLookup, { variant: 'DynamicObjectField' }>,
    client: SuiClient
  ): Promise<Uint8Array> {
    const { parent_object, key, placeholder_name } = lookup.fields;

    const parentAddress = bytesToAddress(parent_object);

    try {
      const field = await client.getDynamicFieldObject({
        parentId: parentAddress,
        name: {
          type: 'vector<u8>',
          value: Array.from(key),
        },
      });

      if (!field.data) {
        throw new LookupResolutionError('DynamicObjectField', 'Dynamic object field not found', {
          parentAddress,
          keyHex: bytesToHex(key),
        });
      }

      const objectId = field.data.objectId;
      const version = field.data.version;
      const digest = field.data.digest;

      if (!objectId || !version || !digest) {
        throw new LookupResolutionError('DynamicObjectField', 'Missing ObjectRef components', {
          objectId,
          version,
          digest,
        });
      }

      const objectRef = {
        object_id: addressToBytes(objectId),
        version: BigInt(version),
        digest: typeof digest === 'string' ? new Uint8Array(Buffer.from(digest, 'base64')) : digest,
      };

      return packObjectRef(objectRef);
    } catch (error) {
      if (error instanceof LookupResolutionError) {
        throw error;
      }

      throw new LookupResolutionError('DynamicObjectField', 'RPC call failed', {
        error: error instanceof Error ? error.message : String(error),
        placeholder_name,
        parentAddress,
      });
    }
  }
}
