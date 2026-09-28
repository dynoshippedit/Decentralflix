import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as storage from '../src/index.js';

describe('index: public exports', () => {
  it('exports the documented public API surface', () => {
    const expected = [
      // fragment
      'splitBuffer', 'joinFragments', 'DEFAULT_FRAGMENT_SIZE',
      // encrypt
      'generateKey', 'validateKey', 'encryptFragment', 'decryptFragment',
      'serializeEncrypted', 'deserializeEncrypted',
      'ALGORITHM', 'KEY_BYTES', 'IV_BYTES', 'AUTH_TAG_BYTES',
      // hash
      'sha256Hex', 'buildManifest', 'validateManifest', 'MANIFEST_VERSION',
      // ipfs
      'IpfsClient', 'DEFAULT_IPFS_ENDPOINT',
      // arweave
      'ArweaveClient', 'DEFAULT_ARWEAVE_GATEWAY', 'MAX_ARWEAVE_PAYLOAD_BYTES',
      // store
      'storeFilm', 'retrieveFilm', 'withRetry',
      // errors
      'StorageError', 'ValidationError', 'IpfsError', 'ArweaveError',
      'PayloadTooLargeError', 'TamperError',
    ];
    for (const name of expected) {
      assert.ok(name in storage, `missing export: ${name}`);
    }
  });

  it('error classes form a proper hierarchy', () => {
    for (const cls of [
      storage.ValidationError, storage.IpfsError, storage.ArweaveError,
      storage.PayloadTooLargeError, storage.TamperError,
    ]) {
      assert.ok(new cls('x') instanceof storage.StorageError);
      assert.ok(new cls('x') instanceof Error);
    }
  });
});
