/**
 * Migration parity gate (also serves as the JSON-RPC vs gRPC differential).
 *
 * Resolves the production TBRv4 sample VAA against mainnet through the REAL
 * resolver (now on gRPC / SuiGrpcClient) and asserts the resulting PTB equals
 * the frozen baseline (baseline.tbrv4.mainnet.json).
 *
 * The baseline was captured from the SAME resolver running on the @mysten/sui
 * 1.x JSON-RPC path. So this assertion is the cross-transport differential:
 * gRPC output (now) === JSON-RPC output (frozen). Byte-identical = the gRPC
 * migration changed nothing the resolver emits ("works exactly as it is").
 *
 * Hits live mainnet via gRPC, so run with:
 *   bun test examples/parity.test.ts
 *
 * If a bridge package upgrade legitimately changes a discovered package id, the
 * baseline must be re-frozen BEFORE comparing — the claim is "same chain state".
 */

import { bcs } from '@mysten/sui/bcs';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { fromBase64 } from '@mysten/sui/utils';
import { describe, expect, test } from 'bun:test';

import { getNetworkConfig, SuiPTBResolver } from '../src';
import baseline from './baseline.tbrv4.mainnet.json';
import { SAMPLE_VAA, TOKEN_BRIDGE_CONFIG } from './token_bridge_resolver_sample.js';

const ResolverStateBcs = bcs.struct('ResolverState', {
  id: bcs.Address,
  package_id: bcs.Address,
  module_name: bcs.string(),
});

describe('migration parity: TBRv4 mainnet resolve (gRPC)', () => {
  test('resolved PTB matches the frozen 1.x/JSON-RPC baseline', async () => {
    const network = getNetworkConfig('mainnet');
    const client = new SuiGrpcClient({ baseUrl: network.grpcUrl, network: network.name });
    const { stateId } = TOKEN_BRIDGE_CONFIG.mainnet;

    const { object } = await client.getObject({ objectId: stateId, include: { content: true } });
    if (!object.content) {
      throw new Error('Invalid State object: no content');
    }
    const state = ResolverStateBcs.parse(object.content);
    const target = `${state.package_id}::${state.module_name}::resolve_vaa`;

    const resolver = new SuiPTBResolver({ network, maxIterations: 10 }, client);
    const result = await resolver.resolveVAA(target, stateId, fromBase64(SAMPLE_VAA));

    // getData() is the canonical serialization the executor builds from.
    // JSON round-trip so bigint/Uint8Array shapes match the committed baseline.
    const actual = JSON.parse(JSON.stringify(result.transaction.getData()));
    expect(actual).toEqual(baseline);
  }, 60_000);
});
