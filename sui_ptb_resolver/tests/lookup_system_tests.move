#[test_only]
module sui_ptb_resolver::lookup_system_tests {
    use sui_ptb_resolver::ptb_types::{Self};
    use std::string::{Self};
    use sui::bcs;

    const TEST_CORE_BRIDGE_STATE: address = @0xaeab97f96cf9877fee2883315d459552b2b921edc16d7ceac6eab944dd88919c;
    const TEST_TOKEN_BRIDGE_STATE: address = @0xc57508ee0d4595e5a8728974a4a93a787d38f339757230d441e895422c07aba9;

    #[test]
    fun test_request_package_lookup() {
        let mut builder = ptb_types::create_ptb_builder_for_testing();
        
        // requesting package lookup
        let handle = ptb_types::request_package_lookup(
            &mut builder,
            TEST_CORE_BRIDGE_STATE,
            string::utf8(b"CurrentPackage"),
            string::utf8(b"package"),
            string::utf8(b"test_package")  // Semantic key for testing
        );
        
        let lookups = ptb_types::get_builder_lookups(&builder);
        assert!(vector::length(lookups) == 1, 0);
        
        assert!(ptb_types::has_pending_lookups(&builder), 1);
        let pending = ptb_types::get_builder_pending_lookups(&builder);
        assert!(vector::length(pending) == 1, 2);
    }

    #[test]
    fun test_request_coin_type_lookup() {
        let mut builder = ptb_types::create_ptb_builder_for_testing();
        
        let token_address = x"000000000000000000000000dac17f958d2ee523a2206206994597c13d831ec7";
        let token_chain = 2u16; // Ethereum
        let mut lookup_key = vector::empty<u8>();
        vector::append(&mut lookup_key, bcs::to_bytes(&token_address));
        vector::append(&mut lookup_key, bcs::to_bytes(&token_chain));
        
        let handle = ptb_types::request_coin_type_lookup(
            &mut builder,
            TEST_TOKEN_BRIDGE_STATE,
            string::utf8(b"token_registry.coin_types"),
            lookup_key,
            string::utf8(b"test_coin_type") 
        );
        
        let lookups = ptb_types::get_builder_lookups(&builder);
        assert!(vector::length(lookups) == 1, 0);
    }

    #[test]
    fun test_multiple_lookups_with_indices() {
        let mut builder = ptb_types::create_ptb_builder_for_testing();
        
        let handle1 = ptb_types::request_package_lookup(
            &mut builder,
            TEST_CORE_BRIDGE_STATE,
            string::utf8(b"CurrentPackage"),
            string::utf8(b"package"),
            string::utf8(b"lookup_1")
        );
        
        let handle2 = ptb_types::request_dynamic_field_lookup(
            &mut builder,
            @0x123,
            b"some_key",
            ptb_types::lookup_value_type_raw(),
            string::utf8(b"lookup_2")
        );
        
        let handle3 = ptb_types::request_object_field_lookup(
            &mut builder,
            @0x456,
            string::utf8(b"field.path"),
            ptb_types::lookup_value_type_object_ref(),
            string::utf8(b"lookup_3")
        );
        
        let lookups = ptb_types::get_builder_lookups(&builder);
        assert!(vector::length(lookups) == 3, 0);
        
        let pending = ptb_types::get_builder_pending_lookups(&builder);
        assert!(vector::length(pending) == 3, 1);
    }

    #[test]
    fun test_clear_pending_lookups() {
        let mut builder = ptb_types::create_ptb_builder_for_testing();
        
        let _handle1 = ptb_types::request_package_lookup(
            &mut builder,
            TEST_CORE_BRIDGE_STATE,
            string::utf8(b"CurrentPackage"),
            string::utf8(b"package"),
            string::utf8(b"clear_test_1")
        );
        
        let _handle2 = ptb_types::request_dynamic_field_lookup(
            &mut builder,
            @0x123,
            b"key",
            ptb_types::lookup_value_type_raw(),
            string::utf8(b"clear_test_2")
        );
        
        assert!(ptb_types::has_pending_lookups(&builder), 0);
        
        ptb_types::clear_pending_lookups(&mut builder);
        
        assert!(!ptb_types::has_pending_lookups(&builder), 1);
        
        let lookups = ptb_types::get_builder_lookups(&builder);
        assert!(vector::length(lookups) == 2, 2);
    }

    #[test]
    fun test_get_lookups_for_resolution() {
        let mut builder = ptb_types::create_ptb_builder_for_testing();
        
        let _handle1 = ptb_types::request_package_lookup(
            &mut builder,
            TEST_CORE_BRIDGE_STATE,
            string::utf8(b"CurrentPackage"),
            string::utf8(b"package"),
            string::utf8(b"resolution_test_1")
        );
        
        let _handle2 = ptb_types::request_coin_type_lookup(
            &mut builder,
            TEST_TOKEN_BRIDGE_STATE,
            string::utf8(b"token_registry.coin_types"),
            b"lookup_key",
            string::utf8(b"resolution_test_2")
        );
        
        let lookups_to_resolve = ptb_types::get_lookups_for_resolution(&builder);
        assert!(vector::length(&lookups_to_resolve) == 2, 0);
    }
}
