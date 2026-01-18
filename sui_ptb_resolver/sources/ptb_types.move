module sui_ptb_resolver::ptb_types {
    use std::string::{Self, String};
    use sui::bcs;
    use sui::event;

    // PTB types for commands, type of commands, Instructions, Arguments and returns of Lookup (object ref, shared object, ...)
    public enum Argument has store, drop, copy {
        GasCoin,
        Input { index: u64 },
        Result { index: u64 },
        NestedResult { index: u64, nested_index: u64 }
    }
    public enum Input has store, drop, copy {
        Pure { data: vector<u8>, type_name: String },
        ObjectImmutableOrOwned { object_ref: ObjectRef },
        ObjectShared { shared_ref: SharedObjectRef },
        ObjectReceiving { object_ref: ObjectRef }
    }

    public struct ObjectRef has store, drop, copy {
        object_id: address,
        version: u64,
        digest: vector<u8>,
    }

    public struct SharedObjectRef has store, drop, copy {
        object_id: address,
        initial_shared_version: u64,
        mutable: bool,
    }

    public struct TypeTag has store, drop, copy {
        type_tag: vector<u8>, 
    }

    public enum Command has store, drop, copy {
        MoveCall {
            package: address,
            module_name: String,
            function_name: String,
            type_arguments: vector<TypeTag>,
            arguments: vector<Argument>
        },
        TransferObjects {
            objects: vector<Argument>,
            recipient: Argument
        },
        SplitCoins {
            coin: Argument,
            amounts: vector<Argument>
        },
        MergeCoins {
            destination: Argument,
            sources: vector<Argument>
        },
        MakeMoveVec {
            type_tag: Option<TypeTag>,
            elements: vector<Argument>
        }
    }

    public struct PTBInstruction has store, drop, copy {
        inputs: vector<Input>,
        commands: vector<Command>,
    }

    public struct InstructionGroup has store, drop, copy {
        instructions: PTBInstruction,
        required_objects: vector<address>,
        required_types: vector<String>,
    }

    public struct InstructionGroups has store, drop, copy {
        groups: vector<InstructionGroup>,
    }

    // Generic struct field for structured table keys
    public struct StructField has store, drop, copy {
        name: vector<u8>,
        value: vector<u8>,
    }

    public enum OffchainLookup has store, drop, copy {
        DynamicField {
            parent_object: address,
            key: vector<u8>,
            placeholder_name: String
        },
        DynamicFieldByType {
            parent_object: address,
            type_suffix: String,
            extract_field: String,
            placeholder_name: String
        },
        DynamicObjectField {
            parent_object: address,
            key: vector<u8>,
            placeholder_name: String
        },
        TableItem {
            parent_object: address,
            table_path: String,
            key_raw: Option<vector<u8>>,
            key_structured: Option<vector<StructField>>,
            key_type: String,  // Move type string for the key (e.g., "0x123::module::KeyStruct")
            placeholder_name: String
        },
        ObjectField {
            parent_object: address,
            field_path: String,
            placeholder_name: String
        }
    }

    public struct CommandResult has copy, drop, store {
        command_index: u64,
        result_count: u64,  // Number of results this command produces
    }
    
    public struct NestedCommandResult has copy, drop, store {
        command_index: u64,
        nested_index: u64,
    }
    

    // Resolver results
    public enum ResolverResult has store, drop, copy {
        Resolved { 
            instruction_groups: InstructionGroups 
        },
        NeedsOffchainData { 
            lookups: vector<OffchainLookup> 
        },
        Error { 
            message: String 
        }
    }

    

    // handler for tracking lookup requests with type information
    public struct LookupHandle has copy, drop, store {
        lookup_index: u64,
        expected_value_type: LookupValueType,
    }
    
    public enum LookupValueType has copy, drop, store {
        Address,      // packageId or object addresses
        CoinType,     // example: "0x2::sui::SUI"
        ObjectRef,    // Object reference data
        Raw,          // Raw bytes
    }
    
    // Builder context for constructing PTBs incrementally
    public struct PTBBuilder has store, drop {
        inputs: vector<Input>,
        commands: vector<Command>,
        current_command_index: u64,
        lookups: vector<OffchainLookup>,
        pending_lookups: vector<LookupHandle>,
        // Track required objects and types as we build
        required_objects: vector<address>,
        required_types: vector<String>,
        // Store discovered data internally
        discovered_data: DiscoveredData,
    }
    
    public struct InputHandle has copy, drop, store {
        input_index: u64,
    }
    
    const E_INVALID_COMMAND_INDEX: u64 = 1004;
    
    // public functions to create enum values for use outside module
    public fun lookup_value_type_address(): LookupValueType {
        LookupValueType::Address
    }
    
    public fun lookup_value_type_coin_type(): LookupValueType {
        LookupValueType::CoinType
    }
    
    public fun lookup_value_type_object_ref(): LookupValueType {
        LookupValueType::ObjectRef
    }
    
    public fun lookup_value_type_raw(): LookupValueType {
        LookupValueType::Raw
    }
    


    fun create_input_arg(index: u64): Argument {
        Argument::Input { index }
    }

    fun create_result_arg(index: u64): Argument {
        Argument::Result { index }
    }




    fun create_pure_input<T: drop>(value: T): Input {
        use std::type_name;
        use std::ascii;

        let type_name_obj = type_name::get<T>();
        let ascii_str = type_name::into_string(type_name_obj);
        let type_str = string::from_ascii(ascii_str);

        Input::Pure {
            data: bcs::to_bytes(&value),
            type_name: type_str
        }
    }

    fun create_object_input(object_ref: ObjectRef): Input {
        Input::ObjectImmutableOrOwned { object_ref }
    }

    public fun create_shared_object_input(shared_ref: SharedObjectRef): Input {
        Input::ObjectShared { shared_ref }
    }

    fun create_receiving_object_input(object_ref: ObjectRef): Input {
        Input::ObjectReceiving { object_ref }
    }

    fun create_move_call_command(
        package: address,
        module_name: String,
        function_name: String,
        type_arguments: vector<TypeTag>,
        arguments: vector<Argument>
    ): Command {
        Command::MoveCall {
            package,
            module_name,
            function_name,
            type_arguments,
            arguments
        }
    }

    fun create_transfer_objects_command(
        objects: vector<Argument>,
        recipient: Argument
    ): Command {
        Command::TransferObjects {
            objects,
            recipient
        }
    }

    fun create_split_coins_command(
        coin: Argument,
        amounts: vector<Argument>
    ): Command {
        Command::SplitCoins {
            coin,
            amounts
        }
    }

    fun create_merge_coins_command(
        destination: Argument,
        sources: vector<Argument>
    ): Command {
        Command::MergeCoins {
            destination,
            sources
        }
    }

    fun create_make_move_vec_command(
        type_tag: Option<TypeTag>,
        elements: vector<Argument>
    ): Command {
        Command::MakeMoveVec {
            type_tag,
            elements
        }
    }

    public fun create_dynamic_field_lookup(
        parent_object: address,
        key: vector<u8>,
        placeholder_name: String
    ): OffchainLookup {
        OffchainLookup::DynamicField {
            parent_object,
            key,
            placeholder_name
        }
    }

    fun create_table_lookup(
        parent_object: address,
        table_path: String,
        key: vector<u8>,
        placeholder_name: String
    ): OffchainLookup {
        OffchainLookup::TableItem {
            parent_object,
            table_path,
            key_raw: option::some(key),
            key_structured: option::none(),
            key_type: string::utf8(b"vector<u8>"),  // Legacy uses raw bytes
            placeholder_name
        }
    }

    public fun create_object_metadata_lookup(
        parent_object: address,
        field_path: String,
        placeholder_name: String
    ): OffchainLookup {
        OffchainLookup::ObjectField {
            parent_object,
            field_path,
            placeholder_name
        }
    }

    fun create_dynamic_field_by_type_lookup(
        parent_object: address,
        type_suffix: String,  
        extract_field: String, 
        placeholder_name: String
    ): OffchainLookup {
        OffchainLookup::DynamicFieldByType {
            parent_object,
            type_suffix,
            extract_field,
            placeholder_name
        }
    }

    public fun create_object_ref(
        object_id: address,
        version: u64,
        digest: vector<u8>
    ): ObjectRef {
        ObjectRef {
            object_id,
            version,
            digest,
        }
    }

    // No longer needed - data is embedded in Command enum

    public fun create_type_tag(type_tag: vector<u8>): TypeTag {
        TypeTag { type_tag }
    }

    fun create_ptb_instruction(
        inputs: vector<Input>,
        commands: vector<Command>
    ): PTBInstruction {
        PTBInstruction {
            inputs,
            commands,
        }
    }

    public fun create_instruction_group(
        instructions: PTBInstruction,
        required_objects: vector<address>,
        required_types: vector<String>
    ): InstructionGroup {
        InstructionGroup {
            instructions,
            required_objects,
            required_types,
        }
    }

    public fun create_instruction_groups(
        groups: vector<InstructionGroup>
    ): InstructionGroups {
        InstructionGroups { groups }
    }

    public fun create_resolved_result(groups: InstructionGroups): ResolverResult {
        ResolverResult::Resolved {
            instruction_groups: groups
        }
    }

    public fun create_needs_offchain_result(
        lookups: vector<OffchainLookup>
    ): ResolverResult {
        ResolverResult::NeedsOffchainData {
            lookups
        }
    }


    // PTB Builder constuction functions

    // Create a struct field for structured table keys
    public fun create_struct_field(name: vector<u8>, value: vector<u8>): StructField {
        StructField { name, value }
    }

    // init new ptb builder with discovered data
    public fun create_ptb_builder(discovered_data_bytes: vector<u8>): PTBBuilder {
        let discovered_data = if (vector::is_empty(&discovered_data_bytes)) {
            create_discovered_data()
        } else {
            discovered_data_from_bytes(discovered_data_bytes)
        };

        PTBBuilder {
            inputs: vector::empty(),
            commands: vector::empty(),
            current_command_index: 0,
            lookups: vector::empty(),
            pending_lookups: vector::empty(),
            required_objects: vector::empty(),
            required_types: vector::empty(),
            discovered_data,
        }
    }
    
    public fun create_command_result(index: u64, result_count: u64): CommandResult {
        CommandResult {
            command_index: index,
            result_count,
        }
    }
    
    fun create_input_handle(index: u64): InputHandle {
        InputHandle {
            input_index: index,
        }
    }
    
    fun create_lookup_handle(
        index: u64, 
        expected_type: LookupValueType
    ): LookupHandle {
        LookupHandle {
            lookup_index: index,
            expected_value_type: expected_type,
        }
    }
    
    public fun command_result_to_argument(result: &CommandResult): Argument {
        create_result_arg(result.command_index)
    }

    
    
    public fun input_handle_to_argument(handle: &InputHandle): Argument {
        create_input_arg(handle.input_index)
    }

    public fun add_pure_input_raw_bytes(builder: &mut PTBBuilder, raw_bytes: vector<u8>): InputHandle {
        let index = vector::length(&builder.inputs);
        let input = Input::Pure {
            data: raw_bytes,  // Use raw bytes directly, no BCS encoding
            type_name: string::utf8(b"vector<u8>")
        };
        vector::push_back(&mut builder.inputs, input);
        create_input_handle(index)
    }

    // Add input to builder and return handle
    public fun add_pure_input<T: drop>(builder: &mut PTBBuilder, value: T): InputHandle {
        let index = vector::length(&builder.inputs);
        vector::push_back(&mut builder.inputs, create_pure_input(value));
        create_input_handle(index)
    }
    
    public fun add_object_input(builder: &mut PTBBuilder, object_ref: ObjectRef): InputHandle {
        let index = vector::length(&builder.inputs);
        vector::push_back(&mut builder.inputs, create_object_input(object_ref));
        create_input_handle(index)
    }
    
    public fun add_receiving_object_input(builder: &mut PTBBuilder, object_ref: ObjectRef): InputHandle {
        let index = vector::length(&builder.inputs);
        vector::push_back(&mut builder.inputs, create_receiving_object_input(object_ref));
        create_input_handle(index)
    }
    
    // add command and return result handler
    public fun add_move_call(
        builder: &mut PTBBuilder,
        package: address,
        module_name: String,
        function_name: String,
        type_arguments: vector<TypeTag>,
        arguments: vector<Argument>
    ): CommandResult {
        let index = builder.current_command_index;
        vector::push_back(&mut builder.commands, create_move_call_command(
            package,
            module_name,
            function_name,
            type_arguments,
            arguments
        ));
        builder.current_command_index = index + 1;
        
        create_command_result(index, 1) // assuming most move_call retuns only 1, add_move_call_multi to solve this
    }

    public fun add_move_call_multi(
        builder: &mut PTBBuilder,
        package: address,
        module_name: String,
        function_name: String,
        type_arguments: vector<TypeTag>,
        arguments: vector<Argument>,
        result_count: u64
    ): CommandResult {
        let index = builder.current_command_index;
        vector::push_back(&mut builder.commands, create_move_call_command(
            package,
            module_name,
            function_name,
            type_arguments,
            arguments
        ));
        builder.current_command_index = index + 1;
        
        create_command_result(index, result_count)
    }
    
    public fun add_transfer_objects(
        builder: &mut PTBBuilder,
        objects: vector<Argument>,
        recipient: Argument
    ): CommandResult {
        let index = builder.current_command_index;
        vector::push_back(&mut builder.commands, create_transfer_objects_command(objects, recipient));
        builder.current_command_index = index + 1;
        
        // TransferObjects returns nothing
        create_command_result(index, 0)
    }
    
    public fun add_split_coins(
        builder: &mut PTBBuilder,
        coin: Argument,
        amounts: vector<Argument>
    ): CommandResult {
        let index = builder.current_command_index;
        let amount_count = vector::length(&amounts);
        vector::push_back(&mut builder.commands, create_split_coins_command(coin, amounts));
        builder.current_command_index = index + 1;
        
        // SplitCoins returns the same number of coins as amounts
        create_command_result(index, amount_count)
    }
    
    public fun add_merge_coins(
        builder: &mut PTBBuilder,
        destination: Argument,
        sources: vector<Argument>
    ): CommandResult {
        let index = builder.current_command_index;
        vector::push_back(&mut builder.commands, create_merge_coins_command(destination, sources));
        builder.current_command_index = index + 1;
        
        create_command_result(index, 0)
    }
    
    public fun add_make_move_vec(
        builder: &mut PTBBuilder,
        type_tag: Option<TypeTag>,
        elements: vector<Argument>
    ): CommandResult {
        let index = builder.current_command_index;
        vector::push_back(&mut builder.commands, create_make_move_vec_command(type_tag, elements));
        builder.current_command_index = index + 1;
        
        // MakeMoveVec returns a single vector
        create_command_result(index, 1)
    }
    
    // track required objects
    public fun add_required_object(builder: &mut PTBBuilder, object: address) {
        if (!vector::contains(&builder.required_objects, &object)) {
            vector::push_back(&mut builder.required_objects, object);
        }
    }
    
    // track required types
    public fun add_required_type(builder: &mut PTBBuilder, type_str: String) {
        if (!vector::contains(&builder.required_types, &type_str)) {
            vector::push_back(&mut builder.required_types, type_str);
        }
    }
    
    
    public fun finalize_builder(builder: &PTBBuilder): InstructionGroups {
        let instruction = create_ptb_instruction(
            builder.inputs,
            builder.commands
        );
        
        let group = create_instruction_group(
            instruction,
            builder.required_objects,
            builder.required_types
        );
        
        create_instruction_groups(vector[group])
    }

    public fun has_pending_lookups(builder: &PTBBuilder): bool {
        !vector::is_empty(&builder.pending_lookups)
    }

    // Lookup Request functions
    
    public fun request_package_lookup(
        builder: &mut PTBBuilder,
        state_object: address,
        type_suffix: String,
        field_name: String,
        semantic_key: String
    ): Option<address> {
        // Check if already discovered
        if (has_discovered_key(&builder.discovered_data, &semantic_key)) {
            let value_bytes = get_discovered_value(&builder.discovered_data, &semantic_key);
            return option::some(sui::address::from_bytes(value_bytes))
        };

        // Not discovered, record lookup request
        let index = vector::length(&builder.lookups);

        let lookup = create_dynamic_field_by_type_lookup(
            state_object,
            type_suffix,
            field_name,
            semantic_key
        );

        vector::push_back(&mut builder.lookups, lookup);

        let handle = create_lookup_handle(
            index,
            LookupValueType::Address
        );

        vector::push_back(&mut builder.pending_lookups, handle);
        option::none()
    }
    
    // Generic table item lookup with optional structured or raw key
    public fun request_table_item_lookup(
        builder: &mut PTBBuilder,
        parent_object: address,
        table_path: String,
        key_raw: Option<vector<u8>>,
        key_structured: Option<vector<StructField>>,
        key_type: String,  // Move type string for the key
        placeholder_name: String
    ): Option<vector<u8>> {
        // Check if already discovered
        if (has_discovered_key(&builder.discovered_data, &placeholder_name)) {
            let value_bytes = get_discovered_value(&builder.discovered_data, &placeholder_name);
            return option::some(value_bytes)
        };

        // Not discovered, record lookup request
        let index = vector::length(&builder.lookups);

        let lookup = OffchainLookup::TableItem {
            parent_object,
            table_path,
            key_raw,
            key_structured,
            key_type,
            placeholder_name
        };

        vector::push_back(&mut builder.lookups, lookup);

        let handle = create_lookup_handle(index, LookupValueType::CoinType);
        vector::push_back(&mut builder.pending_lookups, handle);
        option::none()
    }

    // Legacy function for backward compatibility
    public fun request_coin_type_lookup(
        builder: &mut PTBBuilder,
        state_object: address,
        table_path: String,
        lookup_key: vector<u8>,
        semantic_key: String
    ): Option<vector<u8>> {
        // Check if already discovered
        if (has_discovered_key(&builder.discovered_data, &semantic_key)) {
            let value_bytes = get_discovered_value(&builder.discovered_data, &semantic_key);
            return option::some(value_bytes)
        };

        // Not discovered, record lookup request
        let index = vector::length(&builder.lookups);

        let lookup = create_table_lookup(
            state_object,
            table_path,
            lookup_key,
            semantic_key
        );

        vector::push_back(&mut builder.lookups, lookup);

        let handle = create_lookup_handle(
            index,
            LookupValueType::CoinType
        );

        vector::push_back(&mut builder.pending_lookups, handle);
        option::none()
    }
    
    public fun request_dynamic_field_lookup(
        builder: &mut PTBBuilder,
        parent_object: address,
        key: vector<u8>,
        expected_type: LookupValueType,
        semantic_key: String
    ): Option<vector<u8>> {
        // Check if already discovered
        if (has_discovered_key(&builder.discovered_data, &semantic_key)) {
            let value_bytes = get_discovered_value(&builder.discovered_data, &semantic_key);
            return option::some(value_bytes)
        };

        // Not discovered, record lookup request
        let index = vector::length(&builder.lookups);

        let lookup = create_dynamic_field_lookup(
            parent_object,
            key,
            semantic_key
        );

        vector::push_back(&mut builder.lookups, lookup);

        let handle = create_lookup_handle(
            index,
            expected_type
        );

        vector::push_back(&mut builder.pending_lookups, handle);
        option::none()
    }
    
    public fun request_object_field_lookup(
        builder: &mut PTBBuilder,
        parent_object: address,
        field_path: String,
        expected_type: LookupValueType,
        semantic_key: String
    ): Option<vector<u8>> {
        // Check if already discovered
        if (has_discovered_key(&builder.discovered_data, &semantic_key)) {
            let value_bytes = get_discovered_value(&builder.discovered_data, &semantic_key);
            return option::some(value_bytes)
        };

        // Not discovered, record lookup request
        let index = vector::length(&builder.lookups);

        let lookup = create_object_metadata_lookup(
            parent_object,
            field_path,
            semantic_key
        );

        vector::push_back(&mut builder.lookups, lookup);

        let handle = create_lookup_handle(
            index,
            expected_type
        );

        vector::push_back(&mut builder.pending_lookups, handle);
        option::none()
    }
    
    public fun request_dynamic_object_field_lookup(
        builder: &mut PTBBuilder,
        parent_object: address,
        key: vector<u8>,
        expected_type: LookupValueType,
        semantic_key: String
    ): Option<vector<u8>> {
        // Check if already discovered
        if (has_discovered_key(&builder.discovered_data, &semantic_key)) {
            let value_bytes = get_discovered_value(&builder.discovered_data, &semantic_key);
            return option::some(value_bytes)
        };

        // Not discovered, record lookup request
        let index = vector::length(&builder.lookups);

        let lookup = OffchainLookup::DynamicObjectField {
            parent_object,
            key,
            placeholder_name: semantic_key
        };

        vector::push_back(&mut builder.lookups, lookup);

        let handle = create_lookup_handle(
            index,
            expected_type
        );

        vector::push_back(&mut builder.pending_lookups, handle);
        option::none()
    }
    
    public fun clear_pending_lookups(builder: &mut PTBBuilder) {
        builder.pending_lookups = vector::empty();
    }
    
    public fun get_lookups_for_resolution(builder: &PTBBuilder): vector<OffchainLookup> {
        builder.lookups
    }
    

    // Events (used on each iteration)

    // event emitted when resolver needs offchain data
    public struct ResolverNeedsDataEvent has copy, drop {
        parent_object: address,
        lookup_key: vector<u8>,
        key_type: String,  // Move type string for structured keys (empty for non-table lookups)
        placeholder_name: String,
    }
    
    // event emitted when resolver has final instructions
    public struct ResolverInstructionsEvent has copy, drop {
        inputs: vector<Input>,
        commands: vector<Command>,
        required_objects: vector<address>,
        required_types: vector<String>,
    }
    
    // wrapper event for holding above ones
    public struct ResolverOutputEvent has copy, drop {
        event_type: ResolverEventType,
        payload: vector<u8>, // bsc encoded data
    }

    public enum ResolverEventType has copy, drop {
        NeedsOffchainData,
        Resolved,
        Error
    }

    public fun create_needs_data_event(
        lookup: &OffchainLookup
    ): ResolverNeedsDataEvent {
        match (lookup) {
            OffchainLookup::DynamicField { parent_object, key, placeholder_name } => {
                ResolverNeedsDataEvent {
                    parent_object: *parent_object,
                    lookup_key: *key,
                    key_type: string::utf8(b""),  // Not a table lookup
                    placeholder_name: *placeholder_name,
                }
            },
            OffchainLookup::DynamicFieldByType { parent_object, type_suffix, extract_field, placeholder_name } => {
                let mut key = vector::empty<u8>();
                vector::append(&mut key, *string::as_bytes(type_suffix));
                vector::push_back(&mut key, 0xff);
                vector::append(&mut key, *string::as_bytes(extract_field));
                ResolverNeedsDataEvent {
                    parent_object: *parent_object,
                    lookup_key: key,
                    key_type: string::utf8(b""),  // Not a table lookup
                    placeholder_name: *placeholder_name,
                }
            },
            OffchainLookup::DynamicObjectField { parent_object, key, placeholder_name } => {
                ResolverNeedsDataEvent {
                    parent_object: *parent_object,
                    lookup_key: *key,
                    key_type: string::utf8(b""),  // Not a table lookup
                    placeholder_name: *placeholder_name,
                }
            },
            OffchainLookup::TableItem { parent_object, table_path, key_raw, key_structured, key_type, placeholder_name } => {
                let mut full_key = vector::empty<u8>();
                vector::append(&mut full_key, *string::as_bytes(table_path));
                vector::push_back(&mut full_key, 0xff);

                // Use raw key if available, otherwise encode structured key
                if (option::is_some(key_raw)) {
                    vector::append(&mut full_key, *option::borrow(key_raw));
                } else if (option::is_some(key_structured)) {
                    // Length-prefixed encoding for structured keys (safe for binary data):
                    // num_fields (1 byte) + [name_len (1 byte) + name + value_len (2 bytes big-endian) + value]*
                    let fields = option::borrow(key_structured);
                    let num_fields = vector::length(fields);
                    vector::push_back(&mut full_key, (num_fields as u8));

                    let mut i = 0;
                    while (i < num_fields) {
                        let field = vector::borrow(fields, i);

                        // Name length (1 byte) + name
                        let name_len = vector::length(&field.name);
                        vector::push_back(&mut full_key, (name_len as u8));
                        vector::append(&mut full_key, field.name);

                        // Value length (2 bytes big-endian) + value
                        let value_len = vector::length(&field.value);
                        vector::push_back(&mut full_key, ((value_len >> 8) as u8));
                        vector::push_back(&mut full_key, ((value_len & 0xff) as u8));
                        vector::append(&mut full_key, field.value);

                        i = i + 1;
                    };
                };

                ResolverNeedsDataEvent {
                    parent_object: *parent_object,
                    lookup_key: full_key,
                    key_type: *key_type,
                    placeholder_name: *placeholder_name,
                }
            },
            OffchainLookup::ObjectField { parent_object, field_path, placeholder_name } => {
                ResolverNeedsDataEvent {
                    parent_object: *parent_object,
                    lookup_key: *string::as_bytes(field_path),
                    key_type: string::utf8(b""),  // Not a table lookup
                    placeholder_name: *placeholder_name,
                }
            },
        }
    }
    
    public fun create_instructions_event(
        group: &InstructionGroup
    ): ResolverInstructionsEvent {
        ResolverInstructionsEvent {
            inputs: group.instructions.inputs,
            commands: group.instructions.commands,
            required_objects: group.required_objects,
            required_types: group.required_types,
        }
    }
    
    public fun create_generic_event(
        result: &ResolverResult
    ): ResolverOutputEvent {
        let event_type = match (result) {
            ResolverResult::Resolved { .. } => ResolverEventType::Resolved,
            ResolverResult::NeedsOffchainData { .. } => ResolverEventType::NeedsOffchainData,
            ResolverResult::Error { .. } => ResolverEventType::Error,
        };
        
        ResolverOutputEvent {
            event_type,
            payload: bcs::to_bytes(result),
        }
    }
    
    public fun get_resolver_lookups(result: &ResolverResult): vector<OffchainLookup> {
        match (result) {
            ResolverResult::NeedsOffchainData { lookups } => *lookups,
            _ => vector::empty(),
        }
    }
    
    public fun get_resolver_groups(result: &ResolverResult): InstructionGroups {
        match (result) {
            ResolverResult::Resolved { instruction_groups } => *instruction_groups,
            _ => InstructionGroups { groups: vector::empty() },
        }
    }
    
    // Emit the appropriate event based on the resolver result
    public fun emit_resolver_event(result: &ResolverResult) {
        match (result) {
            ResolverResult::Resolved { instruction_groups } => {
                let groups = &instruction_groups.groups;
                if (vector::length(groups) > 0) {
                    let group = vector::borrow(groups, 0);
                    event::emit(create_instructions_event(group));
                }
            },
            ResolverResult::NeedsOffchainData { lookups } => {
                if (vector::length(lookups) > 0) {
                    let lookup = vector::borrow(lookups, 0);
                    event::emit(create_needs_data_event(lookup));
                }
            },
            ResolverResult::Error { .. } => {
                event::emit(create_generic_event(result));
            },
        }
    }

    // --- Key/Value Disc & DiscoveredData
    
    public struct KeyValue has copy, drop, store {
        key: String,
        value: vector<u8>
    }
    
    public struct DiscoveredData has copy, drop, store {
        entries: vector<KeyValue>
    }
    
    // create an empty discovered data container
    public fun create_discovered_data(): DiscoveredData {
        DiscoveredData {
            entries: vector::empty<KeyValue>()
        }
    }
    
    // insert a key-value entry to discovered data
    // TODO: Prevent same key being added twice, returning error result (can we track on compile time?)
    public fun add_discovered_entry(
        data: &mut DiscoveredData,
        key: String,
        value: vector<u8>
    ) {
        let entry = KeyValue { key, value };
        vector::push_back(&mut data.entries, entry);
    }
    
    // fetch value by key
    fun get_discovered_value(
        data: &DiscoveredData,
        key: &String
    ): vector<u8> {
        let mut i = 0;
        let len = vector::length(&data.entries);
        while (i < len) {
            let entry = vector::borrow(&data.entries, i);
            if (entry.key == *key) {
                return entry.value
            };
            i = i + 1;
        };
        vector::empty<u8>()
    }

    // Internal helper - check if key exists
    fun has_discovered_key(
        data: &DiscoveredData,
        key: &String
    ): bool {
        let mut i = 0;
        let len = vector::length(&data.entries);
        while (i < len) {
            let entry = vector::borrow(&data.entries, i);
            if (entry.key == *key) {
                return true
            };
            i = i + 1;
        };
        false
    }

    #[test_only]
    public fun get_discovered_value_for_testing(
        data: &DiscoveredData,
        key: &String
    ): vector<u8> {
        get_discovered_value(data, key)
    }

    #[test_only]
    public fun has_discovered_key_for_testing(
        data: &DiscoveredData,
        key: &String
    ): bool {
        has_discovered_key(data, key)
    }

    #[test_only]
    public fun create_ptb_builder_for_testing(): PTBBuilder {
        create_ptb_builder(vector::empty())
    }
    

    // decode DiscoveredData from BCS-encoded bytes
    // It uses standard BCS format that can be decoded by any BCS library
    public fun discovered_data_from_bytes(bytes: vector<u8>): DiscoveredData {
        if (vector::is_empty(&bytes)) {
            return create_discovered_data()
        };
        
        // Parse BCS-encoded DiscoveredData as DiscoveredData { entries: vector<KeyValue> }
        // where KeyValue { key: String, value: vector<u8> }
        let mut bcs_reader = bcs::new(bytes);
        let mut data = create_discovered_data();
        
        let num_entries = bcs_reader.peel_vec_length();
        
        let mut i = 0;
        while (i < num_entries) {
            // key: String (encoded as vector<u8> in BCS)
            let key_bytes = bcs_reader.peel_vec_u8();
            let key = string::utf8(key_bytes);
            
            // value: vector<u8>
            let value = bcs_reader.peel_vec_u8();
            
            add_discovered_entry(&mut data, key, value);
            i = i + 1;
        };
        
        data
    }
    
    // encode DiscoveredData to BCS bytes
    public fun encode_discovered_data(data: &DiscoveredData): vector<u8> {
        bcs::to_bytes(data)
    }

    // Test only functions
    #[test_only]
    public fun create_gas_coin_arg(): Argument {
        Argument::GasCoin
    }

    #[test_only]
    public fun create_nested_result_arg(index: u64, nested_index: u64): Argument {
        Argument::NestedResult { index, nested_index }
    }

    #[test_only]
    public fun create_shared_object_ref(
        object_id: address,
        initial_shared_version: u64,
        mutable: bool
    ): SharedObjectRef {
        SharedObjectRef {
            object_id,
            initial_shared_version,
            mutable,
        }
    }

    #[test_only]
    public fun create_nested_command_result(command_index: u64, nested_index: u64): NestedCommandResult {
        NestedCommandResult {
            command_index,
            nested_index,
        }
    }
    
    #[test_only]
    public fun nested_result_to_argument(result: &NestedCommandResult): Argument {
        create_nested_result_arg(result.command_index, result.nested_index)
    }
    
    #[test_only]
    public fun add_shared_object_input(builder: &mut PTBBuilder, shared_ref: SharedObjectRef): InputHandle {
        let index = vector::length(&builder.inputs);
        vector::push_back(&mut builder.inputs, create_shared_object_input(shared_ref));
        create_input_handle(index)
    }

    #[test_only]
    public fun get_nested_result(result: &CommandResult, nested_index: u64): NestedCommandResult {
        assert!(nested_index < result.result_count, E_INVALID_COMMAND_INDEX);
        create_nested_command_result(result.command_index, nested_index)
    }
    
    #[test_only]
    public fun get_builder_inputs(builder: &PTBBuilder): &vector<Input> {
        &builder.inputs
    }
    
    #[test_only]
    public fun get_builder_commands(builder: &PTBBuilder): &vector<Command> {
        &builder.commands
    }
    
    #[test_only]
    public fun get_builder_lookups(builder: &PTBBuilder): &vector<OffchainLookup> {
        &builder.lookups
    }
    
    #[test_only]
    public fun get_builder_pending_lookups(builder: &PTBBuilder): &vector<LookupHandle> {
        &builder.pending_lookups
    }
    
    #[test_only]
    public fun get_current_command_index(builder: &PTBBuilder): u64 {
        builder.current_command_index
    }
    
    #[test_only]
    public fun get_builder_required_objects(builder: &PTBBuilder): &vector<address> {
        &builder.required_objects
    }
    
    #[test_only]
    public fun get_builder_required_types(builder: &PTBBuilder): &vector<String> {
        &builder.required_types
    }

    #[test_only]
    public fun is_resolved(result: &ResolverResult): bool {
        match (result) {
            ResolverResult::Resolved { .. } => true,
            _ => false,
        }
    }
    
    #[test_only]
    public fun is_needs_offchain_data(result: &ResolverResult): bool {
        match (result) {
            ResolverResult::NeedsOffchainData { .. } => true,
            _ => false,
        }
    }
    
    #[test_only]
    public fun is_error(result: &ResolverResult): bool {
        match (result) {
            ResolverResult::Error { .. } => true,
            _ => false,
        }
    }

    #[test_only]
    public fun get_offchain_lookups(result: &ResolverResult): vector<OffchainLookup> {
        match (result) {
            ResolverResult::NeedsOffchainData { lookups } => *lookups,
            _ => vector::empty(),
        }
    }

    #[test_only]
    public fun get_instruction_groups(result: &ResolverResult): InstructionGroups {
        match (result) {
            ResolverResult::Resolved { instruction_groups } => *instruction_groups,
            _ => InstructionGroups { groups: vector::empty() },
        }
    }
    
    #[test_only]
    public fun get_arg_index(arg: &Argument): u64 {
        match (arg) {
            Argument::Input { index } => *index,
            Argument::Result { index } => *index,
            Argument::NestedResult { index, .. } => *index,
            Argument::GasCoin => 0,
        }
    }
    
    #[test_only]
    public fun get_arg_nested_index(arg: &Argument): u64 {
        match (arg) {
            Argument::NestedResult { nested_index, .. } => *nested_index,
            _ => 0,
        }
    }
    
    // get_input_type removed - use pattern matching on Input enum directly
    
    #[test_only]
    public fun get_input_data(input: &Input): vector<u8> {
        match (input) {
            Input::Pure { data, type_name: _ } => *data,
            Input::ObjectImmutableOrOwned { object_ref } => {
                let mut data = vector::empty<u8>();
                vector::append(&mut data, bcs::to_bytes(&object_ref.object_id));
                vector::append(&mut data, bcs::to_bytes(&object_ref.version));
                vector::append(&mut data, object_ref.digest);
                data
            },
            Input::ObjectShared { shared_ref } => {
                let mut data = vector::empty<u8>();
                vector::append(&mut data, bcs::to_bytes(&shared_ref.object_id));
                vector::append(&mut data, bcs::to_bytes(&shared_ref.initial_shared_version));
                vector::push_back(&mut data, if (shared_ref.mutable) 1 else 0);
                data
            },
            Input::ObjectReceiving { object_ref } => {
                let mut data = vector::empty<u8>();
                vector::append(&mut data, bcs::to_bytes(&object_ref.object_id));
                vector::append(&mut data, bcs::to_bytes(&object_ref.version));
                vector::append(&mut data, object_ref.digest);
                data
            },
        }
    }
    
    #[test_only]
    public fun get_command_data(cmd: &Command): vector<u8> {
        // For testing, serialize the entire command
        bcs::to_bytes(cmd)
    }
    
    #[test_only]
    public fun get_type_tag_data(tag: &TypeTag): vector<u8> {
        tag.type_tag
    }
    
    #[test_only]
    public fun get_instruction_inputs(instruction: &PTBInstruction): vector<Input> {
        instruction.inputs
    }
    
    #[test_only]
    public fun get_instruction_commands(instruction: &PTBInstruction): vector<Command> {
        instruction.commands
    }
    
    #[test_only]
    public fun get_group_instructions(group: &InstructionGroup): PTBInstruction {
        group.instructions
    }
    
    #[test_only]
    public fun get_group_required_objects(group: &InstructionGroup): vector<address> {
        group.required_objects
    }
    
    #[test_only]
    public fun get_group_required_types(group: &InstructionGroup): vector<String> {
        group.required_types
    }
    
    #[test_only]
    public fun get_groups(groups: &InstructionGroups): vector<InstructionGroup> {
        groups.groups
    }
    
    // get_lookup_type removed - use pattern matching on OffchainLookup enum directly
    
    #[test_only]
    public fun get_lookup_parent(lookup: &OffchainLookup): address {
        match (lookup) {
            OffchainLookup::DynamicField { parent_object, .. } => *parent_object,
            OffchainLookup::DynamicFieldByType { parent_object, .. } => *parent_object,
            OffchainLookup::DynamicObjectField { parent_object, .. } => *parent_object,
            OffchainLookup::TableItem { parent_object, .. } => *parent_object,
            OffchainLookup::ObjectField { parent_object, .. } => *parent_object,
        }
    }
    
    #[test_only]
    public fun get_lookup_key(lookup: &OffchainLookup): vector<u8> {
        match (lookup) {
            OffchainLookup::DynamicField { key, .. } => *key,
            OffchainLookup::DynamicFieldByType { type_suffix, extract_field, .. } => {
                let mut key = vector::empty<u8>();
                vector::append(&mut key, *string::as_bytes(type_suffix));
                vector::push_back(&mut key, 0xff);
                vector::append(&mut key, *string::as_bytes(extract_field));
                key
            },
            OffchainLookup::DynamicObjectField { key, .. } => *key,
            OffchainLookup::TableItem { table_path, key_raw, key_structured, .. } => {
                let mut full_key = vector::empty<u8>();
                vector::append(&mut full_key, *string::as_bytes(table_path));
                vector::push_back(&mut full_key, 0xff);

                // Use key_raw if available, otherwise encode structured fields
                if (option::is_some(key_raw)) {
                    vector::append(&mut full_key, *option::borrow(key_raw));
                } else if (option::is_some(key_structured)) {
                    // Length-prefixed encoding for structured keys (safe for binary data):
                    // num_fields (1 byte) + [name_len (1 byte) + name + value_len (2 bytes big-endian) + value]*
                    let fields = option::borrow(key_structured);
                    let num_fields = vector::length(fields);
                    vector::push_back(&mut full_key, (num_fields as u8));

                    let mut i = 0;
                    while (i < num_fields) {
                        let field = vector::borrow(fields, i);

                        // Name length (1 byte) + name
                        let name_len = vector::length(&field.name);
                        vector::push_back(&mut full_key, (name_len as u8));
                        vector::append(&mut full_key, field.name);

                        // Value length (2 bytes big-endian) + value
                        let value_len = vector::length(&field.value);
                        vector::push_back(&mut full_key, ((value_len >> 8) as u8));
                        vector::push_back(&mut full_key, ((value_len & 0xff) as u8));
                        vector::append(&mut full_key, field.value);

                        i = i + 1;
                    };
                };

                full_key
            },
            OffchainLookup::ObjectField { field_path, .. } => *string::as_bytes(field_path),
        }
    }
    
    #[test_only]
    public fun get_lookup_placeholder(lookup: &OffchainLookup): String {
        match (lookup) {
            OffchainLookup::DynamicField { placeholder_name, .. } => *placeholder_name,
            OffchainLookup::DynamicFieldByType { placeholder_name, .. } => *placeholder_name,
            OffchainLookup::DynamicObjectField { placeholder_name, .. } => *placeholder_name,
            OffchainLookup::TableItem { placeholder_name, .. } => *placeholder_name,
            OffchainLookup::ObjectField { placeholder_name, .. } => *placeholder_name,
        }
    }

    #[test_only]
    public fun is_gas_coin_arg(arg: &Argument): bool {
        match (arg) {
            Argument::GasCoin => true,
            _ => false,
        }
    }

    #[test_only]
    public fun is_input_arg(arg: &Argument): bool {
        match (arg) {
            Argument::Input { .. } => true,
            _ => false,
        }
    }

    #[test_only]
    public fun is_result_arg(arg: &Argument): bool {
        match (arg) {
            Argument::Result { .. } => true,
            _ => false,
        }
    }

    #[test_only]
    public fun is_nested_result_arg(arg: &Argument): bool {
        match (arg) {
            Argument::NestedResult { .. } => true,
            _ => false,
        }
    }

    #[test_only]
    public fun is_pure_input(input: &Input): bool {
        match (input) {
            Input::Pure { .. } => true,
            _ => false,
        }
    }

    #[test_only]
    public fun is_object_input(input: &Input): bool {
        match (input) {
            Input::ObjectImmutableOrOwned { .. } => true,
            _ => false,
        }
    }

    #[test_only]
    public fun is_shared_object_input(input: &Input): bool {
        match (input) {
            Input::ObjectShared { .. } => true,
            _ => false,
        }
    }

    #[test_only]
    public fun is_move_call_command(cmd: &Command): bool {
        match (cmd) {
            Command::MoveCall { .. } => true,
            _ => false,
        }
    }

    #[test_only]
    public fun is_dynamic_field_lookup(lookup: &OffchainLookup): bool {
        match (lookup) {
            OffchainLookup::DynamicField { .. } => true,
            _ => false,
        }
    }

    #[test_only]
    public fun is_table_lookup(lookup: &OffchainLookup): bool {
        match (lookup) {
            OffchainLookup::TableItem { .. } => true,
            _ => false,
        }
    }

    #[test_only]
    public fun is_object_field_lookup(lookup: &OffchainLookup): bool {
        match (lookup) {
            OffchainLookup::ObjectField { .. } => true,
            _ => false,
        }
    }

    #[test_only]
    public fun is_dynamic_field_by_type_lookup(lookup: &OffchainLookup): bool {
        match (lookup) {
            OffchainLookup::DynamicFieldByType { .. } => true,
            _ => false,
        }
    }
    
    #[test_only]
    public fun get_discovered_keys(data: &DiscoveredData): vector<String> {
        let mut keys = vector::empty<String>();
        let mut i = 0;
        let len = vector::length(&data.entries);
        while (i < len) {
            let entry = vector::borrow(&data.entries, i);
            vector::push_back(&mut keys, entry.key);
            i = i + 1;
        };
        keys
    }
    
    #[test_only]
    public fun discovered_data_length(data: &DiscoveredData): u64 {
        vector::length(&data.entries)
    }
}


