/**
 * TEST MOCKS — in-process HTTP doubles for the Kubo IPFS API and the
 * Arweave gateway. Used ONLY by the test suite; they speak just enough of
 * each API for the client tests and deliberately implement nothing else.
 * No external network is used in tests.
 */

import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';

const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const mockCid = (b) => `mockcid-${sha256(b).slice(0, 46)}`;

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/**
 * Extract the uploaded file bytes from our client's multipart body.
 * Parses: headers CRLFCRLF <data> CRLF--boundary--.
 */
function extractMultipartFile(body) {
  const sep = Buffer.from('\r\n\r\n');
  const start = body.indexOf(sep);
  if (start === -1) throw new Error('mock: bad multipart body (no header separator)');
  const endMarker = body.lastIndexOf(Buffer.from('\r\n--'));
  if (endMarker === -1) throw new Error('mock: bad multipart body (no closing boundary)');
  return body.subarray(start + sep.length, endMarker);
}

function json(res, status, obj) {
  const body = Buffer.from(JSON.stringify(obj), 'utf8');
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': body.length });
  res.end(body);
}

/**
 * Start a mock Kubo server.
 * @param {object} [opts]
 * @param {number} [opts.delayMs] - delay every response by this long (for timeout tests)
 * @param {boolean} [opts.invalidJsonAdd] - /api/v0/add replies with non-JSON
 * @returns {Promise<{url, close, store, pinned, corrupt, remove, addDirect}>}
 */
export async function startMockKubo({ delayMs = 0, invalidJsonAdd = false } = {}) {
  const store = new Map(); // cid -> Buffer
  const pinned = new Set();

  const respond = (req, res) => {
    readBody(req).then((body) => {
      const url = new URL(req.url, 'http://mock');
      const { pathname } = url;
      if (pathname === '/api/v0/add' && req.method === 'POST') {
        if (invalidJsonAdd) {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end('this is not json');
          return;
        }
        const data = extractMultipartFile(body);
        const cid = mockCid(data);
        store.set(cid, data);
        // Kubo streams one JSON line per chunk; the client reads the last line.
        const line = JSON.stringify({ Name: 'fragment', Hash: cid, Size: String(data.length) });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(line + '\n');
        return;
      }
      if (pathname === '/api/v0/cat' && req.method === 'POST') {
        const cid = url.searchParams.get('arg');
        if (!cid || !store.has(cid)) {
          json(res, 404, { Message: 'not found', Code: 0, Type: 'error' });
          return;
        }
        const data = store.get(cid);
        res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': data.length });
        res.end(data);
        return;
      }
      if (pathname === '/api/v0/pin/add' && req.method === 'POST') {
        const cid = url.searchParams.get('arg');
        if (!cid) {
          json(res, 400, { Message: 'missing arg', Code: 0, Type: 'error' });
          return;
        }
        pinned.add(cid);
        json(res, 200, { Pins: [cid] });
        return;
      }
      json(res, 404, { Message: 'mock: unknown path', Code: 0, Type: 'error' });
    }).catch((err) => json(res, 500, { Message: String(err), Code: 0, Type: 'error' }));
  };

  const server = createServer((req, res) => {
    if (delayMs > 0) setTimeout(() => respond(req, res), delayMs);
    else respond(req, res);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  return {
    url: `http://127.0.0.1:${port}`,
    store,
    pinned,
    /** Flip one byte of a stored fragment to simulate tampering. */
    corrupt(cid) {
      const data = store.get(cid);
      if (!data) throw new Error(`mock: no such cid ${cid}`);
      const tampered = Buffer.from(data);
      tampered[0] ^= 0xff;
      store.set(cid, tampered);
    },
    /** Delete a stored fragment to simulate IPFS unavailability (404). */
    remove(cid) {
      store.delete(cid);
    },
    /** Seed a fragment directly, bypassing /add. Returns its cid. */
    addDirect(data) {
      const cid = mockCid(data);
      store.set(cid, data);
      return cid;
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

/**
 * Start a mock Arweave gateway.
 * @param {object} [opts]
 * @param {boolean} [opts.failPost] - POST /tx replies 500 (for error-path tests)
 * @param {number} [opts.delayMs] - delay every response (for timeout tests)
 * @returns {Promise<{url, close, txs, corruptData}>}
 */
export async function startMockArweave({ failPost = false, delayMs = 0 } = {}) {
  const txs = new Map(); // txId -> { tx, data: Buffer }

  const respond = (req, res) => {
    readBody(req).then((body) => {
      const url = new URL(req.url, 'http://mock');
      const { pathname } = url;
      if (pathname === '/tx' && req.method === 'POST') {
        if (failPost) {
          json(res, 500, { error: 'mock gateway failure' });
          return;
        }
        let tx;
        try {
          tx = JSON.parse(body.toString('utf8'));
        } catch {
          json(res, 400, { error: 'invalid tx json' });
          return;
        }
        if (!tx || typeof tx.id !== 'string' || typeof tx.data !== 'string') {
          json(res, 400, { error: 'tx must include id and data' });
          return;
        }
        txs.set(tx.id, { tx, data: Buffer.from(tx.data, 'base64url') });
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('OK');
        return;
      }
      const dataMatch = pathname.match(/^\/tx\/([^/]+)\/data$/);
      if (dataMatch && req.method === 'GET') {
        const txId = decodeURIComponent(dataMatch[1]);
        if (!txs.has(txId)) {
          json(res, 404, { error: 'tx not found' });
          return;
        }
        const data = txs.get(txId).data;
        res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': data.length });
        res.end(data);
        return;
      }
      const statusMatch = pathname.match(/^\/tx\/([^/]+)\/status$/);
      if (statusMatch && req.method === 'GET') {
        const txId = decodeURIComponent(statusMatch[1]);
        if (!txs.has(txId)) {
          json(res, 404, { error: 'tx not found' });
          return;
        }
        json(res, 200, { block_indep_hash: 'mockblock', number_of_retries: 0 });
        return;
      }
      json(res, 404, { error: 'mock: unknown path' });
    }).catch((err) => json(res, 500, { error: String(err) }));
  };

  const server = createServer((req, res) => {
    if (delayMs > 0) setTimeout(() => respond(req, res), delayMs);
    else respond(req, res);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  return {
    url: `http://127.0.0.1:${port}`,
    txs,
    /** Corrupt stored tx data to simulate a tampered gateway payload. */
    corruptData(txId) {
      const entry = txs.get(txId);
      if (!entry) throw new Error(`mock: no such tx ${txId}`);
      const tampered = Buffer.from(entry.data);
      tampered[tampered.length - 1] ^= 0xff;
      entry.data = tampered;
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

/**
 * TEST-ONLY deterministic signer. NOT a real wallet: it fabricates a tx id
 * from the transaction content and stamps a fake signature. Production
 * callers must supply a real wallet signer (see arweave.js).
 */
export async function testSignTx(unsignedTx) {
  const signed = { ...unsignedTx };
  signed.id = `testtx-${createHash('sha256').update(JSON.stringify(unsignedTx)).digest('hex').slice(0, 36)}`;
  signed.signature = `testsig-${randomBytes(8).toString('hex')}`;
  return signed;
}
