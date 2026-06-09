import { bcs } from '@mysten/sui/bcs';
import type { SuiGrpcClient } from '@mysten/sui/grpc';

import { addressToBytes, bytesToAddress, bytesToHex, packObjectRef } from '../bcs/converters.js';
import type { OffchainLookup } from '../types/index.js';
import { LookupResolutionError, type OffchainLookupHandler } from './base.js';

/**
 * Handler for DynamicObjectField lookups (gRPC).
 *
 * Process:
 * 1. Fetch the dynamic OBJECT field by its vector<u8> key.
 * 2. Extract the child object's ObjectRef (object_id, version, digest).
 * 3. Return the packed ObjectRef bytes.
 *
 * NOTE: not exercised by the production resolver. Implemented for completeness;
 * unverified against live mainnet.
 */
export class DynamicObjectFieldHandler
  implements OffchainLookupHandler<Extract<OffchainLookup, { variant: 'DynamicObjectField' }>>
{
  async resolve(
    lookup: Extract<OffchainLookup, { variant: 'DynamicObjectField' }>,
    client: SuiGrpcClient
  ): Promise<Uint8Array> {
    const { parent_object, key, placeholder_name } = lookup.fields;

    const parentAddress = bytesToAddress(parent_object);

    try {
      const keyBcs = bcs.vector(bcs.u8()).serialize(Array.from(key)).toBytes();

      // gRPC has no getDynamicObjectField; getDynamicField returns the entry. For a
      // dynamic OBJECT field the entry carries the child object's id in `childId`.
      const { dynamicField } = await client.getDynamicField({
        parentId: parentAddress,
        name: { type: 'vector<u8>', bcs: keyBcs },
      });

      const childId = dynamicField.$kind === 'DynamicObject' ? dynamicField.childId : undefined;
      if (!childId) {
        throw new LookupResolutionError(
          'DynamicObjectField',
          'Field is not a dynamic object field (no childId)',
          { parentAddress, keyHex: bytesToHex(key) }
        );
      }

      // Fetch the child object for its ObjectRef (version + digest).
      const { object } = await client.getObject({ objectId: childId });
      if (!object.objectId || !object.version || !object.digest) {
        throw new LookupResolutionError('DynamicObjectField', 'Missing ObjectRef components', {
          parentAddress,
          keyHex: bytesToHex(key),
        });
      }

      return packObjectRef({
        object_id: addressToBytes(object.objectId),
        version: BigInt(object.version),
        digest:
          typeof object.digest === 'string'
            ? new Uint8Array(Buffer.from(object.digest, 'base64'))
            : object.digest,
      });
    } catch (error) {
      if (error instanceof LookupResolutionError) {
        throw error;
      }

      throw new LookupResolutionError('DynamicObjectField', 'gRPC call failed', {
        error: error instanceof Error ? error.message : String(error),
        placeholder_name,
        parentAddress,
      });
    }
  }
}
