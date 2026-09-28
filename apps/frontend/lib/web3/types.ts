/**
 * Shared types for the ethers v6 wallet layer (Phase 2, step 4).
 *
 * Everything here is plain TypeScript — no window access, no wallet required
 * — so this module is safe to import anywhere, including SSR.
 */

/** Minimal EIP-1193 provider surface we rely on. */
export interface Eip1193Provider {
  request(args: { method: string; params?: unknown }): Promise<unknown>;
  on?(eventName: string, listener: (...args: unknown[]) => void): void;
  removeListener?(eventName: string, listener: (...args: unknown[]) => void): void;
}

/** A wallet discovered via EIP-6963 (or the legacy window.ethereum fallback). */
export interface DiscoveredProvider {
  /** EIP-6963 info.uuid (stable per wallet); "legacy:…" for window.ethereum. */
  uuid: string;
  /** Human-readable wallet name, e.g. "MetaMask". */
  name: string;
  /** EIP-6963 reverse-DNS id, e.g. "io.metamask". May be "" for legacy. */
  rdns: string;
  /** The raw injected provider. */
  provider: Eip1193Provider;
}

/** Optional transaction overrides for write calls (gas, etc.). */
export interface WriteOverrides {
  gasLimit?: bigint | number;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  nonce?: number;
}

/** Known chain ids used by Decentralflix. */
export const SEPOLIA_CHAIN_ID = 11155111;
export const ARBITRUM_SEPOLIA_CHAIN_ID = 421614;

/** EIP-3085 parameters for wallet_addEthereumChain. */
export interface AddChainParams {
  chainId: string; // 0x-prefixed hex
  chainName: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  rpcUrls: string[];
  blockExplorerUrls: string[];
}

/** TicketNFT.getFilm view. */
export interface TicketFilm {
  title: string;
  priceWei: bigint;
  filmmaker: string;
  active: boolean;
  soulbound: boolean;
  metadataURI: string;
  exists: boolean;
}

/** SubscriptionManager.getPlan view. */
export interface SubscriptionPlan {
  name: string;
  priceWei: bigint;
  durationSecs: bigint;
  active: boolean;
  exists: boolean;
}

/** SubscriptionManager.subscriptionOf view. */
export interface SubscriptionInfo {
  planId: bigint;
  expiresAt: bigint;
}

/** PayPerView.getFilm view. */
export interface PpvFilm {
  filmmaker: string;
  priceWei: bigint;
  exists: boolean;
}

/** DFLIX.pendingRewards view. */
export interface PendingRewards {
  stakingPart: bigint;
  seedPart: bigint;
  total: bigint;
}
