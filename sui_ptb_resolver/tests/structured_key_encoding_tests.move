#[test_only]
/// Tests for the length-prefixed structured key encoding fix.
///
/// As testing scenario we're using a Token Registry table lookup
/// from Wormhole Token Bridge program as use case
module sui_ptb_resolver::structured_key_encoding_tests {
    use sui_ptb_resolver::ptb_types::{Self};
    use std::string::{Self};

    const TEST_TOKEN_BRIDGE_STATE: address = @0xc57508ee0d4595e5a8728974a4a93a787d38f339757230d441e895422c07aba9;

    /// Native SUI token address on Avalanche (contains 0xff at byte 8)
    const NATIVE_SUI_TOKEN_ADDRESS: vector<u8> = x"9258181f5ceac8dbffb7030890243caed69a9599d2886d957a9cb7656af3bdb3";
    const AVALANCHE_CHAIN_ID: u16 = 6;

    #[test]
    /// Test that structured key encoding works correctly for the native SUI token
    /// which contains 0xff in its address bytes.
    fun test_native_sui_token_structured_key_encoding() {
        let mut builder = ptb_types::create_ptb_builder_for_testing();

        // Build the structured key with the problematic address
        let key_fields = vector[
            ptb_types::create_struct_field(b"addr", NATIVE_SUI_TOKEN_ADDRESS),
            ptb_types::create_struct_field(b"chain", sui::bcs::to_bytes(&AVALANCHE_CHAIN_ID))
        ];

        let _handle = ptb_types::request_table_item_lookup(
            &mut builder,
            TEST_TOKEN_BRIDGE_STATE,
            string::utf8(b"token_registry.coin_types"),
            std::option::none(),
            std::option::some(key_fields),
            string::utf8(b"0xPKG::token_registry::CoinTypeKey"),
            string::utf8(b"coin_type")
        );

        let lookups = ptb_types::get_builder_lookups(&builder);
        assert!(vector::length(lookups) == 1, 0);

        let lookup = vector::borrow(lookups, 0);
        let encoded_key = ptb_types::get_lookup_key(lookup);

        // table_path + 0xff + num_fields(1) + [name_len(1) + name + value_len(2) + value]*
        let table_path = b"token_registry.coin_types";
        let table_path_len = vector::length(&table_path);

        // Check table_path is at the start
        let mut i = 0;
        while (i < table_path_len) {
            assert!(*vector::borrow(&encoded_key, i) == *vector::borrow(&table_path, i), 1);
            i = i + 1;
        };

        assert!(*vector::borrow(&encoded_key, table_path_len) == 0xff, 2);
        let num_fields_offset = table_path_len + 1;
        
        assert!(*vector::borrow(&encoded_key, num_fields_offset) == 2, 3);

        let field1_name_len_offset = num_fields_offset + 1;
        let field1_name_len = (*vector::borrow(&encoded_key, field1_name_len_offset) as u64);
        assert!(field1_name_len == 4, 4); // "addr" is 4 bytes

        let field1_name_offset = field1_name_len_offset + 1;
        assert!(*vector::borrow(&encoded_key, field1_name_offset) == 0x61, 5);     // 'a'
        assert!(*vector::borrow(&encoded_key, field1_name_offset + 1) == 0x64, 6); // 'd'
        assert!(*vector::borrow(&encoded_key, field1_name_offset + 2) == 0x64, 7); // 'd'
        assert!(*vector::borrow(&encoded_key, field1_name_offset + 3) == 0x72, 8); // 'r'

        let field1_value_len_offset = field1_name_offset + 4;
        assert!(*vector::borrow(&encoded_key, field1_value_len_offset) == 0x00, 9);
        assert!(*vector::borrow(&encoded_key, field1_value_len_offset + 1) == 0x20, 10); // 32 in hex

        let field1_value_offset = field1_value_len_offset + 2;
        let mut j = 0;
        while (j < 32) {
            let expected = *vector::borrow(&NATIVE_SUI_TOKEN_ADDRESS, j);
            let actual = *vector::borrow(&encoded_key, field1_value_offset + j);
            assert!(expected == actual, 100 + j);
            j = j + 1;
        };

        assert!(*vector::borrow(&encoded_key, field1_value_offset + 8) == 0xff, 200);
    }

    #[test]
    fun test_address_with_multiple_0xff_bytes() {
        let mut builder = ptb_types::create_ptb_builder_for_testing();

        // Create an address with multiple 0xff bytes
        let problematic_address = x"ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00";

        let key_fields = vector[
            ptb_types::create_struct_field(b"addr", problematic_address),
            ptb_types::create_struct_field(b"chain", sui::bcs::to_bytes(&2u16))
        ];

        let _handle = ptb_types::request_table_item_lookup(
            &mut builder,
            TEST_TOKEN_BRIDGE_STATE,
            string::utf8(b"token_registry.coin_types"),
            std::option::none(),
            std::option::some(key_fields),
            string::utf8(b"0xPKG::token_registry::CoinTypeKey"),
            string::utf8(b"coin_type")
        );

        let lookups = ptb_types::get_builder_lookups(&builder);
        let lookup = vector::borrow(lookups, 0);
        let encoded_key = ptb_types::get_lookup_key(lookup);

        let table_path = b"token_registry.coin_types";
        let table_path_len = vector::length(&table_path);
        let addr_value_offset = table_path_len + 1 + 1 + 1 + 4 + 2;

        let mut k = 0;
        while (k < 16) {
            let offset = addr_value_offset + (k * 2);
            assert!(*vector::borrow(&encoded_key, offset) == 0xff, 300 + k);
            k = k + 1;
        };
    }

    #[test]
    fun test_encoding_consistency() {
        let mut builder1 = ptb_types::create_ptb_builder_for_testing();
        let mut builder2 = ptb_types::create_ptb_builder_for_testing();

        let key_fields1 = vector[
            ptb_types::create_struct_field(b"addr", NATIVE_SUI_TOKEN_ADDRESS),
            ptb_types::create_struct_field(b"chain", sui::bcs::to_bytes(&AVALANCHE_CHAIN_ID))
        ];

        let key_fields2 = vector[
            ptb_types::create_struct_field(b"addr", NATIVE_SUI_TOKEN_ADDRESS),
            ptb_types::create_struct_field(b"chain", sui::bcs::to_bytes(&AVALANCHE_CHAIN_ID))
        ];

        let _handle1 = ptb_types::request_table_item_lookup(
            &mut builder1,
            TEST_TOKEN_BRIDGE_STATE,
            string::utf8(b"token_registry.coin_types"),
            std::option::none(),
            std::option::some(key_fields1),
            string::utf8(b"0xPKG::token_registry::CoinTypeKey"),
            string::utf8(b"coin_type")
        );

        let _handle2 = ptb_types::request_table_item_lookup(
            &mut builder2,
            TEST_TOKEN_BRIDGE_STATE,
            string::utf8(b"token_registry.coin_types"),
            std::option::none(),
            std::option::some(key_fields2),
            string::utf8(b"0xPKG::token_registry::CoinTypeKey"),
            string::utf8(b"coin_type")
        );

        let lookups1 = ptb_types::get_builder_lookups(&builder1);
        let lookups2 = ptb_types::get_builder_lookups(&builder2);

        let encoded1 = ptb_types::get_lookup_key(vector::borrow(lookups1, 0));
        let encoded2 = ptb_types::get_lookup_key(vector::borrow(lookups2, 0));

        assert!(vector::length(&encoded1) == vector::length(&encoded2), 0);

        let len = vector::length(&encoded1);
        let mut i = 0;
        while (i < len) {
            assert!(*vector::borrow(&encoded1, i) == *vector::borrow(&encoded2, i), i + 1);
            i = i + 1;
        };
    }

    #[test]
    fun test_encoded_length() {
        let mut builder = ptb_types::create_ptb_builder_for_testing();

        let key_fields = vector[
            ptb_types::create_struct_field(b"addr", NATIVE_SUI_TOKEN_ADDRESS),
            ptb_types::create_struct_field(b"chain", sui::bcs::to_bytes(&AVALANCHE_CHAIN_ID))
        ];

        let _handle = ptb_types::request_table_item_lookup(
            &mut builder,
            TEST_TOKEN_BRIDGE_STATE,
            string::utf8(b"token_registry.coin_types"),
            std::option::none(),
            std::option::some(key_fields),
            string::utf8(b"0xPKG::token_registry::CoinTypeKey"),
            string::utf8(b"coin_type")
        );

        let lookups = ptb_types::get_builder_lookups(&builder);
        let lookup = vector::borrow(lookups, 0);
        let encoded_key = ptb_types::get_lookup_key(lookup);

        // Expected length calculation:
        // table_path: "token_registry.coin_types" = 25 bytes
        // separator: 0xff = 1 byte
        // num_fields: 1 byte
        // field 1 (addr):
        //   name_len: 1 byte
        //   name "addr": 4 bytes
        //   value_len: 2 bytes
        //   value (32 bytes address): 32 bytes
        // field 2 (chain):
        //   name_len: 1 byte
        //   name "chain": 5 bytes
        //   value_len: 2 bytes
        //   value (u16 BCS): 2 bytes
        // Total: 25 + 1 + 1 + (1 + 4 + 2 + 32) + (1 + 5 + 2 + 2) = 25 + 1 + 1 + 39 + 10 = 76

        let expected_length = 76;
        assert!(vector::length(&encoded_key) == expected_length, 0);
    }

    #[test]
    fun test_different_token_addresses() {
        let usdc_address = x"000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";

        let sui_address = NATIVE_SUI_TOKEN_ADDRESS;

        let mut builder = ptb_types::create_ptb_builder_for_testing();

        let usdc_fields = vector[
            ptb_types::create_struct_field(b"addr", usdc_address),
            ptb_types::create_struct_field(b"chain", sui::bcs::to_bytes(&2u16)) // Ethereum
        ];

        let _handle1 = ptb_types::request_table_item_lookup(
            &mut builder,
            TEST_TOKEN_BRIDGE_STATE,
            string::utf8(b"token_registry.coin_types"),
            std::option::none(),
            std::option::some(usdc_fields),
            string::utf8(b"0xPKG::token_registry::CoinTypeKey"),
            string::utf8(b"usdc_coin_type")
        );

        // Add lookup for SUI
        let sui_fields = vector[
            ptb_types::create_struct_field(b"addr", sui_address),
            ptb_types::create_struct_field(b"chain", sui::bcs::to_bytes(&AVALANCHE_CHAIN_ID))
        ];

        let _handle2 = ptb_types::request_table_item_lookup(
            &mut builder,
            TEST_TOKEN_BRIDGE_STATE,
            string::utf8(b"token_registry.coin_types"),
            std::option::none(),
            std::option::some(sui_fields),
            string::utf8(b"0xPKG::token_registry::CoinTypeKey"),
            string::utf8(b"sui_coin_type")
        );

        let lookups = ptb_types::get_builder_lookups(&builder);
        assert!(vector::length(lookups) == 2, 0);

        let usdc_encoded = ptb_types::get_lookup_key(vector::borrow(lookups, 0));
        let sui_encoded = ptb_types::get_lookup_key(vector::borrow(lookups, 1));

        // Both should have the same structure/length (only values differ)
        assert!(vector::length(&usdc_encoded) == vector::length(&sui_encoded), 1);

        // Verify the addresses are correctly placed in each encoding
        let table_path = b"token_registry.coin_types";
        let addr_value_offset = vector::length(&table_path) + 1 + 1 + 1 + 4 + 2;

        // Check USDC address byte 8 is NOT 0xff
        assert!(*vector::borrow(&usdc_encoded, addr_value_offset + 8) != 0xff, 2);

        // Check SUI address byte 8 IS 0xff
        assert!(*vector::borrow(&sui_encoded, addr_value_offset + 8) == 0xff, 3);
    }
}
