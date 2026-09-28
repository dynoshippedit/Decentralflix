import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import {
  ArweaveClient,
  DEFAULT_ARWEAVE_GATEWAY,
  MAX_ARWEAVE_PAYLOAD_BYTES,
} from '../src/arweave.js';
import { ArweaveError, PayloadTooLargeError, ValidationError } from '../src/errors.js';
import { startMockArweave, testSignTx } from './helpers/mock-servers.js';

describe('arweave: client against mock gateway', () => {
  let mock;
  before(async () => {
    mock = await startMockArweave();
  });
  after(async () => {
    await mock.close();
  });

  const client = () => new ArweaveClient({ gateway: mock.url, signTx: testSignTx });

  it('postData then getData round-trips a manifest payload', async () => {
    const payload = JSON.stringify({ filmId: 'f1', hello: 'world' });
    const { id } = await client().postData(payload, { contentType: 'application/json' });
    assert.match(id, /^testtx-/);
    const back = await client().getData(id);
    assert.equal(back.toString('utf8'), payload);
  });

  it('buildTransaction tags Content-Type and App-Name', async () => {
    const tx = client().buildTransaction('{}');
    const decode = (s) => Buffer.from(s, 'base64url').toString('utf8');
    const names = tx.tags.map((t) => decode(t.name));
    assert.ok(names.includes('Content-Type'));
    assert.ok(names.includes('App-Name'));
    assert.equal(tx.format, 2);
  });

  it('refuses payloads larger than 1 MiB', async () => {
    const big = randomBytes(MAX_ARWEAVE_PAYLOAD_BYTES + 1);
    assert.throws(() => client().buildTransaction(big), PayloadTooLargeError);
    await assert.rejects(() => client().postData(big), PayloadTooLargeError);
  });

  it('accepts payloads at exactly the 1 MiB cap', async () => {
    const edge = randomBytes(MAX_ARWEAVE_PAYLOAD_BYTES);
    const { id } = await client().postData(edge, { contentType: 'application/octet-stream' });
    assert.ok((await client().getData(id)).equals(edge));
  });

  it('throws when no signTx is provided', async () => {
    const noSigner = new ArweaveClient({ gateway: mock.url });
    await assert.rejects(() => noSigner.postData('{}'), (err) => {
      assert.ok(err instanceof ArweaveError);
      assert.equal(err.code, 'NO_SIGNER');
      return true;
    });
  });

  it('throws when signTx returns a tx without an id', async () => {
    const badSigner = new ArweaveClient({ gateway: mock.url, signTx: async () => ({}) });
    await assert.rejects(() => badSigner.postData('{}'), (err) => {
      assert.ok(err instanceof ArweaveError);
      assert.equal(err.code, 'INVALID_SIGNATURE_RESULT');
      return true;
    });
  });

  it('getData of unknown tx throws ArweaveError with 404', async () => {
    await assert.rejects(() => client().getData('testtx-missing'), (err) => {
      assert.ok(err instanceof ArweaveError);
      assert.equal(err.status, 404);
      return true;
    });
  });

  it('constructor validates gateway/timeout/signTx', () => {
    assert.throws(() => new ArweaveClient({ gateway: '' }), ValidationError);
    assert.throws(() => new ArweaveClient({ timeoutMs: 0 }), ValidationError);
    assert.throws(() => new ArweaveClient({ signTx: 'nope' }), ValidationError);
  });

  it('default gateway is the public arweave.net', () => {
    assert.equal(DEFAULT_ARWEAVE_GATEWAY, 'https://arweave.net');
  });
});

describe('arweave: error paths', () => {
  it('gateway 500 on POST /tx throws ArweaveError', async () => {
    const mock = await startMockArweave({ failPost: true });
    try {
      const c = new ArweaveClient({ gateway: mock.url, signTx: testSignTx });
      await assert.rejects(() => c.postData('{}'), (err) => {
        assert.ok(err instanceof ArweaveError);
        assert.equal(err.status, 500);
        return true;
      });
    } finally {
      await mock.close();
    }
  });

  it('timeout throws ArweaveError with TIMEOUT code', async () => {
    const mock = await startMockArweave({ delayMs: 1500 });
    try {
      const c = new ArweaveClient({ gateway: mock.url, timeoutMs: 200, signTx: testSignTx });
      await assert.rejects(() => c.getData('testtx-x'), (err) => {
        assert.ok(err instanceof ArweaveError);
        assert.equal(err.code, 'TIMEOUT');
        return true;
      });
    } finally {
      await mock.close();
    }
  });

  it('unreachable gateway throws ArweaveError', async () => {
    const c = new ArweaveClient({ gateway: 'http://127.0.0.1:9', timeoutMs: 2000, signTx: testSignTx });
    await assert.rejects(() => c.postData('{}'), ArweaveError);
  });
});
