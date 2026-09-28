/**
 * Typed wrappers for the SubscriptionManager contract (recurring plans).
 * One function per contract function. All inputs validated before any
 * chain interaction; writes need a signer, reads accept signer or provider.
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

/** Create a plan (owner only). durationSecs must be > 0. */
export async function createPlan(
  signer: ContractRunner,
  planId: number | bigint | string,
  name: string,
  priceWei: bigint,
  durationSecs: number | bigint | string,
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
    { ...(overrides ?? {}) },
  );
}

/** Deactivate a plan (owner only). */
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
    name: string; priceWei: bigint; durationSecs: bigint; active: boolean; exists: boolean;
  };
  return {
    name: r.name, priceWei: BigInt(r.priceWei), durationSecs: BigInt(r.durationSecs),
    active: r.active, exists: r.exists,
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

/** Withdraw collected subscription revenue (owner only). */
export async function withdraw(
  signer: ContractRunner,
  overrides?: WriteOverrides,
): Promise<ContractTransactionResponse> {
  const c: Contract = getSubscriptionManager(signer);
  return c.withdraw({ ...(overrides ?? {}) });
}
