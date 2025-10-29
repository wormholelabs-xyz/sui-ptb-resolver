/**
 * Event Type Definitions - Events emitted by sui_ptb_resolver module
 */

import type { Command, Input, OffchainLookup } from './bcs.js';

/**
 * Event emitted when resolver needs offchain data lookup
 */
export interface ResolverNeedsDataEvent {
  parent_object: string;
  lookup_key: number[];
  key_type: string;
  placeholder_name: string;
}

/**
 * Event emitted when resolver has completed and returns PTB instructions
 */
export interface ResolverInstructionsEvent {
  inputs: Input[];
  commands: Command[];
  required_objects: string[];
  required_types: string[];
}

/**
 * Generic resolver output event wrapper (contains BCS-encoded payload)
 */
export interface ResolverOutputEvent {
  event_type: 'NeedsOffchainData' | 'Resolved' | 'Error';
  payload: number[];
}

/**
 * Parsed result from resolver events
 */
export type ParsedResolverEvent =
  | {
      type: 'NeedsData';
      lookup: OffchainLookup;
      raw: ResolverNeedsDataEvent;
    }
  | {
      type: 'Resolved';
      inputs: Input[];
      commands: Command[];
      required_objects: Uint8Array[];
      required_types: string[];
      raw: ResolverInstructionsEvent;
    }
  | {
      type: 'Error';
      message: string;
    };
