/**
 * @decentralflix/storage — fragmenting.
 *
 * Splits a Buffer into fixed-size fragments for independent encrypted
 * storage on IPFS/Filecoin, and reassembles them on retrieval.
 */

import { ValidationError } from './errors.js';

/** Default fragment size: 1 MiB. */
export const DEFAULT_FRAGMENT_SIZE = 1024 * 1024;

/**
 * Split a Buffer into fixed-size fragments.
 *
 * @param {Buffer} buffer - the input bytes (must be non-empty)
 * @param {number} [fragmentSize=DEFAULT_FRAGMENT_SIZE] - bytes per fragment
 * @returns {Array<{index:number, data:Buffer}>} fragments in order, index 0..n-1
 * @throws {ValidationError} on empty/non-Buffer input or bad fragmentSize
 */
export function splitBuffer(buffer, fragmentSize = DEFAULT_FRAGMENT_SIZE) {
  if (!Buffer.isBuffer(buffer)) {
    throw new ValidationError('splitBuffer: buffer must be a Node.js Buffer');
  }
  if (buffer.length === 0) {
    throw new ValidationError('splitBuffer: buffer must not be empty');
  }
  if (!Number.isInteger(fragmentSize) || fragmentSize <= 0) {
    throw new ValidationError('splitBuffer: fragmentSize must be a positive integer');
  }
  const fragments = [];
  let index = 0;
  for (let offset = 0; offset < buffer.length; offset += fragmentSize, index++) {
    fragments.push({
      index,
      data: buffer.subarray(offset, Math.min(offset + fragmentSize, buffer.length)),
    });
  }
  return fragments;
}

/**
 * Reassemble fragments into the original Buffer.
 *
 * Accepts fragments in any order but requires them to be exactly
 * contiguous (indexes 0..n-1); gaps fail closed instead of producing
 * a silently corrupt stream.
 *
 * @param {Array<{index:number, data:Buffer}>} fragments
 * @returns {Buffer}
 * @throws {ValidationError} on empty/non-array input, non-contiguous indexes, or non-Buffer data
 */
export function joinFragments(fragments) {
  if (!Array.isArray(fragments) || fragments.length === 0) {
    throw new ValidationError('joinFragments: fragments must be a non-empty array');
  }
  const sorted = [...fragments].sort((a, b) => a.index - b.index);
  for (let i = 0; i < sorted.length; i++) {
    const f = sorted[i];
    if (!f || typeof f !== 'object' || f.index !== i) {
      throw new ValidationError(
        `joinFragments: fragment indexes must be exactly contiguous 0..${sorted.length - 1} (missing index ${i})`,
      );
    }
    if (!Buffer.isBuffer(f.data)) {
      throw new ValidationError(`joinFragments: fragment ${i} data must be a Buffer`);
    }
  }
  return Buffer.concat(sorted.map((f) => f.data));
}
