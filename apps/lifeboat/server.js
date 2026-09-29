'use strict';
// Decentralflix Lifeboat backend — M2 (extends M1).
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
const passLib = require('./lib/pass');
const authLib = require('./lib/auth');
const playback = require('./lib/playback');

const PORT = parseInt(process.env.PORT || '8080', 10);
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = path.join(__dirname, 'data');
const MASTERS_DIR = path.join(DATA_DIR, 'masters');
const PUBLIC_DIR = path.join(__dirname, 'public'); // frontend static files
const MAX_JSON_BYTES = 1 << 20; // 1 MiB
const MAX_UPLOAD_BYTES = 1 << 30; // 1 GiB per master upload

// DECIDED 2026-09-29 (Dino): test-credit minting exists ONLY in dev builds.
// DECENTRALFLIX_TEST_MINTS=1 enables the three TEST-ONLY endpoints
// (POST /api/passes/test, POST /api/purchases/test,
// POST /api/purchases/bundle/test); anything else (including unset) disables
// them. Deliberately NO per-user cap: a cap is farmable via extra accounts,
// so in production the endpoints are simply dead. Production credits come
// ONLY from confirmed payments (Stripe webhook with valid signature).
const TEST_MINTS_ENABLED = process.env.DECENTRALFLIX_TEST_MINTS === '1';

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
// auth helpers
// ---------------------------------------------------------------------------

// Extracts the bearer token from the Authorization header, validates the
// session, and returns the account. Returns null when unauthenticated.
function getAuthAccount(req) {
  const header = req.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(header);
  if (!m) return null;
  const token = m[1].trim();
  if (!token) return null;
  const session = store.get('sessions', token);
  if (!authLib.sessionValid(session)) {
    if (session) { try { store.remove('sessions', token); } catch {} }
    return null;
  }
  const account = store.get('accounts', session.account_id);
  if (!account) return null;
  // Return a safe public view (never the password hash).
  return {
    account_id: account.account_id,
    email: account.email,
    role: account.role,
    name: account.name || null,
    created_at: account.created_at,
  };
}

// Sends 401 when unauthenticated; otherwise returns the account.
function requireAuth(req, res) {
  const account = getAuthAccount(req);
  if (!account) { sendError(res, 401, 'authentication required'); return null; }
  return account;
}

// Sends 401 when unauthenticated, 403 when not a filmmaker.
function requireFilmmaker(req, res) {
  const account = requireAuth(req, res);
  if (!account) return null;
  if (account.role !== 'filmmaker') { sendError(res, 403, 'filmmaker role required'); return null; }
  return account;
}

// Sends 403 when the TEST-ONLY mint endpoints are disabled (production mode).
// Checked AFTER requireAuth so unauthenticated probes still get 401.
function requireTestMints(req, res) {
  if (!TEST_MINTS_ENABLED) {
    sendError(res, 403, 'test minting is disabled in this build');
    return false;
  }
  return true;
}

// True when the account owns the film (filmmaker_email matches account email).
function ownsFilm(account, film) {
  return !!account && !!film &&
    typeof film.filmmaker_email === 'string' &&
    film.filmmaker_email.trim().toLowerCase() === account.email.toLowerCase();
}

// True when the account has a purchase entitlement for the film.
function hasEntitlement(account, filmId) {
  if (!account || !filmId) return false;
  const email = account.email.toLowerCase();
  return store.all('entitlements').some((e) =>
    e.film_id === filmId &&
    typeof e.email === 'string' &&
    e.email.toLowerCase() === email &&
    e.status !== 'revoked' && e.status !== 'refunded'
  );
}

// ---------------------------------------------------------------------------
// auth endpoints
// ---------------------------------------------------------------------------

async function signup(req, res) {
  const body = await readJson(req, res);
  if (body === null) return;
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const role = typeof body.role === 'string' ? body.role.trim().toLowerCase() : 'buyer';
  if (!isEmail(email)) return sendError(res, 400, 'email must be a valid email');
  if (password.length < 8) return sendError(res, 400, 'password must be at least 8 characters');
  if (role !== 'buyer' && role !== 'filmmaker')
    return sendError(res, 400, 'role must be "buyer" or "filmmaker"');
  const existing = store.all('accounts').some((a) => a.email.toLowerCase() === email);
  if (existing) return sendError(res, 409, 'an account with this email already exists');
  const account = {
    account_id: 'acct_' + crypto.randomBytes(8).toString('hex'),
    email,
    password_hash: authLib.hashPassword(password),
    role,
    name: typeof body.name === 'string' ? body.name.trim().slice(0, 100) : null,
    created_at: nowIso(),
  };
  // DAT-002: the account and its signup session are one atomic unit.
  const signupTxn = store.txnBegin('signup:' + account.account_id);
  store.txnInsert(signupTxn, 'accounts', account);
  const session = authLib.newSession(account.account_id);
  store.txnInsert(signupTxn, 'sessions', session);
  store.txnCommit(signupTxn);
  return sendJson(res, 201, {
    token: session.token,
    expires_at: session.expires_at,
    account: {
      account_id: account.account_id,
      email: account.email,
      role: account.role,
      name: account.name,
    },
    note: 'Test/dev auth only — not hardened for production (no rate limiting, no email verification).',
  });
}

async function login(req, res) {
  const body = await readJson(req, res);
  if (body === null) return;
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const account = store.all('accounts').find((a) => a.email.toLowerCase() === email);
  if (!account || !authLib.verifyPassword(password, account.password_hash))
    return sendError(res, 401, 'invalid email or password');
  const session = authLib.newSession(account.account_id);
  store.insert('sessions', session);
  return sendJson(res, 200, {
    token: session.token,
    expires_at: session.expires_at,
    account: {
      account_id: account.account_id,
      email: account.email,
      role: account.role,
      name: account.name,
    },
  });
}

async function logout(req, res) {
  const header = req.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(header);
  // SEC-002: actually revoke the session row. The old code called a
  // store.remove that did not exist; the empty catch swallowed the
  // TypeError, making logout a silent no-op. Logout stays idempotent:
  // unknown/absent tokens still return 200.
  let revoked = false;
  if (m) {
    const token = m[1].trim();
    if (token) revoked = store.remove('sessions', token);
  }
  return sendJson(res, 200, { logged_out: true, session_revoked: revoked });
}

async function authMe(req, res) {
  const account = requireAuth(req, res);
  if (!account) return;
  return sendJson(res, 200, { account });
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
  if (meta.genres !== undefined) {
    if (!Array.isArray(meta.genres) || meta.genres.some((g) => typeof g !== 'string' || g.trim() === ''))
      return 'genres must be an array of non-empty strings';
  }
  // Music-rights rule: the filmmaker must attest cleared music; reject otherwise.
  if (meta.cleared_music_attested !== true)
    return 'cleared_music_attested must be true (music rights must be cleared)';
  if (!isEmail(meta.filmmaker_email)) return 'filmmaker_email must be a valid email';
  return null;
}

// Resolves a film's filmmaker_email to a public profile link when the
// filmmaker has created an account; null when no account exists yet.
function filmmakerRef(email) {
  const fmk = store.all('filmmakers')
    .find((f) => f.email === String(email || '').trim().toLowerCase()) || null;
  return fmk ? { filmmaker_id: fmk.filmmaker_id, display_name: fmk.display_name } : null;
}

function publicFilm(film) {
  return {
    film_id: film.film_id,
    title: film.title,
    price_usd_cents: film.price_usd_cents,
    download_allowed: film.download_allowed,
    genres: Array.isArray(film.genres) ? film.genres : [],
    filmmaker: filmmakerRef(film.filmmaker_email),
  };
}

function fullFilm(film) {
  return Object.assign({}, film, {
    playback_url: CDN.getPlaybackUrl(film),
    filmmaker: filmmakerRef(film.filmmaker_email),
  });
}

// Creates an entitlement AND its signed receipt (receipts are signed
// entitlements — never transferable, never cashable). Returns
// { entitlement, receipt, signature }.
function grantEntitlement({ film, email, source, testMode, txn }) {
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
  const receiptRecord = {
    receipt_id: receipt.receipt_id,
    film_id: film.film_id,
    receipt,
    signature,
    created_at: grantedAt,
  };
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
  // DAT-002: the signed receipt and its entitlement are one atomic unit — a
  // crash between the two writes must not leave a receipt with no
  // entitlement (buyer holds proof, gets 403) or vice versa. Callers that
  // need a wider unit (claim approval, bundle purchase, pass redemption)
  // pass their own txn; standalone grants commit immediately.
  const grantTxn = txn || store.txnBegin('grantEntitlement');
  store.txnInsert(grantTxn, 'receipts', receiptRecord);
  store.txnInsert(grantTxn, 'entitlements', entitlement);
  if (!txn) store.txnCommit(grantTxn);
  return { entitlement, receipt, signature };
}

function alreadyEntitled(filmId, emailNorm) {
  const h = sha256Hex(emailNorm);
  return store.all('entitlements').some((e) => e.film_id === filmId && e.email_sha256 === h);
}

// ---------------------------------------------------------------------------
// route handlers
// ---------------------------------------------------------------------------

async function importFilm(req, res, account) {
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
    filmmaker_email: (account ? account.email : meta.filmmaker_email).trim().toLowerCase(),
    genres: Array.isArray(meta.genres) ? meta.genres.map((g) => g.trim()) : [],
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

  // Vimeo's audience export is OPT-IN CONTACTS, not a purchase ledger
  // (Vimeo's own seller FAQ: "Only viewers who explicitly opted in to
  // receive updates are included — for privacy reasons we are not able to
  // provide full buyer lists"; the opt-in button appears on VOD pages as
  // well as after checkout, so opt-ins are not buyers). Importing it must
  // NEVER grant access — these contacts are for migration NOTICES only.
  // Buyers get access through the claim flow: POST /api/claims with their
  // Vimeo receipt reference, then filmmaker approval.
  let recorded = 0;
  let skipped = 0;
  const invalid = [];
  for (const raw of body.emails) {
    if (!isEmail(raw)) {
      invalid.push(raw);
      continue;
    }
    const email = raw.trim().toLowerCase();
    const dup = store
      .all('migration_contacts')
      .some((c) => c.film_id === film.film_id && c.email === email);
    if (dup) {
      skipped += 1;
      continue;
    }
    store.insert('migration_contacts', {
      contact_id: 'mc_' + crypto.randomBytes(6).toString('hex'),
      film_id: film.film_id,
      email,
      source: 'vimeo_export',
      imported_at: nowIso(),
    });
    recorded += 1;
  }
  return sendJson(res, 201, {
    film_id: film.film_id,
    contacts_recorded: recorded,
    skipped_duplicates: skipped,
    invalid_emails: invalid,
    note: 'Migration contacts recorded for notices ONLY — no access granted. Buyers claim access with their Vimeo receipt at POST /api/claims; the filmmaker approves each claim.',
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

  // Research update (2026-09-28): Vimeo's audience export is OPT-IN CONTACTS,
  // not a verified purchase ledger. A claim must carry verifiable evidence:
  // title (via film_id), buyer email, transaction reference, purchase type,
  // and date. No entitlement is ever granted on email match alone.
  const purchaseType =
    typeof body.purchase_type === 'string' ? body.purchase_type.trim().toLowerCase() : '';
  if (purchaseType !== 'buy' && purchaseType !== 'rent')
    return sendError(res, 400, 'purchase_type must be "buy" or "rent"');
  const purchaseDate =
    typeof body.purchase_date === 'string' ? body.purchase_date.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(purchaseDate) || Number.isNaN(Date.parse(purchaseDate)))
    return sendError(res, 400, 'purchase_date must be a valid ISO date (YYYY-MM-DD)');
  if (purchaseDate > nowIso().slice(0, 10))
    return sendError(res, 400, 'purchase_date cannot be in the future');

  const email = body.email.trim().toLowerCase();
  // Deduplicate: one open claim per buyer per film.
  const open = store
    .all('claims')
    .some(
      (c) =>
        c.film_id === film.film_id &&
        c.email === email &&
        (c.status === 'pending' || c.status === 'needs_review')
    );
  if (open) return sendError(res, 409, 'a claim for this film and email is already open');

  const claim = {
    claim_id: 'claim_' + crypto.randomBytes(6).toString('hex'),
    film_id: film.film_id,
    film_title: film.title,
    email,
    email_sha256: sha256Hex(email),
    vimeo_receipt_ref: body.vimeo_receipt_ref.trim(),
    purchase_type: purchaseType,
    purchase_date: purchaseDate,
    status: 'pending',
    created_at: nowIso(),
  };
  store.insert('claims', claim);
  return sendJson(res, 201, claim);
}

// Uncertain receipts go to a manual review queue instead of being approved.
async function reviewClaim(req, res, claimId) {
  const claim = store.get('claims', claimId);
  if (!claim) return sendError(res, 404, 'claim not found');
  if (claim.status !== 'pending' && claim.status !== 'needs_review')
    return sendError(res, 409, `claim already ${claim.status}`);
  const body = await readJson(req, res);
  const reason =
    body && typeof body.reason === 'string' && body.reason.trim() !== ''
      ? body.reason.trim()
      : 'uncertain receipt — manual review required';
  store.update('claims', claimId, {
    status: 'needs_review',
    review_reason: reason,
    decided_at: nowIso(),
  });
  return sendJson(res, 200, store.get('claims', claimId));
}

async function approveClaim(req, res, claimId) {
  const claim = store.get('claims', claimId);
  if (!claim) return sendError(res, 404, 'claim not found');
  if (claim.status !== 'pending' && claim.status !== 'needs_review')
    return sendError(res, 409, `claim already ${claim.status}`);
  const film = store.get('films', claim.film_id);
  if (!film) return sendError(res, 404, 'film not found');

  // DAT-002: the grant and the claim-status flip are one atomic unit — a
  // crash between them left an approved entitlement with the claim still
  // pending (re-approvable).
  const approveTxn = store.txnBegin('approveClaim:' + claimId);
  const { entitlement, receipt, signature } = grantEntitlement({
    film,
    email: claim.email,
    source: 'claim',
    txn: approveTxn,
  });
  store.txnUpdate(approveTxn, 'claims', claimId, { status: 'approved', decided_at: nowIso() });
  store.txnCommit(approveTxn);
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
  const account = requireAuth(req, res);
  if (!account) return;
  if (!requireTestMints(req, res)) return;
  const body = await readJson(req, res);
  if (body === null) return;
  const film = body.film_id ? store.get('films', body.film_id) : null;
  if (!film) return sendError(res, 404, 'film not found');

  const { entitlement, receipt, signature } = grantEntitlement({
    film,
    email: account.email,
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

// TEST-ONLY: same-seller multi-film bundle purchase — one checkout for N
// films from ONE filmmaker. This is the fee-saving alternative to stored
// balances: five separate $4 domestic-card purchases cost ~$2.08 in
// processing (2.9% + $0.30 each); one $20 bundle costs ~$0.88.
// Multi-seller bundles are OUT of scope (they need explicit revenue
// allocation across filmmakers plus a supported payment flow).
async function bundleTestPurchase(req, res) {
  const account = requireAuth(req, res);
  if (!account) return;
  if (!requireTestMints(req, res)) return;
  const body = await readJson(req, res);
  if (body === null) return;
  const ids = body.film_ids;
  if (!Array.isArray(ids) || ids.length < 2)
    return sendError(res, 400, 'film_ids must be an array of at least 2 film ids');
  if (new Set(ids).size !== ids.length)
    return sendError(res, 400, 'film_ids must not contain duplicates');

  const films = [];
  for (const id of ids) {
    const f = store.get('films', id);
    if (!f) return sendError(res, 404, `film not found: ${id}`);
    films.push(f);
  }
  const sellers = new Set(films.map((f) => f.filmmaker_email));
  if (sellers.size > 1) {
    return sendError(res, 400, 'bundle films must share one filmmaker — multi-seller bundles are out of scope');
  }

  const email = account.email.toLowerCase();
  const granted = [];
  const alreadyOwned = [];
  // DAT-002: the N grants and the sales order are one atomic unit — a crash
  // between them left entitlements with no order (sales ledger silently
  // missing the bundle).
  const bundleTxn = store.txnBegin('bundleTestPurchase:' + email);
  for (const film of films) {
    if (alreadyEntitled(film.film_id, email)) {
      alreadyOwned.push(film.film_id);
      continue;
    }
    const { entitlement, receipt, signature } = grantEntitlement({
      film,
      email,
      source: 'bundle_purchase',
      testMode: true,
      txn: bundleTxn,
    });
    granted.push({ film_id: film.film_id, entitlement, receipt, signature });
  }
  if (granted.length === 0) {
    return sendJson(res, 200, {
      test_mode: true,
      note: 'all bundle films already owned — nothing granted, no order recorded',
      already_owned: alreadyOwned,
      allocations: [],
      total_usd_cents: 0,
    });
  }
  // Explicit per-film revenue allocation, recorded in the sales ledger
  // (orders collection). Allocation basis: each film's list price; the bundle
  // total is the sum. The card-fee saving versus separate purchases accrues
  // to whichever party bears processing under the filmmaker agreement
  // (see README "Unit economics").
  const allocations = granted.map((g) => {
    const film = films.find((f) => f.film_id === g.film_id);
    return { film_id: film.film_id, amount_usd_cents: film.price_usd_cents };
  });
  const total = allocations.reduce((s, a) => s + a.amount_usd_cents, 0);
  const order = {
    order_id: 'ord_' + crypto.randomBytes(6).toString('hex'),
    email,
    film_ids: granted.map((g) => g.film_id),
    allocations,
    total_usd_cents: total,
    filmmaker_email: films[0].filmmaker_email,
    bundle: true,
    test_mode: true,
    created_at: nowIso(),
  };
  store.txnInsert(bundleTxn, 'orders', order);
  store.txnCommit(bundleTxn);
  return sendJson(res, 201, {
    test_mode: true,
    note: 'TEST-ONLY simulated bundle purchase — no money moved, Stripe not involved',
    order_id: order.order_id,
    email,
    total_usd_cents: total,
    allocations,
    entitlements: granted,
    already_owned: alreadyOwned,
    fee_note: 'One checkout instead of N: five $4 purchases cost ~$2.08 in card fees vs ~$0.88 for one $20 bundle (2.9% + $0.30 domestic).',
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
  // M2: Collector Pass subscription lifecycle (only reachable with keys set).
  // REQUIRES LEGAL REVIEW BEFORE LAUNCH (money-transmission risk).
  if (event && event.type === 'customer.subscription.created') {
    const md = (event.data && event.data.object && event.data.object.metadata) || {};
    if (md.product === 'collector_pass' && isEmail(md.buyer_email)) {
      const email = md.buyer_email.trim().toLowerCase();
      let p = passLib.getPassByEmail(email);
      if (!p) p = passLib.createPass({ email, testMode: false });
      store.update('passes', p.pass_id, {
        stripe_subscription_id: (event.data.object && event.data.object.id) || null,
        status: 'active',
        test_mode: false,
      });
    }
  }
  if (event && event.type === 'invoice.payment_succeeded') {
    const md = (event.data && event.data.object && event.data.object.metadata) || {};
    if (md.product === 'collector_pass' && isEmail(md.buyer_email)) {
      const p = passLib.getPassByEmail(md.buyer_email);
      if (p && p.status === 'active') {
        passLib.issueCredits({
          pass_id: p.pass_id,
          credits: passLib.CREDITS_PER_BILLING_PERIOD,
          reason: 'subscription_renewal',
          stripe_invoice_id: (event.data.object && event.data.object.id) || null,
        });
      }
    }
  }
  if (event && event.type === 'customer.subscription.deleted') {
    const md = (event.data && event.data.object && event.data.object.metadata) || {};
    if (md.product === 'collector_pass' && isEmail(md.buyer_email)) {
      const p = passLib.getPassByEmail(md.buyer_email);
      if (p) store.update('passes', p.pass_id, { status: 'canceled' });
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
// M2 route handlers
// ---------------------------------------------------------------------------
// Collector Pass: REQUIRES LEGAL REVIEW BEFORE LAUNCH (money-transmission risk).
// Credits are NON-TRANSFERABLE and NON-CASHABLE — enforced in lib/pass.js.

async function passCheckout(req, res) {
  // Real Stripe subscription checkout — the shape exists in lib/stripe.js but
  // there are no keys, so this always throws "not configured".
  try {
    await stripe.createSubscriptionCheckout();
    return sendError(res, 500, 'unexpected: checkout did not throw');
  } catch (err) {
    return sendError(res, 503, err.message, { legal_notice: passLib.LEGAL_NOTICE, economics_warning: passLib.ECONOMICS_WARNING });
  }
}

async function passTestSubscribe(req, res) {
  const account = requireAuth(req, res);
  if (!account) return;
  if (!requireTestMints(req, res)) return;
  const body = await readJson(req, res);
  if (body === null) return;
  // SEC-001 (df-cycle-01): the pass is bound to the authenticated account.
  // The request-body email is never trusted — unauthenticated callers used to
  // mint credits for any address.
  const email = account.email;
  let p = passLib.getPassByEmail(email);
  if (!p) {
    p = passLib.createPass({ email, testMode: true });
  } else if (p.status !== 'active') {
    store.update('passes', p.pass_id, { status: 'active' });
    p = passLib.getPass(p.pass_id);
  }
  const grant = passLib.issueCredits({
    pass_id: p.pass_id,
    credits: passLib.CREDITS_PER_BILLING_PERIOD,
    reason: 'test_grant',
  });
  return sendJson(res, 201, {
    test_mode: true,
    note: 'TEST-ONLY simulated Collector Pass subscription — no money moved, Stripe not involved',
    legal_notice: passLib.LEGAL_NOTICE,
    economics_warning: passLib.ECONOMICS_WARNING,
    pass: p,
    credit_grant: grant,
    balance: passLib.balance(p.pass_id),
  });
}

function passDetail(req, res, passId) {
  // BUG-011: the pass detail (holder email + full credit ledger) is PII.
  // Auth first (consistent with passRedeem: no existence leak to strangers),
  // then the holder check - only the pass owner may read their own ledger.
  const account = requireAuth(req, res);
  if (!account) return;
  const p = passLib.getPass(passId);
  if (!p) return sendError(res, 404, 'pass not found');
  if (p.email !== account.email) {
    return sendError(res, 403, 'pass does not belong to this account');
  }
  return sendJson(res, 200, {
    pass: p,
    balance: passLib.balance(passId),
    ledger: passLib.ledger(passId),
    legal_notice: passLib.LEGAL_NOTICE,
    economics_warning: passLib.ECONOMICS_WARNING,
  });
}

// DF-MEDIA-3: mint a short-lived signed playback URL for an entitled holder.
// Holder check reuses passDetail's (BUG-011): auth first, then only the pass
// owner may mint — no existence/entitlement leak to strangers. The film
// entitlement check matches the stream route: the filmmaker or an entitled
// buyer. A bare pass alone never grants a film.
function passPlaybackUrl(req, res, url, passId) {
  const account = requireAuth(req, res);
  if (!account) return;
  const p = passLib.getPass(passId);
  if (!p) return sendError(res, 404, 'pass not found');
  if (p.email !== account.email) {
    return sendError(res, 403, 'pass does not belong to this account');
  }
  const filmId = (url.searchParams.get('film') || '').trim();
  if (!filmId) return sendError(res, 400, 'film query parameter required');
  const film = store.get('films', filmId);
  if (!film) return sendError(res, 404, 'film not found');
  if (!ownsFilm(account, film) && !hasEntitlement(account, film.film_id))
    return sendError(res, 403, 'purchase required to stream this film');
  const minted = playback.mintPlaybackUrl({ passId: p.pass_id, filmId: film.film_id });
  return sendJson(res, 200, {
    url: minted.url,
    expires_at: minted.expires_at,
    expires_in: minted.expires_in,
    pass_id: p.pass_id,
    film_id: film.film_id,
    legal_notice: passLib.LEGAL_NOTICE,
  });
}

// DF-MEDIA-3: play the master behind a verified signed playback URL.
// Rejects missing/tampered/expired tokens with 403 (fail closed). The
// signature binds pass + film + expiry, so a URL cannot be retargeted at a
// different film. Range requests are honored via CDN.streamFile, so seeking
// works in the native <video> element.
function mediaPlay(req, res, url) {
  const v = playback.verifyPlaybackUrl({
    pass: url.searchParams.get('pass'),
    film: url.searchParams.get('film'),
    exp: url.searchParams.get('exp'),
    sig: url.searchParams.get('sig'),
  });
  if (!v.ok) return sendError(res, 403, 'invalid or expired playback URL');
  const film = store.get('films', v.filmId);
  if (!film) return sendError(res, 404, 'film not found');
  return CDN.streamFile(req, res, film);
}

async function passRedeem(req, res, passId) {
  const account = requireAuth(req, res);
  if (!account) return;
  const body = await readJson(req, res);
  if (body === null) return;
  const film = body.film_id ? store.get('films', body.film_id) : null;
  if (!film) return sendError(res, 404, 'film not found');
  // SEC-001 (df-cycle-01): redemption is bound to the authenticated pass
  // holder. The request-body email is never trusted.
  const pass = passLib.getPass(passId);
  if (!pass) return sendError(res, 404, 'pass not found', { legal_notice: passLib.LEGAL_NOTICE, economics_warning: passLib.ECONOMICS_WARNING });
  if (pass.email !== account.email) {
    return sendError(res, 403, 'pass does not belong to this account', { legal_notice: passLib.LEGAL_NOTICE, economics_warning: passLib.ECONOMICS_WARNING });
  }
  const email = account.email;
  // CRITICAL: ownership is checked BEFORE any credit is debited. A duplicate
  // redemption must never consume a credit.
  if (alreadyEntitled(film.film_id, email)) {
    return sendJson(res, 200, {
      pass_id: passId,
      film_id: film.film_id,
      entitlement: null,
      already_owned: true,
      redemption: null,
      balance: passLib.balance(passId),
      license_term: 'permanent', // NOT copyright ownership — wording pending counsel review
      legal_notice: passLib.LEGAL_NOTICE,
      economics_warning: passLib.ECONOMICS_WARNING,
    });
  }
  // DAT-002: the credit debit and the entitlement grant are one atomic
  // unit — a crash between them left a debited credit with no grant (buyer
  // paid, got nothing).
  const redeemTxn = store.txnBegin('passRedeem:' + passId + ':' + film.film_id);
  let redemption;
  try {
    redemption = passLib.redeemCredit({ pass_id: passId, film_id: film.film_id, email, txn: redeemTxn });
  } catch (err) {
    return sendError(res, err.status || 500, err.message, { legal_notice: passLib.LEGAL_NOTICE, economics_warning: passLib.ECONOMICS_WARNING });
  }
  // A redeemed film takes the same entitlement path as a purchase,
  // so it grants a permanent DRM-free download (yours to keep — wording
  // pending counsel review; NOT copyright ownership).
  const { entitlement } = grantEntitlement({ film, email, source: 'pass_redemption', testMode: true, txn: redeemTxn });
  store.txnCommit(redeemTxn);
  return sendJson(res, 201, {
    pass_id: passId,
    film_id: film.film_id,
    entitlement,
    already_owned: false,
    redemption,
    balance: passLib.balance(passId),
    license_term: 'permanent', // NOT copyright ownership — wording pending counsel review
    legal_notice: passLib.LEGAL_NOTICE,
    economics_warning: passLib.ECONOMICS_WARNING,
  });
}

// ---------------------------------------------------------------------------
// M2: filmmaker onboarding — guided steps: account, Stripe Connect (stub),
// payout details, catalog import (reuses M1 import), audience invite (reuses
// M1 buyer-claim CSV). No raw bank details are ever accepted: payouts go
// through Stripe Connect only.

async function createFilmmaker(req, res) {
  const body = await readJson(req, res);
  if (body === null) return;
  if (!isEmail(body.email)) return sendError(res, 400, 'email must be a valid email');
  if (typeof body.display_name !== 'string' || body.display_name.trim() === '') {
    return sendError(res, 400, 'display_name is required');
  }
  const email = body.email.trim().toLowerCase();
  const existing = store.all('filmmakers').find((f) => f.email === email);
  if (existing) return sendJson(res, 200, existing);
  const filmmaker = {
    filmmaker_id: 'fmk_' + crypto.randomBytes(6).toString('hex'),
    email,
    display_name: body.display_name.trim(),
    stripe_connect_account_id: null,
    connect_status: 'not_started', // not_started | active (via webhook, once keys exist)
    payout_method: null, // only 'stripe_connect' is accepted
    payout_status: 'not_started',
    created_at: nowIso(),
  };
  store.insert('filmmakers', filmmaker);
  return sendJson(res, 201, filmmaker);
}

function getFilmmaker(req, res, filmmakerId) {
  const f = store.get('filmmakers', filmmakerId);
  if (!f) return sendError(res, 404, 'filmmaker not found');
  return sendJson(res, 200, f);
}

async function updateFilmmaker(req, res, filmmakerId) {
  const f = store.get('filmmakers', filmmakerId);
  if (!f) return sendError(res, 404, 'filmmaker not found');
  const body = await readJson(req, res);
  if (body === null) return;
  // Hard rule: this server never touches raw bank details.
  if (body.account_number || body.routing_number || body.bank_account || body.iban) {
    return sendError(res, 400, 'do not send bank details to this server — payouts are handled through Stripe Connect');
  }
  const patch = {};
  if (typeof body.display_name === 'string' && body.display_name.trim() !== '') {
    patch.display_name = body.display_name.trim();
  }
  if (body.payout_method !== undefined) {
    if (body.payout_method !== 'stripe_connect') {
      return sendError(res, 400, "payout_method must be 'stripe_connect'");
    }
    patch.payout_method = 'stripe_connect';
    patch.payout_status = stripe.isConfigured() ? 'pending_onboarding' : 'stub_pending_keys';
  }
  return sendJson(res, 200, store.update('filmmakers', filmmakerId, patch));
}

function filmmakerConnect(req, res, filmmakerId) {
  const f = store.get('filmmakers', filmmakerId);
  if (!f) return sendError(res, 404, 'filmmaker not found');
  // Stripe Connect onboarding-link shape lives in lib/stripe.js; without keys
  // this is deliberately unusable.
  return sendError(res, 503, "Stripe Connect not configured — needs Dino's keys", {
    legal_notice: passLib.LEGAL_NOTICE,
  });
}

function filmmakerOnboarding(req, res, filmmakerId) {
  const f = store.get('filmmakers', filmmakerId);
  if (!f) return sendError(res, 404, 'filmmaker not found');
  const films = store.all('films').filter((fl) => fl.filmmaker_email === f.email);
  const filmIds = new Set(films.map((fl) => fl.film_id));
  // "Audience invite" is done when the filmmaker has imported their Vimeo
  // audience-export contacts (notices — never access) or has approved claims.
  const invited = store.all('migration_contacts').some((c) => filmIds.has(c.film_id));
  const claimedAccess = store
    .all('entitlements')
    .some((e) => filmIds.has(e.film_id) && (e.source === 'claim'));
  const steps = [
    { id: 'account', label: 'Account setup', done: true },
    { id: 'connect', label: 'Stripe Connect (test-mode shape)', done: f.connect_status === 'active' },
    { id: 'payout', label: 'Payout details', done: f.payout_status !== 'not_started' },
    { id: 'catalog', label: 'Catalog import', done: films.length > 0 },
    { id: 'audience', label: 'Audience invite', done: invited || claimedAccess },
  ];
  return sendJson(res, 200, { filmmaker: f, steps, complete: steps.every((s) => s.done) });
}

function filmmakerProfile(req, res, filmmakerId) {
  const f = store.get('filmmakers', filmmakerId);
  if (!f) return sendError(res, 404, 'filmmaker not found');
  const films = store.all('films').filter((fl) => fl.filmmaker_email === f.email).map(publicFilm);
  return sendJson(res, 200, {
    filmmaker_id: f.filmmaker_id,
    display_name: f.display_name,
    films,
  });
}

// ---------------------------------------------------------------------------
// M2: buyer library — purchase history + permanent-license view (NOT copyright ownership).
// (No buyer auth in M2 scope; the email in the path selects the library.
//  Flagged in README as a pre-launch hardening item.)

function buyerLibrary(req, res, emailParam) {
  let email;
  try {
    email = decodeURIComponent(emailParam).trim().toLowerCase();
  } catch {
    return sendError(res, 400, 'invalid email');
  }
  if (!isEmail(email)) return sendError(res, 400, 'invalid email');
  const items = store
    .all('entitlements')
    .filter((e) => e.email === email)
    .map((e) => {
      const film = store.get('films', e.film_id);
      const rec = e.receipt_id ? store.get('receipts', e.receipt_id) : null;
      return {
        entitlement: e,
        film: film ? Object.assign(publicFilm(film), { playback_url: CDN.getPlaybackUrl(film) }) : null,
        receipt: rec ? rec.receipt : null,
        signature: rec ? rec.signature : null,
        license_term: 'permanent', // NOT copyright ownership — wording pending counsel review
      };
    });
  return sendJson(res, 200, { email, films_owned: items.length, items });
}


// ---------------------------------------------------------------------------
// router
// ---------------------------------------------------------------------------

async function handleApi(req, res, url, seg, method) {
  // seg: path segments after /api
  // --- auth ---
  if (seg[0] === 'auth' && seg[1] === 'signup' && seg.length === 2 && method === 'POST') {
    return signup(req, res);
  }
  if (seg[0] === 'auth' && seg[1] === 'login' && seg.length === 2 && method === 'POST') {
    return login(req, res);
  }
  if (seg[0] === 'auth' && seg[1] === 'logout' && seg.length === 2 && method === 'POST') {
    return logout(req, res);
  }
  if (seg[0] === 'auth' && seg[1] === 'me' && seg.length === 2 && method === 'GET') {
    return authMe(req, res);
  }
  if (seg[0] === 'films' && seg.length === 1 && method === 'GET') {
    // M2: ?q= searches title+description, ?genre= filters by genre tag.
    let films = store.all('films');
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();
    const genre = (url.searchParams.get('genre') || '').trim().toLowerCase();
    if (q) {
      films = films.filter((f) => ((f.title || '') + ' ' + (f.description || '')).toLowerCase().includes(q));
    }
    if (genre) {
      films = films.filter((f) => (f.genres || []).some((g) => String(g).toLowerCase() === genre));
    }
    return sendJson(res, 200, films.map(publicFilm));
  }
  if (seg[0] === 'films' && seg[1] === 'import' && seg.length === 2 && method === 'POST') {
    const account = requireFilmmaker(req, res);
    if (!account) return;
    return importFilm(req, res, account);
  }
  if (seg[0] === 'films' && seg[2] === 'stream' && seg.length === 3 && method === 'GET') {
    const account = requireAuth(req, res);
    if (!account) return;
    const film = store.get('films', seg[1]);
    if (!film) return sendError(res, 404, 'film not found');
    if (!ownsFilm(account, film) && !hasEntitlement(account, film.film_id))
      return sendError(res, 403, 'purchase required to stream this film');
    return CDN.streamFile(req, res, film);
  }
  if (seg[0] === 'films' && seg[2] === 'download' && seg.length === 3 && method === 'GET') {
    const account = requireAuth(req, res);
    if (!account) return;
    const film = store.get('films', seg[1]);
    if (!film) return sendError(res, 404, 'film not found');
    if (!ownsFilm(account, film) && !hasEntitlement(account, film.film_id))
      return sendError(res, 403, 'purchase required to download this film');
    return downloadFilm(req, res, seg[1]);
  }
  if (seg[0] === 'films' && seg[2] === 'audience.csv' && seg.length === 3 && method === 'GET') {
    const account = requireFilmmaker(req, res);
    if (!account) return;
    const film = store.get('films', seg[1]);
    if (!film) return sendError(res, 404, 'film not found');
    if (!ownsFilm(account, film))
      return sendError(res, 403, 'only the filmmaker who owns this film can view its audience');
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
    const account = requireFilmmaker(req, res);
    if (!account) return;
    const filmId = url.searchParams.get('film_id');
    const ownFilmIds = new Set(
      store.all('films').filter((f) => ownsFilm(account, f)).map((f) => f.film_id)
    );
    const claims = store.all('claims').filter((c) =>
      ownFilmIds.has(c.film_id) && (!filmId || c.film_id === filmId)
    );
    return sendJson(res, 200, claims);
  }
  if (seg[0] === 'claims' && seg[1] === 'review-queue' && seg.length === 2 && method === 'GET') {
    const account = requireFilmmaker(req, res);
    if (!account) return;
    const ownFilmIds = new Set(
      store.all('films').filter((f) => ownsFilm(account, f)).map((f) => f.film_id)
    );
    const queue = store.all('claims').filter((c) =>
      c.status === 'needs_review' && ownFilmIds.has(c.film_id)
    );
    return sendJson(res, 200, queue);
  }
  if (seg[0] === 'claims' && seg[2] === 'review' && seg.length === 3 && method === 'POST') {
    const account = requireFilmmaker(req, res);
    if (!account) return;
    const claim = store.get('claims', seg[1]);
    if (!claim) return sendError(res, 404, 'claim not found');
    const film = store.get('films', claim.film_id);
    if (!ownsFilm(account, film))
      return sendError(res, 403, 'only the filmmaker who owns this film can review its claims');
    return reviewClaim(req, res, seg[1]);
  }
  if (seg[0] === 'claims' && seg[2] === 'approve' && seg.length === 3 && method === 'POST') {
    const account = requireFilmmaker(req, res);
    if (!account) return;
    const claim = store.get('claims', seg[1]);
    if (!claim) return sendError(res, 404, 'claim not found');
    const film = store.get('films', claim.film_id);
    if (!ownsFilm(account, film))
      return sendError(res, 403, 'only the filmmaker who owns this film can approve its claims');
    return approveClaim(req, res, seg[1]);
  }
  if (seg[0] === 'purchases' && seg[1] === 'test' && seg.length === 2 && method === 'POST') {
    return testPurchase(req, res);
  }
  if (seg[0] === 'purchases' && seg[1] === 'bundle' && seg[2] === 'test' && seg.length === 3 && method === 'POST') {
    return bundleTestPurchase(req, res);
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
  if (seg[0] === 'receipts' && seg[1] === 'terms' && seg.length === 2 && method === 'GET') {
    return sendJson(res, 200, { terms: receipts.TERMS, terms_hash: receipts.TERMS_HASH });
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
  // M2: Collector Pass — REQUIRES LEGAL REVIEW BEFORE LAUNCH (money-transmission risk).
  if (seg[0] === 'passes' && seg[1] === 'test' && seg.length === 2 && method === 'POST') {
    return passTestSubscribe(req, res);
  }
  if (seg[0] === 'passes' && seg[1] === 'checkout' && seg.length === 2 && method === 'POST') {
    return passCheckout(req, res);
  }
  if (seg[0] === 'passes' && seg.length === 2 && method === 'GET') {
    return passDetail(req, res, seg[1]);
  }
  // DF-MEDIA-3: mint a short-lived signed playback URL for an entitled pass
  // holder. The <video> element cannot send an Authorization header, so the
  // signed URL (query-token) is the playable credential.
  if (seg[0] === 'passes' && seg[2] === 'playback-url' && seg.length === 3 && method === 'GET') {
    return passPlaybackUrl(req, res, url, seg[1]);
  }
  // DF-MEDIA-3: serve the master behind a verified signed playback URL.
  // No Authorization header needed — the signature IS the credential.
  if (seg[0] === 'media' && seg[1] === 'play' && seg.length === 2 && method === 'GET') {
    return mediaPlay(req, res, url);
  }
  if (seg[0] === 'passes' && seg[2] === 'redeem' && seg.length === 3 && method === 'POST') {
    return passRedeem(req, res, seg[1]);
  }
  // M2: filmmaker onboarding.
  if (seg[0] === 'filmmakers' && seg.length === 1 && method === 'POST') {
    return createFilmmaker(req, res);
  }
  if (seg[0] === 'filmmakers' && seg.length === 2 && method === 'GET') {
    return getFilmmaker(req, res, seg[1]);
  }
  if (seg[0] === 'filmmakers' && seg.length === 2 && method === 'PATCH') {
    return updateFilmmaker(req, res, seg[1]);
  }
  if (seg[0] === 'filmmakers' && seg[2] === 'connect' && seg.length === 3 && method === 'POST') {
    return filmmakerConnect(req, res, seg[1]);
  }
  if (seg[0] === 'filmmakers' && seg[2] === 'onboarding' && seg.length === 3 && method === 'GET') {
    return filmmakerOnboarding(req, res, seg[1]);
  }
  if (seg[0] === 'filmmakers' && seg[2] === 'profile' && seg.length === 3 && method === 'GET') {
    return filmmakerProfile(req, res, seg[1]);
  }
  // M2: buyer library (purchase history).
  if (seg[0] === 'buyers' && seg[2] === 'library' && seg.length === 3 && method === 'GET') {
    const account = requireAuth(req, res);
    if (!account) return;
    const requested = decodeURIComponent(seg[1]).trim().toLowerCase();
    if (requested !== account.email.toLowerCase())
      return sendError(res, 403, 'you can only view your own library');
    return buyerLibrary(req, res, seg[1]);
  }
  if (seg[0] === 'health' && seg.length === 1 && method === 'GET') {
    return sendJson(res, 200, {
      service: 'decentralflix-lifeboat',
      milestone: 'M2',
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

// DAT-002: complete any multi-file write sequence a previous run staged
// but never committed (crash between the writes), before serving traffic.
const recovery = store.reconcileOnBoot();
if (recovery.recovered > 0) {
  console.log(`decentralflix-lifeboat: crash recovery completed ${recovery.recovered} interrupted transaction(s)`);
}

server.listen(PORT, HOST, () => {
  console.log(`decentralflix-lifeboat M2 listening on http://${HOST}:${PORT} (cdn=${CDN.constructor.name})`);
  if (playback.secretIsDefault()) {
    console.warn('WARNING: DECENTRALFLIX_MEDIA_SECRET is not set — signed playback URLs use a dev-only default secret. Set the env var in production.');
  }
});
