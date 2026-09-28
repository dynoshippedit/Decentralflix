/**
 * @decentralflix/storage — Arweave gateway client.
 *
 * Purpose: permanent storage of MANIFESTS and PROOFS only — never video
 * bytes (repo convention, see docs/PHASE2_AUDIT.md). A hard 1 MiB per-tx
 * payload cap is enforced in code: oversize payloads throw
 * PayloadTooLargeError.
 *
 * WALLET SIGNING IS CALLER-PROVIDED. This package never holds or derives
 * private keys. Construct ArweaveClient with a `signTx` callback:
 *
 *   const client = new ArweaveClient({
 *     gateway: 'https://arweave.net',
 *     signTx: async (unsignedTx) => {
 *       // sign with the caller's wallet (e.g. arweave-js / arbundles /
 *       // a hardware wallet) and return the signed tx object
 *       // including `id` (base64url tx id) and `signature`.
 *       return signedTx;
 *     },
 *   });
 *
 * The transaction shape posted to POST /tx is the standard Arweave v2
 * JSON transaction. Reads use GET /tx/{id}/data.
 */

import { ArweaveError, PayloadTooLargeError, ValidationError } from './errors.js';

export const DEFAULT_ARWEAVE_GATEWAY = 'https://arweave.net';
export const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Hard cap for any single Arweave transaction payload handled by this
 * package: 1 MiB. Manifests and fragment-hash proofs are kilobytes.
 */
export const MAX_ARWEAVE_PAYLOAD_BYTES = 1024 * 1024;

export class ArweaveClient {
  /**
   * @param {object} [opts]
   * @param {string} [opts.gateway] - Arweave gateway base URL
   * @param {number} [opts.timeoutMs] - per-request timeout in ms
   * @param {(unsignedTx: object) => Promise<object>} [opts.signTx] -
   *   caller-provided wallet signer; must resolve to the signed tx
   *   object containing `id` and `signature`
   */
  constructor({ gateway = DEFAULT_ARWEAVE_GATEWAY, timeoutMs = DEFAULT_TIMEOUT_MS, signTx = null } = {}) {
    if (typeof gateway !== 'string' || gateway.length === 0) {
      throw new ValidationError('ArweaveClient: gateway must be a non-empty string');
    }
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new ValidationError('ArweaveClient: timeoutMs must be a positive number');
    }
    if (signTx !== null && typeof signTx !== 'function') {
      throw new ValidationError('ArweaveClient: signTx must be a function or null');
    }
    this.gateway = gateway.replace(/\/+$/, '');
    this.timeoutMs = timeoutMs;
    this.signTx = signTx;
  }

  async #fetchRaw(path, { method = 'GET', body = null, headers = {} } = {}) {
    const url = this.gateway + path;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort(new ArweaveError(`Arweave request timed out after ${this.timeoutMs}ms: ${path}`, {
        code: 'TIMEOUT',
      }));
    }, this.timeoutMs);
    let res;
    try {
      res = await fetch(url, { method, body, headers, signal: controller.signal });
    } catch (err) {
      if (err instanceof ArweaveError) throw err; // our own timeout abort
      throw new ArweaveError(`Arweave request failed: ${err.message} (${path})`, {
        code: err?.code ?? 'REQUEST_FAILED',
        cause: err,
      });
    } finally {
      clearTimeout(timer);
    }
    return res;
  }

  #assertPayloadSize(bytes) {
    if (bytes.length > MAX_ARWEAVE_PAYLOAD_BYTES) {
      throw new PayloadTooLargeError(
        `refusing Arweave payload of ${bytes.length} bytes: limit is ${MAX_ARWEAVE_PAYLOAD_BYTES} bytes. ` +
          'Arweave holds manifests/proofs only — never video bytes.',
        { code: 'PAYLOAD_TOO_LARGE' },
      );
    }
  }

  /**
   * Build an unsigned v2-style transaction JSON for a payload.
   * Payloads larger than 1 MiB are refused here, before any signing.
   *
   * @param {Buffer|string} data
   * @param {object} [opts]
   * @param {string} [opts.contentType='application/json']
   * @param {Array<{name:string, value:string}>} [opts.tags] - extra tags
   * @returns {object} unsigned transaction object
   */
  buildTransaction(data, { contentType = 'application/json', tags = [] } = {}) {
    const bytes = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8');
    this.#assertPayloadSize(bytes);
    if (!Array.isArray(tags)) {
      throw new ValidationError('ArweaveClient.buildTransaction: tags must be an array');
    }
    return {
      format: 2,
      data: bytes.toString('base64url'),
      data_size: String(bytes.length),
      tags: [
        { name: Buffer.from('Content-Type').toString('base64url'), value: Buffer.from(contentType).toString('base64url') },
        { name: Buffer.from('App-Name').toString('base64url'), value: Buffer.from('Decentralflix').toString('base64url') },
        ...tags,
      ],
    };
  }

  /**
   * Sign (via the caller-provided signTx) and POST a transaction.
   * @param {object} tx - unsigned transaction from buildTransaction()
   * @returns {Promise<{id:string}>} the posted transaction id
   */
  async postTransaction(tx) {
    if (!this.signTx) {
      throw new ArweaveError(
        'ArweaveClient.postTransaction: no signTx callback provided — wallet signing is caller-provided',
        { code: 'NO_SIGNER' },
      );
    }
    if (!tx || typeof tx !== 'object') {
      throw new ValidationError('ArweaveClient.postTransaction: tx must be an object');
    }
    const signed = await this.signTx(tx);
    if (!signed || typeof signed !== 'object' || typeof signed.id !== 'string' || signed.id.length === 0) {
      throw new ArweaveError('ArweaveClient.postTransaction: signTx must resolve to a signed tx object containing id', {
        code: 'INVALID_SIGNATURE_RESULT',
      });
    }
    const res = await this.#fetchRaw('/tx', {
      method: 'POST',
      body: JSON.stringify(signed),
      headers: { 'Content-Type': 'application/json' },
    });
    if (res.status !== 200 && res.status !== 202) {
      const snippet = (await res.text().catch(() => '')).slice(0, 500);
      throw new ArweaveError(`Arweave /tx returned HTTP ${res.status}: ${snippet}`, {
        code: `HTTP_${res.status}`,
        status: res.status,
      });
    }
    return { id: signed.id };
  }

  /**
   * Convenience: build + sign + post a payload. Returns { id }.
   * Enforces the 1 MiB payload cap.
   */
  async postData(data, opts) {
    const tx = this.buildTransaction(data, opts);
    return this.postTransaction(tx);
  }

  /**
   * Fetch raw transaction data bytes: GET /tx/{id}/data.
   * @param {string} txId
   * @returns {Promise<Buffer>}
   */
  async getData(txId) {
    if (typeof txId !== 'string' || txId.length === 0) {
      throw new ValidationError('ArweaveClient.getData: txId must be a non-empty string');
    }
    const res = await this.#fetchRaw(`/tx/${encodeURIComponent(txId)}/data`);
    if (!res.ok) {
      const snippet = (await res.text().catch(() => '')).slice(0, 500);
      throw new ArweaveError(`Arweave /tx/${txId}/data returned HTTP ${res.status}: ${snippet}`, {
        code: `HTTP_${res.status}`,
        status: res.status,
      });
    }
    return Buffer.from(await res.arrayBuffer());
  }

  /** GET /tx/{id}/status — returns the parsed status JSON (may be 404/pending). */
  async txStatus(txId) {
    if (typeof txId !== 'string' || txId.length === 0) {
      throw new ValidationError('ArweaveClient.txStatus: txId must be a non-empty string');
    }
    const res = await this.#fetchRaw(`/tx/${encodeURIComponent(txId)}/status`);
    if (!res.ok) {
      throw new ArweaveError(`Arweave /tx/${txId}/status returned HTTP ${res.status}`, {
        code: `HTTP_${res.status}`,
        status: res.status,
      });
    }
    try {
      return await res.json();
    } catch {
      throw new ArweaveError('Arweave /tx/status returned invalid JSON', { code: 'INVALID_JSON' });
    }
  }
}
