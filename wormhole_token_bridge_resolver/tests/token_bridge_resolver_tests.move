#[test_only]
module wormhole_token_bridge_resolver::token_bridge_resolver_tests {
    use wormhole_token_bridge_resolver::token_bridge_resolver::{Self};
    use wormhole_token_bridge_resolver::state::{Self};
    use sui_ptb_resolver::ptb_types::{Self};
    use std::string::{Self};
    use sui::bcs;
    use sui::test_scenario;

    const TEST_PACKAGE_ID: address = @0xd6dfe75ab0586a023edc0b43f28028269c43be4dfa2a1e5bba0dc8a73b689b1c;
    const TEST_CORE_BRIDGE_STATE: address = @0xaeab97f96cf9877fee2883315d459552b2b921edc16d7ceac6eab944dd88919c;
    const TEST_TOKEN_BRIDGE_STATE: address = @0xc57508ee0d4595e5a8728974a4a93a787d38f339757230d441e895422c07aba9;
    const TEST_ADMIN: address = @0x1234;

    #[test]
    fun test_resolve_vaa_without_discovered_data() {
        let mut scenario = test_scenario::begin(TEST_ADMIN);

        let resolver_state = state::new_for_testing(
            TEST_PACKAGE_ID,
            string::utf8(b"token_bridge_resolver"),
            TEST_CORE_BRIDGE_STATE,
            TEST_TOKEN_BRIDGE_STATE,
            test_scenario::ctx(&mut scenario)
        );

        let vaa_bytes = create_test_vaa();
        let discovered_data_bytes = vector::empty<u8>();

        // Call resolve_vaa - should emit NeedsOfchainResolution
        token_bridge_resolver::resolve_vaa(&resolver_state, vaa_bytes, discovered_data_bytes);

        state::destroy_for_testing(resolver_state);
        test_scenario::end(scenario);
    }

    #[test]
    fun test_builder_pattern_integration() {
        // Test that the builder pattern is used correctly
        let mut builder = ptb_types::create_ptb_builder(vector::empty());
        
        // Simulate the PTB building process
        let vaa_bytes = create_test_vaa();
        
        // Build transfer PTB manually (since build_transfer_ptb is internal)
        token_bridge_resolver::build_transfer_ptb_for_test(
            &mut builder,
            vaa_bytes,
            @0xf47329f4344f3bf0f8e436e2f7b485466cff300f12a166563995d3888c296a94,
            @0x562760fc51d90d4ae1835bac3e91e0e6987d3497b06f066941d3e51f6e8d76d0,
            string::utf8(b"0x2::sui::SUI")
        );
        
        // Verify builder has commands
        let commands = ptb_types::get_builder_commands(&builder);
        assert!(vector::length(commands) > 0, 0);
        
        // Verify required objects were added
        let required_objects = ptb_types::get_builder_required_objects(&builder);
        assert!(vector::length(required_objects) >= 2, 1);
        
        // Verify required types were added
        let required_types = ptb_types::get_builder_required_types(&builder);
        assert!(vector::length(required_types) >= 1, 2);
    }

    #[test]
    fun test_lookup_system_integration() {
        let mut builder = ptb_types::create_ptb_builder(vector::empty());
        
        // Request core package lookup
        let _core_handle = ptb_types::request_package_lookup(
            &mut builder,
            TEST_CORE_BRIDGE_STATE,
            string::utf8(b"CurrentPackage"),
            string::utf8(b"package"),
            string::utf8(b"core_bridge_package")
        );
        
        // Request token package lookup
        let _token_handle = ptb_types::request_package_lookup(
            &mut builder,
            TEST_TOKEN_BRIDGE_STATE,
            string::utf8(b"CurrentPackage"),
            string::utf8(b"package"),
            string::utf8(b"token_bridge_package")
        );
        
        // Request coin type lookup
        let lookup_key = build_test_lookup_key();
        let _coin_handle = ptb_types::request_coin_type_lookup(
            &mut builder,
            TEST_TOKEN_BRIDGE_STATE,
            string::utf8(b"token_registry.coin_types"),
            lookup_key,
            string::utf8(b"coin_type")
        );
        
        // Verify all lookups were added
        let lookups = ptb_types::get_builder_lookups(&builder);
        assert!(vector::length(lookups) == 3, 0);
        
        // Verify pending lookups
        assert!(ptb_types::has_pending_lookups(&builder), 1);
        let pending = ptb_types::get_builder_pending_lookups(&builder);
        assert!(vector::length(pending) == 3, 2);
    }

    #[test]
    fun test_command_chaining() {
        // Test that command results are properly chained
        let mut builder = ptb_types::create_ptb_builder(vector::empty());
        let vaa_bytes = create_test_vaa();
        
        // Add inputs
        let core_bridge = ptb_types::add_object_input(
            &mut builder,
            ptb_types::create_object_ref(TEST_CORE_BRIDGE_STATE, 0, vector::empty())
        );
        let vaa_input = ptb_types::add_pure_input(&mut builder, vaa_bytes);
        let clock = ptb_types::add_object_input(
            &mut builder,
            ptb_types::create_object_ref(@0x6, 0, vector::empty())
        );
        
        // Command 1: parse_and_verify
        let vaa_result = ptb_types::add_move_call(
            &mut builder,
            @0x1,
            string::utf8(b"vaa"),
            string::utf8(b"parse_and_verify"),
            vector::empty(),
            vector[
                ptb_types::input_handle_to_argument(&core_bridge),
                ptb_types::input_handle_to_argument(&vaa_input),
                ptb_types::input_handle_to_argument(&clock)
            ]
        );
        
        // Command 2: Use result from command 1
        let token_bridge = ptb_types::add_object_input(
            &mut builder,
            ptb_types::create_object_ref(TEST_TOKEN_BRIDGE_STATE, 0, vector::empty())
        );
        
        let receipt = ptb_types::add_move_call(
            &mut builder,
            @0x2,
            string::utf8(b"vaa"),
            string::utf8(b"verify_only_once"),
            vector::empty(),
            vector[
                ptb_types::input_handle_to_argument(&token_bridge),
                ptb_types::command_result_to_argument(&vaa_result)
            ]
        );
        
        // Verify commands were chained correctly
        let commands = ptb_types::get_builder_commands(&builder);
        assert!(vector::length(commands) == 2, 0);
        
        // Verify result arguments were created
        let arg = ptb_types::command_result_to_argument(&receipt);
        assert!(ptb_types::is_result_arg(&arg), 1);
        assert!(ptb_types::get_arg_index(&arg) == 1, 2); // Second command
    }

    #[test]
    fun test_complete_transfer_flow() {
        // Test the complete transfer flow with builder pattern
        let mut builder = ptb_types::create_ptb_builder(vector::empty());
        let vaa_bytes = create_test_vaa();
        
        // Build complete transfer PTB manually
        token_bridge_resolver::build_complete_transfer_for_test(
            &mut builder,
            vaa_bytes,
            @0xf47329,
            @0x562760,
            string::utf8(b"0x2::sui::SUI")
        );
        
        // Finalize builder
        let instruction_groups = ptb_types::finalize_builder(&builder);
        let groups = ptb_types::get_groups(&instruction_groups);
        
        // Verify we have a complete PTB
        assert!(vector::length(&groups) == 1, 0);
        
        let group = vector::borrow(&groups, 0);
        let instructions = ptb_types::get_group_instructions(group);
        let commands = ptb_types::get_instruction_commands(&instructions);
        
        // Should have multiple commands for complete transfer
        assert!(vector::length(&commands) >= 5, 1); // parse, verify, authorize, redeem, return_nonzero
    }

    // ===== Helper functions =====
    
    fun create_test_vaa(): vector<u8> {
        // Create a minimal valid VAA for testing
        let mut vaa = vector::empty<u8>();
        
        // Version
        vector::push_back(&mut vaa, 1);
        
        // Guardian set index
        vector::append(&mut vaa, x"00000000");
        
        // Signature count
        vector::push_back(&mut vaa, 1);
        
        // Dummy signature (66 bytes)
        let mut i = 0;
        while (i < 66) {
            vector::push_back(&mut vaa, 0);
            i = i + 1;
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
        
        // Sequence
        vector::append(&mut vaa, x"0000000000000001");
        
        // Consistency level
        vector::push_back(&mut vaa, 15);
        
        // Payload type (transfer)
        vector::push_back(&mut vaa, 1);
        
        // Amount (32 bytes)
        let mut i = 0;
        while (i < 32) {
            vector::push_back(&mut vaa, 0);
            i = i + 1;
        };
        
        // Token address (USDT on Ethereum)
        vector::append(&mut vaa, x"000000000000000000000000DAC17F958D2EE523A2206206994597C13D831EC7");
        
        // Token chain
        vector::append(&mut vaa, x"0002");
        
        // Recipient
        let mut i = 0;
        while (i < 32) {
            vector::push_back(&mut vaa, 0);
            i = i + 1;
        };
        
        // Recipient chain
        vector::append(&mut vaa, x"0015"); // Sui
        
        // Fee
        let mut i = 0;
        while (i < 32) {
            vector::push_back(&mut vaa, 0);
            i = i + 1;
        };
        
        vaa
    }
    
    fun build_test_lookup_key(): vector<u8> {
        // Build lookup key for USDT on Ethereum
        let token_address = x"000000000000000000000000DAC17F958D2EE523A2206206994597C13D831EC7";
        let token_chain = 2u16;
        
        let mut key = vector::empty<u8>();
        vector::append(&mut key, bcs::to_bytes(&token_address));
        vector::append(&mut key, bcs::to_bytes(&token_chain));
        key
    }
}
