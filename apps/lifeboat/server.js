'use strict';
// Decentralflix Lifeboat backend — M1.
// Zero-dependency Node.js service: node:http, node:crypto, node:fs (+ path, url).
// No npm install. No database. JSON-file persistence under ./data/.
//
// Run:  node server.js            (PORT env configurable, default 8080)
// Test: ./test.sh

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const store = require('./lib/store');
const receipts = require('./lib/receipts');
const cdn = require('./lib/cdn');
const stripe = require('./lib/stripe');

const PORT = parseInt(process.env.PORT || '8080', 10);
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = path.join(__dirname, 'data');
const MASTERS_DIR = path.join(DATA_DIR, 'masters');
const PUBLIC_DIR = path.join(__dirname, 'public'); // frontend static files
const MAX_JSON_BYTES = 1 << 20; // 1 MiB
const MAX_UPLOAD_BYTES = 1 << 30; // 1 GiB per master upload

fs.mkdirSync(MASTERS_DIR, { recursive: true });

const CDN = cdn.createCdn({ mastersDir: MASTERS_DIR });

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function sendError(res, status, error, extra) {
  sendJson(res, status, Object.assign({ error }, extra || {}));
}

// ---------------------------------------------------------------------------
// static frontend (./public)
// ---------------------------------------------------------------------------
// The server also serves the Lifeboat frontend statically: any non-/api path
// resolves under ./public ("/" -> index.html). The API contract the UI relies
// on:
//   - POST /api/films/import: "meta" arrives as a plain JSON *string* form
//     field (formData.append("meta", JSON.stringify(meta))); we JSON.parse the
//     field regardless of the part's content-type (a JSON content-type part is
//     accepted too).
//   - POST /api/receipts/verify: the frontend posts the receipt object itself
//     (unwrapped); both {receipt, signature} and {...fields, signature} are
//     accepted.
//   - POST /api/claims/:id/approve: the frontend posts an empty {} body.

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return sendError(res, 405, 'method not allowed');
  }
  let decoded;
  try {
    decoded = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
  } catch {
    return sendError(res, 400, 'bad path');
  }
  const filePath = path.normalize(path.join(PUBLIC_DIR, decoded));
  if (filePath !== PUBLIC_DIR && !filePath.startsWith(PUBLIC_DIR + path.sep)) {
    return sendError(res, 404, 'not found'); // traversal attempt
  }
  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) return sendError(res, 404, 'not found');
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': 'no-cache',
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(filePath).pipe(res);
  });
}

function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    req.on('data', (c) => {
      bytes += c.length;
      if (bytes > maxBytes) {
        reject(new Error('request body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJson(req, res) {
  let body;
  try {
    body = await readBody(req, MAX_JSON_BYTES);
  } catch (err) {
    sendError(res, 413, err.message);
    return null;
  }
  if (body.length === 0) return {};
  try {
    return JSON.parse(body.toString('utf8'));
  } catch {
    sendError(res, 400, 'invalid JSON body');
    return null;
  }
}

// Minimal multipart/form-data parser operating on Buffer (binary-safe).
// Returns [{ headers, data }] or null when the boundary is missing.
function parseMultipart(body, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;\s]+))/.exec(contentType || '');
  if (!m) return null;
  const boundary = (m[1] || m[2]).trim();
  const delimiter = Buffer.from('--' + boundary, 'latin1');
  const crlfDelim = Buffer.concat([Buffer.from('\r\n', 'latin1'), delimiter]);
  const parts = [];
  let pos = 0;
  for (;;) {
    const start = body.indexOf(delimiter, pos);
    if (start === -1) break;
    let cursor = start + delimiter.length;
    if (body[cursor] === 0x2d && body[cursor + 1] === 0x2d) break; // closing '--'
    if (body[cursor] === 0x0d && body[cursor + 1] === 0x0a) cursor += 2;
    else if (body[cursor] === 0x0a) cursor += 1;
    const end = body.indexOf(crlfDelim, cursor);
    if (end === -1) break;
    const partBuf = body.subarray(cursor, end);
    const sep = partBuf.indexOf('\r\n\r\n');
    const headerBuf = sep === -1 ? partBuf : partBuf.subarray(0, sep);
    const data = sep === -1 ? Buffer.alloc(0) : partBuf.subarray(sep + 4);
    const headers = {};
    for (const line of headerBuf.toString('latin1').split('\r\n')) {
      const i = line.indexOf(':');
      if (i > -1) headers[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
    }
    parts.push({ headers, data });
    pos = end; // end points at \r\n--boundary; next indexOf skips the \r\n
  }
  return parts;
}

function fieldName(disposition) {
  const m = /name="([^"]*)"/.exec(disposition || '');
  return m ? m[1] : null;
}

function fileName(disposition) {
  const m = /filename="([^"]*)"/.exec(disposition || '');
  return m ? m[1] : null;
}

function isEmail(s) {
  return typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

function sha256Hex(s) {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}

function nowIso() {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// domain
// ---------------------------------------------------------------------------

function validateFilmMeta(meta) {
  if (!meta || typeof meta !== 'object') return 'meta must be a JSON object';
  if (typeof meta.title !== 'string' || meta.title.trim() === '') return 'title is required';
  if (!Number.isInteger(meta.price_usd_cents) || meta.price_usd_cents <= 0)
    return 'price_usd_cents must be a positive integer';
  if (!Array.isArray(meta.territories) || meta.territories.length === 0)
    return 'territories must be a non-empty array';
  if (meta.territories.some((t) => typeof t !== 'string' || t.trim() === ''))
    return 'territories must be non-empty strings';
  // Music-rights rule: the filmmaker must attest cleared music; reject otherwise.
  if (meta.cleared_music_attested !== true)
    return 'cleared_music_attested must be true (music rights must be cleared)';
  if (!isEmail(meta.filmmaker_email)) return 'filmmaker_email must be a valid email';
  return null;
}

function publicFilm(film) {
  return {
    film_id: film.film_id,
    title: film.title,
    price_usd_cents: film.price_usd_cents,
    download_allowed: film.download_allowed,
  };
}

function fullFilm(film) {
  return Object.assign({}, film, { playback_url: CDN.getPlaybackUrl(film) });
}

// Creates an entitlement AND its signed receipt (receipts are signed
// entitlements — never transferable, never cashable). Returns
// { entitlement, receipt, signature }.
function grantEntitlement({ film, email, source, testMode }) {
  const emailNorm = email.trim().toLowerCase();
  const grantedAt = nowIso();
  const receiptFields = {
    receipt_id: 'r_' + crypto.randomBytes(8).toString('hex'),
    film_id: film.film_id,
    buyer_email_sha256: sha256Hex(emailNorm),
    price_usd_cents: film.price_usd_cents,
    currency: 'USD',
    granted_at: grantedAt,
    terms_hash: receipts.TERMS_HASH,
    transferable: false,
  };
  const { receipt, signature } = receipts.sign(receiptFields);
  store.insert('receipts', {
    receipt_id: receipt.receipt_id,
    film_id: film.film_id,
    receipt,
    signature,
    created_at: grantedAt,
  });
  const entitlement = {
    entitlement_id: 'ent_' + crypto.randomBytes(6).toString('hex'),
    film_id: film.film_id,
    email: emailNorm,
    email_sha256: receiptFields.buyer_email_sha256,
    source,
    granted_at: grantedAt,
    price_usd_cents: film.price_usd_cents,
    receipt_id: receipt.receipt_id,
  };
  if (testMode) entitlement.test_mode = true;
  store.insert('entitlements', entitlement);
  return { entitlement, receipt, signature };
}

function alreadyEntitled(filmId, emailNorm) {
  const h = sha256Hex(emailNorm);
  return store.all('entitlements').some((e) => e.film_id === filmId && e.email_sha256 === h);
}

// ---------------------------------------------------------------------------
// route handlers
// ---------------------------------------------------------------------------

async function importFilm(req, res) {
  const ct = req.headers['content-type'] || '';
  if (!ct.includes('multipart/form-data')) {
    return sendError(res, 400, 'expected multipart/form-data');
  }
  let body;
  try {
    body = await readBody(req, MAX_UPLOAD_BYTES);
  } catch (err) {
    return sendError(res, 413, err.message);
  }
  const parts = parseMultipart(body, ct);
  if (!parts) return sendError(res, 400, 'could not parse multipart body');

  let metaRaw = null;
  let masterData = null;
  let masterFilename = 'master.mp4';
  for (const p of parts) {
    const name = fieldName(p.headers['content-disposition']);
    if (name === 'meta') metaRaw = p.data.toString('utf8');
    else if (name === 'master') {
      masterData = p.data;
      masterFilename = fileName(p.headers['content-disposition']) || 'master.mp4';
    }
  }
  if (metaRaw === null) return sendError(res, 400, 'missing "meta" field');
  if (!masterData || masterData.length === 0) return sendError(res, 400, 'missing "master" file');

  let meta;
  try {
    meta = JSON.parse(metaRaw);
  } catch {
    return sendError(res, 400, 'meta is not valid JSON');
  }
  const invalid = validateFilmMeta(meta);
  if (invalid) return sendError(res, 400, invalid);

  const filmId = 'film_' + crypto.randomBytes(6).toString('hex');
  const tmpPath = path.join(MASTERS_DIR, filmId + '.mp4.tmp');
  const finalPath = path.join(MASTERS_DIR, filmId + '.mp4');
  fs.writeFileSync(tmpPath, masterData);
  fs.renameSync(tmpPath, finalPath); // atomic publish of the master

  const film = {
    film_id: filmId,
    title: meta.title.trim(),
    description: typeof meta.description === 'string' ? meta.description : '',
    price_usd_cents: meta.price_usd_cents,
    territories: meta.territories.map((t) => t.trim()),
    download_allowed: Boolean(meta.download_allowed),
    cleared_music_attested: true,
    filmmaker_email: meta.filmmaker_email.trim().toLowerCase(),
    master_bytes: masterData.length,
    original_filename: path.basename(masterFilename),
    created_at: nowIso(),
  };
  store.insert('films', film);

  const out = { film_id: filmId, playback_url: CDN.getPlaybackUrl(film) };
  if (film.download_allowed) out.download_url = `/api/films/${filmId}/download`;
  return sendJson(res, 201, out);
}

async function importBuyers(req, res) {
  const body = await readJson(req, res);
  if (body === null) return;
  const film = body.film_id ? store.get('films', body.film_id) : null;
  if (!film) return sendError(res, 404, 'film not found');
  if (!Array.isArray(body.emails) || body.emails.length === 0)
    return sendError(res, 400, 'emails must be a non-empty array');

  let imported = 0;
  let skipped = 0;
  const invalid = [];
  for (const raw of body.emails) {
    if (!isEmail(raw)) {
      invalid.push(raw);
      continue;
    }
    const email = raw.trim().toLowerCase();
    if (alreadyEntitled(film.film_id, email)) {
      skipped += 1;
      continue;
    }
    grantEntitlement({ film, email, source: 'import' });
    imported += 1;
  }
  return sendJson(res, 201, {
    film_id: film.film_id,
    imported,
    skipped_duplicates: skipped,
    invalid_emails: invalid,
  });
}

async function fileClaim(req, res) {
  const body = await readJson(req, res);
  if (body === null) return;
  const film = body.film_id ? store.get('films', body.film_id) : null;
  if (!film) return sendError(res, 404, 'film not found');
  if (!isEmail(body.email)) return sendError(res, 400, 'email must be a valid email');
  if (typeof body.vimeo_receipt_ref !== 'string' || body.vimeo_receipt_ref.trim() === '')
    return sendError(res, 400, 'vimeo_receipt_ref is required');

  const claim = {
    claim_id: 'claim_' + crypto.randomBytes(6).toString('hex'),
    film_id: film.film_id,
    email: body.email.trim().toLowerCase(),
    email_sha256: sha256Hex(body.email.trim().toLowerCase()),
    vimeo_receipt_ref: body.vimeo_receipt_ref.trim(),
    status: 'pending',
    created_at: nowIso(),
  };
  store.insert('claims', claim);
  return sendJson(res, 201, claim);
}

async function approveClaim(req, res, claimId) {
  const claim = store.get('claims', claimId);
  if (!claim) return sendError(res, 404, 'claim not found');
  if (claim.status !== 'pending') return sendError(res, 409, `claim already ${claim.status}`);
  const film = store.get('films', claim.film_id);
  if (!film) return sendError(res, 404, 'film not found');

  const { entitlement, receipt, signature } = grantEntitlement({
    film,
    email: claim.email,
    source: 'claim',
  });
  store.update('claims', claimId, { status: 'approved', decided_at: nowIso() });
  return sendJson(res, 200, {
    claim_id: claimId,
    status: 'approved',
    entitlement,
    receipt,
    signature,
  });
}

// TEST-ONLY: simulates a completed purchase without touching Stripe or money.
async function testPurchase(req, res) {
  const body = await readJson(req, res);
  if (body === null) return;
  const film = body.film_id ? store.get('films', body.film_id) : null;
  if (!film) return sendError(res, 404, 'film not found');
  if (!isEmail(body.email)) return sendError(res, 400, 'email must be a valid email');

  const { entitlement, receipt, signature } = grantEntitlement({
    film,
    email: body.email,
    source: 'purchase',
    testMode: true,
  });
  return sendJson(res, 201, {
    test_mode: true,
    note: 'TEST-ONLY simulated purchase — no money moved, Stripe not involved',
    entitlement,
    receipt,
    signature,
  });
}

async function stripeWebhook(req, res) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return sendError(res, 503, 'Stripe webhook not configured — set STRIPE_WEBHOOK_SECRET');
  }
  let raw;
  try {
    raw = await readBody(req, MAX_JSON_BYTES);
  } catch (err) {
    return sendError(res, 413, err.message);
  }
  let event;
  try {
    event = stripe.verifyWebhookSignature(raw, req.headers['stripe-signature'], secret);
  } catch (err) {
    return sendError(res, 400, 'invalid webhook signature', { detail: err.message });
  }

  // Route the events we care about. checkout.session.completed fulfills the
  // entitlement: metadata.film_id + metadata.buyer_email (see
  // buildCheckoutSessionParams in lib/stripe.js).
  if (event && event.type === 'checkout.session.completed') {
    const md = (event.data && event.data.object && event.data.object.metadata) || {};
    const film = md.film_id ? store.get('films', md.film_id) : null;
    if (film && isEmail(md.buyer_email)) {
      const email = md.buyer_email.trim().toLowerCase();
      if (!alreadyEntitled(film.film_id, email)) {
        grantEntitlement({ film, email, source: 'purchase' });
      }
    }
  }
  return sendJson(res, 200, { received: true });
}

function csvEscape(v) {
  const s = String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function audienceCsv(req, res, filmId) {
  const film = store.get('films', filmId);
  if (!film) return sendError(res, 404, 'film not found');
  const rows = store
    .all('entitlements')
    .filter((e) => e.film_id === filmId)
    .map((e) => [e.email, e.granted_at, e.source, e.price_usd_cents].map(csvEscape).join(','));
  const csv = 'email,granted_at,source,price_usd_cents\n' + rows.join('\n') + (rows.length ? '\n' : '');
  res.writeHead(200, {
    'Content-Type': 'text/csv',
    'Content-Disposition': `attachment; filename="audience-${filmId}.csv"`,
    'Content-Length': Buffer.byteLength(csv),
  });
  res.end(csv);
}

function downloadFilm(req, res, filmId) {
  const film = store.get('films', filmId);
  if (!film) return sendError(res, 404, 'film not found');
  if (!film.download_allowed) {
    // California AB 2426: digital goods sold as licenses must disclose that the
    // buyer is purchasing a license, not ownership. Streaming-only titles
    // therefore refuse download with an explicit message.
    return sendError(res, 403, 'Download is not available for this title. Your purchase grants a streaming-only license — you are buying a license to access the film, not ownership of the file. (Disclosure per California AB 2426: digital goods sold as licenses must be clearly identified as such.)', {
      code: 'STREAMING_ONLY_AB2426',
    });
  }
  res.setHeader('Content-Disposition', `attachment; filename="${film.film_id}.mp4"`);
  CDN.streamFile(req, res, film);
}

// ---------------------------------------------------------------------------
// router
// ---------------------------------------------------------------------------

async function handleApi(req, res, url, seg, method) {
  // seg: path segments after /api
  if (seg[0] === 'films' && seg.length === 1 && method === 'GET') {
    return sendJson(res, 200, store.all('films').map(publicFilm));
  }
  if (seg[0] === 'films' && seg[1] === 'import' && seg.length === 2 && method === 'POST') {
    return importFilm(req, res);
  }
  if (seg[0] === 'films' && seg[2] === 'stream' && seg.length === 3 && method === 'GET') {
    const film = store.get('films', seg[1]);
    if (!film) return sendError(res, 404, 'film not found');
    return CDN.streamFile(req, res, film);
  }
  if (seg[0] === 'films' && seg[2] === 'download' && seg.length === 3 && method === 'GET') {
    return downloadFilm(req, res, seg[1]);
  }
  if (seg[0] === 'films' && seg[2] === 'audience.csv' && seg.length === 3 && method === 'GET') {
    return audienceCsv(req, res, seg[1]);
  }
  if (seg[0] === 'films' && seg.length === 2 && method === 'GET') {
    const film = store.get('films', seg[1]);
    if (!film) return sendError(res, 404, 'film not found');
    return sendJson(res, 200, fullFilm(film));
  }
  if (seg[0] === 'buyers' && seg[1] === 'import' && seg.length === 2 && method === 'POST') {
    return importBuyers(req, res);
  }
  if (seg[0] === 'claims' && seg.length === 1 && method === 'POST') {
    return fileClaim(req, res);
  }
  if (seg[0] === 'claims' && seg.length === 1 && method === 'GET') {
    const filmId = url.searchParams.get('film_id');
    const claims = store.all('claims').filter((c) => !filmId || c.film_id === filmId);
    return sendJson(res, 200, claims);
  }
  if (seg[0] === 'claims' && seg[2] === 'approve' && seg.length === 3 && method === 'POST') {
    return approveClaim(req, res, seg[1]);
  }
  if (seg[0] === 'purchases' && seg[1] === 'test' && seg.length === 2 && method === 'POST') {
    return testPurchase(req, res);
  }
  if (seg[0] === 'webhooks' && seg[1] === 'stripe' && seg.length === 2 && method === 'POST') {
    return stripeWebhook(req, res);
  }
  if (seg[0] === 'receipts' && seg[1] === 'pubkey' && seg.length === 2 && method === 'GET') {
    return sendJson(res, 200, {
      algorithm: 'Ed25519',
      format: 'base64-spki-der',
      public_key: receipts.getPublicKeyBase64(),
    });
  }
  if (seg[0] === 'receipts' && seg[1] === 'verify' && seg.length === 2 && method === 'POST') {
    const body = await readJson(req, res);
    if (body === null) return;
    // Two accepted shapes (frontend posts the receipt object itself, unwrapped):
    //   1. { receipt: {...fields}, signature: "..." }
    //   2. { ...fields, signature: "..." }  (signature inline with the fields)
    // Extra keys (e.g. test_mode, note, entitlement from a purchase response)
    // are ignored in shape 1.
    let receipt = body.receipt;
    let signature = body.signature;
    if ((!receipt || typeof receipt !== 'object') && typeof signature === 'string') {
      const { signature: sig, ...fields } = body;
      receipt = fields;
      signature = sig;
    }
    return sendJson(res, 200, { valid: receipts.verify(receipt, signature) });
  }
  if (seg[0] === 'health' && seg.length === 1 && method === 'GET') {
    return sendJson(res, 200, {
      service: 'decentralflix-lifeboat',
      milestone: 'M1',
      cdn: CDN.constructor.name,
      stripe_configured: stripe.isConfigured(),
    });
  }
  return sendError(res, 404, 'not found');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const seg = url.pathname.split('/').filter(Boolean);
  try {
    if (seg[0] === 'api') return await handleApi(req, res, url, seg.slice(1), req.method);
    // Everything else is the statically-served frontend (./public).
    return serveStatic(req, res, url.pathname);
  } catch (err) {
    // Bunny-not-configured surfaces here as a 503 with the exact message.
    if (err && /Bunny not configured/.test(err.message)) {
      return sendError(res, 503, err.message);
    }
    console.error('request failed:', err);
    return sendError(res, 500, 'internal error');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`decentralflix-lifeboat M1 listening on http://${HOST}:${PORT} (cdn=${CDN.constructor.name})`);
});
