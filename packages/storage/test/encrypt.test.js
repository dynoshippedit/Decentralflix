import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import {
  generateKey,
  validateKey,
  encryptFragment,
  decryptFragment,
  serializeEncrypted,
  deserializeEncrypted,
  KEY_BYTES,
} from '../src/encrypt.js';
import { ValidationError } from '../src/errors.js';

describe('encrypt: keys', () => {
  it('generateKey returns 32 random bytes', () => {
    const k1 = generateKey();
    const k2 = generateKey();
    assert.equal(k1.length, KEY_BYTES);
    assert.ok(!k1.equals(k2), 'two generated keys must differ');
  });

  it('validateKey accepts 32-byte Buffer, rejects the rest', () => {
    validateKey(generateKey());
    assert.throws(() => validateKey(randomBytes(16)), ValidationError);
    assert.throws(() => validateKey(randomBytes(31)), ValidationError);
    assert.throws(() => validateKey('a'.repeat(32)), ValidationError);
    assert.throws(() => validateKey(null), ValidationError);
  });
});

describe('encrypt: round-trip', () => {
  it('decrypt(encrypt(x)) === x', () => {
    const key = generateKey();
    const data = randomBytes(1_000_003);
    const packet = encryptFragment(data, key);
    assert.ok(decryptFragment(packet, key).equals(data));
  });

  it('never reuses IVs: same plaintext encrypts differently', () => {
    const key = generateKey();
    const data = randomBytes(1024);
    const a = encryptFragment(data, key);
    const b = encryptFragment(data, key);
    assert.notEqual(a.iv, b.iv);
    assert.notEqual(a.ciphertext, b.ciphertext);
  });

  it('decryption with the wrong key fails', () => {
    const packet = encryptFragment(randomBytes(512), generateKey());
    assert.throws(() => decryptFragment(packet, generateKey()), (err) => {
      assert.ok(err instanceof ValidationError);
      assert.match(err.message, /authentication failed/i);
      return true;
    });
  });

  it('corrupted ciphertext fails authentication', () => {
    const key = generateKey();
    const packet = encryptFragment(randomBytes(512), key);
    const bytes = Buffer.from(packet.ciphertext, 'hex');
    bytes[10] ^= 0x01;
    assert.throws(() => decryptFragment({ ...packet, ciphertext: bytes.toString('hex') }, key), ValidationError);
  });

  it('corrupted auth tag fails authentication', () => {
    const key = generateKey();
    const packet = encryptFragment(randomBytes(512), key);
    const tag = Buffer.from(packet.authTag, 'hex');
    tag[0] ^= 0x01;
    assert.throws(() => decryptFragment({ ...packet, authTag: tag.toString('hex') }, key), ValidationError);
  });

  it('rejects malformed packets', () => {
    const key = generateKey();
    assert.throws(() => decryptFragment({ iv: 'deadbeef', ciphertext: '00', authTag: '00' }, key), ValidationError);
    assert.throws(() => decryptFragment(null, key), ValidationError);
  });

  it('rejects empty plaintext', () => {
    assert.throws(() => encryptFragment(Buffer.alloc(0), generateKey()), ValidationError);
  });
});

describe('encrypt: wire format', () => {
  it('serialize/deserialize round-trips and decrypts', () => {
    const key = generateKey();
    const data = randomBytes(777);
    const wire = serializeEncrypted(encryptFragment(data, key));
    assert.equal(wire.length, 12 + 16 + 777);
    const packet = deserializeEncrypted(wire);
    assert.ok(decryptFragment(packet, key).equals(data));
  });

  it('deserialize rejects truncated wire bytes', () => {
    assert.throws(() => deserializeEncrypted(randomBytes(20)), ValidationError);
    assert.throws(() => deserializeEncrypted('not a buffer'), ValidationError);
  });
});
