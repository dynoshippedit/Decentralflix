/**
 * Typed wrappers for the DFLIX contract (ERC-20 reward token:
 * mint / stake / seed-to-earn rewards).
 * One function per contract function. All inputs validated before any
 * chain interaction; writes need a signer, reads accept signer or provider.
 */
import type {
  Contract,
  ContractRunner,
  ContractTransactionResponse,
} from 'ethers';
import { getDFLIX } from '../contracts';
import type { PendingRewards, WriteOverrides } from '../types';
import { reqAddress, reqBytes32, reqBytes4, reqUint } from './validate';

export type { PendingRewards, WriteOverrides };

export async function defaultAdminRole(runner: ContractRunner): Promise<string> {
  const c: Contract = getDFLIX(runner);
  return c.DEFAULT_ADMIN_ROLE() as Promise<string>;
}

export async function maxSupply(runner: ContractRunner): Promise<bigint> {
  const c: Contract = getDFLIX(runner);
  return c.MAX_SUPPLY() as Promise<bigint>;
}

export async function minterRole(runner: ContractRunner): Promise<string> {
  const c: Contract = getDFLIX(runner);
  return c.MINTER_ROLE() as Promise<string>;
}

export async function stakeLockPeriod(runner: ContractRunner): Promise<bigint> {
  const c: Contract = getDFLIX(runner);
  return c.STAKE_LOCK_PERIOD() as Promise<bigint>;
}

export async function accruedRewards(runner: ContractRunner, user: string): Promise<bigint> {
  const c: Contract = getDFLIX(runner);
  return c.accruedRewards(reqAddress(user, 'user')) as Promise<bigint>;
}

/**
 * Allocate a seed reward for a seeder's fragment-hosting report.
 * Requires the attestor/minter role. `reportHash` must be a fresh bytes32
 * (the contract rejects reused hashes).
 */
export async function allocateSeedReward(
  signer: ContractRunner,
  seeder: string,
  amount: bigint,
  reportHash: string,
  overrides?: WriteOverrides,
): Promise<ContractTransactionResponse> {
  const c: Contract = getDFLIX(signer);
  return c.allocateSeedReward(
    reqAddress(seeder, 'seeder'),
    reqUint(amount, 'amount'),
    reqBytes32(reportHash, 'reportHash'),
    { ...(overrides ?? {}) },
  );
}

export async function allocatedSeedRewards(runner: ContractRunner): Promise<bigint> {
  const c: Contract = getDFLIX(runner);
  return c.allocatedSeedRewards() as Promise<bigint>;
}

export async function allowance(
  runner: ContractRunner,
  owner: string,
  spender: string,
): Promise<bigint> {
  const c: Contract = getDFLIX(runner);
  return c.allowance(reqAddress(owner, 'owner'), reqAddress(spender, 'spender')) as Promise<bigint>;
}

export async function approve(
  signer: ContractRunner,
  spender: string,
  value: bigint,
  overrides?: WriteOverrides,
): Promise<ContractTransactionResponse> {
  const c: Contract = getDFLIX(signer);
  return c.approve(reqAddress(spender, 'spender'), reqUint(value, 'value'), {
    ...(overrides ?? {}),
  });
}

export async function attestor(runner: ContractRunner): Promise<string> {
  const c: Contract = getDFLIX(runner);
  return c.attestor() as Promise<string>;
}

export async function balanceOf(runner: ContractRunner, account: string): Promise<bigint> {
  const c: Contract = getDFLIX(runner);
  return c.balanceOf(reqAddress(account, 'account')) as Promise<bigint>;
}

/** Claim accrued staking + seed rewards. */
export async function claimRewards(
  signer: ContractRunner,
  overrides?: WriteOverrides,
): Promise<ContractTransactionResponse> {
  const c: Contract = getDFLIX(signer);
  return c.claimRewards({ ...(overrides ?? {}) });
}

export async function decimals(runner: ContractRunner): Promise<number> {
  const c: Contract = getDFLIX(runner);
  return c.decimals() as Promise<number>;
}

/**
 * Fund the reward pool. Caller must have approved the DFLIX contract
 * (or hold the tokens, depending on implementation) for `amount` first.
 */
export async function fundRewardPool(
  signer: ContractRunner,
  amount: bigint,
  overrides?: WriteOverrides,
): Promise<ContractTransactionResponse> {
  const c: Contract = getDFLIX(signer);
  return c.fundRewardPool(reqUint(amount, 'amount'), { ...(overrides ?? {}) });
}

export async function getRoleAdmin(runner: ContractRunner, role: string): Promise<string> {
  const c: Contract = getDFLIX(runner);
  return c.getRoleAdmin(reqBytes32(role, 'role')) as Promise<string>;
}

export async function grantRole(
  signer: ContractRunner,
  role: string,
  account: string,
  overrides?: WriteOverrides,
): Promise<ContractTransactionResponse> {
  const c: Contract = getDFLIX(signer);
  return c.grantRole(reqBytes32(role, 'role'), reqAddress(account, 'account'), {
    ...(overrides ?? {}),
  });
}

export async function hasRole(
  runner: ContractRunner,
  role: string,
  account: string,
): Promise<boolean> {
  const c: Contract = getDFLIX(runner);
  return c.hasRole(reqBytes32(role, 'role'), reqAddress(account, 'account')) as Promise<boolean>;
}

/** Mint new DFLIX (MINTER_ROLE only). Reverts past MAX_SUPPLY. */
export async function mint(
  signer: ContractRunner,
  to: string,
  amount: bigint,
  overrides?: WriteOverrides,
): Promise<ContractTransactionResponse> {
  const c: Contract = getDFLIX(signer);
  const a = reqUint(amount, 'amount');
  if (a === BigInt(0)) throw new Error('amount: mint amount must be greater than zero');
  return c.mint(reqAddress(to, 'to'), a, { ...(overrides ?? {}) });
}

export async function name(runner: ContractRunner): Promise<string> {
  const c: Contract = getDFLIX(runner);
  return c.name() as Promise<string>;
}

export async function pendingRewards(runner: ContractRunner, user: string): Promise<PendingRewards> {
  const c: Contract = getDFLIX(runner);
  const r = (await c.pendingRewards(reqAddress(user, 'user'))) as {
    stakingPart: bigint; seedPart: bigint; total: bigint;
  };
  return { stakingPart: BigInt(r.stakingPart), seedPart: BigInt(r.seedPart), total: BigInt(r.total) };
}

export async function renounceRole(
  signer: ContractRunner,
  role: string,
  callerConfirmation: string,
  overrides?: WriteOverrides,
): Promise<ContractTransactionResponse> {
  const c: Contract = getDFLIX(signer);
  return c.renounceRole(
    reqBytes32(role, 'role'),
    reqAddress(callerConfirmation, 'callerConfirmation'),
    { ...(overrides ?? {}) },
  );
}

export async function revokeRole(
  signer: ContractRunner,
  role: string,
  account: string,
  overrides?: WriteOverrides,
): Promise<ContractTransactionResponse> {
  const c: Contract = getDFLIX(signer);
  return c.revokeRole(reqBytes32(role, 'role'), reqAddress(account, 'account'), {
    ...(overrides ?? {}),
  });
}

export async function rewardLastUpdate(runner: ContractRunner, user: string): Promise<bigint> {
  const c: Contract = getDFLIX(runner);
  return c.rewardLastUpdate(reqAddress(user, 'user')) as Promise<bigint>;
}

export async function rewardPerTokenPerSecond(runner: ContractRunner): Promise<bigint> {
  const c: Contract = getDFLIX(runner);
  return c.rewardPerTokenPerSecond() as Promise<bigint>;
}

export async function rewardPool(runner: ContractRunner): Promise<bigint> {
  const c: Contract = getDFLIX(runner);
  return c.rewardPool() as Promise<bigint>;
}

export async function seedRewards(runner: ContractRunner, user: string): Promise<bigint> {
  const c: Contract = getDFLIX(runner);
  return c.seedRewards(reqAddress(user, 'user')) as Promise<bigint>;
}

/** Set the attestor address (owner only). */
export async function setAttestor(
  signer: ContractRunner,
  newAttestor: string,
  overrides?: WriteOverrides,
): Promise<ContractTransactionResponse> {
  const c: Contract = getDFLIX(signer);
  return c.setAttestor(reqAddress(newAttestor, 'newAttestor'), { ...(overrides ?? {}) });
}

/** Set the staking reward rate (owner only). */
export async function setRewardRate(
  signer: ContractRunner,
  newRate: bigint,
  overrides?: WriteOverrides,
): Promise<ContractTransactionResponse> {
  const c: Contract = getDFLIX(signer);
  return c.setRewardRate(reqUint(newRate, 'newRate'), { ...(overrides ?? {}) });
}

/** Stake DFLIX. Starts the lock period on first stake. */
export async function stake(
  signer: ContractRunner,
  amount: bigint,
  overrides?: WriteOverrides,
): Promise<ContractTransactionResponse> {
  const c: Contract = getDFLIX(signer);
  const a = reqUint(amount, 'amount');
  if (a === BigInt(0)) throw new Error('amount: stake amount must be greater than zero');
  return c.stake(a, { ...(overrides ?? {}) });
}

export async function stakeLockStart(runner: ContractRunner, user: string): Promise<bigint> {
  const c: Contract = getDFLIX(runner);
  return c.stakeLockStart(reqAddress(user, 'user')) as Promise<bigint>;
}

export async function stakedBalance(runner: ContractRunner, user: string): Promise<bigint> {
  const c: Contract = getDFLIX(runner);
  return c.stakedBalance(reqAddress(user, 'user')) as Promise<bigint>;
}

export async function supportsInterface(runner: ContractRunner, interfaceId: string): Promise<boolean> {
  const c: Contract = getDFLIX(runner);
  return c.supportsInterface(reqBytes4(interfaceId, 'interfaceId')) as Promise<boolean>;
}

export async function symbol(runner: ContractRunner): Promise<string> {
  const c: Contract = getDFLIX(runner);
  return c.symbol() as Promise<string>;
}

export async function totalSupply(runner: ContractRunner): Promise<bigint> {
  const c: Contract = getDFLIX(runner);
  return c.totalSupply() as Promise<bigint>;
}

export async function transfer(
  signer: ContractRunner,
  to: string,
  value: bigint,
  overrides?: WriteOverrides,
): Promise<ContractTransactionResponse> {
  const c: Contract = getDFLIX(signer);
  return c.transfer(reqAddress(to, 'to'), reqUint(value, 'value'), { ...(overrides ?? {}) });
}

export async function transferFrom(
  signer: ContractRunner,
  from: string,
  to: string,
  value: bigint,
  overrides?: WriteOverrides,
): Promise<ContractTransactionResponse> {
  const c: Contract = getDFLIX(signer);
  return c.transferFrom(reqAddress(from, 'from'), reqAddress(to, 'to'), reqUint(value, 'value'), {
    ...(overrides ?? {}),
  });
}

/** Unstake DFLIX after the lock period. */
export async function unstake(
  signer: ContractRunner,
  amount: bigint,
  overrides?: WriteOverrides,
): Promise<ContractTransactionResponse> {
  const c: Contract = getDFLIX(signer);
  const a = reqUint(amount, 'amount');
  if (a === BigInt(0)) throw new Error('amount: unstake amount must be greater than zero');
  return c.unstake(a, { ...(overrides ?? {}) });
}

export async function usedReportHashes(runner: ContractRunner, reportHash: string): Promise<boolean> {
  const c: Contract = getDFLIX(runner);
  return c.usedReportHashes(reqBytes32(reportHash, 'reportHash')) as Promise<boolean>;
}
