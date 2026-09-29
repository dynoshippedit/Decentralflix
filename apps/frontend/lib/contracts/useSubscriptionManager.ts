import { useState, useEffect } from 'react';
import { createPublicClient, http } from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import {
  SUBSCRIPTION_MANAGER_ADDRESS,
  SUBSCRIPTION_MANAGER_ABI,
  SUBSCRIPTION_PLATFORM_FEE_BPS,
} from './config';

/**
 * Hook for reading the SubscriptionManager fee split.
 * MUS-001: the split is the immutable on-chain PLATFORM_FEE_BPS constant
 * (2500 = 25% platform, 75% creator). Read on-chain when a deployment
 * exists; falls back to the canonical shared-config mirror (the same value)
 * so marketing copy and code cannot drift.
 */
export function useSubscriptionManager() {
  // Canonical fallback — the immutable on-chain value. Refreshed from chain when deployed.
  const [platformFeeBps, setPlatformFeeBps] = useState<number>(SUBSCRIPTION_PLATFORM_FEE_BPS);
  const [isOnChain, setIsOnChain] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const publicClient = createPublicClient({
    chain: arbitrumSepolia,
    transport: http(),
  });

  const fetchData = async () => {
    if (!SUBSCRIPTION_MANAGER_ADDRESS || SUBSCRIPTION_MANAGER_ADDRESS === '0x0000000000000000000000000000000000000000') {
      return; // not deployed yet — keep the canonical fallback
    }

    setIsLoading(true);
    try {
      const fee = await publicClient.readContract({
        address: SUBSCRIPTION_MANAGER_ADDRESS,
        abi: SUBSCRIPTION_MANAGER_ABI,
        functionName: 'PLATFORM_FEE_BPS',
      });
      setPlatformFeeBps(Number(fee));
      setIsOnChain(true);
    } catch {
      console.warn('Could not fetch SubscriptionManager fee (contract may not be deployed yet on this network)');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const creatorShareBps = 10000 - platformFeeBps;
  const creatorSharePct = `${creatorShareBps / 100}%`;

  const getPlatformFee = (price: bigint) => (price * BigInt(platformFeeBps)) / BigInt(10000);
  const getCreatorShare = (price: bigint) => price - getPlatformFee(price);

  return {
    platformFeeBps,
    creatorShareBps,
    creatorSharePct,
    isOnChain,
    isLoading,
    getPlatformFee,
    getCreatorShare,
    refresh: fetchData,
  };
}
