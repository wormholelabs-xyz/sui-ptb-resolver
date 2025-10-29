module wormhole_token_bridge_resolver::token_bridge_resolver {
    use std::string;
    use sui_ptb_resolver::ptb_types;
    use sui::bcs;
    use wormhole_token_bridge_resolver::state::{Self, State};
    
    const E_INVALID_CORE_PACKAGE_ADDRESS: u64 = 0;
    const E_INVALID_TOKEN_PACKAGE_ADDRESS: u64 = 1;
    const E_INVALID_COIN_TYPE: u64 = 2;

    public struct ParsedVAA has copy, drop {
        token_address: vector<u8>,
        token_chain: u16,
        recipient: address,  // the recipient from the TB VAA payload for transfer 
    }

    // This is the main resolver function that any other resolver must follow
    // Notes
    // The Token/Coin recipient is determined by the VAA itself
    // The VAA contains the recipient address (encoded at specific offset)
    // We extract the recipient from the VAA and use TransferObjects to send directly to them
    // This allows relayers to execute transactions on behalf of users
    // The authorize_transfer function still validates the VAA, but tokens go to the VAA recipient, not tx.sender
    public fun resolve_vaa(
        resolver_state: &State,
        vaa_bytes: vector<u8>,
        discovered_data_bytes: vector<u8>
    ) {
        // Create builder with discovered data
        let mut builder = ptb_types::create_ptb_builder(discovered_data_bytes);

        // Get addresses from State
        let core_bridge_state = state::core_bridge_state(resolver_state);
        let token_bridge_state = state::token_bridge_state(resolver_state);

        // Request package lookups - returns option<address>
        let core_package: Option<address> = builder.request_package_lookup(
            core_bridge_state,
            string::utf8(b"CurrentPackage"),
            string::utf8(b"package"),
            string::utf8(b"core_bridge_package")
        );

        let token_package: Option<address> = builder.request_package_lookup(
            token_bridge_state,
            string::utf8(b"CurrentPackage"),
            string::utf8(b"package"),
            string::utf8(b"token_bridge_package")
        );

        // Request coin type lookup only if token package is available
        let mut coin_type: Option<vector<u8>> = option::none();

        if (token_package.is_some()) {
            // Parse VAA to get token info
            let parsed_vaa = parse_vaa(vaa_bytes);

            // Build structured key for coin type lookup
            let key_fields = build_coin_type_structured_key(
                parsed_vaa.token_address,
                parsed_vaa.token_chain
            );

            // Get the token bridge package address for type construction
            let token_bridge_package = *option::borrow(&token_package);

            // Construct the key type string: 0xPACKAGE::token_registry::CoinTypeKey
            let mut key_type_string = string::utf8(b"0x");
            string::append(&mut key_type_string, sui::address::to_string(token_bridge_package));
            string::append(&mut key_type_string, string::utf8(b"::token_registry::CoinTypeKey"));

            // Use new structured table lookup
            coin_type = builder.request_table_item_lookup(
                token_bridge_state,
                string::utf8(b"token_registry.coin_types"),
                option::none(),           // No raw key
                option::some(key_fields), // Use structured key
                key_type_string,          // Key type
                string::utf8(b"coin_type")
            );
        };

        // Check if we have pending lookups and emit correct event finalizing run
        if (builder.has_pending_lookups()) {
            let lookups = builder.get_lookups_for_resolution();
            let result = ptb_types::create_needs_offchain_result(lookups);
            ptb_types::emit_resolver_event(&result);

            return
        };

        // All data resolved! Then build PTB with resolved values
        // Coin type needs 0x prefix
        let coin_type_str = string::utf8(*option::borrow(&coin_type));
        let mut full_coin_type = string::utf8(b"0x");
        string::append(&mut full_coin_type, coin_type_str);

        build_redemption_ptb(
            &mut builder,
            vaa_bytes,
            *option::borrow(&core_package),
            *option::borrow(&token_package),
            full_coin_type,
            core_bridge_state,
            token_bridge_state
        );
    }
    
    fun build_redemption_ptb(
        builder: &mut ptb_types::PTBBuilder,
        vaa_bytes: vector<u8>,
        core_bridge_package: address,
        token_bridge_package: address,
        coin_type: string::String,
        core_bridge_state: address,
        token_bridge_state: address
    ) {
        // Ensure coin_type is not empty
        assert!(!string::is_empty(&coin_type), E_INVALID_COIN_TYPE);

        // Parse VAA to get recipient
        let parsed_vaa = parse_vaa(vaa_bytes);
        let recipient_address = parsed_vaa.recipient;
        
        // add PTB inputs
        let vaa_input = builder.add_pure_input(vaa_bytes);
        
        let clock = builder.add_object_input(
            ptb_types::create_object_ref(@0x6, 0, vector::empty())
        );
        
        // For shared objects in PTBs, version 0 with empty digest works
        // The Sui runtime will resolve to the current version automatically
        // Add core bridge state (shared object)
        let core_bridge = builder.add_object_input(
            ptb_types::create_object_ref(core_bridge_state, 0, vector::empty())
        );

        // Add token bridge state (shared object)
        let token_bridge = builder.add_object_input(
            ptb_types::create_object_ref(token_bridge_state, 0, vector::empty())
        );
        
        // Pase and verify command (from core package)
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
        
        // Verify vaa on TokenBridge package
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
        
        // Auth transfer
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
        
        // Reedeem relayer payout
        let payout = builder.add_move_call(
            token_bridge_package,
            string::utf8(b"complete_transfer"),
            string::utf8(b"redeem_relayer_payout"),
            vector[coin_type_tag],
            vector[
                ptb_types::command_result_to_argument(&transfer_result)
            ]
        );
        
        // Transfer the coins to the actual recipient (not tx.sender)
        // First, we need to add the recipient as an input
        let recipient_input = builder.add_pure_input(recipient_address);
        
        builder.add_transfer_objects(
            vector[ptb_types::command_result_to_argument(&payout)],
            ptb_types::input_handle_to_argument(&recipient_input)
        );
        
        builder.add_required_object(core_bridge_state);
        builder.add_required_object(token_bridge_state);
        builder.add_required_type(coin_type);
        
        //finalize and submit as event
        let instruction_groups = builder.finalize_builder();
        let result = ptb_types::create_resolved_result(instruction_groups);
        ptb_types::emit_resolver_event(&result);
    }
    
    
    fun build_coin_type_structured_key(
        token_address: vector<u8>,
        token_chain: u16
    ): vector<ptb_types::StructField> {
        let mut fields = vector::empty();

        // Field 1: addr (no BCS encoding needed, already vector<u8>)
        vector::push_back(&mut fields, ptb_types::create_struct_field(
            b"addr",
            token_address
        ));

        // Field 2: chain (BCS encode the u16)
        vector::push_back(&mut fields, ptb_types::create_struct_field(
            b"chain",
            bcs::to_bytes(&token_chain)
        ));

        fields
    }
    
    fun parse_vaa(vaa_bytes: vector<u8>): ParsedVAA {
        let token_address = extract_token_address(vaa_bytes);
        let token_chain = extract_token_chain(vaa_bytes);
        let recipient = extract_recipient(vaa_bytes);
        
        ParsedVAA {
            token_address,
            token_chain,
            recipient,
        }
    }
    
    // TODO: From TB package
    fun extract_token_address(vaa_bytes: vector<u8>): vector<u8> {
        // Same implementation as original
        let mut offset = 0;
        
        // Skip version (1 byte)
        offset = offset + 1;
        
        // Skip guardian set index (4 bytes)
        offset = offset + 4;
        
        // Get signature count (1 byte)
        let sig_count = *vector::borrow(&vaa_bytes, offset);
        offset = offset + 1;
        
        // Skip signatures (66 bytes each)
        offset = offset + (66 * (sig_count as u64));
        
        // Skip timestamp (4 bytes)
        offset = offset + 4;
        
        // Skip nonce (4 bytes)
        offset = offset + 4;
        
        // Skip emitter chain (2 bytes)
        offset = offset + 2;
        
        // Skip emitter address (32 bytes)
        offset = offset + 32;
        
        // Skip sequence (8 bytes)
        offset = offset + 8;
        
        // Skip consistency level (1 byte)
        offset = offset + 1;
        
        // Skip payload type (1 byte) 
        offset = offset + 1;
        
        // Skip amount (32 bytes)
        offset = offset + 32;
        
        // Extract token address (32 bytes)
        let mut token_address = vector::empty<u8>();
        let mut i = 0;
        while (i < 32) {
            vector::push_back(&mut token_address, *vector::borrow(&vaa_bytes, offset + i));
            i = i + 1;
        };
        
        token_address
    }
    
    // TODO: From TB package
    fun extract_token_chain(vaa_bytes: vector<u8>): u16 {
        // Similar to extract_token_address but for chain ID
        let mut offset = 0;
        
        // Skip to token chain position (same skips as token_address + 32 bytes for address)
        offset = offset + 1;  // version
        offset = offset + 4;  // guardian set index
        
        let sig_count = *vector::borrow(&vaa_bytes, offset);
        offset = offset + 1;
        offset = offset + (66 * (sig_count as u64));
        
        offset = offset + 4;  // timestamp
        offset = offset + 4;  // nonce
        offset = offset + 2;  // emitter chain
        offset = offset + 32; // emitter address
        offset = offset + 8;  // sequence
        offset = offset + 1;  // consistency level
        offset = offset + 1;  // payload type
        offset = offset + 32; // amount
        offset = offset + 32; // token address
        
        // Extract token chain (2 bytes, big-endian)
        let byte1 = (*vector::borrow(&vaa_bytes, offset) as u16);
        let byte2 = (*vector::borrow(&vaa_bytes, offset + 1) as u16);
        
        (byte1 << 8) | byte2
    }
    
    // TODO: From TB package
    fun extract_recipient(vaa_bytes: vector<u8>): address {
        // Navigate to recipient position in VAA
        let mut offset = 0;
        
        // Skip version (1 byte)
        offset = offset + 1;
        
        // Skip guardian set index (4 bytes)
        offset = offset + 4;
        
        // Get signature count (1 byte)
        let sig_count = *vector::borrow(&vaa_bytes, offset);
        offset = offset + 1;
        
        // Skip signatures (66 bytes each)
        offset = offset + (66 * (sig_count as u64));
        
        // Skip timestamp (4 bytes)
        offset = offset + 4;
        
        // Skip nonce (4 bytes)
        offset = offset + 4;
        
        // Skip emitter chain (2 bytes)
        offset = offset + 2;
        
        // Skip emitter address (32 bytes)
        offset = offset + 32;
        
        // Skip sequence (8 bytes)
        offset = offset + 8;
        
        // Skip consistency level (1 byte)
        offset = offset + 1;
        
        // Skip payload type (1 byte) 
        offset = offset + 1;
        
        // Skip amount (32 bytes)
        offset = offset + 32;
        
        // Skip token address (32 bytes)
        offset = offset + 32;
        
        // Skip token chain (2 bytes)
        offset = offset + 2;
        
        // Extract recipient address (32 bytes)
        let mut recipient_bytes = vector::empty<u8>();
        let mut i = 0;
        while (i < 32) {
            vector::push_back(&mut recipient_bytes, *vector::borrow(&vaa_bytes, offset + i));
            i = i + 1;
        };
        
        // Convert bytes to address
        sui::address::from_bytes(recipient_bytes)
    }
    
    
    #[test_only]
    public fun build_transfer_ptb_for_test(
        builder: &mut ptb_types::PTBBuilder,
        vaa_bytes: vector<u8>,
        core_package: address,
        token_package: address,
        coin_type: string::String
    ) {
        let vaa_input = builder.add_pure_input(vaa_bytes);
        let clock = builder.add_object_input(
            ptb_types::create_object_ref(@0x6, 0, vector::empty())
        );
        
        // Use mainnet addresses for testing
        let core_bridge = builder.add_object_input(
            ptb_types::create_object_ref(@0xaeab97f96cf9877fee2883315d459552b2b921edc16d7ceac6eab944dd88919c, 0, vector::empty())
        );

        let token_bridge = builder.add_object_input(
            ptb_types::create_object_ref(@0xc57508ee0d4595e5a8728974a4a93a787d38f339757230d441e895422c07aba9, 0, vector::empty())
        );
        
        // Build chain of commands
        let vaa_result = builder.add_move_call(
            core_package,
            string::utf8(b"vaa"),
            string::utf8(b"parse_and_verify"),
            vector::empty(),
            vector[
                ptb_types::input_handle_to_argument(&core_bridge),
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
                ptb_types::input_handle_to_argument(&token_bridge),
                ptb_types::command_result_to_argument(&vaa_result)
            ]
        );
        
        let coin_type_tag = ptb_types::create_type_tag(*string::as_bytes(&coin_type));
        let transfer_result = builder.add_move_call(
            token_package,
            string::utf8(b"complete_transfer"),
            string::utf8(b"authorize_transfer"),
            vector[coin_type_tag],
            vector[
                ptb_types::input_handle_to_argument(&token_bridge),
                ptb_types::command_result_to_argument(&receipt)
            ]
        );
        
        let payout = builder.add_move_call(
            token_package,
            string::utf8(b"complete_transfer"),
            string::utf8(b"redeem_relayer_payout"),
            vector[coin_type_tag],
            vector[
                ptb_types::command_result_to_argument(&transfer_result)
            ]
        );
        
        let _final = builder.add_move_call(
            token_package,
            string::utf8(b"coin_utils"),
            string::utf8(b"return_nonzero"),
            vector[coin_type_tag],
            vector[
                ptb_types::command_result_to_argument(&payout)
            ]
        );

        builder.add_required_object(@0xaeab97f96cf9877fee2883315d459552b2b921edc16d7ceac6eab944dd88919c);
        builder.add_required_object(@0xc57508ee0d4595e5a8728974a4a93a787d38f339757230d441e895422c07aba9);
        builder.add_required_type(coin_type);
        
        // Don't finalize or emit - let tests verify the builder state
    }
    
    #[test_only]
    public fun build_complete_transfer_for_test(
        builder: &mut ptb_types::PTBBuilder,
        vaa_bytes: vector<u8>,
        core_package: address,
        token_package: address,
        coin_type: string::String
    ) {
        build_transfer_ptb_for_test(builder, vaa_bytes, core_package, token_package, coin_type)
    }
    
    
    #[test]
    fun test_vaa_parsing_13_signatures() {
        // Same test implementation as original
        let mut vaa = vector::empty<u8>();
        
        // Version
        vector::push_back(&mut vaa, 1);
        
        // Guardian set index
        vector::append(&mut vaa, x"00000000");
        
        // Signature count (13)
        vector::push_back(&mut vaa, 13);
        
        // Add 13 dummy signatures (66 bytes each)
        let mut sig_idx = 0;
        while (sig_idx < 13) {
            let mut i = 0;
            while (i < 66) {
                vector::push_back(&mut vaa, 0);
                i = i + 1;
            };
            sig_idx = sig_idx + 1;
        };
        
        // Timestamp
        vector::append(&mut vaa, x"00000000");
        
        // Nonce
        vector::append(&mut vaa, x"00000000");
        
        // Emitter chain (Ethereum)
        vector::append(&mut vaa, x"0002");
        
        // Emitter address
        let mut i = 0;
        while (i < 32) {
            vector::push_back(&mut vaa, 0);
            i = i + 1;
        };
        
        vector::append(&mut vaa, x"00000000000B26EB"); // Sequence
        vector::push_back(&mut vaa, 15); // Consistency level
        vector::push_back(&mut vaa, 1); // Payload type
        
        // Amount
        vector::append(&mut vaa, x"000000000000000000000000000000000000000000000000000000046C8AFDB0");
        
        // Token address (USDT on Ethereum)
        vector::append(&mut vaa, x"000000000000000000000000DAC17F958D2EE523A2206206994597C13D831EC7");
        
        // Token chain
        vector::append(&mut vaa, x"0002");
        
        // Test extraction
        let token_address = extract_token_address(vaa);
        let token_chain = extract_token_chain(vaa);
        
        // Verify
        assert!(vector::length(&token_address) == 32, 1);
        assert!(*vector::borrow(&token_address, 12) == 0xDA, 2);
        assert!(token_chain == 2, 3);
    }
}
