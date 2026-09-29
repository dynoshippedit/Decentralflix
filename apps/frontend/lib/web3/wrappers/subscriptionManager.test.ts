/**
 * Tests for lib/web3/wrappers/subscriptionManager.ts (mocked factory module).
 */
import { describe, expect, it, vi } from 'vitest';
import type { ContractRunner } from 'ethers';
import * as w from './subscriptionManager';

const stubState = vi.hoisted(() => ({
  instances: [] as Array<{ calls: Record<string, unknown[][]> }>,
}));

const ADDR = '0x1111111111111111111111111111111111111111';
const ADDR2 = '0x2222222222222222222222222222222222222222';

const FIXTURES: Record<string, unknown> = {
  getPlan: { name: 'Pro', priceWei: BigInt(200), durationSecs: BigInt(2592000), creator: ADDR2, active: true, exists: true },
  subscriptionOf: { planId: BigInt(3), expiresAt: BigInt(999999) },
};

vi.mock('../contracts', () => {
  const record =
    (calls: Record<string, unknown[][]>, key: string) =>
    (...args: unknown[]) => {
      (calls[key] ??= []).push(args);
      return Promise.resolve(FIXTURES[key] ?? { __called: key, __args: args });
    };
  const make = () => {
    const calls: Record<string, unknown[][]> = {};
    const contract = new Proxy(
      {},
      {
        get(_t, prop: string | symbol) {
          if (prop === '__calls') return calls;
          if (prop === 'getFunction') return (sig: string) => record(calls, `getFunction:${sig}`);
          if (typeof prop === 'string') return record(calls, prop);
          return undefined;
        },
      },
    );
    stubState.instances.push({ calls });
    return contract;
  };
  return { getTicketNFT: make, getSubscriptionManager: make, getPayPerView: make, getDFLIX: make };
});

const RUNNER = {} as unknown as ContractRunner;

function lastCalls(): Record<string, unknown[][]> {
  const s = stubState.instances[stubState.instances.length - 1];
  if (!s) throw new Error('expected a stub contract instance');
  return s.calls;
}

async function expectCall(key: string, expectedArgs: unknown[][], fn: () => Promise<unknown>) {
  stubState.instances.length = 0;
  await fn();
  expect(lastCalls()[key]).toEqual(expectedArgs);
}

describe('subscriptionManager wrappers call the right methods', () => {
  it('cancel', () => expectCall('cancel', [[{}]], () => w.cancel(RUNNER)));
  it('createPlan passes the creator (immutable at creation)', () =>
    expectCall(
      'createPlan',
      [[BigInt(2), 'Pro', BigInt(200), BigInt(2592000), ADDR2, {}]],
      () => w.createPlan(RUNNER, 2, 'Pro', BigInt(200), 2592000, ADDR2),
    ));
  it('deactivatePlan', () => expectCall('deactivatePlan', [[BigInt(2), {}]], () => w.deactivatePlan(RUNNER, 2)));
  it('hasActiveSubscription', () =>
    expectCall('hasActiveSubscription', [[ADDR]], () => w.hasActiveSubscription(RUNNER, ADDR)));
  it('owner', () => expectCall('owner', [[]], () => w.owner(RUNNER)));
  it('platformFeeBps reads the immutable on-chain constant', () =>
    expectCall('PLATFORM_FEE_BPS', [[]], () => w.platformFeeBps(RUNNER)));
  it('renew passes value', () =>
    expectCall('renew', [[BigInt(2), { value: BigInt(200) }]], () => w.renew(RUNNER, 2, BigInt(200))));
  it('renounceOwnership', () => expectCall('renounceOwnership', [[{}]], () => w.renounceOwnership(RUNNER)));
  it('subscribe passes value', () =>
    expectCall('subscribe', [[BigInt(2), { value: BigInt(200) }]], () => w.subscribe(RUNNER, 2, BigInt(200))));
  it('transferOwnership', () =>
    expectCall('transferOwnership', [[ADDR2, {}]], () => w.transferOwnership(RUNNER, ADDR2)));

  it('getPlan maps the tuple (including creator)', async () => {
    stubState.instances.length = 0;
    const plan = await w.getPlan(RUNNER, 2);
    expect(lastCalls()['getPlan']).toEqual([[BigInt(2)]]);
    expect(plan).toEqual({ name: 'Pro', priceWei: BigInt(200), durationSecs: BigInt(2592000), creator: ADDR2, active: true, exists: true });
  });

  it('subscriptionOf maps the tuple', async () => {
    stubState.instances.length = 0;
    const sub = await w.subscriptionOf(RUNNER, ADDR);
    expect(lastCalls()['subscriptionOf']).toEqual([[ADDR]]);
    expect(sub).toEqual({ planId: BigInt(3), expiresAt: BigInt(999999) });
  });
});

describe('subscriptionManager input validation', () => {
  it('rejects zero-duration plans', async () => {
    await expect(w.createPlan(RUNNER, 1, 'P', BigInt(5), 0, ADDR2)).rejects.toThrow(/duration/);
  });
  it('rejects empty plan name', async () => {
    await expect(w.createPlan(RUNNER, 1, '', BigInt(5), 60, ADDR2)).rejects.toThrow(/name/);
  });
  it('rejects bad creator address', async () => {
    await expect(w.createPlan(RUNNER, 1, 'P', BigInt(5), 60, 'bad')).rejects.toThrow(/creator.*address/i);
  });
  it('rejects bad holder address', async () => {
    await expect(w.hasActiveSubscription(RUNNER, 'bad')).rejects.toThrow(/holder.*address/i);
  });
  it('rejects bad plan ids', async () => {
    await expect(w.subscribe(RUNNER, -2, BigInt(5))).rejects.toThrow(/planId/);
  });
});
