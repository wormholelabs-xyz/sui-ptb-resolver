module wormhole_token_bridge_resolver::state {
    use std::string::String;
    use sui::object;
    use sui::package::{Self, Publisher};
    use wormhole_token_bridge_resolver::wormhole_token_bridge_resolver::WORMHOLE_TOKEN_BRIDGE_RESOLVER;

    public struct State has key, store {
        // Mandatory for spec:
        id: UID,
        package_id: address,
        module_name: String,
        // Optional, token bridge related:
        core_bridge_state: address,
        token_bridge_state: address
    }

    public(package) fun new(
        publisher: &Publisher,
        package_id: address,
        module_name: String,
        core_bridge_state: address,
        token_bridge_state: address,
        ctx: &mut TxContext
    ): State {
        package::from_package<WORMHOLE_TOKEN_BRIDGE_RESOLVER>(publisher);
        State {
            id: object::new(ctx),
            package_id,
            module_name,
            core_bridge_state,
            token_bridge_state
        }
    }

    public fun package_id(self: &State): address {
        self.package_id
    }

    public fun module_name(self: &State): String {
        self.module_name
    }

    public fun core_bridge_state(self: &State): address {
        self.core_bridge_state
    }

    public fun token_bridge_state(self: &State): address {
        self.token_bridge_state
    }

    #[test_only]
    public fun new_for_testing(
        package_id: address,
        module_name: String,
        core_bridge_state: address,
        token_bridge_state: address,
        ctx: &mut TxContext
    ): State {
        State {
            id: object::new(ctx),
            package_id,
            module_name,
            core_bridge_state,
            token_bridge_state
        }
    }

    #[test_only]
    public fun destroy_for_testing(state: State) {
        let State { id, package_id: _, module_name: _, core_bridge_state: _, token_bridge_state: _ } = state;
        object::delete(id);
    }
}
