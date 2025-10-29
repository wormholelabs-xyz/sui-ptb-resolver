# SUI PTB Resolver Framework

A comprehensive Move framework for building gas-free, offchain-resolved
Programmable Transaction Blocks (PTBs) on the Sui blockchain. This framework
provides a type-safe builder pattern for constructing complex PTBs with dynamic
data discovery.

## 🎯 Overview

The SUI PTB Resolver Framework provides a standardized, type-safe way for Move
contracts to:

- Build PTBs using a builder pattern similar to Sui SDK
- Request offchain data discovery through semantic key-based lookups
- Emit PTB construction events for offchain resolution
- Support iterative resolution with discovered data managed internally
- Ensure type safety with CommandResult handles
- Automatically capture type information for pure inputs

## 🏗️ Architecture

### Core Components

#### 1. **PTB Types (`ptb_types.move`)**

The foundational module containing type definitions, builder pattern
implementation, and helper functions for PTB construction.

#### 2. **Resolution Flow**

```
┌──────────────┐        ┌──────────────┐        ┌──────────────┐
│ Move Contract│        │   Offchain   │        │   Final PTB  │
│   (Builder)  │───────▶│   Resolver   │───────▶│  Execution   │
│   Pattern    │        │  (Discovers) │        │              │
└──────────────┘        └──────────────┘        └──────────────┘
       ↓                        ↓
  Option<T> API          Semantic Keys
  returns None     ───▶  "core_bridge_package"
  when data needed       "coin_type"
```

### Builder Pattern Types

#### CommandResult & NestedCommandResult

Type-safe handles for referencing command outputs:

```move
public struct CommandResult has copy, drop, store {
    command_index: u64,
    result_count: u64,  // Number of results this command produces
}

public struct NestedCommandResult has copy, drop, store {
    command_index: u64,
    nested_index: u64,
}
```

#### PTBBuilder

The main builder struct for incremental PTB construction with internal
discovered data management:

```move
public struct PTBBuilder has store, drop {
    inputs: vector<Input>,
    commands: vector<Command>,
    current_command_index: u64,
    lookups: vector<OffchainLookup>,
    pending_lookups: vector<LookupHandle>,
    required_objects: vector<address>,
    required_types: vector<String>,
    discovered_data: DiscoveredData,  // Managed internally
}
```

**Note**: `DiscoveredData` is stored inside `PTBBuilder` and managed
automatically. You pass `discovered_data_bytes` when creating the builder.

## 📦 Core Data Structures

### Input Types (Enums)

```move
public enum Input has store, drop, copy {
    Pure {
        data: vector<u8>,
        type_name: String  // Automatically captured via std::type_name
    },
    ObjectImmutableOrOwned { object_ref: ObjectRef },
    ObjectShared { shared_ref: SharedObjectRef },
    ObjectReceiving { object_ref: ObjectRef }
}
```

**Type Name Capture**: When you call `add_pure_input<T>(builder, value)`, the
framework automatically captures the Move type using `std::type_name::get<T>()`.

### Command Types (Enums)

All supported commands:

```move
public enum Command has store, drop, copy {
    MoveCall {
        package: address,
        module_name: String,
        function_name: String,
        type_arguments: vector<TypeTag>,
        arguments: vector<Argument>
    },
    TransferObjects {
        objects: vector<Argument>,
        recipient: Argument
    },
    SplitCoins {
        coin: Argument,
        amounts: vector<Argument>
    },
    MergeCoins {
        destination: Argument,
        sources: vector<Argument>
    },
    MakeMoveVec {
        type_tag: Option<TypeTag>,
        elements: vector<Argument>
    }
}
```

### Lookup Types (Offchain Discovery)

```move
public enum OffchainLookup has store, drop, copy {
    DynamicField {
        parent_object: address,
        key: vector<u8>,
        placeholder_name: String
    },
    DynamicFieldByType {
        parent_object: address,
        type_suffix: String,      // Move type suffix to match
        extract_field: String,    // Field name to extract from value
        placeholder_name: String  // Semantic key for discovered data
    },
    DynamicObjectField {
        parent_object: address,
        key: vector<u8>,
        placeholder_name: String
    },
    TableItem {
        parent_object: address,
        table_path: String,                    // Path to table (e.g., "token_registry.coin_types")
        key_raw: Option<vector<u8>>,           // Legacy raw key
        key_structured: Option<vector<StructField>>,  // Structured key for RPC
        key_type: String,                      // Move type (e.g., "0xPKG::module::KeyType")
        placeholder_name: String
    },
    ObjectField {
        parent_object: address,
        field_path: String,       // Dot-notation path (e.g., "registry.tokens")
        placeholder_name: String
    }
}
```

**Summary:**:

- `DynamicField` - For regular dynamic fields with raw byte keys
- `DynamicFieldByType` - For typed dynamic fields (used for package discovery)
- `DynamicObjectField` - For dynamic object fields
- `TableItem` - For table lookups with structured or raw keys
- `ObjectField` - For navigating nested object fields

## 🔄 Builder Pattern Usage

### Creating a Builder

```move
// Pass discovered_data_bytes (empty vector on first iteration)
let mut builder = ptb_types::create_ptb_builder(discovered_data_bytes);
```

**Important**: The builder accepts `discovered_data_bytes` as a parameter. Pass
an empty vector `vector::empty()` on the first iteration, then pass the
accumulated discovered data on subsequent iterations.

### Adding Inputs

```move
// Add pure input - type is automatically captured!
let input_handle = ptb_types::add_pure_input(
    &mut builder,
    value  // Generic T: drop - type_name captured automatically
);

// Add object input
let object_handle = ptb_types::add_object_input(
    &mut builder,
    object_ref
);

// Add receiving object (for object transfers)
let receiving_handle = ptb_types::add_receiving_object_input(
    &mut builder,
    object_ref
);
```

### Adding Commands with Result Handles

```move
// Add a move call - returns CommandResult
let result = ptb_types::add_move_call(
    &mut builder,
    @package_address,
    string::utf8(b"module"),
    string::utf8(b"function"),
    vector[type_tag],           // Type arguments
    vector[arg1, arg2]          // Arguments
);

// For multi-result commands (returns multiple values)
let multi_result = ptb_types::add_move_call_multi(
    &mut builder,
    @package,
    string::utf8(b"module"),
    string::utf8(b"function"),
    vector::empty(),
    vector[arg],
    3  // This command returns 3 values
);

// Chain commands using result handles
let arg = ptb_types::command_result_to_argument(&result);
let next_result = ptb_types::add_move_call(
    &mut builder,
    @another_package,
    string::utf8(b"module2"),
    string::utf8(b"function2"),
    vector::empty(),
    vector[arg]  // Use previous result as argument
);
```

### Other Command Types

```move
// Transfer objects to a recipient
ptb_types::add_transfer_objects(
    &mut builder,
    vector[obj_arg1, obj_arg2],
    recipient_arg
);

// Split coins
let split_result = ptb_types::add_split_coins(
    &mut builder,
    coin_arg,
    vector[amount1, amount2]  // Returns 2 coins
);

// Merge coins
ptb_types::add_merge_coins(
    &mut builder,
    destination_coin,
    vector[source1, source2]
);

// Make move vector
let vec_result = ptb_types::add_make_move_vec(
    &mut builder,
    option::some(type_tag),
    vector[elem1, elem2, elem3]
);
```

### Requesting Offchain Lookups (Returns Option<T>!)

**IMPORTANT**: All `request_*` functions return `Option<T>`:

- If data is already discovered, returns `option::some(value)`
- If data needs discovery, returns `option::none()` and records the lookup

```move
// Request package lookup (DynamicFieldByType)
let core_package: Option<address> = ptb_types::request_package_lookup(
    &mut builder,
    registry_address,
    string::utf8(b"CurrentPackage"),      // type suffix
    string::utf8(b"package"),              // field to extract
    string::utf8(b"core_bridge_package")   // semantic key
);

// Request table item lookup with structured keys
let key_fields = vector[
    ptb_types::create_struct_field(b"addr", token_address),
    ptb_types::create_struct_field(b"chain", bcs::to_bytes(&chain_id))
];

let coin_type: Option<vector<u8>> = ptb_types::request_table_item_lookup(
    &mut builder,
    token_bridge_state,
    string::utf8(b"token_registry.coin_types"),  // table path
    option::none(),                               // no raw key
    option::some(key_fields),                     // structured key
    string::utf8(b"0xPKG::token_registry::CoinTypeKey"),  // key type
    string::utf8(b"coin_type")                    // semantic key
);

// Request dynamic field lookup
let value: Option<vector<u8>> = ptb_types::request_dynamic_field_lookup(
    &mut builder,
    parent_obj,
    key_bytes,
    ptb_types::lookup_value_type_raw(),
    string::utf8(b"my_value")
);

// Request object field lookup (dot-notation paths)
let metadata: Option<vector<u8>> = ptb_types::request_object_field_lookup(
    &mut builder,
    state_obj,
    string::utf8(b"registry.metadata.version"),
    ptb_types::lookup_value_type_raw(),
    string::utf8(b"version")
);

// Check if we have pending lookups
if (builder.has_pending_lookups()) {
    // Need to emit lookup request event
    let lookups = builder.get_lookups_for_resolution();
    let result = ptb_types::create_needs_offchain_result(lookups);
    ptb_types::emit_resolver_event(&result);
    return
}

// All data available - unwrap and use
let package_addr = *option::borrow(&core_package);
let coin_type_str = string::utf8(*option::borrow(&coin_type));
```

### Finalizing the Builder

```move
// After adding all commands and inputs
let instruction_groups = ptb_types::finalize_builder(&builder);

// Create resolved result
let result = ptb_types::create_resolved_result(instruction_groups);

// Emit the event
ptb_types::emit_resolver_event(&result);
```

## 💡 Complete Example (Current API)

```move
module my_resolver::token_bridge_resolver {
    use sui_ptb_resolver::ptb_types::{Self};
    use std::string;

    public fun resolve_vaa(
        resolver_state: &State,
        vaa_bytes: vector<u8>,
        discovered_data_bytes: vector<u8>  // Pass from SDK
    ) {
        // Initialize builder with discovered data
        let mut builder = ptb_types::create_ptb_builder(discovered_data_bytes);

        let core_bridge_state = state::core_bridge_state(resolver_state);
        let token_bridge_state = state::token_bridge_state(resolver_state);

        // Request lookups - returns Option<T>
        let core_package: Option<address> = ptb_types::request_package_lookup(
            &mut builder,
            core_bridge_state,
            string::utf8(b"CurrentPackage"),
            string::utf8(b"package"),
            string::utf8(b"core_bridge_package")
        );

        let token_package: Option<address> = ptb_types::request_package_lookup(
            &mut builder,
            token_bridge_state,
            string::utf8(b"CurrentPackage"),
            string::utf8(b"package"),
            string::utf8(b"token_bridge_package")
        );

        // Only request coin type if token package is available
        let mut coin_type: Option<vector<u8>> = option::none();
        if (token_package.is_some()) {
            // Build structured key for coin type lookup
            let key_fields = build_coin_type_key(vaa_bytes);
            let token_pkg = *option::borrow(&token_package);

            let key_type = format_key_type(token_pkg);

            coin_type = ptb_types::request_table_item_lookup(
                &mut builder,
                token_bridge_state,
                string::utf8(b"token_registry.coin_types"),
                option::none(),
                option::some(key_fields),
                key_type,
                string::utf8(b"coin_type")
            );
        };

        // Check if we need more data
        if (builder.has_pending_lookups()) {
            let lookups = builder.get_lookups_for_resolution();
            let result = ptb_types::create_needs_offchain_result(lookups);
            ptb_types::emit_resolver_event(&result);
            return
        }

        // All data resolved! Build PTB
        build_redemption_ptb(
            &mut builder,
            vaa_bytes,
            *option::borrow(&core_package),
            *option::borrow(&token_package),
            string::utf8(*option::borrow(&coin_type)),
            core_bridge_state,
            token_bridge_state
        );

        // Finalize and emit
        let groups = ptb_types::finalize_builder(&builder);
        let result = ptb_types::create_resolved_result(groups);
        ptb_types::emit_resolver_event(&result);
    }

    fun build_redemption_ptb(
        builder: &mut ptb_types::PTBBuilder,
        vaa_bytes: vector<u8>,
        core_package: address,
        token_package: address,
        coin_type: string::String,
        core_state: address,
        token_state: address
    ) {
        // Add inputs - type automatically captured!
        let vaa_input = builder.add_pure_input(vaa_bytes);
        let clock = builder.add_object_input(
            ptb_types::create_object_ref(@0x6, 0, vector::empty())
        );
        let core = builder.add_object_input(
            ptb_types::create_object_ref(core_state, 0, vector::empty())
        );
        let token = builder.add_object_input(
            ptb_types::create_object_ref(token_state, 0, vector::empty())
        );

        // Build PTB with command chaining
        let vaa_result = builder.add_move_call(
            core_package,
            string::utf8(b"vaa"),
            string::utf8(b"parse_and_verify"),
            vector::empty(),
            vector[
                ptb_types::input_handle_to_argument(&core),
                ptb_types::input_handle_to_argument(&vaa_input),
                ptb_types::input_handle_to_argument(&clock)
            ]
        );

        let receipt = builder.add_move_call(
            token_package,
            string::utf8(b"vaa"),
            string::utf8(b"verify_only_once"),
            vector::empty(),
            vector[
                ptb_types::input_handle_to_argument(&token),
                ptb_types::command_result_to_argument(&vaa_result)
            ]
        );

        // Create type tag for coin type
        let coin_type_tag = ptb_types::create_type_tag(*string::as_bytes(&coin_type));

        let transfer = builder.add_move_call(
            token_package,
            string::utf8(b"complete_transfer"),
            string::utf8(b"authorize_transfer"),
            vector[coin_type_tag],
            vector[
                ptb_types::input_handle_to_argument(&token),
                ptb_types::command_result_to_argument(&receipt)
            ]
        );

        // Track required objects and types
        builder.add_required_object(core_state);
        builder.add_required_object(token_state);
        builder.add_required_type(coin_type);
    }
}
```

## 🧪 Testing

The framework includes comprehensive tests for:

- Builder pattern functionality
  ([builder_pattern_tests.move](./tests/builder_pattern_tests.move))
- Builder types and handles
  ([builder_types_tests.move](./tests/builder_types_tests.move))
- Discovered data encoding/decoding
  ([discovered_data_tests.move](./tests/discovered_data_tests.move))
- Lookup system functionality
  ([lookup_system_tests.move](./tests/lookup_system_tests.move))
- PTB types and commands ([ptb_types_tests.move](./tests/ptb_types_tests.move))

Run tests:

```bash
sui move test
```

## 🔑 Structured Keys for Table Lookups

The framework supports **structured keys** for table lookups, matching SUI RPC's
`getDynamicFieldObject` format:

### StructField Abstraction

```move
public struct StructField has store, drop, copy {
    name: vector<u8>,    // Field name as bytes
    value: vector<u8>,   // Field value (BCS-encoded)
}
```

### Building Structured Keys

```move
// Example: Wormhole token registry key
// Struct: CoinTypeKey { chain: u16, addr: vector<u8> }

let key_fields = vector[
    ptb_types::create_struct_field(
        b"addr",              // Field name
        token_address         // Raw vector<u8> (no BCS encoding needed)
    ),
    ptb_types::create_struct_field(
        b"chain",             // Field name
        bcs::to_bytes(&chain) // BCS-encode the u16
    )
];
```

### Key Type String

The `key_type` parameter must match the Move type of the table key:

```move
// Format: 0xPACKAGE::module::Type
let key_type = string::utf8(b"0x26efee...::token_registry::CoinTypeKey");
```

### Why Structured Keys?

- **RPC Compatibility**: SUI RPC expects structured data, not opaque bytes
- **Type Safety**: Move type system validates key structure
- **Generic Design**: `StructField` keeps ptb_types domain-agnostic
- **Dynamic Type Discovery**: Key type string built at runtime from discovered
  packages

### Event Encoding

Structured keys are encoded in events using separators:

- `0xff` - Separates table_path, fields, and field pairs
- `0xfe` - Separates field name from value within each field

```
table_path + 0xff + field1_name + 0xfe + field1_value + 0xff + field2_name + 0xfe + field2_value
```

TypeScript SDK decodes this automatically when parsing events.

## 📊 Discovered Data Format

The framework uses standard BCS encoding for discovered data exchange:

```move
DiscoveredData {
    entries: vector<KeyValue>
}

KeyValue {
    key: String,       // Semantic key name
    value: vector<u8>  // BCS-encoded value
}
```

The `discovered_data_from_bytes()` function parses BCS-encoded data back into
the `DiscoveredData` struct.

## 🔑 Key Features

### 1. **Type-Safe Builder Pattern**

Strong typing with CommandResult handles ensures PTBs are constructed correctly
without string-based placeholders.

### 2. **Automatic Type Capture**

Pure inputs automatically capture Move type information using `std::type_name`,
eliminating guesswork in TypeScript.

### 3. **Option<T> API**

Clean API where `request_*` functions return `Option<T>`:

- `option::some(value)` when data is already discovered
- `option::none()` when data needs discovery

### 4. **Internal Discovered Data Management**

`DiscoveredData` is stored inside `PTBBuilder`, simplifying the API and
preventing manual management errors.

### 5. **Gas-Free Resolution**

Using events and dry-run execution, resolution happens without gas costs until
final execution.

### 6. **Semantic Keys**

Human-readable keys like `"core_bridge_package"` instead of numeric indices make
code self-documenting.

### 7. **Multi-Result Command Support**

`add_move_call_multi()` handles functions that return multiple values.

## 🛠️ Complete Builder Pattern API

### Builder Lifecycle

```move
// Create builder with discovered data
create_ptb_builder(discovered_data_bytes: vector<u8>) -> PTBBuilder

// Finalize builder
finalize_builder(builder: &PTBBuilder) -> InstructionGroups

// Create results
create_resolved_result(groups: InstructionGroups) -> ResolverResult
create_needs_offchain_result(lookups: vector<OffchainLookup>) -> ResolverResult

// Emit events
emit_resolver_event(result: &ResolverResult)
```

### Adding Inputs (returns InputHandle)

```move
add_pure_input<T: drop>(builder, value) -> InputHandle              // Type auto-captured
add_object_input(builder, ref) -> InputHandle
add_receiving_object_input(builder, ref) -> InputHandle
```

### Adding Commands (returns CommandResult)

```move
add_move_call(builder, pkg, mod, fn, types, args) -> CommandResult
add_move_call_multi(builder, pkg, mod, fn, types, args, result_count) -> CommandResult
add_transfer_objects(builder, objects, recipient) -> CommandResult
add_split_coins(builder, coin, amounts) -> CommandResult
add_merge_coins(builder, dest, sources) -> CommandResult
add_make_move_vec(builder, type_tag, elements) -> CommandResult
```

### Handle Conversions

```move
command_result_to_argument(result: &CommandResult) -> Argument
input_handle_to_argument(handle: &InputHandle) -> Argument
```

### Requesting Lookups (returns Option<T>)

```move
request_package_lookup(builder, state, suffix, field, key) -> Option<address>
request_table_item_lookup(builder, parent, path, raw_key, struct_key, key_type, key) -> Option<vector<u8>>
request_coin_type_lookup(builder, state, path, key, semantic_key) -> Option<vector<u8>>  // Legacy
request_dynamic_field_lookup(builder, parent, key, type, semantic_key) -> Option<vector<u8>>
request_dynamic_object_field_lookup(builder, parent, key, type, semantic_key) -> Option<vector<u8>>
request_object_field_lookup(builder, parent, path, type, semantic_key) -> Option<vector<u8>>
```

### Builder State Management

```move
has_pending_lookups(builder: &PTBBuilder) -> bool
get_lookups_for_resolution(builder: &PTBBuilder) -> vector<OffchainLookup>
clear_pending_lookups(builder: &mut PTBBuilder)
add_required_object(builder, object: address)
add_required_type(builder, type_str: String)
```

### Discovered Data (Internal - Private Functions)

These are internal to the builder and managed automatically:

- `has_discovered_key()` - PRIVATE
- `get_discovered_value()` - PRIVATE
- `discovered_data_from_bytes()` - Called internally by `create_ptb_builder()`

### Helper Constructors

```move
create_object_ref(id, version, digest) -> ObjectRef
create_type_tag(type_bytes) -> TypeTag
create_struct_field(name, value) -> StructField
create_command_result(index, result_count) -> CommandResult

// LookupValueType constructors
lookup_value_type_address() -> LookupValueType
lookup_value_type_coin_type() -> LookupValueType
lookup_value_type_object_ref() -> LookupValueType
lookup_value_type_raw() -> LookupValueType
```

## 📝 Best Practices

1. **Use Option<T> Pattern**: Check `option::is_some()` before unwrapping with
   `option::borrow()`
2. **Check Pending Lookups**: Always call `has_pending_lookups()` before
   finalizing
3. **Use Semantic Keys**: Choose meaningful key names like
   `"core_bridge_package"` not `"pkg1"`
4. **Let Types Be Captured**: Use `add_pure_input(value)` directly - type name
   is automatic
5. **Track Required Objects**: Call `add_required_object()` for all
   shared/immutable objects used
6. **Use Multi-Result**: Call `add_move_call_multi()` for functions returning
   multiple values

## 🔐 Security Considerations

- Discovered data should be validated before use
- Package addresses should be verified against known deployments
- Input validation is crucial for preventing malicious PTBs
- Builder pattern ensures type safety at compile time
- Semantic keys prevent confusion about what data represents

## 🤝 Contributing

Contributions are welcome! Please ensure:

- All tests pass
- New features include tests
- Code follows the builder pattern
- Documentation is updated
- API remains minimal and clean

## 📚 Additional Resources

- [Sui Programmable Transactions](https://docs.sui.io/concepts/transactions/prog-txn-blocks)
- [Move Language Documentation](https://move-language.github.io/move/)
- [Wormhole Integration Example](../wormhole_token_bridge_resolver/)
- [Main Project README](../README.md)
