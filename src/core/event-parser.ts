/**
 * Event Parser
 *
 * Parses events emitted by sui_ptb_resolver during dry-run execution.
 * Reconstructs OffchainLookup and PTB instructions from event data.
 */

import type { SuiEvent } from '@mysten/sui/client';

import { addressToBytes, arrayToBytes } from '../bcs/converters.js';
import { ResolverInstructionsEventBCS } from '../bcs/schemas.js';
import { LOOKUP_KEY_SEPARATOR } from '../config/constants.js';
import type {
  Command,
  Input,
  OffchainLookup,
  ParsedResolverEvent,
  ResolverInstructionsEvent,
  ResolverNeedsDataEvent,
} from '../types/index.js';
import { findSeparator, splitBytes } from '../utils/index.js';

export class EventParser {
  /**
   * Parse resolver events from dry-run result
   * @param events - Events from dry-run execution
   * @returns Parsed event result
   * @throws Error if no resolver event found or parsing fails
   */
  parseResolverEvent(events: SuiEvent[]): ParsedResolverEvent {
    // Find resolver event
    const event = events.find(
      (e) =>
        e.type.includes('ptb_types::ResolverNeedsDataEvent') ||
        e.type.includes('ptb_types::ResolverInstructionsEvent')
    );

    if (!event) {
      throw new Error('No resolver event found in dry-run result');
    }

    // Parse based on event type
    if (event.type.includes('ResolverNeedsDataEvent')) {
      return this.parseNeedsDataEvent(event);
    }

    if (event.type.includes('ResolverInstructionsEvent')) {
      return this.parseInstructionsEvent(event);
    }

    throw new Error(`Unknown resolver event type: ${event.type}`);
  }

  private parseNeedsDataEvent(event: SuiEvent): ParsedResolverEvent {
    const data = event.parsedJson as ResolverNeedsDataEvent;

    if (!data?.parent_object || !data.lookup_key || !data.placeholder_name) {
      throw new Error('Invalid ResolverNeedsDataEvent: missing required fields');
    }

    const parentObject = this.parseAddress(data.parent_object);
    const lookupKey = arrayToBytes(data.lookup_key);

    const lookup = this.reconstructLookup(
      parentObject,
      lookupKey,
      data.key_type,
      data.placeholder_name
    );

    return {
      type: 'NeedsData',
      lookup,
      raw: data,
    };
  }

  private parseInstructionsEvent(event: SuiEvent): ParsedResolverEvent {
    const data = event.parsedJson as ResolverInstructionsEvent;

    if (!data?.inputs || !data.commands) {
      throw new Error('Invalid ResolverInstructionsEvent: missing required fields');
    }

    // IMPORTANT NOTE: Don't use parsedJson inputs/commands directly because Sui SDK
    // incorrectly parses addresses in ObjectRef as strings instead of bytes.
    // Instead, manually parse from the BCS event data.
    const bcsData = event.bcs;
    if (!bcsData) {
      throw new Error('Event missing BCS data');
    }

    const parsed = ResolverInstructionsEventBCS.parse(
      new Uint8Array(Buffer.from(bcsData, 'base64'))
    );

    const inputs = parsed.inputs.map((input: unknown) => this.transformEnum(input)) as Input[];
    const commands = parsed.commands.map((cmd: unknown) =>
      this.transformEnum(cmd, true)
    ) as Command[];
    const requiredObjects = parsed.required_objects.map((arr: number[]) => new Uint8Array(arr));
    const requiredTypes = parsed.required_types;

    return {
      type: 'Resolved',
      inputs,
      commands,
      required_objects: requiredObjects,
      required_types: requiredTypes,
      raw: data,
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
   * - TableItem: table_path + 0xff + key
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
      // Split at separator
      const parts = splitBytes(lookupKey, LOOKUP_KEY_SEPARATOR);

      const part1 = parts[0]!;
      const part1Str = new TextDecoder('utf-8', { fatal: false }).decode(part1);

      // Format: table_path + 0xff + field1_name + 0xfe + field1_value + 0xff + field2_name + 0xfe + field2_value
      if (part1Str.includes('.') && parts.length > 2) {
        const tablePath = part1Str;
        const structuredFields: Array<{ name: Uint8Array; value: Uint8Array }> = [];

        for (let i = 1; i < parts.length; i++) {
          const fieldPart = parts[i]!;
          // Split by 0xfe to get name and value
          const fieldSeparatorIndex = fieldPart.indexOf(0xfe);
          if (fieldSeparatorIndex !== -1) {
            const name = fieldPart.slice(0, fieldSeparatorIndex);
            const value = fieldPart.slice(fieldSeparatorIndex + 1);
            structuredFields.push({ name, value });
          }
        }

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
      } else if (parts.length === 2) {
        // Legacy format with 2 parts
        const part2 = parts[1]!;
        const part2Str = new TextDecoder('utf-8', { fatal: false }).decode(part2);

        if (part1Str.includes('.')) {
          // Legacy TableItem: table_path + 0xff + raw_key
          return {
            variant: 'TableItem',
            fields: {
              parent_object: parentObject,
              table_path: part1Str,
              key_raw: part2,
              key_structured: null,
              key_type: keyType,
              placeholder_name: placeholderName,
            },
          };
        } else {
          // DynamicFieldByType: type_suffix + 0xff + extract_field
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
      } else {
        throw new Error(
          `Invalid lookup_key format: unexpected structure with ${parts.length} parts`
        );
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

  private parseAddress(address: string | number[]): Uint8Array {
    if (typeof address === 'string') {
      return addressToBytes(address);
    }

    if (Array.isArray(address)) {
      return arrayToBytes(address);
    }

    throw new Error(`Invalid address format: ${typeof address}`);
  }
}
