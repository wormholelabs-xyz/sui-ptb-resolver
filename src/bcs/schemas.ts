import { bcs } from '@mysten/sui/bcs';

// Serdes types as BCS defined in ptb_types.move

export const ArgumentBCS = bcs.enum('Argument', {
  GasCoin: null,
  Input: bcs.struct('Input', { index: bcs.u64() }),
  Result: bcs.struct('Result', { index: bcs.u64() }),
  NestedResult: bcs.struct('NestedResult', {
    index: bcs.u64(),
    nested_index: bcs.u64(),
  }),
});

export const ObjectRefBCS = bcs.struct('ObjectRef', {
  object_id: bcs.fixedArray(32, bcs.u8()),
  version: bcs.u64(),
  digest: bcs.vector(bcs.u8()),
});

export const SharedObjectRefBCS = bcs.struct('SharedObjectRef', {
  object_id: bcs.fixedArray(32, bcs.u8()),
  initial_shared_version: bcs.u64(),
  mutable: bcs.bool(),
});

export const StructFieldBCS = bcs.struct('StructField', {
  name: bcs.vector(bcs.u8()),
  value: bcs.vector(bcs.u8()),
});

export const InputBCS = bcs.enum('Input', {
  Pure: bcs.struct('Pure', {
    data: bcs.vector(bcs.u8()),
    type_name: bcs.string(),
  }),
  ObjectImmutableOrOwned: bcs.struct('ObjectImmutableOrOwned', {
    object_ref: ObjectRefBCS,
  }),
  ObjectShared: bcs.struct('ObjectShared', { shared_ref: SharedObjectRefBCS }),
  ObjectReceiving: bcs.struct('ObjectReceiving', { object_ref: ObjectRefBCS }),
});

export const TypeTagBCS = bcs.struct('TypeTag', {
  type_tag: bcs.vector(bcs.u8()),
});

export const CommandBCS = bcs.enum('Command', {
  MoveCall: bcs.struct('MoveCall', {
    package: bcs.fixedArray(32, bcs.u8()),
    module_name: bcs.string(),
    function_name: bcs.string(),
    type_arguments: bcs.vector(TypeTagBCS),
    arguments: bcs.vector(ArgumentBCS),
  }),
  TransferObjects: bcs.struct('TransferObjects', {
    objects: bcs.vector(ArgumentBCS),
    recipient: ArgumentBCS,
  }),
  SplitCoins: bcs.struct('SplitCoins', {
    coin: ArgumentBCS,
    amounts: bcs.vector(ArgumentBCS),
  }),
  MergeCoins: bcs.struct('MergeCoins', {
    destination: ArgumentBCS,
    sources: bcs.vector(ArgumentBCS),
  }),
  MakeMoveVec: bcs.struct('MakeMoveVec', {
    type_tag: bcs.option(TypeTagBCS),
    elements: bcs.vector(ArgumentBCS),
  }),
});

export const PTBInstructionBCS = bcs.struct('PTBInstruction', {
  inputs: bcs.vector(InputBCS),
  commands: bcs.vector(CommandBCS),
});

export const InstructionGroupBCS = bcs.struct('InstructionGroup', {
  instructions: PTBInstructionBCS,
  required_objects: bcs.vector(bcs.fixedArray(32, bcs.u8())),
  required_types: bcs.vector(bcs.string()),
});

export const InstructionGroupsBCS = bcs.struct('InstructionGroups', {
  groups: bcs.vector(InstructionGroupBCS),
});

export const ResolverInstructionsEventBCS = bcs.struct('ResolverInstructionsEvent', {
  inputs: bcs.vector(InputBCS),
  commands: bcs.vector(CommandBCS),
  required_objects: bcs.vector(bcs.fixedArray(32, bcs.u8())),
  required_types: bcs.vector(bcs.string()),
});

export const OffchainLookupBCS = bcs.enum('OffchainLookup', {
  DynamicField: bcs.struct('DynamicField', {
    parent_object: bcs.fixedArray(32, bcs.u8()),
    key: bcs.vector(bcs.u8()),
    placeholder_name: bcs.string(),
  }),
  DynamicFieldByType: bcs.struct('DynamicFieldByType', {
    parent_object: bcs.fixedArray(32, bcs.u8()),
    type_suffix: bcs.string(),
    extract_field: bcs.string(),
    placeholder_name: bcs.string(),
  }),
  DynamicObjectField: bcs.struct('DynamicObjectField', {
    parent_object: bcs.fixedArray(32, bcs.u8()),
    key: bcs.vector(bcs.u8()),
    placeholder_name: bcs.string(),
  }),
  TableItem: bcs.struct('TableItem', {
    parent_object: bcs.fixedArray(32, bcs.u8()),
    table_path: bcs.string(),
    key_raw: bcs.option(bcs.vector(bcs.u8())),
    key_structured: bcs.option(bcs.vector(StructFieldBCS)),
    key_type: bcs.string(),
    placeholder_name: bcs.string(),
  }),
  ObjectField: bcs.struct('ObjectField', {
    parent_object: bcs.fixedArray(32, bcs.u8()),
    field_path: bcs.string(),
    placeholder_name: bcs.string(),
  }),
});

export const ResolverResultBCS = bcs.enum('ResolverResult', {
  Resolved: bcs.struct('Resolved', {
    instruction_groups: InstructionGroupsBCS,
  }),
  NeedsOffchainData: bcs.struct('NeedsOffchainData', {
    lookups: bcs.vector(OffchainLookupBCS),
  }),
  Error: bcs.struct('Error', {
    message: bcs.string(),
  }),
});

export const KeyValueBCS = bcs.struct('KeyValue', {
  key: bcs.string(),
  value: bcs.vector(bcs.u8()),
});

export const DiscoveredDataBCS = bcs.struct('DiscoveredData', {
  entries: bcs.vector(KeyValueBCS),
});

export const CommandResultBCS = bcs.struct('CommandResult', {
  command_index: bcs.u64(),
  result_count: bcs.u64(),
});

export const NestedCommandResultBCS = bcs.struct('NestedCommandResult', {
  command_index: bcs.u64(),
  nested_index: bcs.u64(),
});

export const InputHandleBCS = bcs.struct('InputHandle', {
  input_index: bcs.u64(),
});
