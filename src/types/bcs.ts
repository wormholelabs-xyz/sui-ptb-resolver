export type Argument =
  | { variant: 'GasCoin' }
  | { variant: 'Input'; fields: { index: bigint } }
  | { variant: 'Result'; fields: { index: bigint } }
  | {
      variant: 'NestedResult';
      fields: { index: bigint; nested_index: bigint };
    };

export interface ObjectRef {
  object_id: Uint8Array; // 32 bytes
  version: bigint;
  digest: Uint8Array;
}

export interface SharedObjectRef {
  object_id: Uint8Array; // 32 bytes
  initial_shared_version: bigint;
  mutable: boolean;
}

export interface StructField {
  name: Uint8Array; // Field name as bytes
  value: Uint8Array; // Field value as BCS-encoded bytes
}

export type Input =
  | { variant: 'Pure'; fields: { data: Uint8Array; type_name: string } }
  | { variant: 'ObjectImmutableOrOwned'; fields: { object_ref: ObjectRef } }
  | { variant: 'ObjectShared'; fields: { shared_ref: SharedObjectRef } }
  | { variant: 'ObjectReceiving'; fields: { object_ref: ObjectRef } };

export interface TypeTag {
  type_tag: Uint8Array;
}

export type Command =
  | {
      variant: 'MoveCall';
      fields: {
        package: Uint8Array; // 32 bytes
        module_name: string;
        function_name: string;
        type_arguments: TypeTag[];
        arguments: Argument[];
      };
    }
  | {
      variant: 'TransferObjects';
      fields: {
        objects: Argument[];
        recipient: Argument;
      };
    }
  | {
      variant: 'SplitCoins';
      fields: {
        coin: Argument;
        amounts: Argument[];
      };
    }
  | {
      variant: 'MergeCoins';
      fields: {
        destination: Argument;
        sources: Argument[];
      };
    }
  | {
      variant: 'MakeMoveVec';
      fields: {
        type_tag: TypeTag | null;
        elements: Argument[];
      };
    };

export interface PTBInstruction {
  inputs: Input[];
  commands: Command[];
}

export interface InstructionGroup {
  instructions: PTBInstruction;
  required_objects: Uint8Array[]; // addresses as 32-byte arrays
  required_types: string[];
}

export interface InstructionGroups {
  groups: InstructionGroup[];
}

// Offchain lookups types

export type OffchainLookup =
  | {
      variant: 'DynamicField';
      fields: {
        parent_object: Uint8Array; // 32 bytes
        key: Uint8Array;
        placeholder_name: string;
      };
    }
  | {
      variant: 'DynamicFieldByType';
      fields: {
        parent_object: Uint8Array; // 32 bytes
        type_suffix: string;
        extract_field: string;
        placeholder_name: string;
      };
    }
  | {
      variant: 'DynamicObjectField';
      fields: {
        parent_object: Uint8Array; // 32 bytes
        key: Uint8Array;
        placeholder_name: string;
      };
    }
  | {
      variant: 'TableItem';
      fields: {
        parent_object: Uint8Array; // 32 bytes
        table_path: string;
        key_raw: Uint8Array | null;
        key_structured: StructField[] | null;
        key_type: string; // Move type string for the key
        placeholder_name: string;
      };
    }
  | {
      variant: 'ObjectField';
      fields: {
        parent_object: Uint8Array; // 32 bytes
        field_path: string;
        placeholder_name: string;
      };
    };

export type LookupValueType = 'Address' | 'CoinType' | 'ObjectRef' | 'Raw';

export interface LookupHandle {
  lookup_index: bigint;
  expected_value_type: LookupValueType;
}

export type ResolverResult =
  | { variant: 'Resolved'; fields: { instruction_groups: InstructionGroups } }
  | { variant: 'NeedsOffchainData'; fields: { lookups: OffchainLookup[] } }
  | { variant: 'Error'; fields: { message: string } };

export interface KeyValue {
  key: string;
  value: Uint8Array;
}

export interface DiscoveredData {
  entries: KeyValue[];
}

// command results types
export interface CommandResult {
  command_index: bigint;
  result_count: bigint;
}

export interface NestedCommandResult {
  command_index: bigint;
  nested_index: bigint;
}

export interface InputHandle {
  input_index: bigint;
}
