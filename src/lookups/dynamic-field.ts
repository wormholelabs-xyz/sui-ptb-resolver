import { bcs } from '@mysten/sui/bcs';
import type { SuiGrpcClient } from '@mysten/sui/grpc';

import { addressToBytes, bytesToAddress, bytesToHex, stringToBytes } from '../bcs/converters.js';
import type { OffchainLookup } from '../types/index.js';
import { LookupResolutionError, type OffchainLookupHandler } from './base.js';

/**
 * Handler for DynamicField lookups (gRPC).
 *
 * Process:
 * 1. Fetch the dynamic field by its vector<u8> key (BCS-encoded for the gRPC name).
 * 2. Decode the value from the field's BCS bytes (json for shape, bcs for value).
 *
 * NOTE: not exercised by the production resolver (which uses DynamicFieldByType +
 * TableItem). Implemented for completeness; unverified against live mainnet.
 */
export class DynamicFieldHandler
  implements OffchainLookupHandler<Extract<OffchainLookup, { variant: 'DynamicField' }>>
{
  async resolve(
    lookup: Extract<OffchainLookup, { variant: 'DynamicField' }>,
    client: SuiGrpcClient
  ): Promise<Uint8Array> {
    const { parent_object, key, placeholder_name } = lookup.fields;

    const parentAddress = bytesToAddress(parent_object);

    try {
      // gRPC dynamic-field name takes the key as BCS bytes. A vector<u8> key
      // BCS-encodes as ULEB128 length prefix + raw bytes.
      const keyBcs = bcs.vector(bcs.u8()).serialize(Array.from(key)).toBytes();

      const field = await client.getDynamicField({
        parentId: parentAddress,
        name: { type: 'vector<u8>', bcs: keyBcs },
      });

      const value = field.dynamicField.value;
      if (!value?.bcs) {
        throw new LookupResolutionError('DynamicField', 'Dynamic field has no value', {
          parentAddress,
          keyHex: bytesToHex(key),
        });
      }

      // The value type tells us how to decode. Common cases: a string (coin type)
      // or an address. Default to raw bytes.
      return this.decodeValue(value.type, value.bcs);
    } catch (error) {
      if (error instanceof LookupResolutionError) {
        throw error;
      }

      throw new LookupResolutionError('DynamicField', 'gRPC call failed', {
        error: error instanceof Error ? error.message : String(error),
        placeholder_name,
        parentAddress,
      });
    }
  }

  private decodeValue(type: string, valueBcs: Uint8Array): Uint8Array {
    if (type === 'address') {
      return addressToBytes(bcs.Address.parse(valueBcs));
    }
    if (type.includes('::string::String') || type === '0x1::ascii::String') {
      return stringToBytes(bcs.string().parse(valueBcs));
    }
    // Fallback: return the raw value bytes.
    return new Uint8Array(valueBcs);
  }
}
