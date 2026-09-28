import { useState, useEffect, useCallback } from 'react';
import { createPublicClient, http, parseAbiItem } from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import {
  SEEDER_CREDITS_ADDRESS,
  SEEDER_CREDITS_ABI,
  MOVIE_TICKET_ADDRESS,
  MOVIE_TICKET_ABI,
  SEEDER_REWARD_MINT_DISCOUNT,
  SEEDER_REWARD_FREE_TICKET,
  SEEDER_REWARD_PRODUCER_BOOST,
  SEEDER_REWARD_AI_CREDITS,
} from './config';

/**
 * Hook for the P2P Seeder Credits system (hybrid Arweave + on-chain).
 * Phase 0/1: Provisional balance from on-chain + simple tier multiplier.
 * Full flow will pull recent Arweave reports for "claimable" preview.
 *
 * === v2 EXTENSION (additive, Spike 4 / ADR-001 §5) ===
 * Multi-source report support (Theta relay + Filecoin retrieval + Livepeer).
 * Event-powered My Seeding Impact + leaderboards (CreditsEarned).
 * Rich redemption options + unified claim flow (sim + calldata preview).
 * Reuses indexer foundation patterns + creator dashboard logs.
 * Non-transferable utility; tier synergies first-class.
 */

// === v2 Multi-Source Report Shape (per ADR-001 §5 + Spike 2 foundation) ===
// Anchored on Arweave (report JSON) or Filecoin for bulk; txId/CID passed to claim.
// Client (player/seeder hook or native) measures across hybrid mesh, bundles attestations.
export interface MultiSourceSeedingReport {
  version: 'v2-multi-adr001';
  seederAddress?: `0x${string}`;
  period: {
    start: string; // ISO
    end: string;
    durationSec: number;
  };
  sources: {
    thetaRelay?: {
      gbRelayed: number;
      peersServed: number;
      avgUploadMbps: number;
      peakUploadMbps?: number;
      segmentsRelayed?: number;
      tfuelReceiptStub?: string; // TFUEL-adj or Edge Node proof ref (future real sig)
      filmContext?: string;
    };
    filecoinRetrieval?: {
      bytesRetrieved: number; // via Saturn/Beam verifiable
      dealsVerified?: number;
      beamSaturnAttestation?: string; // CID or sig stub
    };
    livepeerUsage?: {
      minutesTranscoded: number;
      segmentsProcessed?: number;
      orchestratorRef?: string; // or usage proof
    };
  };
  totalBaseCredits: number; // summed pre-multiplier from all sources (e.g. 42cr/GB theta + retrieval bonuses)
  arweaveReportTxId?: string; // primary immutable anchor (ADR: Arweave for proofs/reports)
  attestation?: {
    platformSig?: string; // ECDSA over (seeder, anchor, amount, chain)
    sourceMask?: string; // e.g. "0x07" for all three sources
  };
  metadata?: Record<string, unknown>; // extensible (uptime streaks, cross-film rep, etc.)
}

// Parsed on-chain impact from CreditsEarned (or indexer materialized view)
export interface SeedingImpactEntry {
  amount: number; // effective (post-multiplier)
  arweaveTxId: string;
  tierMultiplier: number;
  timestamp?: number;
  blockNumber?: number;
  txHash?: string;
}

// Leaderboard row (demo + event aggregated; in prod: indexer top-N query)
export interface LeaderboardEntry {
  seeder: string; // truncated for display or full
  totalCredits: number;
  lastEarned?: number;
  rank: number;
}

// Redemption option for rich UI surfaces
export interface RedemptionOption {
  id: string;
  label: string;
  cost: number; // credits to burn
  description: string;
  rewardType: string; // bytes32 identifier (use the exported consts)
  perkPreview: string; // e.g. "10% off next mint" or "1x free burnable MovieTicket"
  tierSynergy?: string; // e.g. "Producer holders unlock at lower cost"
}

export const DEFAULT_REDEMPTION_OPTIONS: RedemptionOption[] = [
  {
    id: 'mint-discount',
    label: 'Mint Discount Voucher (10%)',
    cost: 120,
    description: 'Burn credits for a one-time 10% platform fee discount voucher on next mint/crowdfund.',
    rewardType: SEEDER_REWARD_MINT_DISCOUNT,
    perkPreview: 'Applies at mint time via attestation or on-chain burn proof.',
    tierSynergy: 'Deluxe+ holders get 20% more effective value',
  },
  {
    id: 'free-ticket',
    label: 'Free Burnable Ticket',
    cost: 200,
    description: 'Claim a free burnable MovieTicket (single-film access) for any catalog title.',
    rewardType: SEEDER_REWARD_FREE_TICKET,
    perkPreview: 'Mints a burnable ticket NFT on claim (future integration with MovieTicket).',
    tierSynergy: 'Producer tier: 150 credit cost',
  },
  {
    id: 'producer-boost',
    label: 'Producer Tier Boost',
    cost: 350,
    description: 'Temporary or snapshot boost toward Producer eligibility / priority in crowdfunds.',
    rewardType: SEEDER_REWARD_PRODUCER_BOOST,
    perkPreview: 'Attestation for FilmmakerCampaign or future governance weight.',
    tierSynergy: 'Stacks with existing Producer 1.5x earnings',
  },
  {
    id: 'ai-collab',
    label: 'AI Collaboration Credits',
    cost: 80,
    description: 'Redeem for extra AI review/proof / script collab quota on owned or created films.',
    rewardType: SEEDER_REWARD_AI_CREDITS,
    perkPreview: 'Unlocks additional submitAIProof calls or Livepeer inference minutes.',
    tierSynergy: 'Available to all tiers',
  },
];

// Demo seeds for leaderboards / impact when no on-chain history
const DEMO_IMPACT: SeedingImpactEntry[] = [
  { amount: 87, arweaveTxId: 'ar://seeder-proof-theta-abc123', tierMultiplier: 150, blockNumber: 9876543 },
  { amount: 42, arweaveTxId: 'ar://seeder-proof-fc-retrieval-xyz', tierMultiplier: 125, blockNumber: 9876501 },
];
const DEMO_LEADERBOARD: LeaderboardEntry[] = [
  { seeder: '0x7099…79C8', totalCredits: 12450, lastEarned: 312, rank: 1 },
  { seeder: '0x3C44…93BC', totalCredits: 9870, lastEarned: 156, rank: 2 },
  { seeder: '0x90F7…6C4f', totalCredits: 6420, lastEarned: 89, rank: 3 },
  { seeder: 'you (demo)', totalCredits: 420, lastEarned: 55, rank: 4 },
];

export function useSeederCredits(userAddress?: `0x${string}`) {
  const [credits, setCredits] = useState(0);
  const [tierMultiplier, setTierMultiplier] = useState(100); // 100 = 1.0x
  const [isLoading, setIsLoading] = useState(false);

  // v2 additions (additive)
  const [myImpact, setMyImpact] = useState<SeedingImpactEntry[]>([]);
  const [leaderboardPreview, setLeaderboardPreview] = useState<LeaderboardEntry[]>(DEMO_LEADERBOARD);
  const [simulatedCredits, setSimulatedCredits] = useState<number | null>(null); // local demo redemptions/claims (non-persistent, UX preview)
  const [isImpactLoading, setIsImpactLoading] = useState(false);

  const publicClient = createPublicClient({
    chain: arbitrumSepolia,
    transport: http(),
  });

  const fetchCredits = async () => {
    if (!userAddress || !SEEDER_CREDITS_ADDRESS || SEEDER_CREDITS_ADDRESS === '0x0000000000000000000000000000000000000000') {
      setCredits(0);
      setTierMultiplier(100);
      // Rich demo even without contract for v2 surfaces
      setMyImpact(DEMO_IMPACT);
      setLeaderboardPreview(DEMO_LEADERBOARD);
      return;
    }

    setIsLoading(true);
    try {
      const [bal, mult] = await Promise.all([
        publicClient.readContract({
          address: SEEDER_CREDITS_ADDRESS,
          abi: SEEDER_CREDITS_ABI,
          functionName: 'credits',
          args: [userAddress],
        }),
        publicClient.readContract({
          address: SEEDER_CREDITS_ADDRESS,
          abi: SEEDER_CREDITS_ABI,
          functionName: 'getTierMultiplier',
          args: [userAddress],
        }),
      ]);

      setCredits(Number(bal));
      setTierMultiplier(Number(mult));
    } catch (err) {
      console.warn('Could not fetch seeder credits (contract may not be deployed)');
      setCredits(0);
      setTierMultiplier(100);
    } finally {
      setIsLoading(false);
    }
  };

  // v2: Event-powered "My Seeding Impact" + simple leaderboard preview (reuses useCreatorDashboard getLogs pattern + indexer foundation)
  // In production: replace with fetch(`${INDEXER_URL}/seeder-activity?address=...`) or GraphQL (see useHasFilmAccess.ts)
  const fetchImpactAndLeaderboard = useCallback(async () => {
    setIsImpactLoading(true);
    try {
      const impact: SeedingImpactEntry[] = [];
      let lb = [...DEMO_LEADERBOARD];

      if (SEEDER_CREDITS_ADDRESS && SEEDER_CREDITS_ADDRESS !== '0x0000000000000000000000000000000000000000') {
        try {
          const earnedEvent = parseAbiItem(
            'event CreditsEarned(address indexed seeder, uint256 amount, string arweaveTxId, uint256 tierMultiplier)'
          );

          // My impact (filter by seeder)
          if (userAddress) {
            const myLogs = await publicClient.getLogs({
              address: SEEDER_CREDITS_ADDRESS,
              event: earnedEvent,
              args: { seeder: userAddress },
              fromBlock: BigInt(0),
            });
            myLogs.forEach((log: any) => {
              impact.push({
                amount: Number(log.args?.amount ?? 0),
                arweaveTxId: log.args?.arweaveTxId ?? 'ar://unknown',
                tierMultiplier: Number(log.args?.tierMultiplier ?? 100),
                blockNumber: log.blockNumber ? Number(log.blockNumber) : undefined,
                txHash: log.transactionHash,
              });
            });
          }

          // Leaderboard preview: recent global CreditsEarned (small history ok on testnet; prod = indexer top aggregate)
          const allLogs = await publicClient.getLogs({
            address: SEEDER_CREDITS_ADDRESS,
            event: earnedEvent,
            fromBlock: BigInt(0),
          });

          const agg = new Map<string, { total: number; last: number }>();
          allLogs.forEach((log: any) => {
            const s = (log.args?.seeder || '').toLowerCase();
            const amt = Number(log.args?.amount ?? 0);
            if (!s) return;
            const prev = agg.get(s) || { total: 0, last: 0 };
            agg.set(s, { total: prev.total + amt, last: amt });
          });

          if (agg.size > 0) {
            lb = Array.from(agg.entries())
              .map(([s, v], idx) => ({
                seeder: s.slice(0, 6) + '…' + s.slice(-4),
                totalCredits: v.total,
                lastEarned: v.last,
                rank: idx + 1,
              }))
              .sort((a, b) => b.totalCredits - a.totalCredits)
              .slice(0, 6);
            // Inject "you" if present
            if (userAddress) {
              const youKey = userAddress.toLowerCase();
              const you = agg.get(youKey);
              if (you) {
                lb = lb.filter((e) => !e.seeder.toLowerCase().includes(youKey.slice(2, 6)));
                lb.unshift({
                  seeder: 'you',
                  totalCredits: you.total,
                  lastEarned: you.last,
                  rank: 0,
                });
                lb = lb.map((e, i) => ({ ...e, rank: i + 1 })).slice(0, 6);
              }
            }
          }
        } catch (e) {
          console.warn('[useSeederCredits] CreditsEarned logs unavailable, using demo v2 impact');
        }
      }

      const finalImpact = impact.length > 0 ? impact : DEMO_IMPACT;
      setMyImpact(finalImpact);
      setLeaderboardPreview(lb.length > 0 ? lb : DEMO_LEADERBOARD);
    } catch (err) {
      console.warn('[useSeederCredits] Impact fetch error', err);
      setMyImpact(DEMO_IMPACT);
      setLeaderboardPreview(DEMO_LEADERBOARD);
    } finally {
      setIsImpactLoading(false);
    }
  }, [userAddress, publicClient]);

  useEffect(() => {
    fetchCredits();
    fetchImpactAndLeaderboard();
  }, [userAddress, fetchImpactAndLeaderboard]);

  const effectiveCredits = Math.floor((simulatedCredits ?? credits) * (tierMultiplier / 100));

  // === v2 Unified Claim Flow (accepts multi-source reports; simulation + preview) ===
  // Reuses Spike 2 Theta report patterns + Arweave anchor. Supports legacy or v2 submit.
  const generateMultiSourceReport = useCallback(
    (params: {
      theta?: Partial<MultiSourceSeedingReport['sources']['thetaRelay']>;
      filecoin?: Partial<MultiSourceSeedingReport['sources']['filecoinRetrieval']>;
      livepeer?: Partial<MultiSourceSeedingReport['sources']['livepeerUsage']>;
      arweaveTxId?: string;
    }): MultiSourceSeedingReport => {
      const now = Date.now();
      const start = new Date(now - 1000 * 60 * 45).toISOString(); // ~45min demo window
      const durationSec = 45 * 60;

      // Realistic base calc (42/GB theta + bonuses; matches Spike 2)
      const thetaGb = params.theta?.gbRelayed ?? 0.87;
      const thetaCredits = Math.floor(thetaGb * 42);
      const fcBonus = params.filecoin?.bytesRetrieved ? Math.floor((params.filecoin.bytesRetrieved ?? 0) / 1e9 * 8) : 0;
      const lpBonus = params.livepeer?.minutesTranscoded ? Math.floor((params.livepeer.minutesTranscoded ?? 0) * 1.5) : 0;
      const totalBase = thetaCredits + fcBonus + lpBonus;

      const report: MultiSourceSeedingReport = {
        version: 'v2-multi-adr001',
        seederAddress: userAddress,
        period: { start, end: new Date(now).toISOString(), durationSec },
        sources: {
          thetaRelay: params.theta
            ? {
                gbRelayed: thetaGb,
                peersServed: params.theta.peersServed ?? 27,
                avgUploadMbps: params.theta.avgUploadMbps ?? 2.7,
                ...params.theta,
              }
            : undefined,
          filecoinRetrieval: params.filecoin
            ? { bytesRetrieved: params.filecoin.bytesRetrieved ?? 2.1e9, ...params.filecoin }
            : undefined,
          livepeerUsage: params.livepeer
            ? { minutesTranscoded: params.livepeer.minutesTranscoded ?? 12, ...params.livepeer }
            : undefined,
        },
        totalBaseCredits: totalBase,
        arweaveReportTxId: params.arweaveTxId,
        attestation: { sourceMask: '0x07' }, // all sources
        metadata: { spike: '4', note: 'Unified hybrid mesh contribution (ADR-001)' },
      };
      return report;
    },
    [userAddress]
  );

  const computeClaimWithTier = useCallback((baseCredits: number, mult = tierMultiplier) => {
    return Math.floor((baseCredits * mult) / 100);
  }, [tierMultiplier]);

  // Prepare unified claim calldata preview (legacy or v2 submitMultiSourceReport)
  const prepareUnifiedClaim = useCallback(
    (report: MultiSourceSeedingReport, useV2 = true) => {
      const finalAmount = computeClaimWithTier(report.totalBaseCredits);
      const anchor = report.arweaveReportTxId || 'ar://pending-v2-report';
      const sigNote = '(platformAttestor signs keccak(seeder + anchor + amount + chainId))';

      if (useV2) {
        return {
          functionName: 'submitMultiSourceReport',
          argsPreview: [anchor, finalAmount, '0x' + '00'.repeat(65) /* sig placeholder */, report.attestation?.sourceMask || '0x07'],
          note: `v2 multi-source claim. Sources: ${Object.keys(report.sources).join('+')}. ${sigNote}. Contract applies cooldown + tier + emits CreditsEarned.`,
          finalCredits: finalAmount,
        };
      }
      // Legacy compat
      return {
        functionName: 'submitSeedingReport',
        argsPreview: [anchor, finalAmount, '0x' + '00'.repeat(65)],
        note: `Legacy single-source claim (for Arweave-only reports). ${sigNote}`,
        finalCredits: finalAmount,
      };
    },
    [computeClaimWithTier]
  );

  // Simple unified claim simulation (updates local sim balance for live preview UX; real = wallet write + refresh)
  const simulateClaim = useCallback(
    (report: MultiSourceSeedingReport) => {
      const final = computeClaimWithTier(report.totalBaseCredits);
      const current = simulatedCredits ?? credits;
      const newBal = current + final;
      setSimulatedCredits(newBal);
      // Append to impact preview
      setMyImpact((prev) => [
        { amount: final, arweaveTxId: report.arweaveReportTxId || 'ar://sim-v2-claim', tierMultiplier, blockNumber: 9999999 },
        ...prev,
      ]);
      return { success: true, credited: final, newBalance: newBal };
    },
    [credits, simulatedCredits, tierMultiplier, computeClaimWithTier]
  );

  // === Redemption surfaces (rich UX + sim) ===
  // On-chain path: call redeemCredits(amount, rewardType) → burns + emits. Frontend applies perk (voucher mint, ticket, boost flag).
  // Attestation-based: for some (e.g. vouchers) can be off-chain claim with on-chain burn receipt.
  const redeemOptions = DEFAULT_REDEMPTION_OPTIONS;

  const simulateRedeem = useCallback(
    (option: RedemptionOption) => {
      const current = simulatedCredits ?? credits;
      if (current < option.cost) {
        return { success: false, error: 'Insufficient credits (demo)' };
      }
      const newBal = current - option.cost;
      setSimulatedCredits(newBal);

      // Record as negative impact entry for "My Seeding Impact"
      setMyImpact((prev) => [
        { amount: -option.cost, arweaveTxId: `redeem:${option.id}`, tierMultiplier: 100, blockNumber: 9999998 },
        ...prev,
      ]);

      return {
        success: true,
        newBalance: newBal,
        perk: option.perkPreview,
        rewardTypeUsed: option.rewardType,
      };
    },
    [credits, simulatedCredits, tierMultiplier]
  );

  const resetSimulations = useCallback(() => {
    setSimulatedCredits(null);
    setMyImpact(DEMO_IMPACT);
  }, []);

  const refresh = useCallback(() => {
    fetchCredits();
    fetchImpactAndLeaderboard();
  }, [fetchCredits, fetchImpactAndLeaderboard]);

  const baseCreditsForDisplay = simulatedCredits ?? credits;

  return {
    // Legacy (unchanged API for compat)
    credits: baseCreditsForDisplay,
    tierMultiplier,
    effectiveCredits,
    isLoading: isLoading || isImpactLoading,
    refresh,

    // v2 rich surfaces (new)
    myImpact,
    leaderboardPreview,
    redeemOptions,
    simulatedCredits,
    isImpactLoading,

    // Unified claim + multi-source
    generateMultiSourceReport,
    prepareUnifiedClaim,
    simulateClaim,
    computeClaimWithTier,

    // Redemption
    simulateRedeem,
    resetSimulations,

    // Helpers
    effectiveBase: baseCreditsForDisplay,
  };
}
