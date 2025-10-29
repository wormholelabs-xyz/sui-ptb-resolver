module wormhole_token_bridge_resolver::wormhole_token_bridge_resolver {
    use sui::package;

    public struct WORMHOLE_TOKEN_BRIDGE_RESOLVER has drop {}

    // creates and transfers Publisher to deployer
    fun init(otw: WORMHOLE_TOKEN_BRIDGE_RESOLVER, ctx: &mut TxContext) {
        package::claim_and_keep(otw, ctx);
    }
}
