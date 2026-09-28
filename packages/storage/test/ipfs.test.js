import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { IpfsClient } from '../src/ipfs.js';
import { IpfsError, ValidationError } from '../src/errors.js';
import { startMockKubo } from './helpers/mock-servers.js';

describe('ipfs: client against mock Kubo', () => {
  let mock;
  before(async () => {
    mock = await startMockKubo();
  });
  after(async () => {
    await mock.close();
  });

  it('add then cat round-trips bytes', async () => {
    const client = new IpfsClient({ endpoint: mock.url });
    const data = randomBytes(50_000);
    const { cid, size } = await client.add(data);
    assert.match(cid, /^mockcid-/);
    assert.equal(size, data.length);
    const back = await client.cat(cid);
    assert.ok(back.equals(data));
  });

  it('add handles multi-megabyte payloads', async () => {
    const client = new IpfsClient({ endpoint: mock.url });
    const data = randomBytes(2 * 1024 * 1024 + 7);
    const { cid } = await client.add(data);
    assert.ok((await client.cat(cid)).equals(data));
  });

  it('pin records the cid', async () => {
    const client = new IpfsClient({ endpoint: mock.url });
    const { cid } = await client.add(randomBytes(100));
    const res = await client.pin(cid);
    assert.ok(res.Pins.includes(cid));
    assert.ok(mock.pinned.has(cid));
  });

  it('cat of unknown cid throws IpfsError with 404 status', async () => {
    const client = new IpfsClient({ endpoint: mock.url });
    await assert.rejects(() => client.cat('mockcid-doesnotexist'), (err) => {
      assert.ok(err instanceof IpfsError);
      assert.equal(err.status, 404);
      assert.match(err.message, /HTTP 404/);
      return true;
    });
  });

  it('constructor validates endpoint/timeout', () => {
    assert.throws(() => new IpfsClient({ endpoint: '' }), ValidationError);
    assert.throws(() => new IpfsClient({ timeoutMs: 0 }), ValidationError);
    assert.throws(() => new IpfsClient({ timeoutMs: -1 }), ValidationError);
  });

  it('add/cat/pin validate arguments', async () => {
    const client = new IpfsClient({ endpoint: mock.url });
    await assert.rejects(() => client.add('nope'), ValidationError);
    await assert.rejects(() => client.cat(''), ValidationError);
    await assert.rejects(() => client.pin(null), ValidationError);
  });
});

describe('ipfs: error paths', () => {
  it('invalid JSON from /add throws IpfsError', async () => {
    const mock = await startMockKubo({ invalidJsonAdd: true });
    try {
      const client = new IpfsClient({ endpoint: mock.url });
      await assert.rejects(() => client.add(randomBytes(10)), (err) => {
        assert.ok(err instanceof IpfsError);
        assert.equal(err.code, 'INVALID_JSON');
        return true;
      });
    } finally {
      await mock.close();
    }
  });

  it('timeout throws IpfsError with TIMEOUT code', async () => {
    const mock = await startMockKubo({ delayMs: 1500 });
    try {
      const client = new IpfsClient({ endpoint: mock.url, timeoutMs: 200 });
      await assert.rejects(() => client.cat('mockcid-whatever'), (err) => {
        assert.ok(err instanceof IpfsError);
        assert.equal(err.code, 'TIMEOUT');
        return true;
      });
    } finally {
      await mock.close();
    }
  });

  it('unreachable endpoint throws IpfsError (connection refused)', async () => {
    // 127.0.0.1:1 is effectively never a listening service.
    const client = new IpfsClient({ endpoint: 'http://127.0.0.1:1', timeoutMs: 2000 });
    await assert.rejects(() => client.cat('mockcid-x'), (err) => {
      assert.ok(err instanceof IpfsError);
      assert.notEqual(err.code, 'TIMEOUT');
      return true;
    });
  });

  it('garbage endpoint host throws IpfsError', async () => {
    const client = new IpfsClient({ endpoint: 'http://127.0.0.1:9', timeoutMs: 2000 });
    await assert.rejects(() => client.add(randomBytes(10)), IpfsError);
  });
});
