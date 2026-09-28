/**
 * @decentralflix/storage — public API.
 *
 * Encrypted-fragment storage layer for Decentralflix (Phase 2):
 * fragments of a film are AES-256-GCM encrypted, stored on IPFS
 * (mirrored to Filecoin at the infrastructure layer), and anchored by a
 * permanent manifest on Arweave. See PINNING.md and LIMITATIONS.md.
 */

export { splitBuffer, joinFragments, DEFAULT_FRAGMENT_SIZE } from './fragment.js';

export {
  generateKey,
  validateKey,
  encryptFragment,
  decryptFragment,
  serializeEncrypted,
  deserializeEncrypted,
  ALGORITHM,
  KEY_BYTES,
  IV_BYTES,
  AUTH_TAG_BYTES,
} from './encrypt.js';

export { sha256Hex, buildManifest, validateManifest, MANIFEST_VERSION } from './hash.js';

export { IpfsClient, DEFAULT_IPFS_ENDPOINT } from './ipfs.js';

export {
  ArweaveClient,
  DEFAULT_ARWEAVE_GATEWAY,
  MAX_ARWEAVE_PAYLOAD_BYTES,
} from './arweave.js';

export { storeFilm, retrieveFilm, withRetry } from './store.js';

export {
  StorageError,
  ValidationError,
  IpfsError,
  ArweaveError,
  PayloadTooLargeError,
  TamperError,
} from './errors.js';
