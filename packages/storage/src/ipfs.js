/**
 * @decentralflix/storage — Kubo HTTP API client (IPFS).
 *
 * Endpoints used: POST /api/v0/add, POST /api/v0/cat, POST /api/v0/pin/add.
 * Zero dependencies (global fetch). Every request has a timeout; non-200
 * statuses and malformed JSON fail loudly as IpfsError. Works against any
 * IPFS HTTP API compatible with Kubo's /api/v0 surface.
 */

import { randomBytes } from 'node:crypto';
import { IpfsError, ValidationError } from './errors.js';

export const DEFAULT_IPFS_ENDPOINT = 'http://127.0.0.1:5001';
export const DEFAULT_TIMEOUT_MS = 30_000;

export class IpfsClient {
  /**
   * @param {object} [opts]
   * @param {string} [opts.endpoint] - Kubo HTTP API base URL (no trailing slash needed)
   * @param {number} [opts.timeoutMs] - per-request timeout in ms
   */
  constructor({ endpoint = DEFAULT_IPFS_ENDPOINT, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    if (typeof endpoint !== 'string' || endpoint.length === 0) {
      throw new ValidationError('IpfsClient: endpoint must be a non-empty string');
    }
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new ValidationError('IpfsClient: timeoutMs must be a positive number');
    }
    this.endpoint = endpoint.replace(/\/+$/, '');
    this.timeoutMs = timeoutMs;
  }

  /**
   * Raw request helper: timeout + transport errors + non-200 become IpfsError.
   * Returns the Response on success (caller reads body).
   */
  async #fetchRaw(path, { body = null, headers = {} } = {}) {
    const url = this.endpoint + path;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort(new IpfsError(`IPFS request timed out after ${this.timeoutMs}ms: ${path}`, {
        code: 'TIMEOUT',
      }));
    }, this.timeoutMs);
    let res;
    try {
      res = await fetch(url, { method: 'POST', body, headers, signal: controller.signal });
    } catch (err) {
      if (err instanceof IpfsError) throw err; // our own timeout abort
      throw new IpfsError(`IPFS request failed: ${err.message} (${path})`, {
        code: err?.code ?? 'REQUEST_FAILED',
        cause: err,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      const snippet = (await res.text().catch(() => '')).slice(0, 500);
      throw new IpfsError(`IPFS ${path} returned HTTP ${res.status}: ${snippet}`, {
        code: `HTTP_${res.status}`,
        status: res.status,
      });
    }
    return res;
  }

  async #readJsonLineResponse(res, path) {
    const text = await res.text();
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    let parsed = null;
    for (const line of lines) {
      try {
        parsed = JSON.parse(line);
      } catch {
        throw new IpfsError(`IPFS ${path} returned invalid JSON: ${line.slice(0, 200)}`, {
          code: 'INVALID_JSON',
        });
      }
    }
    return parsed;
  }

  /**
   * Add bytes to IPFS. Returns { cid, size }.
   * The daemon's response may contain multiple JSON progress lines; the
   * final one carries the CID.
   */
  async add(data) {
    if (!Buffer.isBuffer(data)) {
      throw new ValidationError('IpfsClient.add: data must be a Buffer');
    }
    if (data.length === 0) {
      throw new ValidationError('IpfsClient.add: data must not be empty');
    }
    const boundary = '----decentralflix-' + randomBytes(8).toString('hex');
    const head = Buffer.from(
      `--${boundary}\r\n` +
        'Content-Disposition: form-data; name="file"; filename="fragment"\r\n' +
        'Content-Type: application/octet-stream\r\n\r\n',
      'utf8',
    );
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
    const body = Buffer.concat([head, data, tail]);
    const res = await this.#fetchRaw('/api/v0/add?stream-channels=true', {
      body,
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    });
    const parsed = await this.#readJsonLineResponse(res, '/api/v0/add');
    if (!parsed || typeof parsed.Hash !== 'string' || parsed.Hash.length === 0) {
      throw new IpfsError('IPFS /api/v0/add response missing Hash field', { code: 'INVALID_RESPONSE' });
    }
    return { cid: parsed.Hash, size: Number(parsed.Size ?? 0) };
  }

  /** Fetch the bytes for a CID. Throws IpfsError on 404 / non-200. */
  async cat(cid) {
    if (typeof cid !== 'string' || cid.length === 0) {
      throw new ValidationError('IpfsClient.cat: cid must be a non-empty string');
    }
    const res = await this.#fetchRaw(`/api/v0/cat?arg=${encodeURIComponent(cid)}`);
    return Buffer.from(await res.arrayBuffer());
  }

  /** Pin a CID on the local Kubo node (see PINNING.md). Returns the pin result. */
  async pin(cid) {
    if (typeof cid !== 'string' || cid.length === 0) {
      throw new ValidationError('IpfsClient.pin: cid must be a non-empty string');
    }
    const res = await this.#fetchRaw(`/api/v0/pin/add?arg=${encodeURIComponent(cid)}`);
    const parsed = await this.#readJsonLineResponse(res, '/api/v0/pin/add');
    if (!parsed || !Array.isArray(parsed.Pins)) {
      throw new IpfsError('IPFS /api/v0/pin/add response missing Pins field', { code: 'INVALID_RESPONSE' });
    }
    return parsed;
  }
}
