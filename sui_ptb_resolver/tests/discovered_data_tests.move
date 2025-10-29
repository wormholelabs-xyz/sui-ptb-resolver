#[test_only]
module sui_ptb_resolver::discovered_data_tests {
    use sui_ptb_resolver::ptb_types::{Self};
    use std::string::{Self};
    use sui::bcs;
 // Tests dor Key/Value Discovered Data
    #[test]
    fun test_discovered_data_basic_operations() {
        let mut data = ptb_types::create_discovered_data();
        assert!(ptb_types::discovered_data_length(&data) == 0, 1);
        
        // insert some entries
        let key1 = string::utf8(b"core_bridge_state");
        let value1 = x"31358d198147da50db32eda2562951d53973a0c0ad5ed738e9b17d88b213d790";
        ptb_types::add_discovered_entry(&mut data, key1, value1);
        
        let key2 = string::utf8(b"token_bridge_state");
        let value2 = x"6fb10cdb7aa299e9a4308752dadecb049ff55a892de92992a1edbd7912b3d6da";
        ptb_types::add_discovered_entry(&mut data, key2, value2);
        
        assert!(ptb_types::discovered_data_length(&data) == 2, 2);
        assert!(ptb_types::has_discovered_key_for_testing(&data, &key1), 3);
        assert!(ptb_types::has_discovered_key_for_testing(&data, &key2), 4);
        let missing_key = string::utf8(b"missing");
        assert!(!ptb_types::has_discovered_key_for_testing(&data, &missing_key), 5);
        
        let retrieved1 = ptb_types::get_discovered_value_for_testing(&data, &key1);
        assert!(retrieved1 == value1, 6);
        
        let retrieved2 = ptb_types::get_discovered_value_for_testing(&data, &key2);
        assert!(retrieved2 == value2, 7);
        
        let missing_value = ptb_types::get_discovered_value_for_testing(&data, &missing_key);
        assert!(vector::is_empty(&missing_value), 8);
    }
    
    #[test]
    fun test_discovered_data_encoding_decoding() {
        // create discovered data with multiple entries
        let mut data = ptb_types::create_discovered_data();
        
        // insert various types of data
        ptb_types::add_discovered_entry(&mut data, string::utf8(b"core_bridge_state"), 
            x"31358d198147da50db32eda2562951d53973a0c0ad5ed738e9b17d88b213d790");
        ptb_types::add_discovered_entry(&mut data, string::utf8(b"token_bridge_state"), 
            x"6fb10cdb7aa299e9a4308752dadecb049ff55a892de92992a1edbd7912b3d6da");
        ptb_types::add_discovered_entry(&mut data, string::utf8(b"core_bridge_package"), 
            x"f47329f4344f3bf0f8e436e2f7b485466cff300f12a166563995d3888c296a94");
        ptb_types::add_discovered_entry(&mut data, string::utf8(b"token_bridge_package"), 
            x"562760fc51d90d4ae1835bac3e91e0e6987d3497b06f066941d3e51f6e8d76d0");
        
        // insert a coin type (variable length string)
        let coin_type = string::utf8(b"0xbc03aaab4c11eb84df8bf39fdc714fa5d5b65b16eb7d155e22c74a68c8d4e17f::coin::COIN");
        ptb_types::add_discovered_entry(&mut data, string::utf8(b"coin_type"), 
            *string::as_bytes(&coin_type));
        
        let encoded = ptb_types::encode_discovered_data(&data);
        let decoded = ptb_types::discovered_data_from_bytes(encoded);
        assert!(ptb_types::discovered_data_length(&decoded) == 5, 10);
        
        // cehck each entry
        let key1 = string::utf8(b"core_bridge_state");
        assert!(ptb_types::has_discovered_key_for_testing(&decoded, &key1), 11);
        assert!(ptb_types::get_discovered_value_for_testing(&decoded, &key1) == 
            x"31358d198147da50db32eda2562951d53973a0c0ad5ed738e9b17d88b213d790", 12);
        
        let key5 = string::utf8(b"coin_type");
        assert!(ptb_types::has_discovered_key_for_testing(&decoded, &key5), 13);
        let retrieved_coin_type = ptb_types::get_discovered_value_for_testing(&decoded, &key5);
        assert!(string::utf8(retrieved_coin_type) == coin_type, 14);
    }
    
    #[test]
    fun test_discovered_data_empty_handling() {
        let data = ptb_types::create_discovered_data();
        let encoded = ptb_types::encode_discovered_data(&data);
        
        assert!(vector::length(&encoded) == 1, 20);
        assert!(*vector::borrow(&encoded, 0) == 0, 21);
        
        let decoded = ptb_types::discovered_data_from_bytes(encoded);
        assert!(ptb_types::discovered_data_length(&decoded) == 0, 22);
        
        let empty_bytes = vector::empty<u8>();
        let decoded_empty = ptb_types::discovered_data_from_bytes(empty_bytes);
        assert!(ptb_types::discovered_data_length(&decoded_empty) == 0, 23);
    }
    
    #[test]
    fun test_discovered_data_get_keys() {
        let mut data = ptb_types::create_discovered_data();
        
        ptb_types::add_discovered_entry(&mut data, string::utf8(b"key1"), b"value1");
        ptb_types::add_discovered_entry(&mut data, string::utf8(b"key2"), b"value2");
        ptb_types::add_discovered_entry(&mut data, string::utf8(b"key3"), b"value3");
        
        let keys = ptb_types::get_discovered_keys(&data);
        assert!(vector::length(&keys) == 3, 30);
        
        assert!(*vector::borrow(&keys, 0) == string::utf8(b"key1"), 31);
        assert!(*vector::borrow(&keys, 1) == string::utf8(b"key2"), 32);
        assert!(*vector::borrow(&keys, 2) == string::utf8(b"key3"), 33);
    }
    
    #[test]
    fun test_discovered_data_overwrite() {
        let mut data = ptb_types::create_discovered_data();
        
        let key = string::utf8(b"repeated_key");
        ptb_types::add_discovered_entry(&mut data, key, b"value1");
        ptb_types::add_discovered_entry(&mut data, key, b"value2");
        ptb_types::add_discovered_entry(&mut data, key, b"value3");
        
        assert!(ptb_types::discovered_data_length(&data) == 3, 40);
        
        let value = ptb_types::get_discovered_value_for_testing(&data, &key);
        assert!(value == b"value1", 41);
    }
    
    #[test]
    fun test_large_values() {
        let mut data = ptb_types::create_discovered_data();
        
        let mut large_value = vector::empty<u8>();
        let mut i = 0;
        while (i < 500) {
            vector::push_back(&mut large_value, ((i % 256) as u8));
            i = i + 1;
        };
        
        ptb_types::add_discovered_entry(&mut data, string::utf8(b"vaa_data"), large_value);
        
        let encoded = ptb_types::encode_discovered_data(&data);
        let decoded = ptb_types::discovered_data_from_bytes(encoded);
        
        let retrieved = ptb_types::get_discovered_value_for_testing(&decoded, &string::utf8(b"vaa_data"));
        assert!(vector::length(&retrieved) == 500, 60);
        
        assert!(*vector::borrow(&retrieved, 0) == 0, 61);
        assert!(*vector::borrow(&retrieved, 1) == 1, 62);
        assert!(*vector::borrow(&retrieved, 255) == 255, 63);
    }
    
    #[test]
    fun test_special_characters_in_keys() {
        // Test keys with special characters
        let mut data = ptb_types::create_discovered_data();
        
        ptb_types::add_discovered_entry(&mut data, string::utf8(b"key::with::colons"), b"value1");
        ptb_types::add_discovered_entry(&mut data, string::utf8(b"key_with_underscores"), b"value2");
        ptb_types::add_discovered_entry(&mut data, string::utf8(b"key-with-dashes"), b"value3");
        ptb_types::add_discovered_entry(&mut data, string::utf8(b"0x1234::module::Type"), b"value4");
        
        // Encode and decode
        let encoded = ptb_types::encode_discovered_data(&data);
        let decoded = ptb_types::discovered_data_from_bytes(encoded);
        
        // Verify all keys work
        assert!(ptb_types::has_discovered_key_for_testing(&decoded, &string::utf8(b"key::with::colons")), 70);
        assert!(ptb_types::has_discovered_key_for_testing(&decoded, &string::utf8(b"key_with_underscores")), 71);
        assert!(ptb_types::has_discovered_key_for_testing(&decoded, &string::utf8(b"key-with-dashes")), 72);
        assert!(ptb_types::has_discovered_key_for_testing(&decoded, &string::utf8(b"0x1234::module::Type")), 73);
    }
}
