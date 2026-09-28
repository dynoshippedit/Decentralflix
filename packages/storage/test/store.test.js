import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { storeFilm, retrieveFilm, withRetry } from '../src/store.js';
import { generateKey } from '../src/encrypt.js';
import { sha256Hex } from '../src/hash.js';
import { StorageError, TamperError, ValidationError } from '../src/errors.js';
import { startMockKubo, startMockArweave, testSignTx } from './helpers/mock-servers.js';

describe('store: storeFilm / retrieveFilm against mock services', () => {
  let kubo;
  let arweave;
  before(async () => {
    kubo = await startMockKubo();
    arweave = await startMockArweave();
  });
  after(async () => {
    await kubo.close();
    await arweave.close();
  });

  const base = () => ({ ipfsEndpoint: kubo.url, arweaveGateway: arweave.url, signTx: testSignTx });

  it('round-trips bytes with manifest posted to Arweave', async () => {
    const film = randomBytes(2_600_000);
    const key = generateKey();
    const { manifest, fragmentCids, manifestArweaveTx, key: returnedKey } = await storeFilm(film, {
      ...base(),
      key,
      filmId: 'film-roundtrip-1',
    });
    assert.equal(manifest.fragmentCount, 3);
    assert.equal(fragmentCids.length, 3);
    assert.match(manifestArweaveTx, /^testtx-/);
    assert.equal(manifest.arweaveManifestTx, manifestArweaveTx);
    assert.ok(returnedKey.equals(key));
    assert.ok(arweave.txs.has(manifestArweaveTx));
    // manifest content on Arweave matches what storeFilm returned
    const posted = JSON.parse((await arweave.txs.get(manifestArweaveTx).data).toString('utf8'));
    assert.equal(posted.filmId, 'film-roundtrip-1');

    const back = await retrieveFilm(manifest, { key, ...base() });
    assert.ok(back.equals(film));
  });

  it('works without Arweave at all (IPFS only)', async () => {
    const film = randomBytes(1_200_000);
    const key = generateKey();
    const { manifest, manifestArweaveTx } = await storeFilm(film, { ipfsEndpoint: kubo.url, key });
    assert.equal(manifestArweaveTx, null);
    const back = await retrieveFilm(manifest, { key, ipfsEndpoint: kubo.url });
    assert.ok(back.equals(film));
  });

  it('generates a key when none is provided', async () => {
    const film = randomBytes(10_000);
    const { key, manifest } = await storeFilm(film, { ipfsEndpoint: kubo.url });
    assert.equal(key.length, 32);
    const back = await retrieveFilm(manifest, { key, ipfsEndpoint: kubo.url });
    assert.ok(back.equals(film));
  });

  it('pins every fragment on the local Kubo node', async () => {
    const film = randomBytes(2_100_000);
    const { fragmentCids } = await storeFilm(film, { ipfsEndpoint: kubo.url, key: generateKey() });
    for (const cid of fragmentCids) {
      assert.ok(kubo.pinned.has(cid), `expected ${cid} to be pinned`);
    }
  });

  it('manifest hashes are sha256 of the stored (encrypted) fragment bytes', async () => {
    const film = randomBytes(1_500_000);
    const { manifest, fragmentCids } = await storeFilm(film, { ipfsEndpoint: kubo.url, key: generateKey() });
    manifest.fragmentHashes.forEach((fh, i) => {
      assert.equal(fh.hash, sha256Hex(kubo.store.get(fragmentCids[i])));
    });
  });

  it('detects tampering: corrupted fragment -> TamperError with fragmentIndex', async () => {
    const film = randomBytes(2_200_000);
    const key = generateKey();
    const { manifest, fragmentCids } = await storeFilm(film, { ipfsEndpoint: kubo.url, key });
    kubo.corrupt(fragmentCids[1]); // tamper with the middle fragment in "storage"
    await assert.rejects(() => retrieveFilm(manifest, { key, ipfsEndpoint: kubo.url }), (err) => {
      assert.ok(err instanceof TamperError);
      assert.equal(err.fragmentIndex, 1);
      assert.match(err.message, /sha256 mismatch/i);
      return true;
    });
  });

  it('falls back to Arweave for fragments missing on IPFS', async () => {
    const film = randomBytes(2_200_000);
    const key = generateKey();
    const { manifest, fragmentCids } = await storeFilm(film, {
      ...base(),
      key,
      fragmentSize: 512 * 1024, // wire format (iv+tag+ciphertext) must fit the 1 MiB Arweave cap
      mirrorFragmentsToArweave: true,
      filmId: 'film-fallback-1',
    });
    assert.equal(manifest.arweaveFragmentTxs.filter(Boolean).length, 5);
    // Simulate IPFS losing the middle fragment
    kubo.remove(fragmentCids[1]);
    const back = await retrieveFilm(manifest, { key, ...base() });
    assert.ok(back.equals(film));
  });

  it('throws FRAGMENT_UNAVAILABLE when IPFS lacks a fragment and no fallback exists', async () => {
    const film = randomBytes(2_200_000);
    const key = generateKey();
    const { manifest, fragmentCids } = await storeFilm(film, { ipfsEndpoint: kubo.url, key });
    kubo.remove(fragmentCids[0]);
    await assert.rejects(() => retrieveFilm(manifest, { key, ipfsEndpoint: kubo.url }), (err) => {
      assert.ok(err instanceof StorageError);
      assert.equal(err.code, 'FRAGMENT_UNAVAILABLE');
      return true;
    });
  });

  it('wrong key fails at decryption', async () => {
    const film = randomBytes(1_100_000);
    const { manifest } = await storeFilm(film, { ipfsEndpoint: kubo.url, key: generateKey() });
    await assert.rejects(
      () => retrieveFilm(manifest, { key: generateKey(), ipfsEndpoint: kubo.url }),
      (err) => {
        assert.ok(err instanceof ValidationError);
        assert.match(err.message, /authentication failed/i);
        return true;
      },
    );
  });

  it('rejects an unreachable IPFS endpoint', async () => {
    const film = randomBytes(10_000);
    await assert.rejects(
      () => storeFilm(film, { ipfsEndpoint: 'http://127.0.0.1:9', ipfsTimeoutMs: 1500, key: generateKey() }),
      /IPFS/i,
    );
  });

  it('mirrorFragmentsToArweave rejects fragmentSize that would exceed the Arweave cap', async () => {
    await assert.rejects(
      () =>
        storeFilm(randomBytes(10_000), {
          ipfsEndpoint: kubo.url,
          arweaveGateway: arweave.url,
          signTx: testSignTx,
          mirrorFragmentsToArweave: true,
          fragmentSize: 1024 * 1024, // +28 bytes wire overhead > 1 MiB cap
        }),
      ValidationError,
    );
  });

  it('mirrorFragmentsToArweave without a signer is a validation error', async () => {
    await assert.rejects(
      () => storeFilm(randomBytes(10_000), { ipfsEndpoint: kubo.url, mirrorFragmentsToArweave: true }),
      ValidationError,
    );
  });
});

describe('store: withRetry', () => {
  it('returns on first success', async () => {
    assert.equal(await withRetry(async () => 42), 42);
  });

  it('retries transient failures and succeeds', async () => {
    let calls = 0;
    const v = await withRetry(
      async () => {
        calls++;
        if (calls < 3) throw new Error('flaky');
        return 'ok';
      },
      { baseDelayMs: 1 },
    );
    assert.equal(v, 'ok');
    assert.equal(calls, 3);
  });

  it('rethrows the last error after maxAttempts', async () => {
    let calls = 0;
    await assert.rejects(
      () =>
        withRetry(
          async () => {
            calls++;
            throw new Error(`boom-${calls}`);
          },
          { maxAttempts: 3, baseDelayMs: 1 },
        ),
      /boom-3/,
    );
    assert.equal(calls, 3);
  });

  it('retryIf can fail fast without retrying', async () => {
    let calls = 0;
    await assert.rejects(
      () =>
        withRetry(
          async () => {
            calls++;
            throw Object.assign(new Error('permanent'), { status: 404 });
          },
          { maxAttempts: 3, baseDelayMs: 1, retryIf: (e) => e.status !== 404 },
        ),
      /permanent/,
    );
    assert.equal(calls, 1);
  });
});
