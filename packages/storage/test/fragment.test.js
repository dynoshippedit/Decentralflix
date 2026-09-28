import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { splitBuffer, joinFragments, DEFAULT_FRAGMENT_SIZE } from '../src/fragment.js';
import { ValidationError } from '../src/errors.js';

describe('fragment: splitBuffer', () => {
  it('splits 2.5 MiB into 3 fragments (1 MiB default)', () => {
    const buf = randomBytes(Math.floor(2.5 * 1024 * 1024));
    const frags = splitBuffer(buf);
    assert.equal(frags.length, 3);
    assert.equal(frags[0].data.length, DEFAULT_FRAGMENT_SIZE);
    assert.equal(frags[1].data.length, DEFAULT_FRAGMENT_SIZE);
    assert.equal(frags[2].data.length, buf.length - 2 * DEFAULT_FRAGMENT_SIZE);
    assert.deepEqual(frags.map((f) => f.index), [0, 1, 2]);
  });

  it('exact multiple yields no short tail', () => {
    const buf = randomBytes(2 * DEFAULT_FRAGMENT_SIZE);
    const frags = splitBuffer(buf);
    assert.equal(frags.length, 2);
    assert.equal(frags[1].data.length, DEFAULT_FRAGMENT_SIZE);
  });

  it('buffer smaller than fragmentSize yields one fragment', () => {
    const buf = randomBytes(100);
    const frags = splitBuffer(buf);
    assert.equal(frags.length, 1);
    assert.ok(frags[0].data.equals(buf));
  });

  it('honors a custom fragmentSize', () => {
    const buf = randomBytes(10);
    const frags = splitBuffer(buf, 3);
    assert.equal(frags.length, 4);
    assert.equal(frags[3].data.length, 1);
  });

  it('round-trips byte-exact through joinFragments', () => {
    const buf = randomBytes(3 * DEFAULT_FRAGMENT_SIZE + 12345);
    const joined = joinFragments(splitBuffer(buf));
    assert.ok(joined.equals(buf));
  });

  it('throws ValidationError on empty buffer', () => {
    assert.throws(() => splitBuffer(Buffer.alloc(0)), ValidationError);
  });

  it('throws ValidationError on non-Buffer input', () => {
    assert.throws(() => splitBuffer('not a buffer'), ValidationError);
    assert.throws(() => splitBuffer(new Uint8Array(10)), ValidationError);
  });

  it('throws ValidationError on bad fragmentSize', () => {
    assert.throws(() => splitBuffer(randomBytes(10), 0), ValidationError);
    assert.throws(() => splitBuffer(randomBytes(10), -5), ValidationError);
    assert.throws(() => splitBuffer(randomBytes(10), 1.5), ValidationError);
  });
});

describe('fragment: joinFragments', () => {
  it('reassembles out-of-order fragments', () => {
    const buf = randomBytes(2500);
    const frags = splitBuffer(buf, 700);
    const shuffled = [...frags].reverse();
    assert.ok(joinFragments(shuffled).equals(buf));
  });

  it('throws on non-contiguous indexes', () => {
    const buf = randomBytes(100);
    const frags = splitBuffer(buf, 40); // indexes 0,1,2
    assert.throws(() => joinFragments([frags[0], frags[2]]), ValidationError);
  });

  it('throws on duplicate indexes', () => {
    const buf = randomBytes(100);
    const frags = splitBuffer(buf, 50);
    assert.throws(() => joinFragments([frags[0], frags[0]]), ValidationError);
  });

  it('throws on empty array', () => {
    assert.throws(() => joinFragments([]), ValidationError);
  });

  it('throws on non-Buffer fragment data', () => {
    assert.throws(() => joinFragments([{ index: 0, data: 'x' }]), ValidationError);
  });
});
