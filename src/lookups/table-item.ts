import { bcs } from '@mysten/sui/bcs';
import type { SuiClient } from '@mysten/sui/client';

import { bytesToAddress, stringToBytes } from '../bcs/converters.js';
import type { OffchainLookup, StructField } from '../types/index.js';
import { LookupResolutionError, type OffchainLookupHandler } from './base.js';

/**
 * Handler for TableItem lookups
 *
 * Process:
 * 1. Navigate table_path to find the table ID (e.g., "token_registry.coin_types")
 * 2. Build structured key from key_structured if provided, else use key_raw
 * 3. Fetch dynamic field from table using the key
 * 4. Extract and return the value as bytes
 */
export class TableItemHandler
  implements OffchainLookupHandler<Extract<OffchainLookup, { variant: 'TableItem' }>>
{
  async resolve(
    lookup: Extract<OffchainLookup, { variant: 'TableItem' }>,
    client: SuiClient
  ): Promise<Uint8Array> {
    const { parent_object, table_path, key_raw, key_structured, key_type, placeholder_name } =
      lookup.fields;

    const parentAddress = bytesToAddress(parent_object);

    try {
      const tableId = await this.navigateTablePath(client, parentAddress, table_path);

      let decodedKey: unknown;

      if (key_structured) {
        // For structured keys, we build the key ourselves
        decodedKey = this.buildStructuredKey(key_structured);
      } else {
        // For legacy raw keys, decode based on key_type
        decodedKey = this.decodeLegacyKey(key_raw!, key_type, table_path);
      }

      const tableItem = await client.getDynamicFieldObject({
        parentId: tableId,
        name: {
          type: key_type,
          value: decodedKey,
        },
      });

      if (tableItem.data?.content?.dataType !== 'moveObject') {
        throw new LookupResolutionError('TableItem', 'Table item is not a Move object', {
          tableId,
          key_type,
          decodedKey,
        });
      }

      const fields = tableItem.data.content.fields as Record<string, unknown>;
      const value = fields.value;

      if (value === undefined || value === null) {
        throw new LookupResolutionError('TableItem', 'Table item has no value field', {
          availableFields: Object.keys(fields),
        });
      }

      if (typeof value === 'string') {
        // Coin type or other string value
        return stringToBytes(value);
      }

      if (Array.isArray(value)) {
        // Already bytes
        return new Uint8Array(value);
      }

      throw new LookupResolutionError('TableItem', `Unexpected value type: ${typeof value}`, {
        value,
      });
    } catch (error) {
      if (error instanceof LookupResolutionError) {
        throw error;
      }

      throw new LookupResolutionError('TableItem', 'RPC call failed', {
        error: error instanceof Error ? error.message : String(error),
        placeholder_name,
        parentAddress,
        table_path,
      });
    }
  }

  private buildStructuredKey(fields: StructField[]): Record<string, unknown> {
    const key: Record<string, unknown> = {};

    for (const field of fields) {
      const fieldName = new TextDecoder().decode(field.name);
      const fieldValue = field.value;

      // Decode the BCS value based on common patterns
      const decodedValue = this.decodeBCSValue(fieldValue, fieldName);
      key[fieldName] = decodedValue;
    }

    return key;
  }

  private decodeBCSValue(bytes: Uint8Array, fieldName: string): unknown {
    const lowerName = fieldName.toLowerCase();

    if (lowerName.includes('chain')) {
      // Decode as u16
      return bcs.u16().parse(bytes);
    }

    if (lowerName.includes('addr') || lowerName.includes('address')) {
      return Array.from(bytes);
    }

    if (lowerName.includes('amount') || lowerName.includes('value')) {
      // Try u64 first
      try {
        return bcs.u64().parse(bytes).toString();
      } catch {
        // Try u256
        try {
          return bcs.u256().parse(bytes).toString();
        } catch {
          // Fall back to raw bytes
          return Array.from(bytes);
        }
      }
    }

    // Default: return as raw bytes array
    return Array.from(bytes);
  }

  private decodeLegacyKey(key: Uint8Array, keyType: string, _tablePath: string): unknown {
    if (keyType.includes('vector<u8>')) {
      return Array.from(key);
    }

    return Array.from(key);
  }

  private async navigateTablePath(
    client: SuiClient,
    parentAddress: string,
    path: string
  ): Promise<string> {
    const pathParts = path.split('.');

    const currentObject = await client.getObject({
      id: parentAddress,
      options: { showContent: true },
    });

    if (currentObject.data?.content?.dataType !== 'moveObject') {
      throw new LookupResolutionError('TableItem', 'Parent object is not a Move object', {
        parentAddress,
      });
    }

    let currentFields = currentObject.data.content.fields as Record<string, unknown>;

    for (let i = 0; i < pathParts.length; i++) {
      const part = pathParts[i];
      if (!part) continue;

      let fieldValue = currentFields[part];

      if (fieldValue === undefined || fieldValue === null) {
        throw new LookupResolutionError('TableItem', `Path component '${part}' not found`, {
          path,
          currentStep: i,
          availableFields: Object.keys(currentFields),
        });
      }

      if (typeof fieldValue === 'object' && fieldValue !== null) {
        const obj = fieldValue as Record<string, unknown>;
        if ('fields' in obj && typeof obj.fields === 'object') {
          fieldValue = obj.fields as Record<string, unknown>;
        }
      }

      if (i === pathParts.length - 1) {
        if (typeof fieldValue === 'object' && fieldValue !== null) {
          const tableObj = fieldValue as Record<string, unknown>;

          const tableId =
            (tableObj.id as Record<string, unknown> | undefined)?.id ??
            tableObj.name ??
            tableObj.table_id;

          if (typeof tableId !== 'string') {
            throw new LookupResolutionError(
              'TableItem',
              `Could not extract table ID from field '${part}'`,
              { fieldValue }
            );
          }

          return tableId;
        }

        throw new LookupResolutionError(
          'TableItem',
          `Could not extract table ID from field '${part}'`,
          { fieldValue }
        );
      }

      if (typeof fieldValue === 'object' && fieldValue !== null) {
        currentFields = fieldValue as Record<string, unknown>;
      } else {
        throw new LookupResolutionError('TableItem', `Path component '${part}' is not an object`, {
          part,
          fieldValue,
        });
      }
    }

    throw new LookupResolutionError('TableItem', 'Failed to navigate table path', { path });
  }
}
