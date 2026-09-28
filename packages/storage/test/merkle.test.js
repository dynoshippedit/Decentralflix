import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import {
  buildMerkleRoot,
  getProof,
  verifyMerkleProof,
} from '../src/merkle.js';
import { ValidationError } from '../src/errors.js';

// sha256 helper independent of merkle.js internals (test oracle).
const h = (hexParts) =>
  createHash('sha256')
    .update(Buffer.concat(hexParts.map((p) => Buffer.from(p, 'hex'))))
    .digest('hex');

const leaf = (seed) => createHash('sha256').update(seed).digest('hex');

describe('merkle: buildMerkleRoot', () => {
  it('is deterministic and returns 64-char hex', () => {
    const leaves = [leaf('a'), leaf('b'), leaf('c')];
    assert.equal(buildMerkleRoot(leaves), buildMerkleRoot(leaves));
    assert.match(buildMerkleRoot(leaves), /^[0-9a-f]{64}$/);
  });

  it('matches a hand-computed 2-leaf vector', () => {
    const l0 = leaf('frag0');
    const l1 = leaf('frag1');
    const expected = h([l0, l1]); // sha256(l0 || l1), raw bytes
    assert.equal(buildMerkleRoot([l0, l1]), expected);
  });

  it('is order-sensitive', () => {
    const l0 = leaf('x');
    const l1 = leaf('y');
    assert.notEqual(buildMerkleRoot([l0, l1]), buildMerkleRoot([l1, l0]));
  });

  it('duplicates the last leaf on odd layers', () => {
    const l0 = leaf('0');
    const l1 = leaf('1');
    const l2 = leaf('2');
    const expected = h([h([l0, l1]), h([l2, l2])]);
    assert.equal(buildMerkleRoot([l0, l1, l2]), expected);
  });

  it('treats a single leaf as its own root', () => {
    const l0 = leaf('solo');
    assert.equal(buildMerkleRoot([l0]), l0);
  });

  it('rejects empty / malformed input', () => {
    assert.throws(() => buildMerkleRoot([]), ValidationError);
    assert.throws(() => buildMerkleRoot('nope'), ValidationError);
    assert.throws(() => buildMerkleRoot([leaf('a'), 'ZZZ']), ValidationError);
    assert.throws(() => buildMerkleRoot([leaf('a').toUpperCase()]), ValidationError);
  });
});

describe('merkle: getProof / verifyMerkleProof', () => {
  const sizes = [1, 2, 3, 4, 5, 7, 8, 16];
  for (const n of sizes) {
    it(`round-trips every leaf of a ${n}-leaf tree`, () => {
      const leaves = Array.from({ length: n }, (_, i) => leaf(`frag-${i}-of-${n}`));
      const root = buildMerkleRoot(leaves);
      for (let i = 0; i < n; i++) {
        const proof = getProof(leaves, i);
        assert.equal(
          proof.length,
          n === 1 ? 0 : Math.ceil(Math.log2(n)),
          `proof length for leaf ${i} of ${n}`,
        );
        assert.ok(verifyMerkleProof(root, leaves[i], i, proof), `leaf ${i} verifies`);
      }
    });
  }

  it('rejects a tampered leaf', () => {
    const leaves = [leaf('a'), leaf('b'), leaf('c')];
    const root = buildMerkleRoot(leaves);
    const proof = getProof(leaves, 1);
    const tampered = leaf('b-tampered');
    assert.equal(verifyMerkleProof(root, tampered, 1, proof), false);
  });

  it('rejects a proof built for a different index', () => {
    const leaves = [leaf('a'), leaf('b'), leaf('c'), leaf('d')];
    const root = buildMerkleRoot(leaves);
    const proofFor0 = getProof(leaves, 0);
    assert.equal(verifyMerkleProof(root, leaves[1], 1, proofFor0), false);
  });

  it('rejects a corrupted proof element', () => {
    const leaves = [leaf('a'), leaf('b')];
    const root = buildMerkleRoot(leaves);
    const proof = getProof(leaves, 0);
    proof[0] = leaf('evil');
    assert.equal(verifyMerkleProof(root, leaves[0], 0, proof), false);
  });

  it('rejects a wrong root', () => {
    const leaves = [leaf('a'), leaf('b')];
    const proof = getProof(leaves, 0);
    assert.equal(verifyMerkleProof(leaf('other-root'), leaves[0], 0, proof), false);
  });

  it('rejects out-of-range / malformed proof inputs', () => {
    const leaves = [leaf('a'), leaf('b')];
    assert.throws(() => getProof(leaves, -1), ValidationError);
    assert.throws(() => getProof(leaves, 2), ValidationError);
    assert.throws(() => getProof(leaves, 1.5), ValidationError);
    assert.throws(() => verifyMerkleProof('bad', leaves[0], 0, []), ValidationError);
    assert.throws(() => verifyMerkleProof(leaves[0], 'bad', 0, []), ValidationError);
    assert.throws(() => verifyMerkleProof(leaves[0], leaves[1], 0, ['bad']), ValidationError);
  });

  it('handles the single-leaf tree (empty proof)', () => {
    const l0 = leaf('only');
    const root = buildMerkleRoot([l0]);
    assert.deepEqual(getProof([l0], 0), []);
    assert.equal(verifyMerkleProof(root, l0, 0, []), true);
  });

  it('works on random 64-leaf trees', () => {
    const leaves = Array.from({ length: 64 }, () => randomBytes(32).toString('hex'));
    const root = buildMerkleRoot(leaves);
    for (let i = 0; i < 64; i += 7) {
      assert.ok(verifyMerkleProof(root, leaves[i], i, getProof(leaves, i)));
    }
  });
});
