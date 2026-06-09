import { bcs } from '@mysten/sui/bcs';

import { LookupResolutionError } from './base.js';

/**
 * OpenSignatureBody.Type enum values, mirroring the generated proto
 * `sui.rpc.v2.OpenSignatureBody.Type`: TYPE_UNKNOWN=0, ADDRESS=1, BOOL=2, U8=3,
 * U16=4, U32=5, U64=6, U128=7, U256=8, VECTOR=9, DATATYPE=10, TYPE_PARAMETER=11.
 *
 * These MUST match the proto exactly — a mis-numbering silently mis-encodes a
 * table key (wrong dynamic-field id => wrong/failed lookup). See key-encoding.test.ts.
 * We only encode the subset that can appear as a table key field.
 */
export const SIG_TYPE = {
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
} as const;

/**
 * Re-encode a single key field's resolver-provided bytes to canonical struct-BCS,
 * based on its Move type (an OpenSignatureBody.Type proto value).
 *
 * The resolver emits per-field bytes that are NOT uniformly BCS-encoded:
 * - fixed-width values (bool = 1 byte 0x00/0x01; uN = little-endian bytes) and
 *   addresses (32 bytes) arrive as their exact canonical bytes -> pass through.
 * - vector<u8> arrives RAW and needs a ULEB128 length prefix added here.
 * - nested struct (DATATYPE) and anything else is rejected, not mis-encoded.
 */
export function encodeFieldValue(
  sigType: number | undefined,
  raw: Uint8Array,
  fieldName: string,
  keyType: string
): Uint8Array {
  switch (sigType) {
    case SIG_TYPE.ADDRESS:
      // 32 bytes, no length prefix.
      return raw;
    case SIG_TYPE.BOOL:
    case SIG_TYPE.U8:
    case SIG_TYPE.U16:
    case SIG_TYPE.U32:
    case SIG_TYPE.U64:
    case SIG_TYPE.U128:
    case SIG_TYPE.U256:
      // Fixed-width value (bool = 1 byte 0x00/0x01; ints = LE bytes) — the
      // resolver already provided the exact canonical-BCS bytes.
      return raw;
    case SIG_TYPE.VECTOR:
      // vector<u8>: ULEB128 length prefix + raw bytes. bcs.vector(bcs.u8())
      // produces exactly this, matching Move's struct encoding.
      return bcs.vector(bcs.u8()).serialize(Array.from(raw)).toBytes();
    default:
      // Includes DATATYPE (nested struct keys) and any unsupported type —
      // rejected with a clear error rather than mis-encoded.
      throw new LookupResolutionError(
        'TableItem',
        `Unsupported key field type for '${fieldName}' in ${keyType}`,
        { sigType }
      );
  }
}

/** Concatenate byte segments into a single Uint8Array. */
export function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}
