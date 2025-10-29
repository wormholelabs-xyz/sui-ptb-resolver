# SUI PTB Resolver

A comprehensive framework for building **gas-free, offchain-resolved
Programmable Transaction Blocks (PTBs)** on Sui. This project provides Move
smart contracts, a TypeScript SDK, and a resolver specification for creating
dynamic PTBs that discover required data through iterative offchain lookups.

## What is This?

The SUI PTB Resolver enables construction of complex transactions that require
onchain data discovery **without any gas costs** until final execution. Instead
of hardcoding addresses and data, resolvers dynamically discover:

- Package addresses from registries
- Coin types from token mappings
- Dynamic field values from objects
- Table items with structured keys

## Project Components

### 1. **Move Framework** ([sui_ptb_resolver/](./sui_ptb_resolver/))

Type-safe builder pattern for PTB construction with offchain data discovery.

**Key Features:**

- Builder pattern with CommandResult handles
- Multiple lookup types (DynamicFieldByType, TableItem, DynamicField,
  ObjectField)
- Structured keys for SUI RPC compatibility
- Semantic key-based data management
- Automatic type capture for pure inputs

### 2. **Wormhole Token Bridge Resolver** ([wormhole_token_bridge_resolver/](./wormhole_token_bridge_resolver/))

Proof-of-concept implementation showing complete Wormhole VAA redemption flow.

**Demonstrates:**

- Dynamic package and coin type discovery
- 5-step token redemption flow
- Direct recipient transfer from VAA
- Structured key usage for table lookups

### 3. **TypeScript SDK** ([src/](./src/))

Client library for executing the iterative resolution loop.

**Components:**

- `SuiPTBResolver` - Main orchestration
- `OffchainLookupResolver` - Blockchain data fetching
- `EventParser` - Move event decoding
- `PTBBuilder` - Transaction reconstruction

## Resolver Specification

### Required State Structure

All resolvers **must** implement a State struct with these mandatory fields:

```move
public struct State has key, store {
    id: UID,
    package_id: address,      // REQUIRED: Resolver package address
    module_name: String,      // REQUIRED: Module name for resolve_vaa function
    // ... add domain-specific fields as needed
}
```

**Why Required:**

- `package_id` - Enables SDK to dynamically construct target function
- `module_name` - Makes SDK completely resolver-agnostic
- Eliminates hardcoding in client applications

### Required Entry Point Function

All resolvers **must** implement this exact function signature:

```move
public fun resolve_vaa(
    resolver_state: &State,
    vaa_bytes: vector<u8>,
    discovered_data_bytes: vector<u8>
) {
    // Implementation follows standard pattern (see below)
}
```

**Parameters:**

- `resolver_state` - Shared State object reference
- `vaa_bytes` - Input data (VAA or transaction data)
- `discovered_data_bytes` - BCS-encoded discovered data from previous iterations

### Standard Implementation Pattern

```move
public fun resolve_vaa(
    resolver_state: &State,
    vaa_bytes: vector<u8>,
    discovered_data_bytes: vector<u8>
) {
    // 1. Create builder with discovered data
    let mut builder = ptb_types::create_ptb_builder(discovered_data_bytes);

    // 2. Request any missing data (returns Option<T>)
    let package: Option<address> = ptb_types::request_package_lookup(
        &mut builder,
        state_object,
        type_suffix,
        field_name,
        semantic_key  // e.g., "core_bridge_package"
    );

    // 3. Check if discovery is needed
    if (builder.has_pending_lookups()) {
        let lookups = builder.get_lookups_for_resolution();
        let result = ptb_types::create_needs_offchain_result(lookups);
        ptb_types::emit_resolver_event(&result);
        return
    }

    // 4. Build PTB with all discovered data
    let pkg_addr = *option::borrow(&package);
    // ... build commands using builder.add_move_call(), etc.

    // 5. Finalize and emit resolved event
    let groups = ptb_types::finalize_builder(&builder);
    let result = ptb_types::create_resolved_result(groups);
    ptb_types::emit_resolver_event(&result);
}
```

## Quick Start

### Installation

```bash
# Clone repository
git clone <repo-url>
cd sui-ptb-resolver

# Install TypeScript dependencies
bun install

# Build Move packages
sui move build -p sui_ptb_resolver
sui move build -p wormhole_token_bridge_resolver

# Run tests
sui move test -p sui_ptb_resolver
sui move test -p wormhole_token_bridge_resolver
```

### TypeScript Usage

```typescript
import { SuiPTBResolver } from 'sui-resolver';
import { SuiClient } from '@mysten/sui/client';

const client = new SuiClient({ url: rpcUrl });
const resolver = new SuiPTBResolver({ network, maxIterations: 10 }, client);

// Fetch State to get package_id and module_name
const state = await client.getObject({
  id: stateId,
  options: { showContent: true },
});

const { package_id, module_name } = state.data.content.fields;

// Construct target dynamically
const target = `${package_id}::${module_name}::resolve_vaa`;

// Resolve VAA
const result = await resolver.resolveVAA(target, stateId, vaaBytes);

// Execute transaction
await client.signAndExecuteTransaction({
  transaction: result.transaction,
});
```

## Building a Custom VAA Resolver

### 1. Define State with Required Fields

```move
module my_resolver::state {
    use std::string::String;

    public struct State has key, store {
        id: UID,
        package_id: address,        // REQUIRED
        module_name: String,        // REQUIRED
        // Add domain-specific fields:
        registry: address,
        bridge_state: address,
    }

    public(package) fun new(
        publisher: &Publisher,
        package_id: address,
        module_name: String,
        registry: address,
        bridge_state: address,
        ctx: &mut TxContext
    ): State {
        State {
            id: object::new(ctx),
            package_id,
            module_name,
            registry,
            bridge_state
        }
    }

    // REQUIRED accessors
    public fun package_id(self: &State): address { self.package_id }
    public fun module_name(self: &State): String { self.module_name }

    // Domain-specific accessors
    public fun registry(self: &State): address { self.registry }
    public fun bridge_state(self: &State): address { self.bridge_state }
}
```

### 2. Implement resolve_vaa Function

```move
module my_resolver::resolver {
    use sui_ptb_resolver::ptb_types;
    use my_resolver::state::{Self, State};

    // REQUIRED function signature
    public fun resolve_vaa(
        resolver_state: &State,
        vaa_bytes: vector<u8>,
        discovered_data_bytes: vector<u8>
    ) {
        let mut builder = ptb_types::create_ptb_builder(discovered_data_bytes);

        // Request data discovery
        let package: Option<address> = ptb_types::request_package_lookup(
            &mut builder,
            state::registry(resolver_state),
            string::utf8(b"CurrentPackage"),
            string::utf8(b"package"),
            string::utf8(b"my_package")  // Semantic key
        );

        // Check for pending lookups
        if (builder.has_pending_lookups()) {
            let lookups = builder.get_lookups_for_resolution();
            let result = ptb_types::create_needs_offchain_result(lookups);
            ptb_types::emit_resolver_event(&result);
            return
        }

        // Build PTB
        let pkg = *option::borrow(&package);
        let input = builder.add_pure_input(vaa_bytes);
        builder.add_move_call(
            pkg,
            string::utf8(b"module"),
            string::utf8(b"function"),
            vector::empty(),
            vector[ptb_types::input_handle_to_argument(&input)]
        );

        // Finalize
        let groups = ptb_types::finalize_builder(&builder);
        let result = ptb_types::create_resolved_result(groups);
        ptb_types::emit_resolver_event(&result);
    }
}
```

### 3. Create Setup Module

```move
module my_resolver::setup {
    use sui::package::Publisher;
    use my_resolver::state;

    public entry fun create_state(
        publisher: &Publisher,
        package_id: address,
        module_name: vector<u8>,  // Will be "resolver" for resolve_vaa
        registry: address,
        bridge_state: address,
        ctx: &mut TxContext
    ) {
        let state = state::new(
            publisher,
            package_id,
            std::string::utf8(module_name),
            registry,
            bridge_state,
            ctx
        );
        sui::transfer::public_share_object(state);
    }
}
```

### 4. Deploy and Use

```bash
# Deploy resolver
sui client publish my_resolver --gas-budget 100000000

# Create State
sui client call \
  --package <PACKAGE_ID> \
  --module setup \
  --function create_state \
  --args <PUBLISHER> <PACKAGE_ID> '"resolver"' <REGISTRY> <BRIDGE> \
  --gas-budget 100000000
```

## Key Features

### Type-Safe Builder Pattern

CommandResult handles ensure correct command chaining without string
placeholders.

### Automatic Type Capture

Pure inputs automatically capture Move type information via `std::type_name`.

### Semantic Keys

Human-readable keys like `"core_bridge_package"` instead of numeric indices.

### Option<T> API

Clean API where `request_*` functions return `Option<T>`:

- `option::some(value)` when data is discovered
- `option::none()` when data needs fetching

### Structured Keys

RPC-compatible table keys for direct SUI RPC queries without opaque BCS
encoding.

### Gas-Free Discovery

All data discovery via dry-run execution - no gas costs until final PTB
execution.

## Documentation

- **[sui_ptb_resolver README](./sui_ptb_resolver/README.md)** - Complete Move
  framework documentation
- **[wormhole_token_bridge_resolver README](./wormhole_token_bridge_resolver/README.md)** -
  POC implementation details
- **[Example Code](./examples/token_bridge_resolver_sample.ts)** - TypeScript
  usage example

## Security

- **Package Verification**: Discover packages from trusted state objects only
- **Input Validation**: Validate all discovered data before use
- **Replay Protection**: Implement mechanisms like `verify_only_once`
- **Type Safety**: Builder pattern prevents construction errors at compile time
- **Recipient Control**: Ensure tokens go to correct recipients (not tx.sender)

## Contributing

When creating new resolvers:

1. ✅ Implement required State structure with `package_id` and `module_name`
2. ✅ Use exact `resolve_vaa` function signature
3. ✅ Follow standard implementation pattern
4. ✅ Use semantic keys for discovered data
5. ✅ Provide State accessor functions
6. ✅ Add comprehensive tests
7. ✅ Document public API

## License

⚠ This software is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR
CONDITIONS OF ANY KIND, either express or implied. See the License for the
specific language governing permissions and limitations under the License. Or
plainly spoken - this is a very complex piece of software which targets a
bleeding-edge, experimental smart contract runtime. Mistakes happen, and no
matter how hard you try and whether you pay someone to audit it, it may eat your
tokens, set your printer on fire or startle your cat. Cryptocurrencies are a
high-risk investment, no matter how fancy.

## Resources

- [Sui Programmable Transactions](https://docs.sui.io/concepts/transactions/prog-txn-blocks)
- [Move Language](https://move-language.github.io/move/)
- [Sui RPC API](https://docs.sui.io/references/sui-api)
