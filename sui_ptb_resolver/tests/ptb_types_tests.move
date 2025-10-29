// testing public apis only

#[test_only]
module sui_ptb_resolver::ptb_types_tests {
    use sui_ptb_resolver::ptb_types::{Self};
    use std::string::{Self};
    
    const TEST_ADDRESS: address = @0x1234567890abcdef;

    
    #[test]
    fun test_create_gas_coin_arg() {
        let arg = ptb_types::create_gas_coin_arg();
        assert!(ptb_types::is_gas_coin_arg(&arg), 0);
        assert!(ptb_types::get_arg_index(&arg) == 0, 1);
        assert!(ptb_types::get_arg_nested_index(&arg) == 0, 2);
    }

    #[test]
    fun test_create_nested_result_arg() {
        let index = 2;
        let nested_index = 1;
        let arg = ptb_types::create_nested_result_arg(index, nested_index);
        
        assert!(ptb_types::is_nested_result_arg(&arg), 0);
        assert!(!ptb_types::is_result_arg(&arg), 1);
        assert!(!ptb_types::is_input_arg(&arg), 2);
        assert!(ptb_types::get_arg_index(&arg) == index, 3);
        assert!(ptb_types::get_arg_nested_index(&arg) == nested_index, 4);
    }




    #[test]
    fun test_complete_ptb_construction() {
        // Test using builder pattern (the new public API)
        let mut builder = ptb_types::create_ptb_builder_for_testing();
        
       ptb_types::add_pure_input(&mut builder, b"test");
        ptb_types::add_object_input(
            &mut builder,
            ptb_types::create_object_ref(TEST_ADDRESS, 0, vector::empty())
        );
        
         ptb_types::add_move_call(
            &mut builder,
            TEST_ADDRESS,
            string::utf8(b"module"),
            string::utf8(b"function"),
            vector::empty(),
            vector::empty()
        );
        
        let groups = ptb_types::finalize_builder(&builder);
        assert!(vector::length(&ptb_types::get_groups(&groups)) == 1, 0);
    }


    #[test]
    fun test_discovered_data_basic_operations() {
        let mut data = ptb_types::create_discovered_data();
        
        let key = string::utf8(b"test_key");
        let value = b"test_value";
        
        ptb_types::add_discovered_entry(&mut data, key, value);
        
        assert!(ptb_types::has_discovered_key_for_testing(&data, &key), 0);
        
        let retrieved = ptb_types::get_discovered_value_for_testing(&data, &key);
        assert!(retrieved == value, 1);
    }

    #[test]
    fun test_discovered_data_encoding_decoding() {
        let mut data = ptb_types::create_discovered_data();
        
        ptb_types::add_discovered_entry(&mut data, string::utf8(b"key1"), b"value1");
        ptb_types::add_discovered_entry(&mut data, string::utf8(b"key2"), b"value2");
        
        let encoded = ptb_types::encode_discovered_data(&data);
        let decoded = ptb_types::discovered_data_from_bytes(encoded);
        
        assert!(ptb_types::has_discovered_key_for_testing(&decoded, &string::utf8(b"key1")), 0);
        assert!(ptb_types::has_discovered_key_for_testing(&decoded, &string::utf8(b"key2")), 1);
    }

    #[test]
    fun test_discovered_data_empty_handling() {
        let data = ptb_types::create_discovered_data();
        let keys = ptb_types::get_discovered_keys(&data);
        assert!(vector::is_empty(&keys), 0);
        assert!(ptb_types::discovered_data_length(&data) == 0, 1);
    }


    #[test]
    fun test_discovered_data_get_keys() {
        let mut data = ptb_types::create_discovered_data();
        
        ptb_types::add_discovered_entry(&mut data, string::utf8(b"key1"), b"value1");
        ptb_types::add_discovered_entry(&mut data, string::utf8(b"key2"), b"value2");
        ptb_types::add_discovered_entry(&mut data, string::utf8(b"key3"), b"value3");
        
        let keys = ptb_types::get_discovered_keys(&data);
        assert!(vector::length(&keys) == 3, 0);
    }

    #[test]
    fun test_special_characters_in_keys() {
        let mut data = ptb_types::create_discovered_data();
        
        let key = string::utf8(b"key.with.dots");
        let value = b"value";
        
        ptb_types::add_discovered_entry(&mut data, key, value);
        assert!(ptb_types::has_discovered_key_for_testing(&data, &key), 0);
        
        let retrieved = ptb_types::get_discovered_value_for_testing(&data, &key);
        assert!(retrieved == value, 1);
    }

    #[test]
    fun test_large_values() {
        let mut data = ptb_types::create_discovered_data();
        
        let mut large_value = vector::empty<u8>();
        let mut i = 0;
        while (i < 1000) {
            vector::push_back(&mut large_value, ((i % 256) as u8));
            i = i + 1;
        };
        
        let key = string::utf8(b"large_key");
        ptb_types::add_discovered_entry(&mut data, key, large_value);
        
        let retrieved = ptb_types::get_discovered_value_for_testing(&data, &key);
        assert!(vector::length(&retrieved) == 1000, 0);
    }
}
