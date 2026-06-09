/**
 * Unit tests for the table-key BCS encoder.
 *
 * Regression guard for the SIG_TYPE off-by-one bug: the proto enum is
 * ADDRESS=1, BOOL=2, U8=3, ... A mis-numbering silently mis-encodes a key
 * (wrong dynamic-field id -> wrong/failed lookup). The production TBRv4 resolver
 * only uses u16 + vector<u8>, so the mainnet parity gate CANNOT catch u8/bool
 * mistakes — these tests can.
 */

import { describe, expect, test } from 'bun:test';

import { LookupResolutionError } from './base.js';
import { concatBytes, encodeFieldValue, SIG_TYPE } from './key-encoding.js';

describe('SIG_TYPE mirrors sui.rpc.v2.OpenSignatureBody.Type', () => {
  test('enum values match the generated proto exactly', () => {
    // Verified against node_modules/@mysten/sui .../move_package.d.mts.
    expect(SIG_TYPE).toEqual({
      ADDRESS: 1,
      BOOL: 2,
      U8: 3,
      U16: 4,
      U32: 5,
      U64: 6,
      U128: 7,
      U256: 8,
      VECTOR: 9,
      DATATYPE: 10,
    });
  });
});

describe('encodeFieldValue', () => {
  const enc = (sigType: number, raw: number[]) =>
    Array.from(encodeFieldValue(sigType, new Uint8Array(raw), 'f', '0xPKG::m::K'));

  test('ADDRESS passes through 32 raw bytes (no length prefix)', () => {
    const addr = new Array(32).fill(0).map((_, i) => i);
    expect(enc(SIG_TYPE.ADDRESS, addr)).toEqual(addr);
  });

  test('BOOL passes through its single byte (0x00 / 0x01)', () => {
    // The bug: BOOL was missing; a bool key fell through to default and threw.
    expect(enc(SIG_TYPE.BOOL, [0x01])).toEqual([0x01]);
    expect(enc(SIG_TYPE.BOOL, [0x00])).toEqual([0x00]);
  });

  test('u8 passes through its single LE byte', () => {
    // The bug: U8 was numbered 2 (actually BOOL); a real u8 (proto 3) missed the map.
    expect(enc(SIG_TYPE.U8, [0x2a])).toEqual([0x2a]);
  });

  test('u16 passes through its 2 LE bytes', () => {
    // chain=2 -> 0x02 0x00 (the TBRv4 case that happened to be numbered right)
    expect(enc(SIG_TYPE.U16, [0x02, 0x00])).toEqual([0x02, 0x00]);
  });

  test.each([
    [SIG_TYPE.U32, [1, 2, 3, 4]],
    [SIG_TYPE.U64, [1, 2, 3, 4, 5, 6, 7, 8]],
    [SIG_TYPE.U128, new Array(16).fill(7)],
    [SIG_TYPE.U256, new Array(32).fill(9)],
  ])('fixed-width int (sigType %i) passes through its LE bytes', (sigType, raw) => {
    expect(enc(sigType, raw)).toEqual(raw);
  });

  test('VECTOR adds a ULEB128 length prefix (matches Move vector<u8>)', () => {
    // 3 bytes -> 0x03 prefix + payload
    expect(enc(SIG_TYPE.VECTOR, [0xaa, 0xbb, 0xcc])).toEqual([0x03, 0xaa, 0xbb, 0xcc]);
    // empty vector -> just the 0x00 length
    expect(enc(SIG_TYPE.VECTOR, [])).toEqual([0x00]);
  });

  test('VECTOR length prefix is ULEB128 for >127 bytes', () => {
    const raw = new Array(200).fill(0x01);
    const out = enc(SIG_TYPE.VECTOR, raw);
    // 200 = 0xC8 -> ULEB128 [0xC8, 0x01], then 200 payload bytes
    expect(out.slice(0, 2)).toEqual([0xc8, 0x01]);
    expect(out.length).toBe(202);
  });

  test('DATATYPE (nested struct) is rejected, not mis-encoded', () => {
    expect(() => encodeFieldValue(SIG_TYPE.DATATYPE, new Uint8Array([1]), 'f', 'K')).toThrow(
      LookupResolutionError
    );
  });

  test('unknown / undefined sigType is rejected', () => {
    expect(() => encodeFieldValue(999, new Uint8Array([1]), 'f', 'K')).toThrow(
      LookupResolutionError
    );
    expect(() => encodeFieldValue(undefined, new Uint8Array([1]), 'f', 'K')).toThrow(
      LookupResolutionError
    );
  });
});

describe('concatBytes', () => {
  test('concatenates segments in order', () => {
    expect(
      Array.from(concatBytes([new Uint8Array([1, 2]), new Uint8Array([]), new Uint8Array([3])]))
    ).toEqual([1, 2, 3]);
  });

  test('empty input -> empty output', () => {
    expect(concatBytes([]).length).toBe(0);
  });
});
