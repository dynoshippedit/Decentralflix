/* Pure-JavaScript Ed25519 signature verification (RFC 8032).
 *
 * Zero dependencies, no node:crypto, no WebCrypto signing — only BigInt field
 * arithmetic. Runs in Node AND in the browser (UMD wrapper): the browser
 * injects SHA-512 via SubtleCrypto, Node via node:crypto. This is what powers
 * the offline receipt check on public/verify.html and tools/verify-receipt.js,
 * so a receipt can be verified without trusting this server.
 *
 * Correctness is machine-checked: test.sh compares this implementation
 * against node:crypto's native Ed25519 verify on random keypairs.
 */
(function (root, factory) {
  'use strict';
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.Ed25519Pure = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var P = (1n << 255n) - 19n;
  var L = (1n << 252n) + 27742317777372353535851937790883648493n;

  function mod(a) {
    a = a % P;
    return a < 0n ? a + P : a;
  }

  function modMul(a, b) { return mod(a * b); }

  function modPow(base, exp) {
    var r = 1n;
    var b = mod(base);
    var e = exp;
    while (e > 0n) {
      if (e & 1n) r = mod(r * b);
      b = mod(b * b);
      e >>= 1n;
    }
    return r;
  }

  function modInv(a) { return modPow(a, P - 2n); }

  // d = -121665 * inv(121666) mod p
  var D = mod(-121665n * modInv(121666n));
  var D2 = mod(2n * D);
  // sqrt(-1) mod p, needed by pointDecode (p = 2^255-19 is 5 mod 8).
  var SQRT_M1 = modPow(2n, (P - 1n) >> 2n);

  // Base point: derived by decoding its RFC 8032 compressed encoding
  // (0x58 followed by thirty-one 0x66 bytes) rather than trusting
  // transcribed decimal constants. pointDecode is pure field math, so this
  // is not circular — and L*BASE == identity is checked in the test suite.
  var BASE = null; // initialized after pointDecode is defined (see below)
  var IDENTITY = [0n, 1n, 1n, 0n];

  // Hisil et al. addition, complete for extended coordinates.
  function pointAdd(p, q) {
    var X1 = p[0], Y1 = p[1], Z1 = p[2], T1 = p[3];
    var X2 = q[0], Y2 = q[1], Z2 = q[2], T2 = q[3];
    var A = mod((Y1 - X1) * (Y2 - X2));
    var B = mod((Y1 + X1) * (Y2 + X2));
    var C = mod(T1 * D2 * T2);
    var Dd = mod(2n * Z1 * Z2);
    var E = mod(B - A);
    var F = mod(Dd - C);
    var G = mod(Dd + C);
    var H = mod(B + A);
    return [mod(E * F), mod(G * H), mod(F * G), mod(E * H)];
  }

  function scalarMult(p, scalar) {
    var s = scalar;
    if (s < 0n) s = -s;
    var acc = IDENTITY;
    var addend = p;
    while (s > 0n) {
      if (s & 1n) acc = pointAdd(acc, addend);
      addend = pointAdd(addend, addend);
      s >>= 1n;
    }
    return acc;
  }

  function bytesToLe(bytes) {
    var v = 0n;
    for (var i = bytes.length - 1; i >= 0; i--) v = (v << 8n) | BigInt(bytes[i]);
    return v;
  }

  function leToBytes(v, len) {
    var out = new Uint8Array(len);
    var x = v;
    for (var i = 0; i < len; i++) {
      out[i] = Number(x & 0xffn);
      x >>= 8n;
    }
    return out;
  }

  function pointEncode(p) {
    var x = mod(p[0] * modInv(p[2]));
    var y = mod(p[1] * modInv(p[2]));
    var out = leToBytes(y, 32);
    if (x & 1n) out[31] |= 0x80;
    return out;
  }

  // Returns the extended point or null if the encoding is invalid.
  function pointDecode(enc) {
    if (!(enc instanceof Uint8Array) || enc.length !== 32) return null;
    var y = bytesToLe(enc) & ((1n << 255n) - 1n);
    var sign = (enc[31] & 0x80) !== 0;
    if (y >= P) return null;
    // x = sqrt((y^2 - 1) / (d*y^2 + 1)).
    // p = 2^255-19 is 5 mod 8: x = v^((p+3)/8), then correct by sqrt(-1)
    // when v^2 = -x2 instead of x2.
    var y2 = mod(y * y);
    var num = mod(y2 - 1n);
    var den = mod(D * y2 + 1n);
    var inv = modPow(den, P - 2n);
    var x2 = mod(num * inv);
    var x = modPow(x2, (P + 3n) >> 3n);
    if (mod(x * x) !== x2) x = mod(x * SQRT_M1);
    if (mod(x * x) !== x2) return null;
    if ((x & 1n) === 1n) x = P - x;
    if (sign) x = P - x;
    return [x, y, 1n, mod(x * y)];
  }

  // Initialize BASE from the RFC 8032 compressed encoding, now that
  // pointDecode exists. Throws at load time if the constant is bad.
  (function initBase() {
    var enc = new Uint8Array(32);
    enc[0] = 0x58;
    for (var i = 1; i < 32; i++) enc[i] = 0x66;
    BASE = pointDecode(enc);
    if (!BASE) throw new Error('ed25519: base point decode failed');
  })();

  function pointEqualEncoding(a, b) {
    var ea = pointEncode(a);
    var eb = pointEncode(b);
    for (var i = 0; i < 32; i++) if (ea[i] !== eb[i]) return false;
    return true;
  }

  function concat(arrays) {
    var total = 0;
    for (var i = 0; i < arrays.length; i++) total += arrays[i].length;
    var out = new Uint8Array(total);
    var off = 0;
    for (var j = 0; j < arrays.length; j++) {
      out.set(arrays[j], off);
      off += arrays[j].length;
    }
    return out;
  }

  // Canonical JSON: keys sorted recursively — byte-identical to the
  // canonicalization in lib/receipts.js, so signatures made server-side
  // verify here.
  function canonicalize(value) {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (value !== null && typeof value === 'object') {
      var out = {};
      var keys = Object.keys(value).sort();
      for (var i = 0; i < keys.length; i++) out[keys[i]] = canonicalize(value[keys[i]]);
      return out;
    }
    return value;
  }

  function canonicalJsonBytes(value) {
    var s = JSON.stringify(canonicalize(value));
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s);
    return Uint8Array.from(Buffer.from(s, 'utf8'));
  }

  function base64ToBytes(b64) {
    var clean = String(b64).replace(/\s+/g, '');
    if (typeof Buffer !== 'undefined') return Uint8Array.from(Buffer.from(clean, 'base64'));
    var bin = atob(clean);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  // Extracts the 32-byte raw Ed25519 key from a base64 DER SPKI blob
  // (the format served by GET /api/receipts/pubkey). Returns null unless the
  // DER prefix matches exactly.
  var SPKI_PREFIX = [0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00];
  function parseSpkiDerPublicKey(derBytes) {
    var der = derBytes instanceof Uint8Array ? derBytes : new Uint8Array(derBytes);
    if (der.length !== SPKI_PREFIX.length + 32) return null;
    for (var i = 0; i < SPKI_PREFIX.length; i++) {
      if (der[i] !== SPKI_PREFIX[i]) return null;
    }
    return der.slice(SPKI_PREFIX.length);
  }

  // sha512: async function (Uint8Array) -> Uint8Array.
  //   Browser: async (d) => new Uint8Array(await crypto.subtle.digest('SHA-512', d))
  //   Node:    async (d) => Uint8Array.from(require('node:crypto').createHash('sha512').update(d).digest())
  async function verify(publicKey32, signature64, messageBytes, sha512) {
    try {
      var pk = publicKey32 instanceof Uint8Array ? publicKey32 : new Uint8Array(publicKey32);
      var sig = signature64 instanceof Uint8Array ? signature64 : new Uint8Array(signature64);
      var msg = messageBytes instanceof Uint8Array ? messageBytes : new Uint8Array(messageBytes);
      if (pk.length !== 32 || sig.length !== 64) return false;

      var Renc = sig.slice(0, 32);
      var S = bytesToLe(sig.slice(32, 64));
      if (S >= L) return false;

      var R = pointDecode(Renc);
      if (!R) return false;
      var A = pointDecode(pk);
      if (!A) return false;

      var hBytes = await sha512(concat([Renc, pk, msg]));
      var h = bytesToLe(hBytes) % L;

      var lhs = scalarMult(BASE, S);
      var rhs = pointAdd(R, scalarMult(A, h));
      return pointEqualEncoding(lhs, rhs);
    } catch (e) {
      return false;
    }
  }

  return {
    verify: verify,
    parseSpkiDerPublicKey: parseSpkiDerPublicKey,
    base64ToBytes: base64ToBytes,
    canonicalJsonBytes: canonicalJsonBytes,
    canonicalize: canonicalize
  };
});
