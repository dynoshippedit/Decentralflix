/**
 * Contract factories for the Phase 2 contracts (ethers v6).
 *
 * Each factory binds the compiled ABI (from lib/contracts/abis.generated.ts)
 * to the configured deployment address (from lib/contracts/config.ts) and
 * returns an ethers.Contract attached to the given signer or provider.
 *
 * Until Phase 2 step 9 (Sepolia testnet deploy) fills in real addresses, the
 * config holds the zero address and every factory throws a clear UNDEPLOYED
 * error instead of building a contract that would send calls into the void.
 */

import { Contract, ZeroAddress, type ContractRunner } from 'ethers';
import {
  DFLIX_ABI_FULL,
  PAY_PER_VIEW_ABI_FULL,
  SUBSCRIPTION_MANAGER_ABI_FULL,
  TICKET_NFT_ABI_FULL,
} from '../contracts/abis.generated';
import {
  DFLIX_ADDRESS,
  PAY_PER_VIEW_ADDRESS,
  SUBSCRIPTION_MANAGER_ADDRESS,
  TICKET_NFT_ADDRESS,
} from '../contracts/config';

/** Thrown when a Phase 2 contract has no deployed address configured yet. */
export class UndeployedError extends Error {
  readonly contractName: string;
  readonly envVar: string;
  constructor(contractName: string, envVar: string) {
    super(
      `UNDEPLOYED: ${contractName} has no deployed address configured. ` +
        `Set the ${envVar} env var ` +
        `(Phase 2 step 9: Sepolia testnet deploy) before calling this contract.`,
    );
    this.name = 'UndeployedError';
    this.contractName = contractName;
    this.envVar = envVar;
  }
}

/** Guard: throws UndeployedError when the address is missing/zero. */
export function assertDeployed(
  address: string | undefined,
  contractName: string,
  envVar: string,
): asserts address is string {
  if (!address || address === ZeroAddress) {
    throw new UndeployedError(contractName, envVar);
  }
}

/** TicketNFT — ERC-721 film access tickets. */
export function getTicketNFT(runner: ContractRunner): Contract {
  assertDeployed(TICKET_NFT_ADDRESS, 'TicketNFT', 'NEXT_PUBLIC_TICKET_NFT_ADDRESS');
  return new Contract(TICKET_NFT_ADDRESS, TICKET_NFT_ABI_FULL, runner);
}

/** SubscriptionManager — recurring subscription plans. */
export function getSubscriptionManager(runner: ContractRunner): Contract {
  assertDeployed(SUBSCRIPTION_MANAGER_ADDRESS, 'SubscriptionManager', 'NEXT_PUBLIC_SUBSCRIPTION_MANAGER_ADDRESS');
  return new Contract(SUBSCRIPTION_MANAGER_ADDRESS, SUBSCRIPTION_MANAGER_ABI_FULL, runner);
}

/** PayPerView — one-off film purchases with platform fee split. */
export function getPayPerView(runner: ContractRunner): Contract {
  assertDeployed(PAY_PER_VIEW_ADDRESS, 'PayPerView', 'NEXT_PUBLIC_PAY_PER_VIEW_ADDRESS');
  return new Contract(PAY_PER_VIEW_ADDRESS, PAY_PER_VIEW_ABI_FULL, runner);
}

/** DFLIX — ERC-20 reward token (mint / stake / seed-to-earn). */
export function getDFLIX(runner: ContractRunner): Contract {
  assertDeployed(DFLIX_ADDRESS, 'DFLIX', 'NEXT_PUBLIC_DFLIX_ADDRESS');
  return new Contract(DFLIX_ADDRESS, DFLIX_ABI_FULL, runner);
}
