/**
 * Event Parser
 *
 * Parses events emitted by sui_ptb_resolver during dry-run execution.
 * Reconstructs OffchainLookup and PTB instructions from event data.
 */

import type { SuiClientTypes } from '@mysten/sui/client';

import { ResolverInstructionsEventBCS, ResolverNeedsDataEventBCS } from '../bcs/schemas.js';
import { LOOKUP_KEY_SEPARATOR } from '../config/constants.js';
import type {
  Command,
  Input,
  OffchainLookup,
  ParsedResolverEvent,
  ResolverInstructionsEvent,
  ResolverNeedsDataEvent,
} from '../types/index.js';
import { findSeparator } from '../utils/index.js';

/**
 * gRPC event shape (from simulateTransaction). `bcs` is already raw bytes (no
 * base64), and `json` shape varies across APIs — so we always parse `bcs`.
 */
type GrpcEvent = SuiClientTypes.Event;

export class EventParser {
  /**
   * Parse resolver events from a gRPC simulateTransaction result.
   * @param events - Events from the simulated transaction
   * @returns Parsed event result
   * @throws Error if no resolver event found or parsing fails
   */
  parseResolverEvent(events: GrpcEvent[]): ParsedResolverEvent {
    // Find resolver event
    const event = events.find(
      (e) =>
        e.eventType.includes('ptb_types::ResolverNeedsDataEvent') ||
        e.eventType.includes('ptb_types::ResolverInstructionsEvent')
    );

    if (!event) {
      throw new Error('No resolver event found in simulation result');
    }

    // Parse based on event type
    if (event.eventType.includes('ResolverNeedsDataEvent')) {
      return this.parseNeedsDataEvent(event);
    }

    if (event.eventType.includes('ResolverInstructionsEvent')) {
      return this.parseInstructionsEvent(event);
    }

    throw new Error(`Unknown resolver event type: ${event.eventType}`);
  }

  private parseNeedsDataEvent(event: GrpcEvent): ParsedResolverEvent {
    // Parse from event BCS (not json) for consistent shape across APIs.
    const decoded = ResolverNeedsDataEventBCS.parse(event.bcs);

    const parentObject = new Uint8Array(decoded.parent_object);
    const lookupKey = new Uint8Array(decoded.lookup_key);

    const lookup = this.reconstructLookup(
      parentObject,
      lookupKey,
      decoded.key_type,
      decoded.placeholder_name
    );

    // `raw` keeps the decoded fields for callers/debugging.
    const raw: ResolverNeedsDataEvent = {
      parent_object: `0x${Buffer.from(parentObject).toString('hex')}`,
      lookup_key: Array.from(lookupKey),
      key_type: decoded.key_type,
      placeholder_name: decoded.placeholder_name,
    };

    return {
      type: 'NeedsData',
      lookup,
      raw,
    };
  }

  private parseInstructionsEvent(event: GrpcEvent): ParsedResolverEvent {
    // Always parse from BCS: the SDK warns json shape varies (JSON-RPC vs gRPC),
    // and addresses in ObjectRef must be bytes, not strings.
    const parsed = ResolverInstructionsEventBCS.parse(event.bcs);

    const inputs = parsed.inputs.map((input: unknown) => this.transformEnum(input)) as Input[];
    const commands = parsed.commands.map((cmd: unknown) =>
      this.transformEnum(cmd, true)
    ) as Command[];
    const requiredObjects = parsed.required_objects.map((arr: number[]) => new Uint8Array(arr));
    const requiredTypes = parsed.required_types;

    const raw: ResolverInstructionsEvent = {
      inputs,
      commands,
      required_objects: requiredObjects.map(
        (arr: Uint8Array) => `0x${Buffer.from(arr).toString('hex')}`
      ),
      required_types: requiredTypes,
    };

    return {
      type: 'Resolved',
      inputs,
      commands,
      required_objects: requiredObjects,
      required_types: requiredTypes,
      raw,
    };
  }

  private transformEnum(enumObj: unknown, isCommand: boolean = false): Record<string, unknown> {
    // @mysten/bcs format: { VariantName: { ...fields } }
    // Our format: { variant: 'VariantName', fields: { ...fields } }
    if (typeof enumObj !== 'object' || enumObj === null) {
      throw new Error('Invalid enum object: expected object');
    }

    const enumRecord = enumObj as Record<string, unknown>;
    const variant = Object.keys(enumRecord)[0];
    if (!variant) {
      throw new Error('Invalid enum object: no variant found');
    }
    const fields = enumRecord[variant];

    const transformedFields: Record<string, unknown> = {};
    if (typeof fields !== 'object' || fields === null) {
      throw new Error('Invalid enum fields: expected object');
    }
    for (const [key, value] of Object.entries(fields as Record<string, unknown>)) {
      if (Array.isArray(value)) {
        if (
          isCommand &&
          (key === 'arguments' ||
            key === 'objects' ||
            key === 'amounts' ||
            key === 'sources' ||
            key === 'elements')
        ) {
          transformedFields[key] = value.map((item: unknown) => this.transformEnum(item));
        } else if (value.length > 0 && typeof value[0] === 'object' && !Array.isArray(value[0])) {
          const firstKey = Object.keys(value[0] as Record<string, unknown>)[0];
          if (firstKey && typeof (value[0] as Record<string, unknown>)[firstKey] === 'object') {
            // Likely an array of enums
            transformedFields[key] = value.map((item: unknown) => this.transformEnum(item));
          } else {
            transformedFields[key] = value;
          }
        } else {
          transformedFields[key] = value;
        }
      } else if (
        typeof value === 'object' &&
        value !== null &&
        !Buffer.isBuffer(value) &&
        !(value instanceof Uint8Array)
      ) {
        if (isCommand && (key === 'recipient' || key === 'coin' || key === 'destination')) {
          transformedFields[key] = this.transformEnum(value);
        } else {
          const keys = Object.keys(value);
          const firstKey = keys[0];
          if (
            keys.length === 1 &&
            firstKey &&
            typeof (value as Record<string, unknown>)[firstKey] === 'object'
          ) {
            transformedFields[key] = this.transformEnum(value);
          } else {
            transformedFields[key] = value;
          }
        }
      } else {
        transformedFields[key] = value;
      }
    }

    return { variant, fields: transformedFields };
  }

  /**
   * Reconstruct OffchainLookup from event data
   *
   * The lookup_key format depends on the lookup type:
   * - DynamicFieldByType: type_suffix + 0xff + extract_field
   * - TableItem (raw key): table_path + 0xff + raw_key
   * - TableItem (structured key): table_path + 0xff + num_fields(1) + [name_len(1) + name + value_len(2) + value]*
   * - DynamicField: raw key bytes
   * - ObjectField: field_path bytes
   * - DynamicObjectField: raw key bytes
   *
   * @param parentObject - Parent object address (32 bytes)
   * @param lookupKey - Lookup key bytes (format depends on type)
   * @param keyType - Move type string for table keys (empty for non-table lookups)
   * @param placeholderName - Semantic key for discovered data
   * @returns Reconstructed OffchainLookup
   */
  private reconstructLookup(
    parentObject: Uint8Array,
    lookupKey: Uint8Array,
    keyType: string,
    placeholderName: string
  ): OffchainLookup {
    // Check if lookup_key contains separator (0xff)
    const separatorIndex = findSeparator(lookupKey, LOOKUP_KEY_SEPARATOR);

    if (separatorIndex !== -1) {
      const part1 = lookupKey.slice(0, separatorIndex);
      const part1Str = new TextDecoder('utf-8', { fatal: false }).decode(part1);
      const afterSeparator = lookupKey.slice(separatorIndex + 1);

      if (part1Str.includes('.')) {
        const tablePath = part1Str;

        // Check if this is length-prefixed structured key format
        // Format: num_fields(1) + [name_len(1) + name + value_len(2 big-endian) + value]*
        if (afterSeparator.length > 0) {
          const numFields = afterSeparator[0]!;

          if (numFields >= 1 && numFields <= 10) {
            const structuredFields = this.tryParseLengthPrefixedFields(afterSeparator);
            if (structuredFields !== null) {
              return {
                variant: 'TableItem',
                fields: {
                  parent_object: parentObject,
                  table_path: tablePath,
                  key_raw: null,
                  key_structured: structuredFields,
                  key_type: keyType,
                  placeholder_name: placeholderName,
                },
              };
            }
          }
        }

        // Fall back to raw key format: table_path + 0xff + raw_key
        return {
          variant: 'TableItem',
          fields: {
            parent_object: parentObject,
            table_path: part1Str,
            key_raw: afterSeparator,
            key_structured: null,
            key_type: keyType,
            placeholder_name: placeholderName,
          },
        };
      } else {
        // DynamicFieldByType: type_suffix + 0xff + extract_field
        const part2Str = new TextDecoder('utf-8', { fatal: false }).decode(afterSeparator);
        return {
          variant: 'DynamicFieldByType',
          fields: {
            parent_object: parentObject,
            type_suffix: part1Str,
            extract_field: part2Str,
            placeholder_name: placeholderName,
          },
        };
      }
    }

    try {
      const keyStr = new TextDecoder('utf-8', { fatal: true }).decode(lookupKey);

      if (keyStr.includes('.') || /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(keyStr)) {
        return {
          variant: 'ObjectField',
          fields: {
            parent_object: parentObject,
            field_path: keyStr,
            placeholder_name: placeholderName,
          },
        };
      }
    } catch {
      // Not valid UTF-8, must be binary key
    }

    return {
      variant: 'DynamicField',
      fields: {
        parent_object: parentObject,
        key: lookupKey,
        placeholder_name: placeholderName,
      },
    };
  }

  /**
   * Try to parse length-prefixed structured key fields
   *
   * Format: num_fields(1 byte) + [name_len(1 byte) + name + value_len(2 bytes big-endian) + value]*
   *
   * @param data - Byte array starting with num_fields
   * @returns Array of {name, value} pairs or null if parsing fails
   */
  private tryParseLengthPrefixedFields(
    data: Uint8Array
  ): Array<{ name: Uint8Array; value: Uint8Array }> | null {
    if (data.length < 1) {
      return null;
    }

    const numFields = data[0]!;
    const fields: Array<{ name: Uint8Array; value: Uint8Array }> = [];
    let offset = 1;

    for (let i = 0; i < numFields; i++) {
      if (offset >= data.length) {
        return null;
      }
      const nameLen = data[offset]!;
      offset += 1;

      if (offset + nameLen > data.length) {
        return null;
      }
      const name = data.slice(offset, offset + nameLen);
      offset += nameLen;

      if (offset + 2 > data.length) {
        return null;
      }
      const valueLen = (data[offset]! << 8) | data[offset + 1]!;
      offset += 2;

      if (offset + valueLen > data.length) {
        return null;
      }
      const value = data.slice(offset, offset + valueLen);
      offset += valueLen;

      fields.push({ name, value });
    }

    if (offset !== data.length) {
      return null;
    }

    return fields;
  }
}
