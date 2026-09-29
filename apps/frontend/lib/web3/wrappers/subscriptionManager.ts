/**
 * Typed wrappers for the SubscriptionManager contract (recurring plans).
 * One function per contract function. All inputs validated before any
 * chain interaction; writes need a signer, reads accept signer or provider.
 *
 * MUS-001: SubscriptionManager is a non-custodial 75/25 splitter. Every
 * payment is split immediately — 75% (+ rounding remainder) to the plan's
 * creator, 25% to the platform. The split is the immutable
 * PLATFORM_FEE_BPS constant; there is no fee setter and no withdraw.
 */
import type {
  Contract,
  ContractRunner,
  ContractTransactionResponse,
} from 'ethers';
import { getSubscriptionManager } from '../contracts';
import type { SubscriptionInfo, SubscriptionPlan, WriteOverrides } from '../types';
import { reqAddress, reqNonEmptyString, reqUint, reqWei } from './validate';

export type { SubscriptionInfo, SubscriptionPlan, WriteOverrides };

/** Cancel the caller's subscription. */
export async function cancel(
  signer: ContractRunner,
  overrides?: WriteOverrides,
): Promise<ContractTransactionResponse> {
  const c: Contract = getSubscriptionManager(signer);
  return c.cancel({ ...(overrides ?? {}) });
}

/**
 * Create a plan (owner only). durationSecs must be > 0.
 * The creator is set ONCE here and can never be changed — the owner cannot
 * redirect the creator's 75% share later. Zero address reverts on-chain.
 */
export async function createPlan(
  signer: ContractRunner,
  planId: number | bigint | string,
  name: string,
  priceWei: bigint,
  durationSecs: number | bigint | string,
  creator: string,
  overrides?: WriteOverrides,
): Promise<ContractTransactionResponse> {
  const c: Contract = getSubscriptionManager(signer);
  const duration = reqUint(durationSecs, 'durationSecs');
  if (duration === BigInt(0)) throw new Error('durationSecs: plan duration must be greater than zero');
  return c.createPlan(
    reqUint(planId, 'planId'),
    reqNonEmptyString(name, 'name'),
    reqWei(priceWei, 'priceWei'),
    duration,
    reqAddress(creator, 'creator'),
    { ...(overrides ?? {}) },
  );
}

/** Deactivate a plan (owner only). Moves no funds. */
export async function deactivatePlan(
  signer: ContractRunner,
  planId: number | bigint | string,
  overrides?: WriteOverrides,
): Promise<ContractTransactionResponse> {
  const c: Contract = getSubscriptionManager(signer);
  return c.deactivatePlan(reqUint(planId, 'planId'), { ...(overrides ?? {}) });
}

export async function getPlan(
  runner: ContractRunner,
  planId: number | bigint | string,
): Promise<SubscriptionPlan> {
  const c: Contract = getSubscriptionManager(runner);
  const r = (await c.getPlan(reqUint(planId, 'planId'))) as {
    name: string; priceWei: bigint; durationSecs: bigint; creator: string;
    active: boolean; exists: boolean;
  };
  return {
    name: r.name, priceWei: BigInt(r.priceWei), durationSecs: BigInt(r.durationSecs),
    creator: r.creator, active: r.active, exists: r.exists,
  };
}

export async function hasActiveSubscription(runner: ContractRunner, holder: string): Promise<boolean> {
  const c: Contract = getSubscriptionManager(runner);
  return c.hasActiveSubscription(reqAddress(holder, 'holder')) as Promise<boolean>;
}

export async function owner(runner: ContractRunner): Promise<string> {
  const c: Contract = getSubscriptionManager(runner);
  return c.owner() as Promise<string>;
}

/**
 * Read the immutable platform fee (basis points) from the contract.
 * 2500 = 25% platform, 75% creator. No setter exists on-chain by design.
 */
export async function platformFeeBps(runner: ContractRunner): Promise<bigint> {
  const c: Contract = getSubscriptionManager(runner);
  return c.PLATFORM_FEE_BPS() as Promise<bigint>;
}

/** Renew an existing subscription. `valueWei` must cover the plan price. */
export async function renew(
  signer: ContractRunner,
  planId: number | bigint | string,
  valueWei: bigint,
  overrides?: WriteOverrides,
): Promise<ContractTransactionResponse> {
  const c: Contract = getSubscriptionManager(signer);
  return c.renew(reqUint(planId, 'planId'), {
    value: reqWei(valueWei, 'valueWei'),
    ...(overrides ?? {}),
  });
}

export async function renounceOwnership(
  signer: ContractRunner,
  overrides?: WriteOverrides,
): Promise<ContractTransactionResponse> {
  const c: Contract = getSubscriptionManager(signer);
  return c.renounceOwnership({ ...(overrides ?? {}) });
}

/** Subscribe to a plan. `valueWei` must cover the plan price. */
export async function subscribe(
  signer: ContractRunner,
  planId: number | bigint | string,
  valueWei: bigint,
  overrides?: WriteOverrides,
): Promise<ContractTransactionResponse> {
  const c: Contract = getSubscriptionManager(signer);
  return c.subscribe(reqUint(planId, 'planId'), {
    value: reqWei(valueWei, 'valueWei'),
    ...(overrides ?? {}),
  });
}

export async function subscriptionOf(runner: ContractRunner, holder: string): Promise<SubscriptionInfo> {
  const c: Contract = getSubscriptionManager(runner);
  const r = (await c.subscriptionOf(reqAddress(holder, 'holder'))) as {
    planId: bigint; expiresAt: bigint;
  };
  return { planId: BigInt(r.planId), expiresAt: BigInt(r.expiresAt) };
}

export async function transferOwnership(
  signer: ContractRunner,
  newOwner: string,
  overrides?: WriteOverrides,
): Promise<ContractTransactionResponse> {
  const c: Contract = getSubscriptionManager(signer);
  return c.transferOwnership(reqAddress(newOwner, 'newOwner'), { ...(overrides ?? {}) });
}
