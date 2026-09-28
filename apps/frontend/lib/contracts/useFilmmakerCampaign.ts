import { useState, useEffect } from 'react';
import { createPublicClient, http, parseEther } from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import { FILMMAKER_CAMPAIGN_ADDRESS, FILMMAKER_CAMPAIGN_ABI } from './config';
import { fetchArweaveMetadata, getDemoFilmTitle, getDemoFilmDescription, getPosterUrl } from '@/hooks/useFilmMetadata';

/**
 * Hook for FilmmakerCampaign (crowdfunding + milestone escrow + AI review).
 * Exact same patterns as useMovieTicket, useSeederCredits, useReviews:
 * - viem publicClient for all reads
 * - useState + useEffect + loading + refresh()
 * - Graceful fallback to rich Phase 0 stub/demo data when contract not deployed or zero address
 * - No writes here (writes follow the exact createWalletClient + Privy pattern from mint/page.tsx)
 *
 * Ties directly into Reviews core: crowdfund backers (esp. Producer tier) are "verified owners"
 * who can leave reviews + (for Producers) submit AI milestone proofs for platform review.
 */

export type CampaignStatus = 'ACTIVE' | 'FUNDED' | 'FAILED' | 'DELIVERED';

export interface Campaign {
  id: number;
  filmmaker: `0x${string}`;
  metadataHash: string; // Arweave JSON pointer (pitch, title, poster art, milestone descriptions)
  target: bigint;
  raised: bigint;
  deadline: number; // unix seconds
  status: number; // 0=ACTIVE ...
  // Title/description/poster now populated from Arweave metadata JSON (via fetchArweaveMetadata) when real campaigns exist.
  // Falls back to rich Phase 0 demo data ONLY for zero-address (no contract). Real metadataHash always prefer Arweave JSON.
  title: string;
  description: string;
  poster?: string;
  // Tier pricing (demo values when on-chain struct fields unavailable via public getter)
  tierPrices: bigint[]; // [BASIC, DELUXE, PRODUCER]
  tierMaxSupplies: number[];
  tierSold: number[];
  // Milestones (amounts + descs from metadata in real flow)
  milestones: Array<{ amount: bigint; desc: string; approved: boolean }>;
}

const STATUS_LABELS: Record<number, CampaignStatus> = {
  0: 'ACTIVE',
  1: 'FUNDED',
  2: 'FAILED',
  3: 'DELIVERED',
};

// Rich Phase 0 demo campaigns (always beautiful & useful even pre-deploy).
// These illustrate "back verified creators" + direct tie to gated reviews.
const DEMO_CAMPAIGNS: Campaign[] = [
  {
    id: 0,
    filmmaker: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as `0x${string}`,
    metadataHash: 'ar://demo-campaign-silent-echo',
    target: parseEther('2.5'),
    raised: parseEther('1.82'),
    deadline: Math.floor(Date.now() / 1000) + 1000 * 3600 * 24 * 11, // ~11 days
    status: 0,
    title: 'Silent Echo',
    description: 'A haunting sci-fi short about memory, loss, and the last radio signal from a dying colony ship. 100% on-chain ownership + verified backer reviews.',
    tierPrices: [parseEther('0.025'), parseEther('0.08'), parseEther('0.25')],
    tierMaxSupplies: [120, 40, 12],
    tierSold: [73, 19, 4],
    milestones: [
      { amount: parseEther('0.8'), desc: 'Script + pre-production locked', approved: true },
      { amount: parseEther('1.0'), desc: 'Principal photography + rough cut', approved: false },
      { amount: parseEther('0.7'), desc: 'Final color, sound mix, Arweave master delivery', approved: false },
    ],
  },
  {
    id: 1,
    filmmaker: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' as `0x${string}`,
    metadataHash: 'ar://demo-campaign-neon-harbor',
    target: parseEther('1.8'),
    raised: parseEther('0.95'),
    deadline: Math.floor(Date.now() / 1000) + 1000 * 3600 * 24 * 6,
    status: 0,
    title: 'Neon Harbor',
    description: 'Cyber-noir thriller set in a flooded megacity. Producer backers get early private screener + power to submit AI proofs for milestone review.',
    tierPrices: [parseEther('0.015'), parseEther('0.055'), parseEther('0.18')],
    tierMaxSupplies: [200, 55, 15],
    tierSold: [41, 12, 2],
    milestones: [
      { amount: parseEther('0.6'), desc: 'Concept art, animatic, casting', approved: false },
      { amount: parseEther('0.9'), desc: 'Live action shoot + VFX plates', approved: false },
      { amount: parseEther('0.3'), desc: 'Post + final Arweave + Livepeer masters', approved: false },
    ],
  },
];

export function useFilmmakerCampaign() {
  const [campaigns, setCampaigns] = useState<Campaign[]>(DEMO_CAMPAIGNS);
  const [aiReviewWindow, setAiReviewWindow] = useState<number>(72 * 3600); // seconds default
  const [isLoading, setIsLoading] = useState(false);

  const publicClient = createPublicClient({
    chain: arbitrumSepolia,
    transport: http(),
  });

  const fetchCampaigns = async () => {
    if (!FILMMAKER_CAMPAIGN_ADDRESS || FILMMAKER_CAMPAIGN_ADDRESS === '0x0000000000000000000000000000000000000000') {
      // Phase 0: beautiful demo data so the crowdfund page is immediately useful and cinematic
      setCampaigns(DEMO_CAMPAIGNS);
      setAiReviewWindow(72 * 3600);
      return;
    }

    setIsLoading(true);
    try {
      // Real on-chain enumeration (Phase 0 scan, same spirit as useOwnedFilms). Titles now pulled from Arweave.
      const nextIdRaw = await publicClient.readContract({
        address: FILMMAKER_CAMPAIGN_ADDRESS,
        abi: FILMMAKER_CAMPAIGN_ABI,
        functionName: 'nextCampaignId',
      });
      const nextId = Number(nextIdRaw);

      const onChain: Campaign[] = [];
      for (let i = 0; i < nextId; i++) {
        try {
          const c: any = await publicClient.readContract({
            address: FILMMAKER_CAMPAIGN_ADDRESS,
            abi: FILMMAKER_CAMPAIGN_ABI,
            functionName: 'campaigns',
            args: [BigInt(i)],
          });

          // Basic fields only from public getter. Enrich with real Arweave metadata when available (Phase 0+).
          // Use shared graceful getDemo* only as base (for unknown hashes); real metadataHash always wins when JSON present.
          const demo = DEMO_CAMPAIGNS[i] || DEMO_CAMPAIGNS[0];
          const metadataHash = c[1] as string;

          // Fetch title/description/poster from the uploaded campaign metadata JSON (the whole point of this change)
          let title = getDemoFilmTitle(metadataHash);
          let description = getDemoFilmDescription(metadataHash);
          let poster: string | undefined;
          try {
            const meta = await fetchArweaveMetadata(metadataHash);
            if (meta) {
              if (meta.title) title = meta.title;
              if (meta.description) description = meta.description;
              poster = getPosterUrl(meta) || undefined;
            }
          } catch {
            // keep graceful fallback — fetch util already logs
          }

          onChain.push({
            id: i,
            filmmaker: c[0] as `0x${string}`,
            metadataHash,
            target: c[2] as bigint,
            raised: c[3] as bigint,
            deadline: Number(c[4]),
            status: Number(c[5]),
            title,
            description,
            poster,
            tierPrices: demo.tierPrices,
            tierMaxSupplies: demo.tierMaxSupplies,
            tierSold: demo.tierSold,
            milestones: demo.milestones,
          });
        } catch {
          // skip malformed
        }
      }

      // Demo fallback ONLY when zero-address (no contract) for Phase 0 beauty.
      // When real contract, show ONLY on-chain campaigns so real metadataHash (with creator Arweave JSON title/desc/poster) surfaces cleanly.
      const merged = onChain.length > 0 ? onChain : [];
      setCampaigns(merged);

      // Also fetch AI window
      try {
        const windowSec = await publicClient.readContract({
          address: FILMMAKER_CAMPAIGN_ADDRESS,
          abi: FILMMAKER_CAMPAIGN_ABI,
          functionName: 'aiReviewWindow',
        });
        setAiReviewWindow(Number(windowSec));
      } catch {
        // keep default
      }
    } catch (err) {
      console.warn('Could not fetch FilmmakerCampaign data (using beautiful demo campaigns)');
      setCampaigns(DEMO_CAMPAIGNS);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCampaigns();
  }, []);

  const getStatusLabel = (status: number): CampaignStatus => STATUS_LABELS[status] || 'ACTIVE';

  const getProgress = (c: Campaign) => {
    if (c.target === BigInt(0)) return 0;
    return Math.min(100, Math.floor((Number(c.raised) / Number(c.target)) * 100));
  };

  const isActive = (c: Campaign) => getStatusLabel(c.status) === 'ACTIVE' && Date.now() / 1000 < c.deadline;

  // Phase 0 helper: Producer ownership check (real impl would scan DFCP tokens + tokenTiers).
  // For now returns demo-friendly result. In production page can combine with on-chain ownership.
  const isProducerBackerDemo = (userAddress?: string, campaignId?: number) => {
    if (!userAddress) return false;
    // Demo: treat any connected user as having Producer tier on demo campaigns (for showcasing the unique AI proof flow)
    return true; // Phase 0 practical — real ownership gating added post-deploy with full enumeration
  };

  return {
    campaigns,
    aiReviewWindow,
    isLoading,
    refresh: fetchCampaigns,
    getStatusLabel,
    getProgress,
    isActive,
    isProducerBackerDemo,
  };
}

/**
 * Write helpers (documented here — implemented in pages using exact mint/page.tsx pattern):
 *
 * const walletClient = createWalletClient({ account, chain: targetChain, transport: custom(provider) });
 *
 * // Launch (after useArweaveUpload().uploadJson(metadata))
 * await walletClient.writeContract({
 *   address: FILMMAKER_CAMPAIGN_ADDRESS,
 *   abi: FILMMAKER_CAMPAIGN_ABI,
 *   functionName: 'launchCampaign',
 *   args: [metadataHash, target, milestoneAmounts, tierPrices, tierMaxSupplies, deadline],
 * });
 *
 * // Contribute (tier 0/1/2)
 * await walletClient.writeContract({
 *   address: FILMMAKER_CAMPAIGN_ADDRESS, abi: FILMMAKER_CAMPAIGN_ABI,
 *   functionName: 'contribute', args: [campaignId, tier], value: price,
 * });
 *
 * // Producer AI Proof submit (after uploadJson or upload proof artifact)
 * await walletClient.writeContract({
 *   address: FILMMAKER_CAMPAIGN_ADDRESS, abi: FILMMAKER_CAMPAIGN_ABI,
 *   functionName: 'submitAIProof', args: [campaignId, mId, proofHash],
 * });
 *
 * // Refund
 * await walletClient.writeContract({ ... 'claimRefund', args: [campaignId] });
 *
 * All errors surfaced exactly like mint flow (user rejected, insufficient, etc.).
 * See /crowdfund page for live implementation.
 */
