/**
 * @decentralflix/storage — per-fragment AES-256-GCM encryption.
 *
 * Each fragment is encrypted independently with a fresh random 12-byte IV,
 * so identical plaintext fragments produce different ciphertext. The key is
 * caller-managed: whoever holds the 32-byte key can decrypt (this is
 * at-rest confidentiality, NOT DRM — see LIMITATIONS.md).
 */

import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { ValidationError } from './errors.js';

export const ALGORITHM = 'aes-256-gcm';
export const KEY_BYTES = 32;
export const IV_BYTES = 12;
export const AUTH_TAG_BYTES = 16;

/**
 * Binary wire format for a stored encrypted fragment:
 *   iv (12 bytes) || authTag (16 bytes) || ciphertext (n bytes)
 * The manifest's sha256 is computed over exactly these bytes.
 */
export const WIRE_IV_LENGTH = IV_BYTES;
export const WIRE_TAG_LENGTH = AUTH_TAG_BYTES;

/** Generate a fresh random 32-byte encryption key. */
export function generateKey() {
  return randomBytes(KEY_BYTES);
}

/** Validate that a value is a 32-byte key Buffer. @throws {ValidationError} */
export function validateKey(key) {
  if (!Buffer.isBuffer(key) || key.length !== KEY_BYTES) {
    throw new ValidationError('encryption key must be a 32-byte Buffer');
  }
}

/**
 * Encrypt one fragment.
 * @param {Buffer} data - plaintext fragment bytes
 * @param {Buffer} key - 32-byte key
 * @returns {{iv:string, ciphertext:string, authTag:string}} hex-encoded packet
 */
export function encryptFragment(data, key) {
  if (!Buffer.isBuffer(data)) {
    throw new ValidationError('encryptFragment: data must be a Buffer');
  }
  if (data.length === 0) {
    throw new ValidationError('encryptFragment: data must not be empty');
  }
  validateKey(key);
  const iv = randomBytes(IV_BYTES); // fresh IV per fragment — never reused
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    iv: iv.toString('hex'),
    ciphertext: ciphertext.toString('hex'),
    authTag: authTag.toString('hex'),
  };
}

/**
 * Decrypt one fragment packet.
 * @param {{iv:string, ciphertext:string, authTag:string}} packet
 * @param {Buffer} key - 32-byte key
 * @returns {Buffer} plaintext
 * @throws {ValidationError} on malformed packet, wrong key, or corrupted data
 */
export function decryptFragment(packet, key) {
  validateKey(key);
  if (!packet || typeof packet !== 'object') {
    throw new ValidationError('decryptFragment: packet must be an object');
  }
  const iv = Buffer.from(packet.iv ?? '', 'hex');
  const ciphertext = Buffer.from(packet.ciphertext ?? '', 'hex');
  const authTag = Buffer.from(packet.authTag ?? '', 'hex');
  if (iv.length !== IV_BYTES || authTag.length !== AUTH_TAG_BYTES || ciphertext.length === 0) {
    throw new ValidationError('decryptFragment: malformed encrypted packet');
  }
  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch (err) {
    throw new ValidationError(
      'decryptFragment: authentication failed — wrong key or corrupted data',
      { code: 'DECRYPT_AUTH_FAILED', cause: err },
    );
  }
}

/**
 * Serialize an encrypted packet to the binary wire format
 * (iv || authTag || ciphertext) for storage and hashing.
 */
export function serializeEncrypted(packet) {
  if (!packet || typeof packet !== 'object') {
    throw new ValidationError('serializeEncrypted: packet must be an object');
  }
  const iv = Buffer.from(packet.iv ?? '', 'hex');
  const authTag = Buffer.from(packet.authTag ?? '', 'hex');
  const ciphertext = Buffer.from(packet.ciphertext ?? '', 'hex');
  if (iv.length !== IV_BYTES || authTag.length !== AUTH_TAG_BYTES || ciphertext.length === 0) {
    throw new ValidationError('serializeEncrypted: malformed encrypted packet');
  }
  return Buffer.concat([iv, authTag, ciphertext]);
}

/** Inverse of serializeEncrypted. */
export function deserializeEncrypted(wire) {
  if (!Buffer.isBuffer(wire)) {
    throw new ValidationError('deserializeEncrypted: wire must be a Buffer');
  }
  if (wire.length < IV_BYTES + AUTH_TAG_BYTES + 1) {
    throw new ValidationError('deserializeEncrypted: wire bytes too short to be a valid packet');
  }
  return {
    iv: wire.subarray(0, IV_BYTES).toString('hex'),
    authTag: wire.subarray(IV_BYTES, IV_BYTES + AUTH_TAG_BYTES).toString('hex'),
    ciphertext: wire.subarray(IV_BYTES + AUTH_TAG_BYTES).toString('hex'),
  };
}
