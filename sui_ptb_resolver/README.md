# SUI PTB Resolver Framework

A comprehensive Move framework for building gas-free, offchain-resolved
Programmable Transaction Blocks (PTBs) on the Sui blockchain. This framework
provides a type-safe builder pattern for constructing complex PTBs with dynamic
data discovery.

## 🎯 Overview

The SUI PTB Resolver Framework provides a standardized, type-safe way for Move
contracts to:

- Build PTBs using a builder pattern similar to Sui SDK
- Request offchain data discovery with index-based lookups
- Emit PTB construction events for offchain resolution
- Support iterative resolution with discovered data
- Ensure type safety with CommandResult handles

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
```

### Builder Pattern Types

#### CommandResult & NestedCommandResult

Type-safe handles for referencing command outputs:

```move
public struct CommandResult has copy, drop, store {
    command_index: u64,
    result_count: u64,
}

public struct NestedCommandResult has copy, drop, store {
    command_index: u64,
    nested_index: u64,
}
```

#### PTBBuilder

The main builder struct for incremental PTB construction:

```move
public struct PTBBuilder has store, drop {
    inputs: vector<Input>,
    commands: vector<Command>,
    lookups: vector<OffchainLookup>,
    current_command_index: u64,
}
```

#### ResolutionContext

Manages the resolution lifecycle with different stages:

```move
public struct ResolutionContext has store, drop {
    stage: ResolutionStage,
    builder: Option<PTBBuilder>,
    discovered_data: DiscoveredData,
    iteration: u8,
}
```

Resolution stages:

- `CollectingLookups`: Gathering required lookups
- `ResolvingLookups`: Waiting for offchain data
- `BuildingPTB`: Constructing the PTB
- `Complete`: Resolution finished

## 📦 Core Data Structures

### Input Types

```move
// Pure values (primitives, vectors)
INPUT_PURE = 0

// Immutable or owned objects
INPUT_OBJECT_IMM_OR_OWNED = 1

// Shared objects
INPUT_OBJECT_SHARED = 2
```

### Command Types

Currently supported:

- `CMD_MOVE_CALL` (0) - Call Move functions

### Lookup Types (Offchain Discovery)

- **DynamicFieldByType** - Discover package addresses via typed dynamic fields
- **TableItem** - Query table items with structured keys (supports SUI RPC
  format)
- **DynamicField** - Query dynamic fields with raw keys
- **ObjectField** - Navigate nested object fields via dot-notation paths

## 🔄 Builder Pattern Usage

### Creating a Builder

```move
let mut builder = ptb_types::create_ptb_builder();
```

### Adding Inputs

```move
// Add pure input and get a handle
let input_handle = ptb_types::add_pure_input(
    &mut builder,
    bcs::to_bytes(&value)
);

// Add object input
let object_handle = ptb_types::add_object_input(
    &mut builder,
    object_ref
);

// Add shared object
let shared_handle = ptb_types::add_shared_object_input(
    &mut builder,
    shared_ref
);
```

### Adding Commands with Result Handles

```move
// Add a move call and get result handle
let result = ptb_types::add_move_call(
    &mut builder,
    @package_address,
    string::utf8(b"module"),
    string::utf8(b"function"),
    vector[type_tag],
    vector[arg1, arg2]
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

### Working with Multi-Result Commands

```move
// For commands that return multiple values
let multi_result = ptb_types::add_move_call(...);

// Access specific result index
let nested = ptb_types::get_nested_result(&multi_result, 0);
let arg = ptb_types::nested_result_to_argument(&nested);
```

### Requesting Offchain Lookups

```move
// Request package lookup (DynamicFieldByType)
let package_handle = ptb_types::request_package_lookup(
    &mut builder,
    registry_address,
    string::utf8(b"CurrentPackage"),  // type suffix
    string::utf8(b"package"),          // field to extract
    string::utf8(b"core_package")      // semantic key
);

// Request table item lookup with structured keys
let key_fields = vector[
    ptb_types::create_struct_field(b"addr", token_address),
    ptb_types::create_struct_field(b"chain", bcs::to_bytes(&chain_id))
];

ptb_types::request_table_item_lookup(
    &mut builder,
    token_bridge_state,
    string::utf8(b"token_registry.coin_types"),  // table path
    option::none(),                               // no raw key
    option::some(key_fields),                     // structured key
    string::utf8(b"0xPKG::token_registry::CoinTypeKey"),  // key type
    string::utf8(b"coin_type")                    // semantic key
);
```

### Resolution Context

```move
// Create resolution context
let mut context = ptb_types::create_resolution_context();

// Add discovered data
ptb_types::add_discovered_entry(
    &mut context.discovered_data,
    key,
    value
);

// Transition through stages
ptb_types::start_collecting_lookups(&mut context);
ptb_types::start_resolving_lookups(&mut context);
ptb_types::start_building_ptb(&mut context);
ptb_types::complete_resolution(&mut context);
```

## 💡 Usage Example

### Complete Resolver Implementation

```move
module my_resolver::token_bridge_resolver {
    use sui_ptb_resolver::ptb_types::{Self};

    public fun resolve_vaa(
        vaa_bytes: vector<u8>,
        discovered_data_bytes: vector<u8>
    ) {
        // Initialize builder
        let mut builder = ptb_types::create_ptb_builder();

        // Parse discovered data
        let discovered_data = ptb_types::discovered_data_from_bytes(
            discovered_data_bytes
        );

        // Check if we need to discover package
        if (!ptb_types::has_discovered_key(
            &discovered_data,
            &string::utf8(b"core_bridge_package")
        )) {
            // Request package discovery
            let handle = ptb_types::request_package_lookup(
                &mut builder,
                @registry,
                string::utf8(b"0x5306f64e312b581766351c07af79c72fcb1cd25147157fdc2f8ad76de9a3fb6a::state::State"),
                string::utf8(b"core_bridge_package")
            );

            // Emit needs data event
            let result = ptb_types::finalize_needs_offchain(builder);
            ptb_types::emit_resolver_event(&result);
            return
        }

        // Build PTB with discovered data
        let package = ptb_types::get_discovered_address(
            &discovered_data,
            &string::utf8(b"core_bridge_package")
        );

        // Add VAA input
        let vaa_input = ptb_types::add_pure_input(
            &mut builder,
            vaa_bytes
        );

        // Parse and verify VAA
        let vaa_arg = ptb_types::input_handle_to_argument(&vaa_input);
        let parse_result = ptb_types::add_move_call(
            &mut builder,
            package,
            string::utf8(b"vaa"),
            string::utf8(b"parse_and_verify"),
            vector::empty(),
            vector[vaa_arg]
        );

        // Complete transfer using parsed VAA
        let vaa_result_arg = ptb_types::command_result_to_argument(&parse_result);
        let transfer_result = ptb_types::add_move_call(
            &mut builder,
            package,
            string::utf8(b"complete_transfer"),
            string::utf8(b"authorize_transfer"),
            vector[coin_type],
            vector[vaa_result_arg]
        );

        // Finalize and emit
        let result = ptb_types::finalize_resolved(builder);
        ptb_types::emit_resolver_event(&result);
    }
}
```

## 🧪 Testing

The framework includes comprehensive tests for:

- Builder pattern functionality
- Command result handling
- Index-based lookup system
- Resolution context state management
- Discovered data encoding/decoding

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

The framework uses a custom binary format for discovered data exchange:

```
[num_entries: u8]
[entry1]
[entry2]
...

Each entry:
[key_len: u8][key_bytes][value_len: u16 (little-endian)][value_bytes]
```

## 🔑 Key Features

### 1. **Type-Safe Builder Pattern**

Strong typing with CommandResult handles ensures PTBs are constructed correctly
without string-based placeholders.

### 2. **Index-Based Lookups**

Commands are referenced by index, providing compile-time safety and preventing
runtime errors.

### 3. **Gas-Free Resolution**

Using events and dry-run execution, resolution happens without gas costs until
final execution.

### 4. **Iterative Discovery**

Supports multiple rounds of data discovery for complex resolution scenarios.

### 5. **Clean Public API**

Minimal public interface focused on the builder pattern, with internal
complexity hidden.

## 🚀 Real-World Applications

### Wormhole Token Bridge Resolver

The framework powers the Wormhole token bridge resolver, enabling:

- Dynamic package and state object discovery
- Token type resolution from on-chain registries
- Complex multi-step VAA redemption flows
- Type-safe command chaining for transfers

## 📈 Performance Considerations

- **No Iterations**: Removed iteration-based event emission for better
  performance
- **Efficient Lookups**: Index-based system reduces overhead
- **Minimal Allocations**: Builder pattern reuses memory efficiently

## 🛠️ Builder Pattern API

### Core Builder Functions

```move
// Builder lifecycle
create_ptb_builder() -> PTBBuilder
finalize_resolved(builder) -> ResolverResult
finalize_needs_offchain(builder) -> ResolverResult

// Adding inputs (returns handles)
add_pure_input(builder, data) -> InputHandle
add_object_input(builder, ref) -> InputHandle
add_shared_object_input(builder, ref) -> InputHandle

// Adding commands (returns result handles)
add_move_call(builder, package, module, function, types, args) -> CommandResult

// Handle conversions
command_result_to_argument(result) -> Argument
input_handle_to_argument(handle) -> Argument
nested_result_to_argument(nested) -> Argument

// Requesting lookups (returns handles)
request_package_lookup(builder, registry, suffix, name) -> LookupHandle
request_coin_type_lookup(builder, registry, name) -> LookupHandle
```

### Resolution Context Functions

```move
// Context management
create_resolution_context() -> ResolutionContext
start_collecting_lookups(context)
start_resolving_lookups(context)
start_building_ptb(context)
complete_resolution(context)

// Working with discovered data
add_discovered_entry(data, key, value)
get_discovered_value(data, key) -> vector<u8>
get_discovered_address(data, key) -> address
has_discovered_key(data, key) -> bool
```

## 📝 Best Practices

1. **Use Builder Pattern**: Always use the builder pattern for PTB construction
2. **Handle Results Properly**: Use CommandResult handles for type safety
3. **Validate Discovered Data**: Always verify discovered data before use
4. **Keep Minimal Public API**: Only expose necessary functions
5. **Test Thoroughly**: Include tests for all builder operations

## 🔐 Security Considerations

- Discovered data should be validated before use
- Package addresses should be verified against known deployments
- Input validation is crucial for preventing malicious PTBs
- Builder pattern ensures type safety at compile time

## 📄 License

This framework is part of the Sui ecosystem and follows Sui's licensing terms.

## 🤝 Contributing

Contributions are welcome! Please ensure:

- All tests pass
- New features include tests
- Code follows the builder pattern
- Documentation is updated
- Minimal public API is maintained

## 📚 Additional Resources

- [Sui Programmable Transactions](https://docs.sui.io/concepts/transactions/prog-txn-blocks)
- [Move Language Documentation](https://move-language.github.io/move/)
- [Wormhole Integration Example](../wormhole_token_bridge_resolver/)
