/**
 * Input validation + amount helpers shared by the contract wrappers.
 * Every wrapper validates its inputs BEFORE touching a contract, so misuse
 * fails fast with a descriptive error instead of a revert or a bad tx.
 */

import { isAddress, parseEther } from 'ethers';
import type { WriteOverrides } from '../types';

/** Re-exported so callers can pass overrides without importing types. */
export type { WriteOverrides };

/** EIP-55 address check. */
export function reqAddress(value: unknown, name: string): string {
  if (typeof value !== 'string' || !isAddress(value)) {
    throw new Error(`${name}: expected a valid Ethereum address, got ${JSON.stringify(value)}`);
  }
  return value;
}

/** Non-negative integer (uint256) from number | bigint | decimal string. */
export function reqUint(value: unknown, name: string): bigint {
  let n: bigint;
  try {
    if (typeof value === 'bigint') n = value;
    else if (typeof value === 'number') {
      if (!Number.isInteger(value)) throw new Error('not an integer');
      n = BigInt(value);
    } else if (typeof value === 'string' && /^\d+$/.test(value)) n = BigInt(value);
    else throw new Error('not a uint');
  } catch {
    throw new Error(`${name}: expected a non-negative integer (uint256), got ${JSON.stringify(value)}`);
  }
  if (n < BigInt(0)) throw new Error(`${name}: expected a non-negative integer (uint256), got ${JSON.stringify(value)}`);
  return n;
}

/** Wei amount from bigint | decimal-wei-string | number. Never negative. */
export function reqWei(value: unknown, name: string): bigint {
  const n = reqUint(value, name);
  return n;
}

/** Non-empty string (titles, names, URIs, tx ids). */
export function reqNonEmptyString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${name}: expected a non-empty string, got ${JSON.stringify(value)}`);
  }
  return value;
}

/** bytes4 hex string, e.g. an ERC-165 interface id. */
export function reqBytes4(value: unknown, name: string): string {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{8}$/.test(value)) {
    throw new Error(`${name}: expected a bytes4 hex string (0x + 8 hex chars), got ${JSON.stringify(value)}`);
  }
  return value;
}

/** bytes32 hex string. */
export function reqBytes32(value: unknown, name: string): string {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`${name}: expected a bytes32 hex string (0x + 64 hex chars), got ${JSON.stringify(value)}`);
  }
  return value;
}

/** Boolean. */
export function reqBool(value: unknown, name: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`${name}: expected a boolean, got ${JSON.stringify(value)}`);
  }
  return value;
}

/** Bytes payload (hex string or Uint8Array) for safeTransferFrom data. */
export function reqBytes(value: unknown, name: string): string | Uint8Array {
  if (typeof value === 'string') {
    if (!/^0x([0-9a-fA-F]{2})*$/.test(value)) {
      throw new Error(`${name}: expected a 0x-prefixed hex string, got ${JSON.stringify(value)}`);
    }
    return value;
  }
  if (value instanceof Uint8Array) return value;
  throw new Error(`${name}: expected a hex string or Uint8Array, got ${JSON.stringify(value)}`);
}

/**
 * Convert a human ETH/token amount ("1.5") to wei. Accepts bigint passthrough
 * (already wei). Throws on malformed input.
 */
export function ethToWei(amount: string | bigint): bigint {
  if (typeof amount === 'bigint') {
    if (amount < BigInt(0)) throw new Error(`ethToWei: amount must be non-negative, got ${amount}`);
    return amount;
  }
  if (typeof amount !== 'string' || !/^\d+(\.\d+)?$/.test(amount)) {
    throw new Error(`ethToWei: expected a decimal amount string like "1.5", got ${JSON.stringify(amount)}`);
  }
  return parseEther(amount);
}
