'use client';

/**
 * useWeb3Wallet — React hook over the ethers v6 wallet layer.
 *
 * State: { provider, signer, address, chainId, isConnected, isConnecting,
 *          error, availableProviders, connect(rdns?), disconnect }.
 *
 * - Never crashes when no wallet exists (connect() surfaces a friendly
 *   error instead).
 * - Subscribes to EIP-1193 accountsChanged / chainChanged and updates state;
 *   unsubscribes on disconnect and on unmount.
 * - Does NOT rewire Privy or WalletConnectButton — it is a parallel,
 *   opt-in connection path for the Phase 2 contracts (see README).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { BrowserProvider, JsonRpcSigner } from 'ethers';
import { listProviders, pickProvider } from './detect';
import type { DiscoveredProvider } from './types';
import {
  connectWallet,
  onAccountsChanged,
  onChainChanged,
  type WalletConnection,
} from './connect';

export interface Web3WalletState {
  provider: BrowserProvider | null;
  signer: JsonRpcSigner | null;
  address: string | null;
  chainId: number | null;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  /** Wallets discovered on the last connect() attempt (or mount). */
  availableProviders: DiscoveredProvider[];
  /** Connect. Pass an rdns (e.g. "io.metamask") or wallet name to target one. */
  connect: (rdns?: string) => Promise<void>;
  disconnect: () => void;
}

const INITIAL = {
  provider: null as BrowserProvider | null,
  signer: null as JsonRpcSigner | null,
  address: null as string | null,
  chainId: null as number | null,
  isConnected: false,
  isConnecting: false,
  error: null as string | null,
  availableProviders: [] as DiscoveredProvider[],
};

export function useWeb3Wallet(): Web3WalletState {
  const [state, setState] = useState(INITIAL);
  const rawRef = useRef<WalletConnection['raw'] | null>(null);
  const unsubRef = useRef<Array<() => void>>([]);

  const clearSubscriptions = useCallback(() => {
    for (const unsub of unsubRef.current) {
      try {
        unsub();
      } catch {
        /* ignore */
      }
    }
    unsubRef.current = [];
  }, []);

  const disconnect = useCallback(() => {
    clearSubscriptions();
    rawRef.current = null;
    setState((s) => ({
      ...s,
      provider: null,
      signer: null,
      address: null,
      chainId: null,
      isConnected: false,
      isConnecting: false,
      error: null,
    }));
  }, [clearSubscriptions]);

  const connect = useCallback(
    async (rdns?: string) => {
      setState((s) => ({ ...s, isConnecting: true, error: null }));
      try {
        const providers = listProviders();
        const target = pickProvider(providers, rdns);
        if (!target) {
          throw new Error(
            rdns
              ? `No wallet matching "${rdns}" was found. Install it (or another EIP-6963 wallet) and retry.`
              : 'No Ethereum wallet detected. Install MetaMask or Coinbase Wallet, then retry.',
          );
        }
        const conn = await connectWallet(target.provider);
        rawRef.current = target.provider;
        clearSubscriptions();
        unsubRef.current = [
          onAccountsChanged(target.provider, (accounts) => {
            if (accounts.length === 0) {
              disconnect(); // wallet locked / disconnected
            } else {
              setState((s) => ({ ...s, address: accounts[0] ?? null }));
            }
          }),
          onChainChanged(target.provider, (chainId) => {
            setState((s) => ({ ...s, chainId }));
          }),
        ];
        setState((s) => ({
          ...s,
          provider: conn.provider,
          signer: conn.signer,
          address: conn.address,
          chainId: conn.chainId,
          isConnected: true,
          isConnecting: false,
          error: null,
          availableProviders: providers,
        }));
      } catch (err) {
        setState((s) => ({
          ...s,
          isConnecting: false,
          error: err instanceof Error ? err.message : String(err),
        }));
      }
    },
    [clearSubscriptions, disconnect],
  );

  // Refresh the discovered-provider list on mount (client only); cleanup subs.
  useEffect(() => {
    try {
      setState((s) => ({ ...s, availableProviders: listProviders() }));
    } catch {
      /* SSR / no window — leave empty */
    }
    return () => {
      clearSubscriptions();
    };
  }, [clearSubscriptions]);

  return {
    provider: state.provider,
    signer: state.signer,
    address: state.address,
    chainId: state.chainId,
    isConnected: state.isConnected,
    isConnecting: state.isConnecting,
    error: state.error,
    availableProviders: state.availableProviders,
    connect,
    disconnect,
  };
}
