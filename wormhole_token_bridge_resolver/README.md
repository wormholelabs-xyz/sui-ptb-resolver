# Wormhole Token Bridge Resolver

A proof-of-concept Move-based resolver for Wormhole VAA (Verifiable Action
Approval) redemption on Sui. This resolver demonstrates gas-free discovery and
resolution of cross-chain token transfers through the Wormhole bridge, enabling
manual token redemptions with automatic PTB construction.

## Overview

This resolver is a **proof-of-concept implementation** showing how to redeem
Wormhole VAAs on Sui through:

1. Dynamic discovery of required on-chain data (packages, coin types)
2. Type-safe PTB construction using the builder pattern
3. Semantic key-based data management
4. Direct token transfer to VAA-specified recipients
5. Command chaining with type-safe handles

The resolver handles the complete 5-step Wormhole token redemption flow while
extracting the recipient from the VAA and transferring tokens directly to them
(not to tx.sender).

## Architecture

### State Management

The resolver uses a State object to store configuration:

```move
public struct State has key, store {
    id: UID,
    package_id: address,           // This resolver's package address
    module_name: String,           // Module name ("token_bridge_resolver")
    core_bridge_state: address,    // Wormhole core bridge state
    token_bridge_state: address    // Wormhole token bridge state
}
```

This enables the TypeScript SDK to be fully resolver-agnostic by querying State
for package and module information.

### Resolution Flow

```
┌─────────────────┐
│  SDK calls      │
│  resolve_vaa    │
│  with State ID  │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────┐
│ Iteration 1: Package Lookup │
│ - Returns Option::None      │
│ - Emits lookup requests     │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ SDK fetches packages        │
│ from blockchain             │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ Iteration 2: Coin Type      │
│ - Packages available        │
│ - Requests coin type lookup │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ SDK fetches coin type       │
│ from token registry         │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ Iteration 3: Build PTB      │
│ - All data available        │
│ - Constructs 5-step flow    │
│ - Returns final PTB         │
└─────────────────────────────┘
```

## Implementation Details

### Phase 1: Package Discovery

The resolver requests package addresses using semantic keys:

```move
// Request core bridge package
let core_package: Option<address> = builder.request_package_lookup(
    core_bridge_state,
    string::utf8(b"CurrentPackage"),
    string::utf8(b"package"),
    string::utf8(b"core_bridge_package")  // Semantic key
);

// Request token bridge package
let token_package: Option<address> = builder.request_package_lookup(
    token_bridge_state,
    string::utf8(b"CurrentPackage"),
    string::utf8(b"package"),
    string::utf8(b"token_bridge_package")  // Semantic key
);
```

Returns `Option::None` if data needs discovery, triggering an offchain lookup
event.

### Phase 2: Coin Type Resolution

Once packages are discovered, the resolver requests the coin type using
structured keys:

```move
// Only request if token package is available
if (token_package.is_some()) {
    // Parse VAA to get token info
    let parsed_vaa = parse_vaa(vaa_bytes);

    // Build structured key
    let key_fields = build_coin_type_structured_key(
        parsed_vaa.token_address,
        parsed_vaa.token_chain
    );

    // Construct dynamic key type string
    let token_pkg = *option::borrow(&token_package);
    let mut key_type_string = string::utf8(b"0x");
    string::append(&mut key_type_string, sui::address::to_string(token_pkg));
    string::append(&mut key_type_string, string::utf8(b"::token_registry::CoinTypeKey"));

    // Request table lookup
    coin_type = builder.request_table_item_lookup(
        token_bridge_state,
        string::utf8(b"token_registry.coin_types"),
        option::none(),           // No raw key
        option::some(key_fields), // Structured key
        key_type_string,          // Move type
        string::utf8(b"coin_type")
    );
}
```

#### Structured Keys

The resolver uses structured keys for RPC compatibility:

```move
fun build_coin_type_structured_key(
    token_address: vector<u8>,
    token_chain: u16
): vector<ptb_types::StructField> {
    vector[
        // Field 1: addr (raw bytes, no BCS encoding)
        ptb_types::create_struct_field(b"addr", token_address),
        // Field 2: chain (BCS-encoded u16)
        ptb_types::create_struct_field(b"chain", bcs::to_bytes(&token_chain))
    ]
}
```

This matches the Move struct:

```move
struct CoinTypeKey has drop, copy, store {
    chain: u16,
    addr: vector<u8>
}
```

### Phase 3: PTB Construction

Once all data is discovered, the resolver builds a 5-command PTB:

#### 1. Parse and Verify VAA

```move
let vaa_input = builder.add_pure_input(vaa_bytes);
let clock = builder.add_object_input(
    ptb_types::create_object_ref(@0x6, 0, vector::empty())
);
let core_bridge = builder.add_object_input(
    ptb_types::create_object_ref(core_bridge_state, 0, vector::empty())
);

let vaa_result = builder.add_move_call(
    core_bridge_package,
    string::utf8(b"vaa"),
    string::utf8(b"parse_and_verify"),
    vector::empty(),
    vector[
        ptb_types::input_handle_to_argument(&core_bridge),
        ptb_types::input_handle_to_argument(&vaa_input),
        ptb_types::input_handle_to_argument(&clock)
    ]
);
```

#### 2. Verify Only Once (Replay Protection)

```move
let token_bridge = builder.add_object_input(
    ptb_types::create_object_ref(token_bridge_state, 0, vector::empty())
);

let receipt = builder.add_move_call(
    token_bridge_package,
    string::utf8(b"vaa"),
    string::utf8(b"verify_only_once"),
    vector::empty(),
    vector[
        ptb_types::input_handle_to_argument(&token_bridge),
        ptb_types::command_result_to_argument(&vaa_result)
    ]
);
```

#### 3. Authorize Transfer

```move
let coin_type_tag = ptb_types::create_type_tag(*string::as_bytes(&coin_type));

let transfer_result = builder.add_move_call(
    token_bridge_package,
    string::utf8(b"complete_transfer"),
    string::utf8(b"authorize_transfer"),
    vector[coin_type_tag],
    vector[
        ptb_types::input_handle_to_argument(&token_bridge),
        ptb_types::command_result_to_argument(&receipt)
    ]
);
```

#### 4. Redeem Relayer Payout

```move
let payout = builder.add_move_call(
    token_bridge_package,
    string::utf8(b"complete_transfer"),
    string::utf8(b"redeem_relayer_payout"),
    vector[coin_type_tag],
    vector[
        ptb_types::command_result_to_argument(&transfer_result)
    ]
);
```

#### 5. Transfer to Recipient

```move
// Extract recipient from VAA
let parsed_vaa = parse_vaa(vaa_bytes);
let recipient_address = parsed_vaa.recipient;

// Add recipient as input (type auto-captured)
let recipient_input = builder.add_pure_input(recipient_address);

// Transfer coins directly to VAA recipient
builder.add_transfer_objects(
    vector[ptb_types::command_result_to_argument(&payout)],
    ptb_types::input_handle_to_argument(&recipient_input)
);
```

## 📦 Components

### 1. token_bridge_resolver.move

Main resolver logic implementing the complete redemption flow.

**Key functions:**

- `resolve_vaa()` - Main entry point for VAA resolution
- `build_redemption_ptb()` - Constructs the 5-step PTB
- `parse_vaa()` - Extracts token and recipient info from VAA
- `build_coin_type_structured_key()` - Creates structured keys for table lookups

### 2. state.move

State management with resolver configuration.

**State fields:**

- `package_id` - Resolver package address (for SDK modularity)
- `module_name` - Module name (for SDK modularity)
- `core_bridge_state` - Wormhole core bridge state address
- `token_bridge_state` - Wormhole token bridge state address

### 3. setup.move

Deployment entry point for creating the shared State object.

**Entry function:**

```move
public entry fun create_state(
    publisher: &Publisher,
    package_id: address,
    module_name: vector<u8>,
    core_bridge_state: address,
    token_bridge_state: address,
    ctx: &mut TxContext
)
```

### 4. wormhole_token_bridge_resolver.move

One-Time Witness module for claiming Publisher capability.

### 5. version_control.move

Version management utilities (if needed for upgrades).

## VAA Parser

The resolver includes a complete VAA parser:

```move
public struct ParsedVAA has copy, drop {
    token_address: vector<u8>,  // 32-byte token address
    token_chain: u16,           // Source chain ID
    recipient: address,         // Sui recipient address
}
```

**Features:**

- Handles dynamic guardian signature counts (1-19)
- Proper offset calculation for all VAA fields
- Extracts three critical fields: token address, chain, and recipient

## Key Features

### Semantic Keys

Human-readable keys for discovered data:

- `"core_bridge_package"` - Core bridge package address
- `"token_bridge_package"` - Token bridge package address
- `"coin_type"` - Resolved coin type string

### Structured Keys

RPC-compatible table keys instead of opaque BCS bytes:

**Advantages:**

- Direct SUI RPC compatibility
- Type-safe at compile time
- Human-readable field values
- Dynamic type string construction

### Type-Safe Command Chaining

CommandResult handles ensure correct types:

```move
let result1 = builder.add_move_call(...);
let result2 = builder.add_move_call(
    ...,
    vector[ptb_types::command_result_to_argument(&result1)]
);
```

### Direct Recipient Transfer

Tokens go to VAA recipient, not tx.sender:

- Enables relayer-executed transactions
- Prevents fund misdirection
- Matches user expectations from VAA submission

### Automatic Type Capture

Pure inputs automatically capture Move types:

```move
let input = builder.add_pure_input(recipient_address);
// Type "address" automatically captured via std::type_name
```

## Usage

### Deployment

```bash
# Publish the resolver
sui client publish wormhole_token_bridge_resolver --gas-budget 100000000

# Create State object
sui client call \
  --package <PACKAGE_ID> \
  --module setup \
  --function create_state \
  --args <PUBLISHER_ID> <PACKAGE_ID> '"token_bridge_resolver"' <CORE_STATE> <TOKEN_STATE> \
  --gas-budget 100000000
```

### TypeScript Integration

```typescript
import { SuiPTBResolver } from 'sui-resolver';

const resolver = new SuiPTBResolver({ network, maxIterations: 10 }, client);

// Fetch State to get package and module info
const state = await client.getObject({
  id: stateId,
  options: { showContent: true },
});

const { package_id, module_name } = state.data.content.fields;
const target = `${package_id}::${module_name}::resolve_vaa`;

// Resolve VAA
const result = await resolver.resolveVAA(target, stateId, vaaBytes);

// Execute transaction
await client.signAndExecuteTransaction({
  transaction: result.transaction,
});
```

## Testing

```bash
sui move test
```

Tests cover:

- VAA parsing with different signature counts
- Structured key construction
- Command chaining with results
- Complete redemption flow
- Builder pattern integration

## Security

- **Package Verification**: Discovers packages from trusted state objects
- **Replay Protection**: Uses `verify_only_once` to consume VAAs
- **Type Safety**: Builder pattern prevents construction errors
- **Input Validation**: Checks for empty coin types and valid addresses
- **Direct Transfer**: Tokens always go to VAA recipient (relayer-proof)
- **Recipient Extraction**: Uses VAA data, not tx.sender

## Performance

- **Gas-Free Discovery**: All lookups via dry-run execution
- **Typically 2-3 Iterations**: Package → Coin Type → Build
- **Type-Safe**: No runtime type checking needed
- **Efficient Memory**: Builder reuses structures

## POC Status

This is a **proof-of-concept implementation** for manual VAA redemption
demonstrating:

✅ Complete Wormhole redemption flow ✅ Dynamic package and coin type discovery
✅ Type-safe PTB construction ✅ Direct recipient transfers ✅ Structured key
system ✅ Semantic key management

The implementation serves as a reference for building production resolvers with
more features like batch redemptions, fee handling, and advanced error recovery.

## Dependencies

- `sui_ptb_resolver::ptb_types` - Core PTB builder framework
- Sui Move standard library
- Wormhole bridge contracts (mainnet)

## Contributing

When extending this POC:

1. Follow the builder pattern
2. Use semantic keys for discovered data
3. Maintain type safety with handles
4. Add comprehensive tests
5. Document all public functions

## Additional Resources

- [Sui PTB Resolver Framework](../sui_ptb_resolver/)
- [Main Project README](../README.md)
- [Wormhole Documentation](https://docs.wormhole.com/)
- [Sui Programmable Transactions](https://docs.sui.io/concepts/transactions/prog-txn-blocks)
