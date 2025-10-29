/**
 * PTB Builder - Reconstructs a Sui Transaction from resolved PTB instructions.
 */

import { bcs } from '@mysten/sui/bcs';
import { Transaction, type TransactionObjectArgument } from '@mysten/sui/transactions';

import { bytesToAddress } from '../bcs/converters.js';
import type { Argument, Command, Input, InstructionGroups, TypeTag } from '../types/index.js';

export class PTBBuilder {
  private tx: Transaction;
  private inputHandles: TransactionObjectArgument[] = [];
  private resultHandles: TransactionObjectArgument[][] = [];

  constructor() {
    this.tx = new Transaction();
  }

  /**
   * Build Transaction from instruction groups from Output Event
   * @param groups - Instruction groups from resolver
   * @returns Built Transaction ready for signing
   */
  buildFromInstructions(groups: InstructionGroups): Transaction {
    if (groups.groups.length === 0) {
      throw new Error('No instruction groups provided');
    }

    const group = groups.groups[0]!;
    const { instructions } = group;

    for (const input of instructions.inputs) {
      this.processInput(input);
    }

    for (const command of instructions.commands) {
      this.processCommand(command);
    }

    return this.tx;
  }

  private processInput(input: Input): void {
    const variant = input.variant;

    switch (variant) {
      case 'Pure': {
        const { data, type_name } = input.fields;
        const handle = this.processPureInput(data, type_name);
        this.inputHandles.push(handle);
        break;
      }

      case 'ObjectImmutableOrOwned': {
        const { object_ref } = input.fields;
        const address = bytesToAddress(object_ref.object_id);
        const handle = this.tx.object(address);
        this.inputHandles.push(handle);
        break;
      }

      case 'ObjectShared': {
        const { shared_ref } = input.fields;
        const address = bytesToAddress(shared_ref.object_id);
        const handle = this.tx.object(address);
        this.inputHandles.push(handle);
        break;
      }

      case 'ObjectReceiving': {
        const { object_ref } = input.fields;
        const address = bytesToAddress(object_ref.object_id);
        const handle = this.tx.object(address);
        this.inputHandles.push(handle);
        break;
      }

      default: {
        const _exhaustive: never = variant;
        throw new Error(`Unknown input variant: ${_exhaustive}`);
      }
    }
  }

  // process pure input with explicit type information from Move
  private processPureInput(data: Uint8Array, _typeName: string): TransactionObjectArgument {
    // Type name is available but not currently used for reconstruction
    // Data is already BCS-encoded from Move side via bcs::to_bytes()
    return this.tx.pure(bcs.vector(bcs.u8()).serialize(Array.from(data)));
  }

  private processCommand(command: Command): void {
    const variant = command.variant;

    switch (variant) {
      case 'MoveCall': {
        const result = this.processMoveCall(command.fields);
        this.resultHandles.push(Array.isArray(result) ? result : [result]);
        break;
      }

      case 'TransferObjects': {
        this.processTransferObjects(command.fields);
        this.resultHandles.push([]);
        break;
      }

      case 'SplitCoins': {
        const result = this.processSplitCoins(command.fields);
        this.resultHandles.push(Array.isArray(result) ? result : [result]);
        break;
      }

      case 'MergeCoins': {
        this.processMergeCoins(command.fields);
        this.resultHandles.push([]);
        break;
      }

      case 'MakeMoveVec': {
        const result = this.processMakeMoveVec(command.fields);
        this.resultHandles.push([result]);
        break;
      }

      default: {
        const _exhaustive: never = variant;
        throw new Error(`Unknown command variant: ${_exhaustive}`);
      }
    }
  }

  private processMoveCall(fields: {
    package: Uint8Array;
    module_name: string;
    function_name: string;
    type_arguments: TypeTag[];
    arguments: Argument[];
  }): TransactionObjectArgument {
    const packageAddr = bytesToAddress(fields.package);
    const target = `${packageAddr}::${fields.module_name}::${fields.function_name}`;

    const typeArguments = fields.type_arguments.map((tag) => {
      return new TextDecoder().decode(tag.type_tag);
    });

    const args = fields.arguments.map((arg) => this.resolveArgument(arg));

    return this.tx.moveCall({
      target,
      typeArguments,
      arguments: args,
    });
  }

  private processTransferObjects(fields: { objects: Argument[]; recipient: Argument }): void {
    const objects = fields.objects.map((arg) => this.resolveArgument(arg));
    const recipient = this.resolveArgument(fields.recipient);

    this.tx.transferObjects(objects, recipient);
  }

  private processSplitCoins(fields: {
    coin: Argument;
    amounts: Argument[];
  }): TransactionObjectArgument {
    const coin = this.resolveArgument(fields.coin);
    const amounts = fields.amounts.map((arg) => this.resolveArgument(arg));

    return this.tx.splitCoins(coin, amounts);
  }

  private processMergeCoins(fields: { destination: Argument; sources: Argument[] }): void {
    const destination = this.resolveArgument(fields.destination);
    const sources = fields.sources.map((arg) => this.resolveArgument(arg));

    this.tx.mergeCoins(destination, sources);
  }

  private processMakeMoveVec(fields: {
    type_tag: TypeTag | null;
    elements: Argument[];
  }): TransactionObjectArgument {
    const elements = fields.elements.map((arg) => this.resolveArgument(arg));

    const type = fields.type_tag ? new TextDecoder().decode(fields.type_tag.type_tag) : undefined;

    return this.tx.makeMoveVec({
      type,
      elements,
    });
  }

  private resolveArgument(arg: Argument): TransactionObjectArgument {
    const variant = arg.variant;

    switch (variant) {
      case 'GasCoin':
        return this.tx.gas;

      case 'Input': {
        const handle = this.inputHandles[Number(arg.fields.index)];
        if (!handle) {
          throw new Error(`Input handle not found at index ${arg.fields.index}`);
        }
        return handle;
      }

      case 'Result': {
        const results = this.resultHandles[Number(arg.fields.index)];
        if (!results || results.length === 0) {
          throw new Error(`Result handle not found at index ${arg.fields.index}`);
        }
        return results[0]!;
      }

      case 'NestedResult': {
        const results = this.resultHandles[Number(arg.fields.index)];
        if (!results) {
          throw new Error(`Result handle not found at index ${arg.fields.index}`);
        }
        const nested = results[Number(arg.fields.nested_index)];
        if (!nested) {
          throw new Error(
            `Nested result not found at index ${arg.fields.index}[${arg.fields.nested_index}]`
          );
        }
        return nested;
      }

      default: {
        const _exhaustive: never = variant;
        throw new Error(`Unknown argument variant: ${_exhaustive}`);
      }
    }
  }

  getTransaction(): Transaction {
    return this.tx;
  }
}
