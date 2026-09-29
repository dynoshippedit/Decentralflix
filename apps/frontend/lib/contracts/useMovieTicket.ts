import { useState, useEffect } from 'react';
import { createPublicClient, http } from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import { MOVIE_TICKET_ADDRESS, MOVIE_TICKET_ABI, PLATFORM_FEE_BPS } from './config';

/**
 * Hook for reading from MovieTicket contract.
 * Provides platform fee, total supply, and helper functions.
 * Use this for UI displays (fee breakdown, etc.).
 * df-cycle-12/13: the split is the immutable on-chain PLATFORM_FEE_BPS constant
 * (2500 = 25% platform, 75% creator), shared via RevenueSplitter. Read on-chain
 * when a deployment exists; falls back to the canonical build-time mirror.
 */
export function useMovieTicket() {
  const [platformFeeBps, setPlatformFeeBps] = useState<number>(PLATFORM_FEE_BPS);
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
          functionName: 'PLATFORM_FEE_BPS',
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

  const getPlatformFee = (price: bigint) => (price * BigInt(platformFeeBps)) / BigInt(10000);

  const getCreatorShare = (price: bigint) => price - getPlatformFee(price);

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
 * Loops over ALL minted token IDs (dense from 0) via the on-chain
 * totalMinted() mint counter — NOT totalSupply(), which shrinks on burn and
 * would hide every token minted after any burn.
 * Returns the videoHashes + tokenIds the user actually holds on-chain.
 *
 * NOTE: this linear scan is frontend-only. The contract itself never scans:
 * hasAccessToVideo is backed by the _filmAccessCount reverse index (O(1),
 * ADR-001), so on-chain access gating was never affected by this bug.
 *
 * Acceptable while the mint count is small. Will move to events/subgraph later.
 *
 * The enumeration core is exported pure (enumerateOwnedFilms) so it can be
 * unit-tested without React or a live chain — see
 * useOwnedFilms.enumeration.test.ts.
 */
export type FilmReadView = (
  functionName: 'totalMinted' | 'ownerOf' | 'videoMetadata',
  args?: readonly bigint[],
) => Promise<unknown>;

export async function enumerateOwnedFilms(
  readView: FilmReadView,
  owner: `0x${string}`,
): Promise<Array<{ tokenId: number; videoHash: string }>> {
  // Bound = ever-minted count. Burned IDs throw inside ownerOf and are skipped
  // by the per-token catch below.
  const minted = Number((await readView('totalMinted')) as bigint);

  const owned: Array<{ tokenId: number; videoHash: string }> = [];

  for (let i = 0; i < minted; i++) {
    try {
      const tokenOwner = (await readView('ownerOf', [BigInt(i)])) as string;

      if (tokenOwner.toLowerCase() === owner.toLowerCase()) {
        const meta = (await readView('videoMetadata', [BigInt(i)])) as unknown as string[];

        owned.push({
          tokenId: i,
          videoHash: meta[0],
        });
      }
    } catch {
      // token was burned (or never existed) — skip
    }
  }

  return owned;
}

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
      // Bind the pure enumerator to this client. 'totalMinted' is part of the
      // generated lockstep ABI, so the literal view name typechecks.
      const readView: FilmReadView = (functionName, args) =>
        publicClient.readContract({
          address: MOVIE_TICKET_ADDRESS,
          abi: MOVIE_TICKET_ABI,
          functionName,
          args: args as never,
        }) as unknown as Promise<unknown>;

      setFilms(await enumerateOwnedFilms(readView, owner));
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
