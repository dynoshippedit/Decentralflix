/**
 * Tests for lib/web3/wrappers/ticketNft.ts.
 * The '../contracts' factory module is mocked with a recording Proxy stub,
 * so each wrapper is verified to call the right contract method with the
 * right args (after validation/normalization).
 */
import { describe, expect, it, vi } from 'vitest';
import type { ContractRunner } from 'ethers';
import * as w from './ticketNft';

const stubState = vi.hoisted(() => ({
  instances: [] as Array<{ calls: Record<string, unknown[][]> }>,
}));

const ADDR = '0x1111111111111111111111111111111111111111';
const ADDR2 = '0x2222222222222222222222222222222222222222';

const FIXTURES: Record<string, unknown> = {
  getFilm: {
    title: 'T', priceWei: BigInt(9), filmmaker: ADDR, active: true,
    soulbound: false, metadataURI: 'ipfs://x', exists: true,
  },
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

/** Run fn against a fresh stub and assert the recorded call. */
async function expectCall(key: string, expectedArgs: unknown[][], fn: () => Promise<unknown>) {
  stubState.instances.length = 0;
  await fn();
  expect(lastCalls()[key]).toEqual(expectedArgs);
}

describe('ticketNft wrappers call the right methods', () => {
  it('approve', () => expectCall('approve', [[ADDR2, BigInt(3), {}]], () => w.approve(RUNNER, ADDR2, 3)));
  it('balanceOf', () => expectCall('balanceOf', [[ADDR]], () => w.balanceOf(RUNNER, ADDR)));
  it('getApproved', () => expectCall('getApproved', [[BigInt(3)]], () => w.getApproved(RUNNER, 3)));
  it('hasValidTicket', () =>
    expectCall('hasValidTicket', [[ADDR, BigInt(3)]], () => w.hasValidTicket(RUNNER, ADDR, 3)));
  it('isApprovedForAll', () =>
    expectCall('isApprovedForAll', [[ADDR, ADDR2]], () => w.isApprovedForAll(RUNNER, ADDR, ADDR2)));
  it('mintTicket passes value', () =>
    expectCall('mintTicket', [[BigInt(7), { value: BigInt(1000) }]], () => w.mintTicket(RUNNER, 7, BigInt(1000))));
  it('name', () => expectCall('name', [[]], () => w.name(RUNNER)));
  it('nextTokenId', () => expectCall('nextTokenId', [[]], () => w.nextTokenId(RUNNER)));
  it('owner', () => expectCall('owner', [[]], () => w.owner(RUNNER)));
  it('ownerOf', () => expectCall('ownerOf', [[BigInt(3)]], () => w.ownerOf(RUNNER, 3)));
  it('redeemTicket', () => expectCall('redeemTicket', [[BigInt(3), {}]], () => w.redeemTicket(RUNNER, 3)));
  it('registerFilm', () =>
    expectCall(
      'registerFilm',
      [[BigInt(1), 'Title', BigInt(500), ADDR, true, 'ipfs://m', {}]],
      () => w.registerFilm(RUNNER, 1, 'Title', BigInt(500), ADDR, true, 'ipfs://m'),
    ));
  it('renounceOwnership', () => expectCall('renounceOwnership', [[{}]], () => w.renounceOwnership(RUNNER)));
  it('safeTransferFrom uses the 3-arg overload', () =>
    expectCall(
      'getFunction:safeTransferFrom(address,address,uint256)',
      [[ADDR, ADDR2, BigInt(3), {}]],
      () => w.safeTransferFrom(RUNNER, ADDR, ADDR2, 3),
    ));
  it('safeTransferFromWithData uses the 4-arg overload', () =>
    expectCall(
      'getFunction:safeTransferFrom(address,address,uint256,bytes)',
      [[ADDR, ADDR2, BigInt(3), '0xdead', {}]],
      () => w.safeTransferFromWithData(RUNNER, ADDR, ADDR2, 3, '0xdead'),
    ));
  it('setApprovalForAll', () =>
    expectCall('setApprovalForAll', [[ADDR2, true, {}]], () => w.setApprovalForAll(RUNNER, ADDR2, true)));
  it('setFilmActive', () =>
    expectCall('setFilmActive', [[BigInt(3), false, {}]], () => w.setFilmActive(RUNNER, 3, false)));
  it('setFilmPrice', () =>
    expectCall('setFilmPrice', [[BigInt(3), BigInt(600), {}]], () => w.setFilmPrice(RUNNER, 3, BigInt(600))));
  it('supportsInterface', () =>
    expectCall('supportsInterface', [['0x80ac58cd']], () => w.supportsInterface(RUNNER, '0x80ac58cd')));
  it('symbol', () => expectCall('symbol', [[]], () => w.symbol(RUNNER)));
  it('ticketFilm', () => expectCall('ticketFilm', [[BigInt(3)]], () => w.ticketFilm(RUNNER, 3)));
  it('tokenURI', () => expectCall('tokenURI', [[BigInt(3)]], () => w.tokenURI(RUNNER, 3)));
  it('transferFrom', () =>
    expectCall('transferFrom', [[ADDR, ADDR2, BigInt(3), {}]], () => w.transferFrom(RUNNER, ADDR, ADDR2, 3)));
  it('transferOwnership', () =>
    expectCall('transferOwnership', [[ADDR2, {}]], () => w.transferOwnership(RUNNER, ADDR2)));
  it('validTicketCount', () =>
    expectCall('validTicketCount', [[ADDR, BigInt(3)]], () => w.validTicketCount(RUNNER, ADDR, 3)));

  it('getFilm maps the tuple to a typed view', async () => {
    stubState.instances.length = 0;
    const film = await w.getFilm(RUNNER, 3);
    expect(lastCalls()['getFilm']).toEqual([[BigInt(3)]]);
    expect(film).toEqual({
      title: 'T', priceWei: BigInt(9), filmmaker: ADDR, active: true,
      soulbound: false, metadataURI: 'ipfs://x', exists: true,
    });
  });
});

describe('ticketNft input validation', () => {
  it('rejects bad addresses', async () => {
    await expect(w.balanceOf(RUNNER, 'nope')).rejects.toThrow(/owner.*address/i);
    await expect(w.mintTicket(RUNNER, 1, BigInt(5)).then(() => w.approve(RUNNER, '0x123', 1))).rejects.toThrow(
      /to.*address/i,
    );
  });
  it('rejects negative / non-integer ids', async () => {
    await expect(w.mintTicket(RUNNER, -1, BigInt(5))).rejects.toThrow(/filmId/);
    await expect(w.ownerOf(RUNNER, 1.5)).rejects.toThrow(/tokenId/);
  });
  it('rejects malformed bytes4', async () => {
    await expect(w.supportsInterface(RUNNER, '0x123')).rejects.toThrow(/bytes4/);
  });
  it('rejects empty title / metadataURI', async () => {
    await expect(w.registerFilm(RUNNER, 1, '', BigInt(5), ADDR, false, 'ipfs://m')).rejects.toThrow(/title/);
    await expect(w.registerFilm(RUNNER, 1, 'T', BigInt(5), ADDR, false, '')).rejects.toThrow(/metadataURI/);
  });
  it('rejects malformed bytes data', async () => {
    await expect(w.safeTransferFromWithData(RUNNER, ADDR, ADDR2, 1, 'zzz')).rejects.toThrow(/data/);
  });
  it('rejects non-boolean flags', async () => {
    await expect(w.setFilmActive(RUNNER, 1, 'yes' as unknown as boolean)).rejects.toThrow(/active/);
  });
});
