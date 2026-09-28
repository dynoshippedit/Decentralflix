/**
 * Tests for lib/web3/wrappers/dflix.ts (mocked factory module).
 */
import { describe, expect, it, vi } from 'vitest';
import type { ContractRunner } from 'ethers';
import * as w from './dflix';

const stubState = vi.hoisted(() => ({
  instances: [] as Array<{ calls: Record<string, unknown[][]> }>,
}));

const ADDR = '0x1111111111111111111111111111111111111111';
const ADDR2 = '0x2222222222222222222222222222222222222222';
const BYTES32 = '0x' + 'ab'.repeat(32);

const FIXTURES: Record<string, unknown> = {
  pendingRewards: { stakingPart: BigInt(1), seedPart: BigInt(2), total: BigInt(3) },
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

describe('dflix wrappers call the right methods', () => {
  it('DEFAULT_ADMIN_ROLE', () =>
    expectCall('DEFAULT_ADMIN_ROLE', [[]], () => w.defaultAdminRole(RUNNER)));
  it('MAX_SUPPLY', () => expectCall('MAX_SUPPLY', [[]], () => w.maxSupply(RUNNER)));
  it('MINTER_ROLE', () => expectCall('MINTER_ROLE', [[]], () => w.minterRole(RUNNER)));
  it('STAKE_LOCK_PERIOD', () =>
    expectCall('STAKE_LOCK_PERIOD', [[]], () => w.stakeLockPeriod(RUNNER)));
  it('accruedRewards', () => expectCall('accruedRewards', [[ADDR]], () => w.accruedRewards(RUNNER, ADDR)));
  it('allocateSeedReward', () =>
    expectCall(
      'allocateSeedReward',
      [[ADDR, BigInt(50), BYTES32, {}]],
      () => w.allocateSeedReward(RUNNER, ADDR, BigInt(50), BYTES32),
    ));
  it('allocatedSeedRewards', () =>
    expectCall('allocatedSeedRewards', [[]], () => w.allocatedSeedRewards(RUNNER)));
  it('allowance', () =>
    expectCall('allowance', [[ADDR, ADDR2]], () => w.allowance(RUNNER, ADDR, ADDR2)));
  it('approve', () =>
    expectCall('approve', [[ADDR2, BigInt(100), {}]], () => w.approve(RUNNER, ADDR2, BigInt(100))));
  it('attestor', () => expectCall('attestor', [[]], () => w.attestor(RUNNER)));
  it('balanceOf', () => expectCall('balanceOf', [[ADDR]], () => w.balanceOf(RUNNER, ADDR)));
  it('claimRewards', () => expectCall('claimRewards', [[{}]], () => w.claimRewards(RUNNER)));
  it('decimals', () => expectCall('decimals', [[]], () => w.decimals(RUNNER)));
  it('fundRewardPool', () =>
    expectCall('fundRewardPool', [[BigInt(1000), {}]], () => w.fundRewardPool(RUNNER, BigInt(1000))));
  it('getRoleAdmin', () => expectCall('getRoleAdmin', [[BYTES32]], () => w.getRoleAdmin(RUNNER, BYTES32)));
  it('grantRole', () =>
    expectCall('grantRole', [[BYTES32, ADDR, {}]], () => w.grantRole(RUNNER, BYTES32, ADDR)));
  it('hasRole', () =>
    expectCall('hasRole', [[BYTES32, ADDR]], () => w.hasRole(RUNNER, BYTES32, ADDR)));
  it('mint', () => expectCall('mint', [[ADDR, BigInt(100), {}]], () => w.mint(RUNNER, ADDR, BigInt(100))));
  it('name', () => expectCall('name', [[]], () => w.name(RUNNER)));
  it('renounceRole', () =>
    expectCall('renounceRole', [[BYTES32, ADDR, {}]], () => w.renounceRole(RUNNER, BYTES32, ADDR)));
  it('revokeRole', () =>
    expectCall('revokeRole', [[BYTES32, ADDR, {}]], () => w.revokeRole(RUNNER, BYTES32, ADDR)));
  it('rewardLastUpdate', () =>
    expectCall('rewardLastUpdate', [[ADDR]], () => w.rewardLastUpdate(RUNNER, ADDR)));
  it('rewardPerTokenPerSecond', () =>
    expectCall('rewardPerTokenPerSecond', [[]], () => w.rewardPerTokenPerSecond(RUNNER)));
  it('rewardPool', () => expectCall('rewardPool', [[]], () => w.rewardPool(RUNNER)));
  it('seedRewards', () => expectCall('seedRewards', [[ADDR]], () => w.seedRewards(RUNNER, ADDR)));
  it('setAttestor', () =>
    expectCall('setAttestor', [[ADDR2, {}]], () => w.setAttestor(RUNNER, ADDR2)));
  it('setRewardRate', () =>
    expectCall('setRewardRate', [[BigInt(7), {}]], () => w.setRewardRate(RUNNER, BigInt(7))));
  it('stake', () => expectCall('stake', [[BigInt(25), {}]], () => w.stake(RUNNER, BigInt(25))));
  it('stakeLockStart', () =>
    expectCall('stakeLockStart', [[ADDR]], () => w.stakeLockStart(RUNNER, ADDR)));
  it('stakedBalance', () =>
    expectCall('stakedBalance', [[ADDR]], () => w.stakedBalance(RUNNER, ADDR)));
  it('supportsInterface', () =>
    expectCall('supportsInterface', [['0x36372b07']], () => w.supportsInterface(RUNNER, '0x36372b07')));
  it('symbol', () => expectCall('symbol', [[]], () => w.symbol(RUNNER)));
  it('totalSupply', () => expectCall('totalSupply', [[]], () => w.totalSupply(RUNNER)));
  it('transfer', () =>
    expectCall('transfer', [[ADDR2, BigInt(10), {}]], () => w.transfer(RUNNER, ADDR2, BigInt(10))));
  it('transferFrom', () =>
    expectCall('transferFrom', [[ADDR, ADDR2, BigInt(10), {}]], () => w.transferFrom(RUNNER, ADDR, ADDR2, BigInt(10))));
  it('unstake', () => expectCall('unstake', [[BigInt(25), {}]], () => w.unstake(RUNNER, BigInt(25))));
  it('usedReportHashes', () =>
    expectCall('usedReportHashes', [[BYTES32]], () => w.usedReportHashes(RUNNER, BYTES32)));

  it('pendingRewards maps the tuple', async () => {
    stubState.instances.length = 0;
    const r = await w.pendingRewards(RUNNER, ADDR);
    expect(lastCalls()['pendingRewards']).toEqual([[ADDR]]);
    expect(r).toEqual({ stakingPart: BigInt(1), seedPart: BigInt(2), total: BigInt(3) });
  });
});

describe('dflix input validation', () => {
  it('rejects zero mint / stake / unstake amounts', async () => {
    await expect(w.mint(RUNNER, ADDR, BigInt(0))).rejects.toThrow(/greater than zero/);
    await expect(w.stake(RUNNER, BigInt(0))).rejects.toThrow(/greater than zero/);
    await expect(w.unstake(RUNNER, BigInt(0))).rejects.toThrow(/greater than zero/);
  });
  it('rejects malformed bytes32', async () => {
    await expect(w.hasRole(RUNNER, '0x1234', ADDR)).rejects.toThrow(/bytes32/);
    await expect(w.usedReportHashes(RUNNER, 'nope')).rejects.toThrow(/bytes32/);
  });
  it('rejects bad addresses', async () => {
    await expect(w.balanceOf(RUNNER, 'bad')).rejects.toThrow(/account.*address/i);
    await expect(w.transfer(RUNNER, 'bad', BigInt(1))).rejects.toThrow(/to.*address/i);
  });
  it('rejects malformed bytes4', async () => {
    await expect(w.supportsInterface(RUNNER, '0x12')).rejects.toThrow(/bytes4/);
  });
});
