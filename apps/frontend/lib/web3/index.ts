/**
 * ethers v6 wallet layer for Decentralflix Phase 2 (step 4).
 * Barrel export. Everything here is import-safe with no wallet and on SSR.
 */
export * from './types';
export * from './detect';
export * from './connect';
export * from './contracts';
export * as wrappers from './wrappers';
export { useWeb3Wallet } from './useWeb3Wallet';
export type { Web3WalletState } from './useWeb3Wallet';
