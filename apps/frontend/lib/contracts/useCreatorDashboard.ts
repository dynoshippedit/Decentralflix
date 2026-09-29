import { useState, useEffect } from 'react';
import { createPublicClient, http, parseAbiItem, formatEther } from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import { MOVIE_TICKET_ADDRESS, MOVIE_TICKET_ABI, FILMMAKER_CAMPAIGN_ADDRESS, FILMMAKER_CAMPAIGN_ABI } from './config';
import { useFilmmakerCampaign, Campaign } from './useFilmmakerCampaign';
import { fetchArweaveMetadata, getDemoFilmTitle, getDemoFilmDescription, getPosterUrl } from '@/hooks/useFilmMetadata';

/**
 * useCreatorDashboard — small focused hook for Phase 0/1 Creator Studio.
 *
 * Responsibilities (scoped, practical):
 * - My created films (on-chain scan of videoMetadata.creator)
 * - Real earnings overview via CreatorPaid events (immediate payouts at mint time)
 * - My crowdfund campaigns (filtered from existing hook + demo merge)
 * - Rich Phase 0 demo data so the dashboard is immediately beautiful & useful
 * - Ties into tiers (via existing), crowdfund, Reviews (owner voice on your films), future SeederCredits
 *
 * Real on-chain paths used where contracts are deployed; graceful demo fallback otherwise.
 * Pattern matches all other hooks (viem publicClient, loading, refresh()).
 */

export interface CreatedFilm {
  tokenId: number;
  videoHash: string;
  title: string;
  description?: string;
  poster?: string;
  price?: bigint;
  tier?: number;
}

export interface CreatorPayout {
  tokenId: number;
  amount: bigint;
  txHash?: string; // best-effort
  timestamp?: number;
  blockNumber?: number; // captured from CreatorPaid logs for timing display (real on-chain or demo)
}

export interface CreatorDashboardData {
  createdFilms: CreatedFilm[];
  totalEarnings: bigint; // in wei
  recentPayouts: CreatorPayout[];
  myCampaigns: Campaign[];
  isLoading: boolean;
  error?: string;
  refresh: () => void;
}

// Rich Phase 0 demo data (used when contract not deployed or no on-chain matches)
// Titles/descriptions from shared hook (no local duplication)
const DEMO_CREATED_FILMS: CreatedFilm[] = [
  { tokenId: 42, videoHash: 'ar://film1-abc123', title: getDemoFilmTitle('ar://film1-abc123'), description: getDemoFilmDescription('ar://film1-abc123') },
  { tokenId: 43, videoHash: 'ar://film3-ghi789', title: getDemoFilmTitle('ar://film3-ghi789'), description: getDemoFilmDescription('ar://film3-ghi789') },
];

const DEMO_PAYOUTS: CreatorPayout[] = [
  { tokenId: 42, amount: BigInt('1850000000000000000'), blockNumber: 12345678 }, // ~1.85 ETH creator share example
  { tokenId: 43, amount: BigInt('920000000000000000'), blockNumber: 12345670 },
  { tokenId: 19, amount: BigInt('340000000000000000'), blockNumber: 12345655 },
];

const DEMO_TOTAL = DEMO_PAYOUTS.reduce((sum, p) => sum + p.amount, BigInt(0));

export function useCreatorDashboard(creatorAddress?: `0x${string}`) {
  const [createdFilms, setCreatedFilms] = useState<CreatedFilm[]>(DEMO_CREATED_FILMS);
  const [totalEarnings, setTotalEarnings] = useState<bigint>(DEMO_TOTAL);
  const [recentPayouts, setRecentPayouts] = useState<CreatorPayout[]>(DEMO_PAYOUTS);
  const [myCampaigns, setMyCampaigns] = useState<Campaign[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const publicClient = createPublicClient({
    chain: arbitrumSepolia,
    transport: http(),
  });

  // Reuse the existing campaign hook (it already does rich demo + on-chain merge)
  const { campaigns: allCampaigns, isLoading: campaignsLoading, refresh: refreshCampaigns } = useFilmmakerCampaign();

  const fetchCreatorData = async () => {
    if (!creatorAddress) {
      // No wallet — surface beautiful demo so page is always valuable
      setCreatedFilms(DEMO_CREATED_FILMS);
      setTotalEarnings(DEMO_TOTAL);
      setRecentPayouts(DEMO_PAYOUTS);
      // Beautiful demo campaigns when no address (use known demo filmmaker)
      const demoFilmmaker = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'.toLowerCase();
      const demoCampaigns = allCampaigns.filter(c => (c.filmmaker || '').toLowerCase() === demoFilmmaker).slice(0, 2);
      setMyCampaigns(demoCampaigns.length ? demoCampaigns : allCampaigns.slice(0, 2));
      return;
    }

    setIsLoading(true);
    setError(undefined);

    try {
      const addrLower = creatorAddress.toLowerCase();

      // 1. Created films: Phase 0 linear scan (same spirit as useOwnedFilms,
      //    bounded by totalMinted — NOT totalSupply(), which shrinks on burn
      //    and would hide created films minted after any burn).
      let onChainFilms: CreatedFilm[] = [];
      if (MOVIE_TICKET_ADDRESS && MOVIE_TICKET_ADDRESS !== '0x0000000000000000000000000000000000000000') {
        try {
          const minted = await publicClient.readContract({
            address: MOVIE_TICKET_ADDRESS,
            abi: MOVIE_TICKET_ABI,
            functionName: 'totalMinted',
          });
          const mintedNum = Number(minted);

          for (let i = 0; i < mintedNum; i++) {
            try {
              const meta = await publicClient.readContract({
                address: MOVIE_TICKET_ADDRESS,
                abi: MOVIE_TICKET_ABI,
                functionName: 'videoMetadata',
                args: [BigInt(i)],
              }) as unknown as [string, `0x${string}`, bigint, boolean];

              const filmCreator = (meta[1] || '').toLowerCase();
              if (filmCreator === addrLower) {
                const hash = meta[0];
                // Stronger Arweave enrichment via fetch (title + desc + poster from JSON when available; graceful demo via get* + fetch for placeholders)
                let title = getDemoFilmTitle(hash);
                let description = getDemoFilmDescription(hash);
                let poster: string | undefined;
                try {
                  const metaData = await fetchArweaveMetadata(hash);
                  if (metaData) {
                    title = metaData.title || title;
                    description = metaData.description || description;
                    poster = getPosterUrl(metaData) || undefined;
                  }
                } catch {}
                onChainFilms.push({
                  tokenId: i,
                  videoHash: hash,
                  title,
                  description,
                  poster,
                });
              }
            } catch {
              // skip burned / invalid
            }
          }
        } catch (e) {
          console.warn('[useCreatorDashboard] created films scan skipped (contract or network)');
        }
      }

      const films = onChainFilms.length > 0 ? onChainFilms : DEMO_CREATED_FILMS;
      setCreatedFilms(films);

      // 2. Earnings via CreatorPaid events (real on-chain payouts)
      let earnings = BigInt(0);
      let payouts: CreatorPayout[] = [];
      if (MOVIE_TICKET_ADDRESS && MOVIE_TICKET_ADDRESS !== '0x0000000000000000000000000000000000000000') {
        try {
          const creatorPaidEvent = parseAbiItem(
            'event CreatorPaid(uint256 indexed tokenId, address indexed creator, uint256 amount)'
          );

          const logs = await publicClient.getLogs({
            address: MOVIE_TICKET_ADDRESS,
            event: creatorPaidEvent,
            args: { creator: creatorAddress },
            fromBlock: BigInt(0), // Phase 0: small testnet history fine. TODO Phase 1: recent blocks or indexer for perf at scale
          });

          payouts = logs.map((log: any) => ({
            tokenId: Number(log.args?.tokenId ?? 0),
            amount: log.args?.amount ?? BigInt(0),
            // txHash available on log.transactionHash in viem
            txHash: log.transactionHash,
            // Best-effort timestamp (Phase 0 small history; real indexer would provide this instantly)
            blockNumber: log.blockNumber ? Number(log.blockNumber) : undefined,
          })).sort((a, b) => b.tokenId - a.tokenId); // recent-ish by token order

          earnings = payouts.reduce((sum, p) => sum + p.amount, BigInt(0));
        } catch (e) {
          console.warn('[useCreatorDashboard] CreatorPaid logs unavailable, using demo');
        }
      }

      if (earnings === BigInt(0) && (!MOVIE_TICKET_ADDRESS || MOVIE_TICKET_ADDRESS === '0x0000000000000000000000000000000000000000')) {
        earnings = DEMO_TOTAL;
        payouts = DEMO_PAYOUTS;
      }
      setTotalEarnings(earnings);
      setRecentPayouts(payouts.length > 0 ? payouts.slice(0, 5) : DEMO_PAYOUTS);

      // 3. My campaigns — filter existing rich campaign list (demo + on-chain)
      const filteredCampaigns = allCampaigns.filter(
        (c) => c.filmmaker && c.filmmaker.toLowerCase() === addrLower
      );
      // Always merge a couple demo campaigns for beautiful Phase 0 experience even pre-deploy
      const merged = filteredCampaigns.length > 0
        ? [...filteredCampaigns, ...allCampaigns.filter(c => !filteredCampaigns.includes(c)).slice(0, 1)]
        : allCampaigns.slice(0, 2); // demo fallback
      setMyCampaigns(merged);

    } catch (err: any) {
      console.warn('[useCreatorDashboard] fetch error, falling back to demo', err);
      setError('On-chain data partial (using Phase 0 demo)');
      setCreatedFilms(DEMO_CREATED_FILMS);
      setTotalEarnings(DEMO_TOTAL);
      setRecentPayouts(DEMO_PAYOUTS);
      setMyCampaigns(allCampaigns.slice(0, 2));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCreatorData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creatorAddress, allCampaigns.length]);

  const refresh = () => {
    refreshCampaigns();
    fetchCreatorData();
  };

  return {
    createdFilms,
    totalEarnings,
    recentPayouts,
    myCampaigns,
    isLoading: isLoading || campaignsLoading,
    error,
    refresh,
  } as CreatorDashboardData;
}
