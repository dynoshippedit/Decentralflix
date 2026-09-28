/**
 * @decentralflix/storage — content hashing and manifests.
 *
 * The manifest is the tamper-evidence anchor for a film: one sha256 per
 * encrypted fragment plus the IPFS CIDs. retrieveFilm() verifies every
 * fragment against this manifest and throws TamperError on any mismatch,
 * before decryption. The manifest itself is posted to Arweave (permanent).
 */

import { createHash } from 'node:crypto';
import { ValidationError } from './errors.js';

/** Manifest schema version. */
export const MANIFEST_VERSION = 1;

/**
 * sha256 of bytes, hex-encoded.
 * @param {Buffer|string} data
 * @returns {string} 64-char lowercase hex digest
 */
export function sha256Hex(data) {
  if (!Buffer.isBuffer(data) && typeof data !== 'string') {
    throw new ValidationError('sha256Hex: data must be a Buffer or string');
  }
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Build a JSON-serializable film manifest.
 *
 * @param {string} filmId - stable, non-empty film identifier
 * @param {Array<{index:number, hash:string, size:number}>} fragmentInfos -
 *   per-fragment info; `hash` must be a sha256 hex digest of the stored
 *   (encrypted, wire-format) fragment bytes
 * @param {object} [extra]
 * @param {number} [extra.fragmentSize] - bytes per fragment used at store time
 * @param {string[]} [extra.fragmentCids] - IPFS CIDs parallel to fragmentHashes
 * @param {string|null} [extra.arweaveManifestTx] - Arweave tx id of this manifest
 * @param {string[]} [extra.arweaveFragmentTxs] - per-fragment Arweave tx ids
 *   (only when fragments were mirrored to Arweave; see store.js)
 * @returns {object} JSON-serializable manifest
 * @throws {ValidationError} on invalid inputs
 */
export function buildManifest(filmId, fragmentInfos, extra = {}) {
  if (typeof filmId !== 'string' || filmId.length === 0) {
    throw new ValidationError('buildManifest: filmId must be a non-empty string');
  }
  if (!Array.isArray(fragmentInfos) || fragmentInfos.length === 0) {
    throw new ValidationError('buildManifest: fragmentInfos must be a non-empty array');
  }
  const sorted = [...fragmentInfos].sort((a, b) => a.index - b.index);
  for (let i = 0; i < sorted.length; i++) {
    const f = sorted[i];
    if (!f || typeof f !== 'object' || f.index !== i) {
      throw new ValidationError(`buildManifest: fragment indexes must be contiguous 0..${sorted.length - 1}`);
    }
    if (typeof f.hash !== 'string' || !/^[0-9a-f]{64}$/.test(f.hash)) {
      throw new ValidationError(`buildManifest: fragment ${i} hash must be a 64-char hex sha256 digest`);
    }
    if (!Number.isInteger(f.size) || f.size <= 0) {
      throw new ValidationError(`buildManifest: fragment ${i} size must be a positive integer`);
    }
  }
  const {
    fragmentSize = null,
    fragmentCids = [],
    arweaveManifestTx = null,
    arweaveFragmentTxs = [],
  } = extra ?? {};
  return {
    filmId,
    version: MANIFEST_VERSION,
    fragmentCount: sorted.length,
    fragmentHashes: sorted.map((f) => ({ index: f.index, hash: f.hash, size: f.size })),
    createdAt: new Date().toISOString(),
    encryption: {
      algorithm: 'aes-256-gcm',
      fragmentSize,
    },
    fragmentCids: Array.isArray(fragmentCids) ? [...fragmentCids] : [],
    arweaveManifestTx,
    arweaveFragmentTxs: Array.isArray(arweaveFragmentTxs) ? [...arweaveFragmentTxs] : [],
  };
}

/** Structural validation of a manifest before retrieval. @throws {ValidationError} */
export function validateManifest(manifest) {
  if (!manifest || typeof manifest !== 'object') {
    throw new ValidationError('validateManifest: manifest must be an object');
  }
  if (manifest.version !== MANIFEST_VERSION) {
    throw new ValidationError(
      `validateManifest: unsupported manifest version ${manifest.version} (expected ${MANIFEST_VERSION})`,
    );
  }
  if (!Array.isArray(manifest.fragmentHashes) || manifest.fragmentHashes.length === 0) {
    throw new ValidationError('validateManifest: manifest.fragmentHashes must be a non-empty array');
  }
  if (!Array.isArray(manifest.fragmentCids) || manifest.fragmentCids.length !== manifest.fragmentHashes.length) {
    throw new ValidationError('validateManifest: manifest.fragmentCids must parallel fragmentHashes');
  }
  return manifest;
}
