/**
 * Tests for lib/web3/wrappers/payPerView.ts (mocked factory module).
 */
import { describe, expect, it, vi } from 'vitest';
import type { ContractRunner } from 'ethers';
import * as w from './payPerView';

const stubState = vi.hoisted(() => ({
  instances: [] as Array<{ calls: Record<string, unknown[][]> }>,
}));

const ADDR = '0x1111111111111111111111111111111111111111';
const ADDR2 = '0x2222222222222222222222222222222222222222';

const FIXTURES: Record<string, unknown> = {
  getFilm: { filmmaker: ADDR, priceWei: BigInt(400), exists: true },
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

describe('payPerView wrappers call the right methods', () => {
  it('buyAccess passes value', () =>
    expectCall('buyAccess', [[BigInt(5), { value: BigInt(400) }]], () => w.buyAccess(RUNNER, 5, BigInt(400))));
  it('hasAccess', () =>
    expectCall('hasAccess', [[ADDR, BigInt(5)]], () => w.hasAccess(RUNNER, ADDR, 5)));
  it('owner', () => expectCall('owner', [[]], () => w.owner(RUNNER)));
  it('platformFeeBps reads the immutable on-chain constant', () =>
    expectCall('PLATFORM_FEE_BPS', [[]], () => w.platformFeeBps(RUNNER)));
  it('registerFilm passes the explicit filmmaker (owner only)', () =>
    expectCall('registerFilm', [[BigInt(5), BigInt(400), ADDR, {}]], () => w.registerFilm(RUNNER, 5, BigInt(400), ADDR)));
  it('renounceOwnership', () => expectCall('renounceOwnership', [[{}]], () => w.renounceOwnership(RUNNER)));
  it('setFilmPrice', () =>
    expectCall('setFilmPrice', [[BigInt(5), BigInt(450), {}]], () => w.setFilmPrice(RUNNER, 5, BigInt(450))));
  it('transferOwnership', () =>
    expectCall('transferOwnership', [[ADDR2, {}]], () => w.transferOwnership(RUNNER, ADDR2)));

  it('getFilm maps the tuple', async () => {
    stubState.instances.length = 0;
    const film = await w.getFilm(RUNNER, 5);
    expect(lastCalls()['getFilm']).toEqual([[BigInt(5)]]);
    expect(film).toEqual({ filmmaker: ADDR, priceWei: BigInt(400), exists: true });
  });
});

describe('payPerView input validation', () => {
  it('rejects bad user address', async () => {
    await expect(w.hasAccess(RUNNER, 'bad', 1)).rejects.toThrow(/user.*address/i);
  });
  it('rejects bad film ids', async () => {
    await expect(w.buyAccess(RUNNER, -1, BigInt(5))).rejects.toThrow(/filmId/);
  });
});
