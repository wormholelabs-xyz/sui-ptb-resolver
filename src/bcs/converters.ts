import { bcs } from '@mysten/sui/bcs';
import { fromHex, toHex } from '@mysten/sui/utils';

import type { ObjectRef } from '../types/index.js';

export function addressToBytes(address: string): Uint8Array {
  const hex = address.startsWith('0x') ? address.slice(2) : address;
  const paddedHex = hex.padStart(64, '0');

  return fromHex(paddedHex);
}

export function bytesToAddress(bytes: Uint8Array | number[]): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);

  if (arr.length !== 32) {
    throw new Error(`Invalid address length: expected 32 bytes, got ${arr.length}`);
  }

  return `0x${toHex(arr)}`;
}

export function stringToBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

export function bytesToString(bytes: Uint8Array | number[]): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return new TextDecoder().decode(arr);
}

export function packObjectRef(ref: ObjectRef): Uint8Array {
  const versionBytes = bcs.u64().serialize(ref.version).toBytes();

  const totalLength = 32 + versionBytes.length + ref.digest.length;
  const packed = new Uint8Array(totalLength);

  let offset = 0;

  // Copy object_id (32 bytes)
  packed.set(ref.object_id, offset);
  offset += 32;

  // Copy version (8 bytes, BCS-encoded u64)
  packed.set(versionBytes, offset);
  offset += versionBytes.length;

  // Copy digest (variable length)
  packed.set(ref.digest, offset);

  return packed;
}

export function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  return fromHex(cleanHex);
}

export function bytesToHex(bytes: Uint8Array | number[], prefix = true): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const hex = toHex(arr);
  return prefix ? `0x${hex}` : hex;
}

export function arrayToBytes(arr: number[]): Uint8Array {
  return new Uint8Array(arr);
}

export function bytesToArray(bytes: Uint8Array): number[] {
  return Array.from(bytes);
}
