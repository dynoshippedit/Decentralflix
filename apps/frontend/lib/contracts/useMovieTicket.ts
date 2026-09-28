import { useState, useEffect } from 'react';
import { createPublicClient, http } from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import { MOVIE_TICKET_ADDRESS, MOVIE_TICKET_ABI } from './config';

/**
 * Hook for reading from MovieTicket contract.
 * Provides platform fee, total supply, and helper functions.
 * Use this for UI displays (fee breakdown, etc.).
 */
export function useMovieTicket() {
  const [platformFeeBps, setPlatformFeeBps] = useState<number | null>(null);
  const [totalSupply, setTotalSupply] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const publicClient = createPublicClient({
    chain: arbitrumSepolia,
    transport: http(),
  });

  const fetchData = async () => {
    if (!MOVIE_TICKET_ADDRESS || MOVIE_TICKET_ADDRESS === '0x0000000000000000000000000000000000000000') {
      return;
    }

    setIsLoading(true);
    try {
      const [fee, supply] = await Promise.all([
        publicClient.readContract({
          address: MOVIE_TICKET_ADDRESS,
          abi: MOVIE_TICKET_ABI,
          functionName: 'platformFeeBps',
        }),
        publicClient.readContract({
          address: MOVIE_TICKET_ADDRESS,
          abi: MOVIE_TICKET_ABI,
          functionName: 'totalSupply',
        }),
      ]);

      setPlatformFeeBps(Number(fee));
      setTotalSupply(Number(supply));
    } catch (err) {
      console.warn('Could not fetch MovieTicket data (contract may not be deployed yet on this network)');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const getPlatformFee = (price: bigint) => {
    if (!platformFeeBps) return BigInt(0);
    return (price * BigInt(platformFeeBps)) / BigInt(10000);
  };

  const getCreatorShare = (price: bigint) => {
    if (!platformFeeBps) return price;
    return price - getPlatformFee(price);
  };

  return {
    platformFeeBps,
    totalSupply,
    isLoading,
    getPlatformFee,
    getCreatorShare,
    refresh: fetchData,
  };
}

/**
 * Phase 0 real ownership enumeration.
 * Scans totalSupply and collects tokens owned by the given address.
 * Returns the videoHashes + tokenIds the user actually holds on-chain.
 * This is the same pattern the contract uses internally for hasAccessToVideo.
 * Acceptable while totalSupply is small. Will move to events/subgraph later.
 */
export function useOwnedFilms(owner?: `0x${string}`) {
  const [films, setFilms] = useState<Array<{ tokenId: number; videoHash: string }>>([]);
  const [isLoading, setIsLoading] = useState(false);

  const publicClient = createPublicClient({
    chain: arbitrumSepolia,
    transport: http(),
  });

  const fetchOwned = async () => {
    if (!owner || !MOVIE_TICKET_ADDRESS || MOVIE_TICKET_ADDRESS === '0x0000000000000000000000000000000000000000') {
      setFilms([]);
      return;
    }

    setIsLoading(true);
    try {
      const supply = await publicClient.readContract({
        address: MOVIE_TICKET_ADDRESS,
        abi: MOVIE_TICKET_ABI,
        functionName: 'totalSupply',
      });

      const owned: Array<{ tokenId: number; videoHash: string }> = [];

      for (let i = 0; i < Number(supply); i++) {
        try {
          const tokenOwner = await publicClient.readContract({
            address: MOVIE_TICKET_ADDRESS,
            abi: MOVIE_TICKET_ABI,
            functionName: 'ownerOf',
            args: [BigInt(i)],
          });

          if ((tokenOwner as string).toLowerCase() === owner.toLowerCase()) {
            const meta = await publicClient.readContract({
              address: MOVIE_TICKET_ADDRESS,
              abi: MOVIE_TICKET_ABI,
              functionName: 'videoMetadata',
              args: [BigInt(i)],
            });

            owned.push({
              tokenId: i,
              videoHash: (meta as unknown as string[])[0],
            });
          }
        } catch {
          // token may have been burned or other transient error — skip
        }
      }

      setFilms(owned);
    } catch (err) {
      console.warn('Could not enumerate owned films (contract may not be deployed or network issue)');
      setFilms([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOwned();
  }, [owner]);

  return {
    films,
    isLoading,
    refresh: fetchOwned,
  };
}
