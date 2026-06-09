/**
 * Migration parity gate.
 *
 * Resolves the production TBRv4 sample VAA against mainnet through the REAL
 * resolver and asserts the resulting PTB equals the frozen 1.x baseline
 * (baseline.tbrv4.mainnet.json). The SAME assertion must pass on @mysten/sui
 * 1.x and 2.x — that is the proof the migration changes nothing the resolver
 * emits ("works exactly as it is").
 *
 * Hits live mainnet (the resolver runs dry-run simulations), so run with:
 *   bun test examples/parity.test.ts
 *
 * If a bridge package upgrade legitimately changes a discovered package id, the
 * baseline must be re-frozen from a fresh 1.x run BEFORE comparing against 2.x —
 * the parity claim is "1.x-now vs 2.x-now", same chain state.
 */

import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { fromBase64 } from '@mysten/sui/utils';
import { describe, expect, test } from 'bun:test';

import { getNetworkConfig, SuiPTBResolver } from '../src';
import baseline from './baseline.tbrv4.mainnet.json';
import { SAMPLE_VAA, TOKEN_BRIDGE_CONFIG } from './token_bridge_resolver_sample.js';

describe('migration parity: TBRv4 mainnet resolve', () => {
  test('resolved PTB matches the frozen 1.x baseline', async () => {
    const network = getNetworkConfig('mainnet');
    const client = new SuiJsonRpcClient({ url: network.rpcUrl, network: network.name });
    const { stateId } = TOKEN_BRIDGE_CONFIG.mainnet;

    const stateObject = await client.getObject({
      id: stateId,
      options: { showContent: true },
    });
    if (stateObject.data?.content?.dataType !== 'moveObject') {
      throw new Error('Invalid State object');
    }
    const fields = stateObject.data.content.fields as Record<string, unknown>;
    const target = `${fields.package_id as string}::${fields.module_name as string}::resolve_vaa`;

    const resolver = new SuiPTBResolver({ network, maxIterations: 10 }, client);
    const result = await resolver.resolveVAA(target, stateId, fromBase64(SAMPLE_VAA));

    // getData() is the canonical serialization the executor builds from.
    // Compare via JSON round-trip so bigint/Uint8Array shapes match the
    // committed baseline exactly.
    const actual = JSON.parse(JSON.stringify(result.transaction.getData()));
    expect(actual).toEqual(baseline);
  }, 60_000);
});
