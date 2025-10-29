module wormhole_token_bridge_resolver::setup {
    use sui::package::Publisher;
    use wormhole_token_bridge_resolver::state;

    // Create and share the State object, only package deployed can call this
    public entry fun create_state(
        publisher: &Publisher,
        package_id: address,
        module_name: vector<u8>,
        core_bridge_state: address,
        token_bridge_state: address,
        ctx: &mut TxContext
    ) {
        let resolver_state = state::new(
            publisher,
            package_id,
            std::string::utf8(module_name),
            core_bridge_state,
            token_bridge_state,
            ctx
        );

        sui::transfer::public_share_object(resolver_state);
    }
}
