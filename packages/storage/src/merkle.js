/**
 * @decentralflix/storage — Merkle trees over fragment hashes.
 *
 * A film's fragment manifest is anchored on-chain (see
 * `packages/contracts/contracts/ProofRegistry.sol`) as the Merkle root of the
 * per-fragment sha256 leaf hashes. This module builds those trees and the
 * inclusion proofs that `verifyFragment` checks.
 *
 * TREE CONVENTION (mirrored byte-for-byte by ProofRegistry._processProof):
 * - Leaves are the 32 raw bytes of each fragment's sha256 hex digest
 *   (as produced by `sha256Hex` in hash.js).
 * - Internal node = sha256(left || right), order-preserving (NOT sorted).
 * - Odd layers duplicate the last node before pairing.
 * - A single leaf is its own root (empty proof).
 *
 * Note: this is deliberately NOT OpenZeppelin's MerkleProof convention —
 * OZ hardcodes keccak256 for internal hashing, while the storage layer
 * standardizes on sha256 end-to-end. See ProofRegistry's NatSpec.
 */

import { createHash } from 'node:crypto';
import { ValidationError } from './errors.js';

const LEAF_HASH_RE = /^[0-9a-f]{64}$/;

/**
 * Validate an array of leaf hashes.
 * @param {string[]} leafHashes
 * @throws {ValidationError} on empty/non-array input or malformed hashes
 */
function validateLeafHashes(leafHashes) {
  if (!Array.isArray(leafHashes) || leafHashes.length === 0) {
    throw new ValidationError('merkle: leafHashes must be a non-empty array');
  }
  for (let i = 0; i < leafHashes.length; i++) {
    const h = leafHashes[i];
    if (typeof h !== 'string' || !LEAF_HASH_RE.test(h)) {
      throw new ValidationError(
        `merkle: leaf hash at index ${i} must be a 64-char lowercase hex sha256 digest`,
      );
    }
  }
}

/**
 * Validate a Merkle proof array.
 * @param {string[]} proof
 * @throws {ValidationError}
 */
function validateProof(proof) {
  if (!Array.isArray(proof)) {
    throw new ValidationError('merkle: proof must be an array');
  }
  for (let i = 0; i < proof.length; i++) {
    const h = proof[i];
    if (typeof h !== 'string' || !LEAF_HASH_RE.test(h)) {
      throw new ValidationError(
        `merkle: proof element at index ${i} must be a 64-char lowercase hex sha256 digest`,
      );
    }
  }
}

/**
 * sha256(left || right) over raw digest bytes.
 * @param {string} leftHex 64-char hex digest
 * @param {string} rightHex 64-char hex digest
 * @returns {string} 64-char hex digest
 */
function hashPair(leftHex, rightHex) {
  return createHash('sha256')
    .update(Buffer.concat([Buffer.from(leftHex, 'hex'), Buffer.from(rightHex, 'hex')]))
    .digest('hex');
}

/**
 * Build all tree levels; levels[0] = leaves, levels[last] = [root].
 * @param {string[]} leafHashes
 * @returns {string[][]}
 */
function buildLevels(leafHashes) {
  const levels = [[...leafHashes]];
  while (levels[levels.length - 1].length > 1) {
    const prev = levels[levels.length - 1];
    const next = [];
    for (let i = 0; i < prev.length; i += 2) {
      const left = prev[i];
      const right = i + 1 < prev.length ? prev[i + 1] : prev[i]; // duplicate last if odd
      next.push(hashPair(left, right));
    }
    levels.push(next);
  }
  return levels;
}

/**
 * Build the Merkle root over fragment sha256 leaf hashes.
 * @param {string[]} leafHashes - non-empty array of 64-char hex sha256 digests, in fragment order
 * @returns {string} 64-char hex root
 * @throws {ValidationError} on invalid input
 */
export function buildMerkleRoot(leafHashes) {
  validateLeafHashes(leafHashes);
  const levels = buildLevels(leafHashes);
  return levels[levels.length - 1][0];
}

/**
 * Build the inclusion proof for one leaf: sibling hashes from leaf to root.
 * @param {string[]} leafHashes - same array passed to buildMerkleRoot
 * @param {number} index - 0-based leaf index
 * @returns {string[]} sibling hashes, leaf-level first; length = ceil(log2(n))
 * @throws {ValidationError} on invalid input or out-of-range index
 */
export function getProof(leafHashes, index) {
  validateLeafHashes(leafHashes);
  if (!Number.isInteger(index) || index < 0 || index >= leafHashes.length) {
    throw new ValidationError(
      `merkle: index must be an integer in [0, ${leafHashes.length - 1}]`,
    );
  }
  const levels = buildLevels(leafHashes);
  const proof = [];
  let idx = index;
  for (let level = 0; level < levels.length - 1; level++) {
    const nodes = levels[level];
    // Even index: sibling is the right neighbor (or ourselves when duplicated at an odd tail).
    // Odd index: sibling is the left neighbor.
    const siblingIdx = idx % 2 === 0 ? (idx + 1 < nodes.length ? idx + 1 : idx) : idx - 1;
    proof.push(nodes[siblingIdx]);
    idx = Math.floor(idx / 2);
  }
  return proof;
}

/**
 * Verify an inclusion proof against a root (pure JS; mirrors
 * ProofRegistry._processProof for the on-chain check).
 * @param {string} root - 64-char hex Merkle root
 * @param {string} leafHash - 64-char hex leaf digest
 * @param {number} index - 0-based leaf index the proof was built for
 * @param {string[]} proof - sibling hashes from getProof
 * @returns {boolean} true iff the proof recomputes to root
 * @throws {ValidationError} on malformed inputs
 */
export function verifyMerkleProof(root, leafHash, index, proof) {
  if (typeof root !== 'string' || !LEAF_HASH_RE.test(root)) {
    throw new ValidationError('merkle: root must be a 64-char lowercase hex digest');
  }
  if (typeof leafHash !== 'string' || !LEAF_HASH_RE.test(leafHash)) {
    throw new ValidationError('merkle: leafHash must be a 64-char lowercase hex digest');
  }
  if (!Number.isInteger(index) || index < 0) {
    throw new ValidationError('merkle: index must be a non-negative integer');
  }
  validateProof(proof);
  let computed = leafHash;
  let idx = index;
  for (const sibling of proof) {
    computed = idx % 2 === 0 ? hashPair(computed, sibling) : hashPair(sibling, computed);
    idx = Math.floor(idx / 2);
  }
  return computed === root;
}
