#[test_only]
module sui_ptb_resolver::builder_types_tests {
    use sui_ptb_resolver::ptb_types::{Self};

    #[test]
    fun test_create_ptb_builder() {
        // builder with empty collections
        let _builder = ptb_types::create_ptb_builder_for_testing();
    }

    #[test]
    fun test_create_command_result() {
        let result = ptb_types::create_command_result(5, 1);
        let arg = ptb_types::command_result_to_argument(&result);
        assert!(ptb_types::is_result_arg(&arg), 0);
        assert!(ptb_types::get_arg_index(&arg) == 5, 1);
    }

    #[test]
    fun test_create_nested_command_result() {
        let nested_result = ptb_types::create_nested_command_result(3, 2);
        let arg = ptb_types::nested_result_to_argument(&nested_result);
        assert!(ptb_types::is_nested_result_arg(&arg), 0);
        assert!(ptb_types::get_arg_index(&arg) == 3, 1);
        assert!(ptb_types::get_arg_nested_index(&arg) == 2, 2);
    }

    #[test]
    fun test_handle_to_argument_conversions() {
        let cmd_result = ptb_types::create_command_result(0, 1);
        let cmd_arg = ptb_types::command_result_to_argument(&cmd_result);
        assert!(ptb_types::is_result_arg(&cmd_arg), 0);
        
        let nested_result = ptb_types::create_nested_command_result(1, 0);
        let nested_arg = ptb_types::nested_result_to_argument(&nested_result);
        assert!(ptb_types::is_nested_result_arg(&nested_arg), 1);
        
        let mut builder = ptb_types::create_ptb_builder_for_testing();
        let input_handle = ptb_types::add_pure_input(&mut builder, b"test");
        let input_arg = ptb_types::input_handle_to_argument(&input_handle);
        assert!(ptb_types::is_input_arg(&input_arg), 2);
    }
}
