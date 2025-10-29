#[test_only]
module sui_ptb_resolver::builder_pattern_tests {
    use sui_ptb_resolver::ptb_types::{Self};
    use std::string::{Self};
    use sui::bcs;

    #[test]
    fun test_add_inputs_to_builder() {
        let mut builder = ptb_types::create_ptb_builder_for_testing();
        
        let data1 = b"test_data";
        let input1 = ptb_types::add_pure_input(&mut builder, data1);
        
        let object_ref = ptb_types::create_object_ref(
            @0x123,
            100,
            b"digest"
        );
        let input2 = ptb_types::add_object_input(&mut builder, object_ref);
        
        let shared_ref = ptb_types::create_shared_object_ref(
            @0x456,
            50,
            true
        );
        let input3 = ptb_types::add_shared_object_input(&mut builder, shared_ref);
        

        let inputs = ptb_types::get_builder_inputs(&builder);
        assert!(vector::length(inputs) == 3, 0);
        
        let arg1 = ptb_types::input_handle_to_argument(&input1);
        assert!(ptb_types::is_input_arg(&arg1), 1);
        assert!(ptb_types::get_arg_index(&arg1) == 0, 2);
        let arg2 = ptb_types::input_handle_to_argument(&input2);
        assert!(ptb_types::get_arg_index(&arg2) == 1, 3);
        let arg3 = ptb_types::input_handle_to_argument(&input3);
        assert!(ptb_types::get_arg_index(&arg3) == 2, 4);
    }

    #[test]
    fun test_add_commands_to_builder() {
        let mut builder = ptb_types::create_ptb_builder_for_testing();
        let input1 = ptb_types::add_pure_input(&mut builder, b"data");
        let input2 = ptb_types::add_object_input(
            &mut builder,
            ptb_types::create_object_ref(@0x1, 0, vector::empty())
        );
        
        let result1 = ptb_types::add_move_call(
            &mut builder,
            @0x2,
            string::utf8(b"module1"),
            string::utf8(b"function1"),
            vector::empty(),
            vector[
                ptb_types::input_handle_to_argument(&input1),
                ptb_types::input_handle_to_argument(&input2)
            ]
        );
        
        let result2 = ptb_types::add_move_call(
            &mut builder,
            @0x2,
            string::utf8(b"module2"),
            string::utf8(b"function2"),
            vector::empty(),
            vector[
                ptb_types::command_result_to_argument(&result1)
            ]
        );
        
        let commands = ptb_types::get_builder_commands(&builder);
        assert!(vector::length(commands) == 2, 0);
        
        assert!(ptb_types::get_current_command_index(&builder) == 2, 1);
        
        let arg = ptb_types::command_result_to_argument(&result2);
        assert!(ptb_types::is_result_arg(&arg), 2);
        assert!(ptb_types::get_arg_index(&arg) == 1, 3); 
    }

    #[test]
    fun test_command_chaining() {
        let mut builder = ptb_types::create_ptb_builder_for_testing();
        
        let vaa_input = ptb_types::add_pure_input(&mut builder, b"vaa_bytes");
        
        let parse_result = ptb_types::add_move_call(
            &mut builder,
            @0x1,
            string::utf8(b"vaa"),
            string::utf8(b"parse"),
            vector::empty(),
            vector[ptb_types::input_handle_to_argument(&vaa_input)]
        );
        
        let verify_result = ptb_types::add_move_call(
            &mut builder,
            @0x1,
            string::utf8(b"vaa"),
            string::utf8(b"verify"),
            vector::empty(),
            vector[ptb_types::command_result_to_argument(&parse_result)]
        );
        
        let _process_result = ptb_types::add_move_call(
            &mut builder,
            @0x2,
            string::utf8(b"bridge"),
            string::utf8(b"process"),
            vector::empty(),
            vector[ptb_types::command_result_to_argument(&verify_result)]
        );
        
        assert!(ptb_types::get_current_command_index(&builder) == 3, 0);
        let commands = ptb_types::get_builder_commands(&builder);
        assert!(vector::length(commands) == 3, 1);
    }

    #[test]
    fun test_multi_result_command() {
        let mut builder = ptb_types::create_ptb_builder_for_testing();
        
        let multi_result = ptb_types::add_move_call_multi(
            &mut builder,
            @0x1,
            string::utf8(b"module"),
            string::utf8(b"function_with_two_returns"),
            vector::empty(),
            vector::empty(),
            2 
        );
        
        let nested_result_0 = ptb_types::get_nested_result(&multi_result, 0);
        let nested_result_1 = ptb_types::get_nested_result(&multi_result, 1);
        
        let _cmd1 = ptb_types::add_move_call(
            &mut builder,
            @0x2,
            string::utf8(b"module"),
            string::utf8(b"use_first"),
            vector::empty(),
            vector[ptb_types::nested_result_to_argument(&nested_result_0)]
        );
        
        let _cmd2 = ptb_types::add_move_call(
            &mut builder,
            @0x2,
            string::utf8(b"module"),
            string::utf8(b"use_second"),
            vector::empty(),
            vector[ptb_types::nested_result_to_argument(&nested_result_1)]
        );
        
        assert!(vector::length(ptb_types::get_builder_commands(&builder)) == 3, 0);
    }

    #[test]
    fun test_required_objects_and_types() {
        let mut builder = ptb_types::create_ptb_builder_for_testing();
        
        ptb_types::add_required_object(&mut builder, @0x123);
        ptb_types::add_required_object(&mut builder, @0x456);
        ptb_types::add_required_object(&mut builder, @0x123); 
        
        let coin_type = string::utf8(b"0x2::sui::SUI");
        let token_type = string::utf8(b"0x1::token::TOKEN");
        ptb_types::add_required_type(&mut builder, coin_type);
        ptb_types::add_required_type(&mut builder, token_type);
        ptb_types::add_required_type(&mut builder, coin_type); 
        
        let objects = ptb_types::get_builder_required_objects(&builder);
        assert!(vector::length(objects) == 2, 0);
        
        let types = ptb_types::get_builder_required_types(&builder);
        assert!(vector::length(types) == 2, 1);
    }

    #[test]
    fun test_finalize_builder() {
        let mut builder = ptb_types::create_ptb_builder_for_testing();
        
        let input = ptb_types::add_pure_input(&mut builder, b"data");
        let _result = ptb_types::add_move_call(
            &mut builder,
            @0x1,
            string::utf8(b"module"),
            string::utf8(b"function"),
            vector::empty(),
            vector[ptb_types::input_handle_to_argument(&input)]
        );
        
        ptb_types::add_required_object(&mut builder, @0x1);
        ptb_types::add_required_type(&mut builder, string::utf8(b"0x2::sui::SUI"));
        
        let instruction_groups = ptb_types::finalize_builder(&builder);
        let groups = ptb_types::get_groups(&instruction_groups);
        assert!(vector::length(&groups) == 1, 0);
        
        let group = vector::borrow(&groups, 0);
        let objects = ptb_types::get_group_required_objects(group);
        assert!(vector::length(&objects) == 1, 1);
        assert!(*vector::borrow(&objects, 0) == @0x1, 2);
        
        let types = ptb_types::get_group_required_types(group);
        assert!(vector::length(&types) == 1, 3);
    }

    #[test]
    fun test_builder_with_type_arguments() {
        let mut builder = ptb_types::create_ptb_builder_for_testing();
        
        let sui_type = ptb_types::create_type_tag(bcs::to_bytes(&string::utf8(b"0x2::sui::SUI")));
        let type_args = vector[sui_type];
        
        let _result = ptb_types::add_move_call(
            &mut builder,
            @0x2,
            string::utf8(b"coin"),
            string::utf8(b"mint"),
            type_args,
            vector[ptb_types::create_gas_coin_arg()]
        );
        
        ptb_types::add_required_type(&mut builder, string::utf8(b"0x2::sui::SUI"));
        
        let commands = ptb_types::get_builder_commands(&builder);
        assert!(vector::length(commands) == 1, 0);
    }

    #[test] 
    fun test_complex_ptb_building() {
        let mut builder = ptb_types::create_ptb_builder_for_testing();
        
        let core_bridge = ptb_types::add_object_input(
            &mut builder,
            ptb_types::create_object_ref(@0xaeab, 0, vector::empty())
        );
        let vaa_bytes = ptb_types::add_pure_input(&mut builder, b"vaa");
        let clock = ptb_types::add_object_input(
            &mut builder,
            ptb_types::create_object_ref(@0x6, 0, vector::empty())
        );
        let token_bridge = ptb_types::add_object_input(
            &mut builder,
            ptb_types::create_object_ref(@0xc575, 0, vector::empty())
        );
        
        let vaa_result = ptb_types::add_move_call(
            &mut builder,
            @0x1,
            string::utf8(b"vaa"),
            string::utf8(b"parse_and_verify"),
            vector::empty(),
            vector[
                ptb_types::input_handle_to_argument(&core_bridge),
                ptb_types::input_handle_to_argument(&vaa_bytes),
                ptb_types::input_handle_to_argument(&clock)
            ]
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
        
        let coin_type = ptb_types::create_type_tag(
            bcs::to_bytes(&string::utf8(b"0x2::sui::SUI"))
        );
        let _auth_result = ptb_types::add_move_call(
            &mut builder,
            @0x2,
            string::utf8(b"complete_transfer"),
            string::utf8(b"authorize_transfer"),
            vector[coin_type],
            vector[
                ptb_types::input_handle_to_argument(&token_bridge),
                ptb_types::command_result_to_argument(&receipt)
            ]
        );
        
        ptb_types::add_required_object(&mut builder, @0xaeab);
        ptb_types::add_required_object(&mut builder, @0xc575);
        ptb_types::add_required_type(&mut builder, string::utf8(b"0x2::sui::SUI"));
        
        let instruction_groups = ptb_types::finalize_builder(&builder);
        
        let groups = ptb_types::get_groups(&instruction_groups);
        assert!(vector::length(&groups) == 1, 0);
        
        let group = vector::borrow(&groups, 0);
        let instructions = ptb_types::get_group_instructions(group);
        let inputs = ptb_types::get_instruction_inputs(&instructions);
        let commands = ptb_types::get_instruction_commands(&instructions);
        
        assert!(vector::length(&inputs) == 4, 1);
        assert!(vector::length(&commands) == 3, 2);
    }
}
