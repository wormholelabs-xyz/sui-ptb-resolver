import type { SuiGrpcClient } from '@mysten/sui/grpc';
import { deriveDynamicFieldID, parseStructTag } from '@mysten/sui/utils';

import { bytesToAddress, stringToBytes } from '../bcs/converters.js';
import type { OffchainLookup, StructField } from '../types/index.js';
import { LookupResolutionError, type OffchainLookupHandler } from './base.js';
import { concatBytes, encodeFieldValue } from './key-encoding.js';

/**
 * Handler for TableItem lookups (gRPC).
 *
 * gRPC has no `getDynamicFieldObject({name:{type,value}})` that BCS-encodes the
 * key by name. We instead:
 *  1. Navigate `table_path` over the parent object's JSON content to find the
 *     table's object id (json is fine for *navigation* — field names only).
 *  2. Encode the structured key to BCS in the key struct's DECLARED field order,
 *     fetched generically from chain via movePackageService.getDatatype (so any
 *     resolver's key encodes correctly, not just CoinTypeKey).
 *  3. Derive the dynamic-field object id (deriveDynamicFieldID) and getObject it.
 *  4. Decode the value bytes (json for navigation done; value via bcs/json).
 */
export class TableItemHandler
  implements OffchainLookupHandler<Extract<OffchainLookup, { variant: 'TableItem' }>>
{
  async resolve(
    lookup: Extract<OffchainLookup, { variant: 'TableItem' }>,
    client: SuiGrpcClient
  ): Promise<Uint8Array> {
    const { parent_object, table_path, key_raw, key_structured, key_type, placeholder_name } =
      lookup.fields;

    const parentAddress = bytesToAddress(parent_object);

    try {
      const tableId = await this.navigateTablePath(client, parentAddress, table_path);

      // Build the BCS bytes of the key as Move would encode the key struct/value.
      const keyBcs = key_structured
        ? await this.encodeStructuredKey(client, key_type, key_structured)
        : this.encodeRawKey(key_raw!);

      // Derive the dynamic field object id and fetch it.
      const fieldId = deriveDynamicFieldID(tableId, key_type, keyBcs);
      const { object } = await client.getObject({ objectId: fieldId, include: { json: true } });

      // The Field<K, V> wrapper exposes the stored value under `value`.
      const json = object.json as Record<string, unknown> | null;
      const value = json?.value;

      if (value === undefined || value === null) {
        throw new LookupResolutionError('TableItem', 'Table item has no value field', {
          fieldId,
          availableFields: json ? Object.keys(json) : [],
        });
      }

      return this.valueToBytes(value);
    } catch (error) {
      if (error instanceof LookupResolutionError) {
        throw error;
      }

      throw new LookupResolutionError('TableItem', 'gRPC call failed', {
        error: error instanceof Error ? error.message : String(error),
        placeholder_name,
        parentAddress,
        table_path,
      });
    }
  }

  /**
   * Encode the structured key to BCS in the key struct's declared field order.
   *
   * The resolver emits fields by NAME with per-field bytes that are NOT uniformly
   * BCS-encoded (e.g. a `vector<u8>` addr is raw, a `u16` chain is already its 2
   * LE bytes). We fetch the struct layout from chain to learn (a) field order and
   * (b) each field's Move type, then re-encode each value to canonical struct-BCS.
   */
  private async encodeStructuredKey(
    client: SuiGrpcClient,
    keyType: string,
    fields: StructField[]
  ): Promise<Uint8Array> {
    const tag = parseStructTag(keyType);

    const resp = await client.movePackageService.getDatatype({
      packageId: tag.address,
      moduleName: tag.module,
      name: tag.name,
    });
    const descriptorFields = resp.response.datatype?.fields;
    if (!descriptorFields || descriptorFields.length === 0) {
      throw new LookupResolutionError('TableItem', 'Key datatype has no fields', { keyType });
    }

    // Index the resolver-provided values by field name.
    const byName = new Map<string, Uint8Array>();
    for (const f of fields) {
      byName.set(new TextDecoder().decode(f.name), new Uint8Array(f.value));
    }

    const parts: Uint8Array[] = [];
    for (const fd of descriptorFields) {
      const fieldName = fd.name;
      if (fieldName === undefined) {
        throw new LookupResolutionError('TableItem', 'Datatype field missing name', { keyType });
      }
      const raw = byName.get(fieldName);
      if (!raw) {
        throw new LookupResolutionError(
          'TableItem',
          `Key is missing field '${fieldName}' required by ${keyType}`,
          { provided: Array.from(byName.keys()) }
        );
      }
      parts.push(encodeFieldValue(fd.type?.type, raw, fieldName, keyType));
    }

    return concatBytes(parts);
  }

  // Legacy raw key: the bytes are used as-is (vector<u8> key encoded by caller).
  private encodeRawKey(key: Uint8Array): Uint8Array {
    return new Uint8Array(key);
  }

  private valueToBytes(value: unknown): Uint8Array {
    if (typeof value === 'string') {
      // Coin type or other string value. Mirrors the JSON-RPC handler.
      return stringToBytes(value);
    }
    if (Array.isArray(value)) {
      return new Uint8Array(value as number[]);
    }
    throw new LookupResolutionError('TableItem', `Unexpected value type: ${typeof value}`, {
      value,
    });
  }

  /**
   * Walk a dot-path (e.g. "token_registry.coin_types") over the parent object's
   * JSON content to find the nested table's object id. JSON is used only for
   * navigation (field names), never for the resolved value.
   */
  private async navigateTablePath(
    client: SuiGrpcClient,
    parentAddress: string,
    path: string
  ): Promise<string> {
    const { object } = await client.getObject({
      objectId: parentAddress,
      include: { json: true },
    });

    const content = object.json as Record<string, unknown> | null;
    if (!content) {
      throw new LookupResolutionError('TableItem', 'Parent object has no JSON content', {
        parentAddress,
      });
    }

    const pathParts = path.split('.').filter(Boolean);
    let current: unknown = content;

    for (let i = 0; i < pathParts.length; i++) {
      const part = pathParts[i]!;
      if (typeof current !== 'object' || current === null) {
        throw new LookupResolutionError('TableItem', `Path component '${part}' is not an object`, {
          path,
          currentStep: i,
        });
      }

      let fieldValue = (current as Record<string, unknown>)[part];
      if (fieldValue === undefined || fieldValue === null) {
        throw new LookupResolutionError('TableItem', `Path component '${part}' not found`, {
          path,
          currentStep: i,
          availableFields: Object.keys(current as Record<string, unknown>),
        });
      }

      // Unwrap a nested { fields: {...} } shape if present (JSON-RPC-style).
      if (typeof fieldValue === 'object' && fieldValue !== null && 'fields' in fieldValue) {
        fieldValue = (fieldValue as Record<string, unknown>).fields;
      }

      if (i === pathParts.length - 1) {
        const tableId = extractTableId(fieldValue);
        if (!tableId) {
          throw new LookupResolutionError(
            'TableItem',
            `Could not extract table id from field '${part}'`,
            { fieldValue }
          );
        }
        return tableId;
      }

      current = fieldValue;
    }

    throw new LookupResolutionError('TableItem', 'Failed to navigate table path', { path });
  }
}

/** A Sui Table/Bag serializes its UID; the id may appear as `id`, `id.id`, or `name`. */
function extractTableId(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value !== 'object' || value === null) return null;
  const obj = value as Record<string, unknown>;
  const id = obj.id;
  if (typeof id === 'string') return id;
  if (
    typeof id === 'object' &&
    id !== null &&
    typeof (id as Record<string, unknown>).id === 'string'
  ) {
    return (id as Record<string, unknown>).id as string;
  }
  if (typeof obj.name === 'string') return obj.name;
  return null;
}
