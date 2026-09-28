'use strict';
// Decentralflix Lifeboat — authentication library.
// Email + password accounts with scrypt hashing and random session tokens.
// Zero dependencies: node:crypto only. Sessions are bearer tokens sent as
// `Authorization: Bearer <token>`.
//
// Roles:
//   - 'buyer': can purchase, stream/download owned films, view own library
//   - 'filmmaker': everything a buyer can do, plus import films, view
//     audience.csv for own films, approve claims for own films
//
// This is a local test/dev auth system. It is NOT hardened for production
// (no rate limiting, no email verification, no 2FA). Labels in the UI must
// say so.

const crypto = require('node:crypto');

const SCRYPT_KEYLEN = 32;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1], 'hex');
  const expected = Buffer.from(parts[2], 'hex');
  if (salt.length === 0 || expected.length !== SCRYPT_KEYLEN) return false;
  const actual = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
  return crypto.timingSafeEqual(actual, expected);
}

function newToken() {
  return crypto.randomBytes(32).toString('hex');
}

function newSession(accountId) {
  const now = Date.now();
  return {
    token: newToken(),
    account_id: accountId,
    created_at: new Date(now).toISOString(),
    expires_at: new Date(now + SESSION_TTL_MS).toISOString(),
  };
}

function sessionValid(session) {
  return !!session && Date.parse(session.expires_at) > Date.now();
}

module.exports = {
  hashPassword,
  verifyPassword,
  newToken,
  newSession,
  sessionValid,
  SESSION_TTL_MS,
};
