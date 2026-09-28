/**
 * Connection helpers over a raw EIP-1193 provider, using ethers v6.
 *
 * - connectWallet(): eth_requestAccounts -> BrowserProvider + signer + address + chainId
 * - getChainId(): numeric chain id via eth_chainId
 * - switchChain(): wallet_switchEthereumChain with wallet_addEthereumChain
 *   fallback for Sepolia (11155111) and Arbitrum Sepolia (421614)
 * - onAccountsChanged / onChainChanged: subscription helpers returning
 *   unsubscribe functions.
 *
 * All functions throw descriptive errors; none touch `window` directly, so
 * they are import-safe on the server (they only fail if actually called
 * without a provider).
 */

import { BrowserProvider, type JsonRpcSigner } from 'ethers';
import type { AddChainParams, Eip1193Provider } from './types';
import { ARBITRUM_SEPOLIA_CHAIN_ID, SEPOLIA_CHAIN_ID } from './types';

export { ARBITRUM_SEPOLIA_CHAIN_ID, SEPOLIA_CHAIN_ID };

export interface WalletConnection {
  /** The raw injected EIP-1193 provider (for event subscriptions). */
  raw: Eip1193Provider;
  provider: BrowserProvider;
  signer: JsonRpcSigner;
  address: string;
  chainId: number;
}

/** EIP-3085 params for the two testnets we support. */
export const KNOWN_CHAINS: Record<number, AddChainParams> = {
  [SEPOLIA_CHAIN_ID]: {
    chainId: '0xaa36a7',
    chainName: 'Sepolia',
    nativeCurrency: { name: 'Sepolia ETH', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://rpc.sepolia.org'],
    blockExplorerUrls: ['https://sepolia.etherscan.io'],
  },
  [ARBITRUM_SEPOLIA_CHAIN_ID]: {
    chainId: '0x66eee',
    chainName: 'Arbitrum Sepolia',
    nativeCurrency: { name: 'Arbitrum Sepolia ETH', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://sepolia-rollup.arbitrum.io/rpc'],
    blockExplorerUrls: ['https://sepolia.arbiscan.io'],
  },
};

function toHexChainId(chainId: number): string {
  if (!Number.isInteger(chainId) || chainId <= 0) {
    throw new Error(`switchChain: expected a positive integer chain id, got ${String(chainId)}`);
  }
  return '0x' + chainId.toString(16);
}

/**
 * Prompt the wallet to connect and return the ethers v6 handles.
 * Rejects with a descriptive error when the user declines or no accounts
 * are returned.
 */
export async function connectWallet(raw: Eip1193Provider): Promise<WalletConnection> {
  if (!raw || typeof raw.request !== 'function') {
    throw new Error('connectWallet: expected an EIP-1193 provider with a request() method');
  }
  const provider = new BrowserProvider(raw);
  let accounts: unknown;
  try {
    accounts = await provider.send('eth_requestAccounts', []);
  } catch (err) {
    throw new Error(
      `connectWallet: eth_requestAccounts failed (${err instanceof Error ? err.message : String(err)})`,
    );
  }
  if (!Array.isArray(accounts) || accounts.length === 0) {
    throw new Error('connectWallet: wallet returned no accounts (request rejected or locked)');
  }
  const signer = await provider.getSigner();
  const address = await signer.getAddress();
  const network = await provider.getNetwork();
  return { raw, provider, signer, address, chainId: Number(network.chainId) };
}

/** Numeric chain id of whatever network the provider is on. */
export async function getChainId(raw: Eip1193Provider): Promise<number> {
  if (!raw || typeof raw.request !== 'function') {
    throw new Error('getChainId: expected an EIP-1193 provider with a request() method');
  }
  const hex = (await raw.request({ method: 'eth_chainId', params: [] })) as string;
  const chainId = parseInt(hex, 16);
  if (!Number.isInteger(chainId) || chainId <= 0) {
    throw new Error(`getChainId: wallet returned an invalid chain id: ${String(hex)}`);
  }
  return chainId;
}

/**
 * Ask the wallet to switch networks. If the chain is unknown to the wallet
 * (error 4902) and we have EIP-3085 params for it (Sepolia / Arbitrum
 * Sepolia), we request the wallet to add it instead.
 */
export async function switchChain(raw: Eip1193Provider, chainId: number): Promise<void> {
  if (!raw || typeof raw.request !== 'function') {
    throw new Error('switchChain: expected an EIP-1193 provider with a request() method');
  }
  const hex = toHexChainId(chainId);
  try {
    await raw.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hex }] });
  } catch (err) {
    const code = (err as { code?: number })?.code;
    if (code !== 4902) {
      throw new Error(
        `switchChain: wallet_switchEthereumChain failed (${err instanceof Error ? err.message : String(err)})`,
      );
    }
    const params = KNOWN_CHAINS[chainId];
    if (!params) {
      throw new Error(
        `switchChain: chain ${chainId} is not known to the wallet and no add-chain params are configured for it`,
      );
    }
    await raw.request({ method: 'wallet_addEthereumChain', params: [params] });
  }
}

/**
 * Subscribe to EIP-1193 accountsChanged. The callback receives the new
 * account list (empty = disconnected/locked). Returns an unsubscribe fn.
 * No-op (returns a no-op unsubscribe) when the provider has no `on`.
 */
export function onAccountsChanged(
  raw: Eip1193Provider,
  cb: (accounts: string[]) => void,
): () => void {
  if (!raw || typeof raw.on !== 'function') return () => {};
  const handler = (accounts: unknown) => {
    cb(Array.isArray(accounts) ? (accounts as string[]) : []);
  };
  raw.on('accountsChanged', handler);
  return () => {
    try {
      raw.removeListener?.('accountsChanged', handler);
    } catch {
      /* ignore */
    }
  };
}

/**
 * Subscribe to EIP-1193 chainChanged. The callback receives the new chain
 * id as a number. Returns an unsubscribe fn. No-op when no `on`.
 */
export function onChainChanged(
  raw: Eip1193Provider,
  cb: (chainId: number) => void,
): () => void {
  if (!raw || typeof raw.on !== 'function') return () => {};
  const handler = (hexChainId: unknown) => {
    const chainId = parseInt(String(hexChainId), 16);
    if (Number.isInteger(chainId)) cb(chainId);
  };
  raw.on('chainChanged', handler);
  return () => {
    try {
      raw.removeListener?.('chainChanged', handler);
    } catch {
      /* ignore */
    }
  };
}
