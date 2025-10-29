import type { SuiClient } from '@mysten/sui/client';

import { addressToBytes, bytesToAddress } from '../bcs/converters.js';
import type { OffchainLookup } from '../types/index.js';
import { LookupResolutionError, type OffchainLookupHandler } from './base.js';

/**
 * Handler for DynamicFieldByType lookups
 *
 * 1. Fetch all dynamic fields of parent object
 * 2. Filter by type_suffix (e.g., "CurrentPackage" for Core/TB state contracts)
 * 3. Get the matched field object
 * 4. Extract the field specified by extract_field (e.g., "package")
 * 5. Return as address bytes
 */
export class DynamicFieldByTypeHandler
  implements OffchainLookupHandler<Extract<OffchainLookup, { variant: 'DynamicFieldByType' }>>
{
  async resolve(
    lookup: Extract<OffchainLookup, { variant: 'DynamicFieldByType' }>,
    client: SuiClient
  ): Promise<Uint8Array> {
    const { parent_object, type_suffix, extract_field, placeholder_name } = lookup.fields;

    const parentAddress = bytesToAddress(parent_object);

    try {
      const fieldsResponse = await client.getDynamicFields({
        parentId: parentAddress,
      });

      const matchingField = fieldsResponse.data.find((field) => {
        const objectType = field.objectType ?? field.name?.type;
        return objectType?.endsWith(type_suffix);
      });

      if (!matchingField) {
        // WORKAROUND: For Wormhole State objects, package IDs are not in dynamic fields
        // but in the object type itself. If looking for "package" field and no dynamic
        // field found, try extracting from the parent object's type.
        if (extract_field === 'package' || type_suffix === 'CurrentPackage') {
          const parentObj = await client.getObject({
            id: parentAddress,
            options: { showContent: true },
          });

          if (parentObj.data?.content?.dataType === 'moveObject') {
            const objectType = parentObj.data.content.type;
            const packageId = objectType.split('::')[0];

            if (packageId) {
              return addressToBytes(packageId);
            }
          }
        }

        throw new LookupResolutionError(
          'DynamicFieldByType',
          `No dynamic field found with type suffix: ${type_suffix}`,
          { parentAddress, type_suffix }
        );
      }

      const fieldObject = await client.getObject({
        id: matchingField.objectId,
        options: { showContent: true },
      });

      if (fieldObject.data?.content?.dataType !== 'moveObject') {
        throw new LookupResolutionError('DynamicFieldByType', 'Field object is not a Move object', {
          fieldObjectId: matchingField.objectId,
        });
      }

      const fields = fieldObject.data.content.fields as Record<string, unknown>;
      const extractedValue = fields[extract_field];

      if (extractedValue === undefined || extractedValue === null) {
        throw new LookupResolutionError(
          'DynamicFieldByType',
          `Field '${extract_field}' not found in object`,
          { availableFields: Object.keys(fields) }
        );
      }

      if (typeof extractedValue === 'string') {
        return addressToBytes(extractedValue);
      }

      throw new LookupResolutionError(
        'DynamicFieldByType',
        `Expected address string, got ${typeof extractedValue}`,
        { extractedValue }
      );
    } catch (error) {
      if (error instanceof LookupResolutionError) {
        throw error;
      }

      throw new LookupResolutionError('DynamicFieldByType', 'RPC call failed', {
        error: error instanceof Error ? error.message : String(error),
        placeholder_name,
        parentAddress,
      });
    }
  }
}
