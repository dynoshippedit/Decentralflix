#!/usr/bin/env node
'use strict';
// Offline receipt verifier (CLI).
//
// Verifies a Decentralflix portable receipt WITHOUT trusting the server:
// the Ed25519 math is the pure-JS implementation in ../lib/ed25519.js
// (no node:crypto verify), and the public key comes from a base64 DER SPKI
// blob you supply — or fetched once from the server's /api/receipts/pubkey
// and then verified locally.
//
// Usage:
//   node tools/verify-receipt.js --pubkey <base64-der-spki> receipt.json
//   node tools/verify-receipt.js --server http://127.0.0.1:8080 receipt.json
//
// receipt.json may be the wrapped shape {receipt, signature} or the unwrapped
// shape {...fields, signature}. Exits 0 and prints VALID, exits 1 and prints
// INVALID otherwise. Prints the entitlement details on success.

const fs = require('node:fs');
const http = require('node:http');
const crypto = require('node:crypto');
const path = require('node:path');
const ed = require('../lib/ed25519');

function usage() {
  console.error('usage: node tools/verify-receipt.js (--pubkey <base64> | --server <base>) receipt.json');
  process.exit(2);
}

function sha512(data) {
  return Promise.resolve(
    Uint8Array.from(crypto.createHash('sha512').update(Buffer.from(data)).digest())
  );
}

function fetchPubkey(serverBase) {
  return new Promise((resolve, reject) => {
    const url = serverBase.replace(/\/+$/, '') + '/api/receipts/pubkey';
    http
      .get(url, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          if (res.statusCode !== 200) return reject(new Error('pubkey fetch failed: ' + res.statusCode));
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')).public_key);
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject);
  });
}

async function main() {
  const args = process.argv.slice(2);
  let pubkeyB64 = null;
  let serverBase = null;
  let file = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--pubkey' && args[i + 1]) pubkeyB64 = args[++i];
    else if (args[i] === '--server' && args[i + 1]) serverBase = args[++i];
    else if (!args[i].startsWith('--')) file = args[i];
    else usage();
  }
  if (!file || (!pubkeyB64 && !serverBase)) usage();

  if (serverBase) pubkeyB64 = await fetchPubkey(serverBase);

  const raw = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
  let receipt = raw.receipt;
  let signature = raw.signature;
  if ((!receipt || typeof receipt !== 'object') && typeof signature === 'string') {
    const { signature: sig, ...fields } = raw; // unwrapped shape
    receipt = fields;
    signature = sig;
  }
  if (!receipt || typeof receipt !== 'object' || typeof signature !== 'string') {
    console.error('INVALID: could not find {receipt, signature} in ' + file);
    process.exit(1);
  }

  const der = ed.base64ToBytes(pubkeyB64);
  const pubRaw = ed.parseSpkiDerPublicKey(der);
  if (!pubRaw) {
    console.error('INVALID: public key is not a valid Ed25519 SPKI DER blob');
    process.exit(1);
  }

  const msg = ed.canonicalJsonBytes(receipt);
  const ok = await ed.verify(pubRaw, ed.base64ToBytes(signature), msg, sha512);

  if (!ok) {
    console.log('INVALID: Ed25519 signature does not verify');
    process.exit(1);
  }

  console.log('VALID: Ed25519 signature verifies (offline, pure-JS implementation)');
  console.log('  receipt_id:        ' + receipt.receipt_id);
  console.log('  film_id:           ' + receipt.film_id);
  console.log('  buyer_email_sha256:' + ' ' + receipt.buyer_email_sha256);
  console.log('  price_usd_cents:   ' + receipt.price_usd_cents);
  console.log('  granted_at:        ' + receipt.granted_at);
  console.log('  transferable:      ' + receipt.transferable);
}

main().catch((err) => {
  console.error('error: ' + (err && err.message ? err.message : err));
  process.exit(2);
});
