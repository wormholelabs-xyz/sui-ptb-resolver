/**
 * SUI PTB Resolver
 *
 * Main resolver class for gas-free PTB resolution using sui_ptb_resolver framework.
 */

import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';

import { bytesToAddress } from '../bcs/converters.js';
import { PTBBuilder } from '../builder/index.js';
import { DEFAULT_DRY_RUN_TIMEOUT, DEFAULT_MAX_ITERATIONS } from '../config/constants.js';
import { OffchainLookupResolver } from '../lookups/resolver.js';
import type { ResolverOutput, SuiPTBResolverConfig } from '../types/index.js';
import { validateRange } from '../utils/index.js';
import { DiscoveredDataStore } from './discovered-data.js';
import { EventParser } from './event-parser.js';

/**
 * Callback function to create resolver transaction
 * @param discoveredData - BCS-encoded discovered data to pass to resolver
 * @returns Transaction that calls the resolver function
 */
export type ResolverCallbackFn = (discoveredData: Uint8Array) => Promise<Transaction>;

/**
 * Main SUI PTB Resolver
 *
 * Generic resolver for gas-free PTB construction using offchain data discovery.
 * Works with any resolver implementation that follows the sui_ptb_resolver pattern.
 */
export class SuiPTBResolver {
  private client: SuiClient;
  private lookupResolver: OffchainLookupResolver;
  private eventParser: EventParser;
  private config: SuiPTBResolverConfig;

  constructor(config: SuiPTBResolverConfig, client?: SuiClient) {
    this.config = {
      maxIterations: DEFAULT_MAX_ITERATIONS,
      debug: false,
      dryRunTimeout: DEFAULT_DRY_RUN_TIMEOUT,
      ...config,
    };

    this.client = client ?? new SuiClient({ url: config.network.rpcUrl });
    this.lookupResolver = new OffchainLookupResolver();
    this.eventParser = new EventParser();
  }

  /**
   * Resolve a PTB using iterative offchain lookup
   *
   * Generic resolution process:
   * 1. Call resolver function in dry-run mode
   * 2. Parse emitted events
   * 3. If NeedsData: fetch offchain data and retry
   * 4. If Resolved: reconstruct and return PTB
   * 5. Repeat until resolved or max iterations reached
   *
   * @param createResolverTx - Callback to create resolver transaction
   * @returns Resolved PTB and metadata
   */
  async resolve(createResolverTx: ResolverCallbackFn): Promise<ResolverOutput> {
    const discoveredData = new DiscoveredDataStore();
    const maxIterations = this.config.maxIterations ?? DEFAULT_MAX_ITERATIONS;

    validateRange(maxIterations, 1, 100, 'maxIterations');

    if (this.config.debug) {
      console.log(`[SuiPTBResolver] Starting resolution (max ${maxIterations} iterations)`);
    }

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      if (this.config.debug) {
        console.log(`[SuiPTBResolver] Iteration ${iteration + 1}/${maxIterations}`);
      }

      // Create resolver transaction with current discovered data
      const tx = await createResolverTx(discoveredData.serialize());

      // Set up transaction for dry-run
      tx.setSender('0x0000000000000000000000000000000000000000000000000000000000000000');
      tx.setGasBudget(100_000_000);

      // Execute dry-run
      const dryRunResult = await this.client.dryRunTransactionBlock({
        transactionBlock: await tx.build({ client: this.client }),
      });

      // Check execution status
      if (dryRunResult.effects.status.status !== 'success') {
        throw new Error(
          `Dry-run execution failed: ${dryRunResult.effects.status.error ?? 'Unknown error'}`
        );
      }

      // Parse events
      const parsedEvent = this.eventParser.parseResolverEvent(dryRunResult.events || []);

      if (parsedEvent.type === 'Resolved') {
        // Resolution complete! Build final PTB
        if (this.config.debug) {
          console.log(`[SuiPTBResolver] Resolution complete after ${iteration + 1} iteration(s)`);
        }

        const ptbBuilder = new PTBBuilder();
        const transaction = ptbBuilder.buildFromInstructions({
          groups: [
            {
              instructions: {
                inputs: parsedEvent.inputs,
                commands: parsedEvent.commands,
              },
              required_objects: parsedEvent.required_objects,
              required_types: parsedEvent.required_types,
            },
          ],
        });

        return {
          transaction,
          iterations: iteration + 1,
          discoveredData: discoveredData.getAll(),
          requiredObjects: parsedEvent.required_objects.map((addr) => bytesToAddress(addr)),
          requiredTypes: parsedEvent.required_types,
        };
      }

      if (parsedEvent.type === 'NeedsData') {
        // Fetch offchain data
        const lookup = parsedEvent.lookup;
        const placeholderName = this.getPlaceholderName(lookup);

        if (this.config.debug) {
          console.log(`[SuiPTBResolver] Fetching offchain data: ${placeholderName}`);
        }

        // Resolve lookup
        const value = await this.lookupResolver.resolve(lookup, this.client);

        // Store discovered data
        discoveredData.set(placeholderName, value);

        if (this.config.debug) {
          console.log(`[SuiPTBResolver] Discovered: ${placeholderName} (${value.length} bytes)`);
        }

        // Continue to next iteration
        continue;
      }

      if (parsedEvent.type === 'Error') {
        throw new Error(`Resolver error: ${parsedEvent.message}`);
      }

      // Should never reach here due to exhaustive type checking
      throw new Error('Unknown event type');
    }

    throw new Error(`Max iterations (${maxIterations}) reached without resolution`);
  }

  /**
   * Get placeholder name from lookup
   * @param lookup - Offchain lookup
   * @returns Placeholder name
   */
  private getPlaceholderName(lookup: { fields?: { placeholder_name?: string } }): string {
    return lookup.fields?.placeholder_name ?? 'unknown';
  }

  /**
   * Get the SUI client
   * @returns SUI client instance
   */
  getClient(): SuiClient {
    return this.client;
  }

  /**
   * Get the resolver configuration
   * @returns Resolver config
   */
  getConfig(): SuiPTBResolverConfig {
    return { ...this.config };
  }

  /**
   * Resolve a VAA using resolve_vaa function pattern
   *
   * This is a convenience wrapper for the common pattern where the resolver
   * has a `resolve_vaa` function that takes (State, vaa_bytes, discovered_data).
   *
   * @param target - Move function target (e.g., "PACKAGE::module::resolve_vaa")
   * @param stateId - State object ID for the resolver
   * @param vaaBytes - VAA bytes to resolve
   * @returns Resolved PTB and metadata
   */
  async resolveVAA(target: string, stateId: string, vaaBytes: Uint8Array): Promise<ResolverOutput> {
    return this.resolve(async (discoveredData) => {
      const tx = new Transaction();

      tx.moveCall({
        target,
        arguments: [
          tx.object(stateId),
          tx.pure.vector('u8', Array.from(vaaBytes)),
          tx.pure.vector('u8', Array.from(discoveredData)),
        ],
      });

      return tx;
    });
  }
}
