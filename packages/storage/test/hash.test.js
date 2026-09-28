import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { sha256Hex, buildManifest, validateManifest, MANIFEST_VERSION } from '../src/hash.js';
import { ValidationError } from '../src/errors.js';

describe('hash: sha256Hex', () => {
  it('is deterministic and 64-char hex', () => {
    const d = randomBytes(4096);
    assert.equal(sha256Hex(d), sha256Hex(d));
    assert.match(sha256Hex(d), /^[0-9a-f]{64}$/);
  });

  it('matches the well-known test vector for "abc"', () => {
    assert.equal(
      sha256Hex('abc'),
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('distinguishes different inputs', () => {
    assert.notEqual(sha256Hex('a'), sha256Hex('b'));
  });

  it('rejects non-Buffer/string input', () => {
    assert.throws(() => sha256Hex(123), ValidationError);
    assert.throws(() => sha256Hex(null), ValidationError);
  });
});

describe('hash: buildManifest', () => {
  const infos = [
    { index: 1, hash: sha256Hex('frag1'), size: 100 },
    { index: 0, hash: sha256Hex('frag0'), size: 200 },
  ];

  it('builds a JSON-serializable, sorted manifest', () => {
    const m = buildManifest('film-123', infos, {
      fragmentSize: 1024,
      fragmentCids: ['cid0', 'cid1'],
    });
    assert.equal(m.filmId, 'film-123');
    assert.equal(m.version, MANIFEST_VERSION);
    assert.equal(m.fragmentCount, 2);
    assert.deepEqual(m.fragmentHashes.map((f) => f.index), [0, 1]);
    assert.deepEqual(m.fragmentCids, ['cid0', 'cid1']);
    assert.equal(m.encryption.algorithm, 'aes-256-gcm');
    assert.equal(m.encryption.fragmentSize, 1024);
    assert.ok(!Number.isNaN(Date.parse(m.createdAt)));
    // JSON round-trip preserves everything
    assert.deepEqual(JSON.parse(JSON.stringify(m)), m);
  });

  it('records Arweave tx ids when provided', () => {
    const m = buildManifest('f', [{ index: 0, hash: sha256Hex('x'), size: 5 }], {
      arweaveManifestTx: 'txid-1',
      arweaveFragmentTxs: ['txid-0'],
    });
    assert.equal(m.arweaveManifestTx, 'txid-1');
    assert.deepEqual(m.arweaveFragmentTxs, ['txid-0']);
  });

  it('validates inputs', () => {
    assert.throws(() => buildManifest('', infos), ValidationError);
    assert.throws(() => buildManifest('f', []), ValidationError);
    assert.throws(
      () => buildManifest('f', [{ index: 0, hash: 'not-a-hash', size: 1 }]),
      ValidationError,
    );
    assert.throws(
      () => buildManifest('f', [{ index: 0, hash: sha256Hex('x'), size: 0 }]),
      ValidationError,
    );
    // non-contiguous indexes
    assert.throws(
      () =>
        buildManifest('f', [
          { index: 0, hash: sha256Hex('a'), size: 1 },
          { index: 2, hash: sha256Hex('b'), size: 1 },
        ]),
      ValidationError,
    );
  });
});

describe('hash: validateManifest', () => {
  it('accepts a well-formed manifest and rejects broken ones', () => {
    const good = buildManifest('f', [{ index: 0, hash: sha256Hex('x'), size: 9 }], {
      fragmentCids: ['cid0'],
    });
    validateManifest(good);
    assert.throws(() => validateManifest(null), ValidationError);
    assert.throws(() => validateManifest({ ...good, version: 999 }), ValidationError);
    assert.throws(() => validateManifest({ ...good, fragmentHashes: [] }), ValidationError);
    assert.throws(() => validateManifest({ ...good, fragmentCids: [] }), ValidationError);
  });
});
