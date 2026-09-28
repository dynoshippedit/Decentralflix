/**
 * @decentralflix/storage — high-level store / retrieve API.
 *
 * storeFilm(buffer, opts):
 *   1. splits the buffer into fragments
 *   2. encrypts each fragment (AES-256-GCM, fresh IV per fragment)
 *   3. uploads each encrypted fragment to IPFS and pins it (local Kubo)
 *   4. builds the tamper-evidence manifest (sha256 per fragment)
 *   5. optionally posts the manifest JSON to Arweave (permanent)
 *   6. optionally mirrors encrypted fragments to Arweave (OFF by default —
 *      Arweave is for manifests/proofs; fragments belong on IPFS/Filecoin)
 *
 * retrieveFilm(manifest, opts):
 *   per fragment: try IPFS (with retries) → fall back to Arweave if the
 *   fragment was mirrored there → verify sha256 against the manifest
 *   (TamperError on mismatch, before decryption) → decrypt → join.
 */

import { DEFAULT_FRAGMENT_SIZE, splitBuffer, joinFragments } from './fragment.js';
import {
  generateKey,
  validateKey,
  encryptFragment,
  decryptFragment,
  serializeEncrypted,
  deserializeEncrypted,
} from './encrypt.js';
import { sha256Hex, buildManifest, validateManifest } from './hash.js';
import { IpfsClient, DEFAULT_IPFS_ENDPOINT } from './ipfs.js';
import { ArweaveClient, DEFAULT_ARWEAVE_GATEWAY, MAX_ARWEAVE_PAYLOAD_BYTES } from './arweave.js';
import { AUTH_TAG_BYTES, IV_BYTES } from './encrypt.js';
import { StorageError, TamperError, ValidationError } from './errors.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Retry helper with exponential backoff.
 *
 * @param {(attempt:number) => Promise<T>} fn
 * @param {object} [opts]
 * @param {number} [opts.maxAttempts=3]
 * @param {number} [opts.baseDelayMs=100] - doubled each attempt
 * @param {(err:Error) => boolean} [opts.retryIf] - return false to fail fast
 *   (e.g. don't retry a 404)
 * @returns {Promise<T>} last error rethrown after attempts are exhausted
 */
export async function withRetry(fn, { maxAttempts = 3, baseDelayMs = 100, retryIf = () => true } = {}) {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new ValidationError('withRetry: maxAttempts must be a positive integer');
  }
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts && retryIf(err)) {
        await sleep(baseDelayMs * 2 ** (attempt - 1));
      } else {
        break;
      }
    }
  }
  throw lastErr;
}

/**
 * Store a film's bytes as encrypted fragments.
 *
 * @param {Buffer} buffer - film bytes (must be non-empty)
 * @param {object} [opts]
 * @param {Buffer} [opts.key] - 32-byte encryption key; generated if omitted
 *   (the caller MUST persist it — the key is returned, never stored)
 * @param {string} [opts.filmId] - stable film id; defaults to film-<sha256 prefix>
 * @param {number} [opts.fragmentSize] - bytes per fragment (default 1 MiB)
 * @param {string} [opts.ipfsEndpoint] - Kubo API (default http://127.0.0.1:5001)
 * @param {number} [opts.ipfsTimeoutMs]
 * @param {boolean} [opts.pin=true] - pin each fragment on the local Kubo node
 * @param {string} [opts.arweaveGateway] - if set (with signTx), post the
 *   manifest JSON to Arweave
 * @param {number} [opts.arweaveTimeoutMs]
 * @param {(unsignedTx:object) => Promise<object>} [opts.signTx] -
 *   caller-provided wallet signer (see arweave.js)
 * @param {boolean} [opts.mirrorFragmentsToArweave=false] - ALSO post each
 *   encrypted fragment to Arweave and record tx ids in the manifest so
 *   retrieveFilm() can fall back to Arweave per fragment. OFF by default:
 *   Arweave is for manifests/proofs; this exists for the "IPFS down"
 *   survival path and costs AR per byte. Never stores raw video.
 * @returns {Promise<{key:Buffer, manifest:object, fragmentCids:string[], manifestArweaveTx:string|null}>}
 */
export async function storeFilm(
  buffer,
  {
    key,
    filmId,
    fragmentSize = DEFAULT_FRAGMENT_SIZE,
    ipfsEndpoint = DEFAULT_IPFS_ENDPOINT,
    ipfsTimeoutMs,
    pin = true,
    arweaveGateway,
    arweaveTimeoutMs,
    signTx = null,
    mirrorFragmentsToArweave = false,
  } = {},
) {
  if (!Buffer.isBuffer(buffer)) {
    throw new ValidationError('storeFilm: buffer must be a Buffer');
  }
  const theKey = key ?? generateKey();
  validateKey(theKey);
  const id = filmId ?? `film-${sha256Hex(buffer).slice(0, 16)}`;
  if (typeof id !== 'string' || id.length === 0) {
    throw new ValidationError('storeFilm: filmId must be a non-empty string');
  }

  if (mirrorFragmentsToArweave && fragmentSize + IV_BYTES + AUTH_TAG_BYTES > MAX_ARWEAVE_PAYLOAD_BYTES) {
    throw new ValidationError(
      `storeFilm: mirrorFragmentsToArweave requires fragmentSize <= ${
        MAX_ARWEAVE_PAYLOAD_BYTES - IV_BYTES - AUTH_TAG_BYTES
      } bytes (so the encrypted wire format still fits the 1 MiB Arweave payload cap)`,
    );
  }

  const fragments = splitBuffer(buffer, fragmentSize);
  const ipfs = new IpfsClient({ endpoint: ipfsEndpoint, ...(ipfsTimeoutMs !== undefined ? { timeoutMs: ipfsTimeoutMs } : {}) });

  const stored = [];
  for (const { index, data } of fragments) {
    const wire = serializeEncrypted(encryptFragment(data, theKey));
    const { cid } = await withRetry(() => ipfs.add(wire), {
      retryIf: (err) => err.status !== 404, // 404 on add is a config error — fail fast
    });
    if (pin) {
      await withRetry(() => ipfs.pin(cid));
    }
    stored.push({ index, hash: sha256Hex(wire), size: wire.length, cid, wire });
  }

  const arweaveFragmentTxs = new Array(stored.length).fill(null);
  let arweaveClient = null;
  if (arweaveGateway !== undefined || signTx !== null) {
    arweaveClient = new ArweaveClient({
      gateway: arweaveGateway ?? DEFAULT_ARWEAVE_GATEWAY,
      ...(arweaveTimeoutMs !== undefined ? { timeoutMs: arweaveTimeoutMs } : {}),
      signTx,
    });
  }
  if (mirrorFragmentsToArweave) {
    if (!arweaveClient) {
      throw new ValidationError('storeFilm: mirrorFragmentsToArweave requires arweaveGateway and signTx');
    }
    for (const s of stored) {
      // Encrypted fragment bytes only — never raw video. The 1 MiB
      // ArweaveClient cap is enforced inside postData().
      const { id: txId } = await withRetry(() =>
        arweaveClient.postData(s.wire, { contentType: 'application/octet-stream' }),
      );
      arweaveFragmentTxs[s.index] = txId;
    }
  }

  const manifest = buildManifest(
    id,
    stored.map((s) => ({ index: s.index, hash: s.hash, size: s.size })),
    {
      fragmentSize,
      fragmentCids: stored.map((s) => s.cid),
      arweaveFragmentTxs,
    },
  );

  let manifestArweaveTx = null;
  if (arweaveClient) {
    const { id: txId } = await withRetry(() =>
      arweaveClient.postData(JSON.stringify(manifest), { contentType: 'application/json' }),
    );
    manifestArweaveTx = txId;
    manifest.arweaveManifestTx = txId;
  }

  return {
    key: theKey,
    manifest,
    fragmentCids: stored.map((s) => s.cid),
    manifestArweaveTx,
  };
}

/**
 * Retrieve a film from its manifest.
 *
 * Per fragment: IPFS first (retries with exponential backoff), Arweave
 * fallback when the fragment was mirrored there, sha256 verification
 * against the manifest (TamperError on mismatch — thrown before
 * decryption), then decrypt and rejoin in order.
 *
 * @param {object} manifest - as produced by storeFilm() / buildManifest()
 * @param {object} opts
 * @param {Buffer} opts.key - 32-byte decryption key
 * @param {string} [opts.ipfsEndpoint]
 * @param {number} [opts.ipfsTimeoutMs]
 * @param {string} [opts.arweaveGateway]
 * @param {number} [opts.arweaveTimeoutMs]
 * @returns {Promise<Buffer>} the original bytes
 * @throws {TamperError} if any fragment fails hash verification
 * @throws {StorageError} if a fragment is unavailable from every source
 */
export async function retrieveFilm(
  manifest,
  {
    key,
    ipfsEndpoint = DEFAULT_IPFS_ENDPOINT,
    ipfsTimeoutMs,
    arweaveGateway = DEFAULT_ARWEAVE_GATEWAY,
    arweaveTimeoutMs,
  } = {},
) {
  validateManifest(manifest);
  if (key === undefined) {
    throw new ValidationError('retrieveFilm: key is required');
  }
  validateKey(key);

  const ipfs = new IpfsClient({ endpoint: ipfsEndpoint, ...(ipfsTimeoutMs !== undefined ? { timeoutMs: ipfsTimeoutMs } : {}) });
  const needsArweave = (manifest.arweaveFragmentTxs ?? []).some((tx) => tx);
  const arweave = needsArweave
    ? new ArweaveClient({ gateway: arweaveGateway, ...(arweaveTimeoutMs !== undefined ? { timeoutMs: arweaveTimeoutMs } : {}) })
    : null;

  const decrypted = [];
  for (const fh of manifest.fragmentHashes) {
    const cid = manifest.fragmentCids[fh.index];
    let wire = null;
    let ipfsErr = null;
    try {
      wire = await withRetry(() => ipfs.cat(cid), {
        retryIf: (err) => err.status !== 404, // missing on this node — go straight to fallback
      });
    } catch (err) {
      ipfsErr = err;
    }
    if (wire === null) {
      const txId = manifest.arweaveFragmentTxs?.[fh.index];
      if (!txId || !arweave) {
        throw new StorageError(
          `fragment ${fh.index}: unavailable on IPFS${ipfsErr ? ` (${ipfsErr.message})` : ''} and no Arweave fallback is recorded in the manifest`,
          { code: 'FRAGMENT_UNAVAILABLE', cause: ipfsErr ?? undefined },
        );
      }
      wire = await withRetry(() => arweave.getData(txId));
    }
    const actual = sha256Hex(wire);
    if (actual !== fh.hash) {
      throw new TamperError(
        `fragment ${fh.index}: sha256 mismatch — expected ${fh.hash}, got ${actual}`,
        { fragmentIndex: fh.index, expected: fh.hash, actual },
      );
    }
    decrypted.push({ index: fh.index, data: decryptFragment(deserializeEncrypted(wire), key) });
  }
  return joinFragments(decrypted);
}
