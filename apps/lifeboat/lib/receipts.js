'use strict';
// Portable Ed25519 receipts for the Decentralflix Lifeboat.
//
// A receipt is a SIGNED ENTITLEMENT, not a token:
//   - bound to exactly one buyer (email sha256) and one film
//   - transferable: false ALWAYS — it can never be sold, gifted, or cashed out
//   - it evidences a license grant; it is NOT ownership of the file
// Anyone holding the public key (GET /api/receipts/pubkey) can verify a receipt
// offline with POST /api/receipts/verify or any Ed25519 implementation, using the
// canonical-JSON serialization defined here (keys sorted recursively, UTF-8).
//
// Key management: keypair is generated once on first run and stored at
// ./data/receipt-key.pem (mode 0600). data/ is gitignored. If the key file is
// lost, previously issued receipts can no longer be verified against a new key —
// back it up. (M1 scope: single-node key; rotation/KMS is a later milestone.)

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const KEY_PATH = path.join(__dirname, '..', 'data', 'receipt-key.pem');

// Human-readable terms whose sha256 becomes receipts[].terms_hash.
// Bump the version string if the terms ever change.
const TERMS = [
  'decentralflix-lifeboat receipt terms v1',
  'This receipt is a SIGNED ENTITLEMENT, not a token.',
  'It is bound to one buyer email hash and one film id.',
  'It is NEVER transferable, NEVER cashable, and has no cash value.',
  'It evidences a streaming/download license grant; it is not ownership of the file.',
].join('\n');

const TERMS_HASH = crypto.createHash('sha256').update(TERMS, 'utf8').digest('hex');

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value).sort()) out[k] = canonicalize(value[k]);
    return out;
  }
  return value;
}

function canonicalBytes(obj) {
  return Buffer.from(JSON.stringify(canonicalize(obj)), 'utf8');
}

let cached = null;

function getKeys() {
  if (cached) return cached;
  if (fs.existsSync(KEY_PATH)) {
    const privateKey = crypto.createPrivateKey(fs.readFileSync(KEY_PATH, 'utf8'));
    const publicKey = crypto.createPublicKey(privateKey);
    cached = { privateKey, publicKey };
  } else {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
    fs.mkdirSync(path.dirname(KEY_PATH), { recursive: true });
    fs.writeFileSync(KEY_PATH, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
    cached = { privateKey, publicKey };
  }
  return cached;
}

// receiptFields: {receipt_id, film_id, buyer_email_sha256, price_usd_cents,
//                 currency:"USD", granted_at, terms_hash, transferable:false}
// Returns { receipt, signature } where signature is base64 Ed25519 over the
// canonical bytes.
function sign(receiptFields) {
  const { privateKey } = getKeys();
  const receipt = canonicalize(receiptFields);
  const signature = crypto.sign(null, canonicalBytes(receipt), privateKey).toString('base64');
  return { receipt, signature };
}

// Returns true iff signature is a valid Ed25519 signature of the canonical
// form of receipt under this node's public key. Pure cryptography — it does
// NOT consult any entitlement database.
function verify(receipt, signature) {
  try {
    if (!receipt || typeof receipt !== 'object' || typeof signature !== 'string') return false;
    const { publicKey } = getKeys();
    return crypto.verify(
      null,
      canonicalBytes(receipt),
      publicKey,
      Buffer.from(signature, 'base64')
    );
  } catch {
    return false;
  }
}

// Base64 of the DER-encoded SPKI public key, for offline verification.
function getPublicKeyBase64() {
  const { publicKey } = getKeys();
  return publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
}

module.exports = { TERMS, TERMS_HASH, sign, verify, getPublicKeyBase64 };
