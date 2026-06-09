import { bcs } from '@mysten/sui/bcs';
import type { SuiClientTypes } from '@mysten/sui/client';
import type { SuiGrpcClient } from '@mysten/sui/grpc';

import { addressToBytes, bytesToAddress } from '../bcs/converters.js';
import type { OffchainLookup } from '../types/index.js';
import { LookupResolutionError, type OffchainLookupHandler } from './base.js';

// A dynamic-field value holding a single `package: address` (e.g. Wormhole
// State's CurrentPackage). A single-address-field struct BCS-encodes as exactly
// 32 bytes. Field order/shape verified against the executor's CurrentPackageValueBcs.
const SingleAddressValueBcs = bcs.struct('SingleAddressValue', {
  value: bcs.Address,
});

/**
 * Handler for DynamicFieldByType lookups (gRPC).
 *
 * 1. List dynamic fields of the parent object.
 * 2. Match by type_suffix (e.g. "CurrentPackage").
 * 3. BCS-decode the field value to extract the address (extract_field, e.g. "package").
 * 4. Fallback: Wormhole State objects keep the package in the object TYPE prefix,
 *    not a dynamic field — derive it from the parent's type when no field matches.
 * Returns 32-byte address.
 */
export class DynamicFieldByTypeHandler
  implements OffchainLookupHandler<Extract<OffchainLookup, { variant: 'DynamicFieldByType' }>>
{
  async resolve(
    lookup: Extract<OffchainLookup, { variant: 'DynamicFieldByType' }>,
    client: SuiGrpcClient
  ): Promise<Uint8Array> {
    const { parent_object, type_suffix, extract_field, placeholder_name } = lookup.fields;

    const parentAddress = bytesToAddress(parent_object);

    try {
      // Page through dynamic fields looking for one whose type ends with the suffix.
      let cursor: string | null = null;
      let hasNextPage = true;
      while (hasNextPage) {
        const page: SuiClientTypes.ListDynamicFieldsResponse = await client.listDynamicFields({
          parentId: parentAddress,
          cursor,
        });

        const match = page.dynamicFields.find((f: SuiClientTypes.DynamicFieldEntry) =>
          f.type.endsWith(type_suffix)
        );
        if (match) {
          // Re-fetch the field with its value bytes and BCS-decode the address.
          const field = await client.getDynamicField({
            parentId: parentAddress,
            name: match.name,
          });
          const valueBcs = field.dynamicField.value?.bcs;
          if (!valueBcs) {
            throw new LookupResolutionError('DynamicFieldByType', 'Field has no BCS value', {
              type_suffix,
              extract_field,
            });
          }
          const decoded = SingleAddressValueBcs.parse(valueBcs);
          return addressToBytes(decoded.value);
        }

        hasNextPage = page.hasNextPage;
        cursor = page.cursor;
      }

      // FALLBACK: Wormhole State objects expose the current package in the object
      // TYPE prefix (0xPKG::module::State), not as a dynamic field.
      if (extract_field === 'package' || type_suffix === 'CurrentPackage') {
        const { object } = await client.getObject({ objectId: parentAddress });
        const packageId = object.type.split('::')[0];
        if (packageId) {
          return addressToBytes(packageId);
        }
      }

      throw new LookupResolutionError(
        'DynamicFieldByType',
        `No dynamic field found with type suffix: ${type_suffix}`,
        { parentAddress, type_suffix }
      );
    } catch (error) {
      if (error instanceof LookupResolutionError) {
        throw error;
      }

      throw new LookupResolutionError('DynamicFieldByType', 'gRPC call failed', {
        error: error instanceof Error ? error.message : String(error),
        placeholder_name,
        parentAddress,
      });
    }
  }
}
