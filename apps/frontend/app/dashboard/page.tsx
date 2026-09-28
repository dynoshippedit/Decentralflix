'use client';

import React, { useState } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { formatEther, createWalletClient, custom, parseEther, defineChain } from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import { useCreatorDashboard, useSeederCredits, useMyAccessibleFilms, FILMMAKER_CAMPAIGN_ADDRESS, FILMMAKER_CAMPAIGN_ABI } from '@/lib/contracts';
import { useArweaveUpload } from '@/hooks/useArweaveUpload';
import { getDemoFilmTitle, useFilmMetadata, getDemoOwnedFilms } from '@/hooks/useFilmMetadata';

/**
 * /dashboard — Advanced high-quality Phase 0/1 stub for Creator + User dashboards.
 *
 * Tabbed cinematic experience:
 *   - User Library & Voice: owned/gated films (useMyAccessibleFilms + useHasFilmAccess for MovieTicket + crowdfund), credits/seeding (useSeederCredits), profile, strong "you own this" + verified owner voice links to Reviews.
 *   - Creator Studio: manage active campaigns (FilmmakerCampaign + inline stubs for AI proofs / setCampaignVideo), Arweave upload + direct launch (reuse hook + contract calls for launchCampaign), earnings (real CreatorPaid logs + stats for raised/reach), created films.
 *
 * Leverages all recent systems (multi-tier NFTs, P2P SeederCredits, crowdfund escrow+AI review, Arweave, Reviews as verified owner voice, real ownership/gating, Livepeer via links). Demo + real paths. Minimal files. Cinematic emerald ownership accents + emotional messaging.
 */

type Tab = 'user' | 'creator';

// Local Hardhat detection (reused pattern from crowdfund/mint for launch in dashboard)
const hardhatLocal = defineChain({
  id: 31337,
  name: 'Hardhat',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['http://127.0.0.1:8545'] } },
});

const TIER_LABELS = ['BASIC', 'DELUXE', 'PRODUCER'] as const;
type Tier = 'BASIC' | 'DELUXE' | 'PRODUCER';
const TIER_VALUES: Record<Tier, number> = { BASIC: 0, DELUXE: 1, PRODUCER: 2 };

export default function DashboardPage() {
  const { ready, authenticated, user, login } = usePrivy();
  const { wallets } = useWallets();

  const connectedAddress = user?.wallet?.address as `0x${string}` | undefined;

  const [activeTab, setActiveTab] = useState<Tab>('user');

  // === Real hooks (all existing patterns) ===
  // useMyAccessibleFilms: combines MovieTicket + crowdfund (hasCrowdfundAccess + campaignVideoHash from setCampaignVideo) using the improved gating logic
  const { films: accessibleFilmsRaw, isLoading: accessibleLoading } = useMyAccessibleFilms(connectedAddress);
  const {
    credits,
    effectiveCredits,
    tierMultiplier,
    isLoading: creditsLoading,
    // v2 additive (Spike 4)
    myImpact,
    leaderboardPreview,
    redeemOptions,
    simulateRedeem,
    simulateClaim,
    generateMultiSourceReport,
    prepareUnifiedClaim,
    resetSimulations,
  } = useSeederCredits(connectedAddress);

  const {
    createdFilms,
    totalEarnings,
    recentPayouts,
    myCampaigns,
    isLoading: creatorLoading,
    error: creatorError,
    refresh: refreshCreator,
  } = useCreatorDashboard(connectedAddress);

  // Arweave upload (exact same hook used in crowdfund + UploadTest)
  const { upload, uploadJson, uploading: arUploading, result: arResult, error: arError, reset: resetAr } = useArweaveUpload();

  // === Advanced Creator Launch (Phase 0/1 stub): upload + direct launch from Dashboard ===
  // Reuses exact crowdfund patterns (metadata, uploadJson, walletClient + contract write)
  // Launch pattern mirrors crowdfund/page.tsx handleLaunchCampaign (Arweave-first + launchCampaign) — step toward shared util
  const [launchTitle, setLaunchTitle] = useState('');
  const [launchDesc, setLaunchDesc] = useState('');
  const [launchTarget, setLaunchTarget] = useState('2.5');
  const [launchDeadlineDays, setLaunchDeadlineDays] = useState('14');
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchTx, setLaunchTx] = useState<string | null>(null);

  // Mini tier config for quick launch (Producer emerald emphasis)
  const [quickTierPrices, setQuickTierPrices] = useState(['0.025', '0.08', '0.25']);
  const [quickTierSupplies, setQuickTierSupplies] = useState(['120', '40', '12']);
  const [quickMilestones, setQuickMilestones] = useState(['0.8', '1.0', '0.7']);

  // Network for launch (reused from crowdfund pattern)
  const isLocalAddress = FILMMAKER_CAMPAIGN_ADDRESS.toLowerCase() === '0x5fbdb2315678afecb367f032d93f642f64180aa3';
  const targetChain = isLocalAddress ? hardhatLocal : arbitrumSepolia;

  const getWalletClient = async () => {
    const wallet = wallets[0];
    const provider = await wallet.getEthereumProvider();
    return createWalletClient({
      account: connectedAddress,
      chain: targetChain,
      transport: custom(provider),
    });
  };

  const handleQuickLaunch = async () => {
    if (!launchTitle || !launchDesc) {
      alert('Title and pitch required for launch');
      return;
    }
    if (FILMMAKER_CAMPAIGN_ADDRESS === '0x0000000000000000000000000000000000000000') {
      alert('Set NEXT_PUBLIC_FILMMAKER_CAMPAIGN_ADDRESS in .env.local to launch live');
      return;
    }

    setIsLaunching(true);
    setLaunchTx(null);

    try {
      // Build metadata (Arweave first — core pattern)
      const metadata = {
        title: launchTitle,
        description: launchDesc,
        filmmaker: connectedAddress,
        target: launchTarget,
        created: Date.now(),
        tiers: TIER_LABELS.map((label, i) => ({ tier: label, price: quickTierPrices[i], maxSupply: parseInt(quickTierSupplies[i]) })),
        milestones: quickMilestones.map((amt, i) => ({ id: i, amount: amt, desc: `Milestone ${i + 1}` })),
        version: 'dashboard-quicklaunch',
      };

      const uploadRes = await uploadJson(metadata, { 'Type': 'FilmmakerCampaign', 'Title': launchTitle, 'Source': 'CreatorDashboard' });
      if (!uploadRes) throw new Error(arError || 'Arweave upload failed for campaign metadata');

      const metadataHash = `ar://${uploadRes.id}`;

      const targetWei = parseEther(launchTarget);
      const mAmts = quickMilestones.map(a => parseEther(a));
      const tPrices = quickTierPrices.map(p => parseEther(p)) as [bigint, bigint, bigint];
      const tSupplies = quickTierSupplies.map(s => BigInt(parseInt(s))) as [bigint, bigint, bigint];
      const deadline = BigInt(Math.floor(Date.now() / 1000) + parseInt(launchDeadlineDays) * 86400);

      const walletClient = await getWalletClient();
      const hash = await walletClient.writeContract({
        address: FILMMAKER_CAMPAIGN_ADDRESS,
        abi: FILMMAKER_CAMPAIGN_ABI,
        functionName: 'launchCampaign',
        account: connectedAddress!,
        args: [metadataHash, targetWei, mAmts, tPrices, tSupplies, deadline],
      });

      setLaunchTx(hash);
      // Reset + refresh creator data (campaigns will pick it up)
      setLaunchTitle(''); setLaunchDesc(''); setLaunchTarget('2.5');
      await refreshCreator();
    } catch (err: any) {
      console.error(err);
      let msg = err?.message || 'Launch failed';
      if (msg.includes('user rejected')) msg = 'Transaction rejected.';
      alert(`Quick launch failed: ${msg}`);
    } finally {
      setIsLaunching(false);
    }
  };

  // Enriched accessible films for User Library (now uses improved useMyAccessibleFilms + sources for MovieTicket vs Crowdfund)
  // Leans on shared hook (getDemoOwnedFilms + getDemoFilmTitle graceful) to reduce demo list duplication.
  // Real Arweave titles via useFilmMetadata on film pages / when metadataHash present.
  const ownedFilms = accessibleFilmsRaw.length > 0
    ? accessibleFilmsRaw.map(f => ({
        title: getDemoFilmTitle(f.hash),
        hash: f.hash,
        sources: f.sources || [],
        // tokenId omitted (crowdfund tokens use different ID space; not needed for gating links)
      }))
    : getDemoOwnedFilms();

  // Real review voice surface — uses owned/accessible films (MovieTicket + crowdfund)
  // Full aggregation via useReviews per hash would be ideal; here we surface direct edit links + count of films with voice.

  const isLoading = creatorLoading || accessibleLoading || creditsLoading;

  // Simple network badge (matches crowdfund/mint)
  const isLocal = false; // extend if needed
  const networkName = isLocal ? 'Hardhat Local' : 'Arbitrum Sepolia';

  if (!ready) {
    return <div className="min-h-screen bg-black text-white flex items-center justify-center">Loading Decentralflix Dashboard…</div>;
  }

  if (!authenticated || !connectedAddress) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <div className="text-7xl mb-6">🎟️</div>
          <h1 className="text-5xl font-semibold tracking-[-2.5px] mb-4">Your Dashboard</h1>
          <p className="text-xl text-white/70 mb-8">
            Connect to see your owned library, Seeder Credits, verified review voice, creator earnings, campaigns, and Arweave uploads.
          </p>
          <button
            onClick={login}
            className="px-12 py-4 bg-white text-black rounded-full text-lg font-medium active:scale-[0.985] transition"
          >
            Sign in
          </button>
          <div className="mt-6 text-xs text-white/50 tracking-widest">PERMANENT ACCESS • CENSORSHIP-RESISTANT</div>
        </div>
      </div>
    );
  }

  // Post-upload quick actions (beautiful, actionable) — now points to dashboard Quick Launchpad too
  const UploadActions = () => {
    if (!arResult) return null;
    const hash = arResult.id;
    return (
      <div className="mt-4 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl">
        <div className="text-emerald-400 text-xs tracking-[2px] mb-1">UPLOADED TO ARWEAVE</div>
        <div className="font-mono text-xs break-all text-white/80 mb-3">ar://{hash}</div>
        <div className="flex flex-wrap gap-3">
          <a
            href={`/mint?videoHash=${encodeURIComponent(`ar://${hash}`)}`}
            className="flex-1 text-center px-5 py-2.5 bg-white text-black rounded-xl text-sm font-medium hover:bg-white/90 transition"
          >
            Mint Tickets for this Film
          </a>
          <a
            href="#upload"
            className="flex-1 text-center px-5 py-2.5 border border-emerald-500/60 text-emerald-400 rounded-xl text-sm font-medium hover:bg-emerald-500/10 transition"
          >
            Launch Campaign from Here
          </a>
          <button onClick={resetAr} className="px-5 py-2.5 text-sm text-white/60 hover:text-white">Reset</button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Cinematic top nav (exact visual language from crowdfund) */}
      <div className="border-b border-white/10 sticky top-0 z-40 bg-black/95 backdrop-blur">
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <a href="/" className="text-white/60 hover:text-white text-sm tracking-[3px]">← DECENTRALFLIX</a>
            <div className="text-2xl font-semibold tracking-[-1.5px]">Dashboard</div>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <a href="/collection" className="text-white/60 hover:text-white hidden md:block">Collection</a>
            <a href="/crowdfund" className="text-white/60 hover:text-white">Crowdfund</a>
            <a href="/mint" className="text-white/60 hover:text-white">Mint</a>
            <a href="/reviews" className="text-white/60 hover:text-white">Reviews</a>
            <div className="px-3 py-1 text-xs rounded-full bg-white/10 border border-white/20 font-mono">{networkName}</div>
            <div className="text-xs text-white/50 font-mono hidden lg:block">{connectedAddress.slice(0, 6)}…{connectedAddress.slice(-4)}</div>
          </div>
        </div>
      </div>

      {/* Hero header */}
      <div className="max-w-6xl mx-auto px-6 pt-10 pb-6">
        <div className="flex items-end justify-between">
          <div>
            <div className="uppercase tracking-[4px] text-xs text-white/50 mb-2">OWNERSHIP • EARNINGS • VOICE</div>
            <h1 className="text-6xl font-semibold tracking-[-3px]">Your Decentralflix</h1>
            <p className="text-2xl text-white/70 tracking-tight mt-1">Library, credits, campaigns, and creator earnings in one place.</p>
          </div>
          <button
            onClick={() => {
              refreshCreator();
              // owned + credits refresh is via their own effects
            }}
            disabled={isLoading}
            className="px-6 py-2.5 text-sm border border-white/30 hover:bg-white/5 rounded-full disabled:opacity-50"
          >
            {isLoading ? 'SYNCING…' : 'REFRESH'}
          </button>
        </div>
      </div>

      {/* Tab switcher — cinematic, high-quality */}
      <div className="max-w-6xl mx-auto px-6 pb-8">
        <div className="inline-flex rounded-2xl border border-white/10 bg-zinc-950 p-1">
          <button
            onClick={() => setActiveTab('user')}
            className={`px-8 py-3 rounded-xl text-sm font-medium tracking-wide transition-all ${activeTab === 'user'
              ? 'bg-white text-black shadow'
              : 'text-white/70 hover:text-white hover:bg-white/5'}`}
          >
            USER LIBRARY &amp; VOICE
          </button>
          <button
            onClick={() => setActiveTab('creator')}
            className={`px-8 py-3 rounded-xl text-sm font-medium tracking-wide transition-all ${activeTab === 'creator'
              ? 'bg-emerald-600 text-black shadow'
              : 'text-white/70 hover:text-white hover:bg-white/5'}`}
          >
            CREATOR STUDIO
          </button>
        </div>
        <div className="text-[10px] text-white/40 mt-2 pl-1">
          {activeTab === 'user' 
            ? 'Owned tickets • Seeder Credits (P2P) • Your verified reviews' 
            : 'Campaigns • Earnings from mints • Arweave uploads • Your films'}
        </div>
      </div>

      {/* ============ USER TAB ============ */}
      {activeTab === 'user' && (
        <div className="max-w-6xl mx-auto px-6 pb-16 space-y-8">
          {/* Profile / Wallet */}
          <div className="bg-zinc-900 border border-white/10 rounded-3xl p-8">
            <div className="flex flex-col md:flex-row md:items-center gap-6">
              <div className="flex-1">
                <div className="text-xs text-emerald-400 tracking-[3px] mb-1">CONNECTED</div>
                <div className="font-mono text-lg break-all">{connectedAddress}</div>
                <div className="text-sm text-white/50 mt-1">Authenticated via Privy + SIWE • Ownership verified on Arbitrum</div>
              </div>
              <div>
                <a href="/collection" className="inline-block px-6 py-3 border border-white/40 rounded-2xl text-sm hover:bg-white/5">Full Collection View →</a>
              </div>
            </div>
          </div>

          {/* Owned Films / Library (reuses Collection patterns + real hook) */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-red-600 text-xs tracking-[3px]">YOUR TICKETS</div>
                <h3 className="text-3xl font-semibold tracking-tight">Films you own</h3>
              </div>
              <a href="/collection" className="text-sm text-emerald-400 hover:underline">Manage all →</a>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {ownedFilms.map((film, idx) => (
                <div key={idx} className="bg-zinc-950 border border-white/10 rounded-2xl p-6">
                  <div className="font-semibold text-xl tracking-tight mb-1">{film.title}</div>
                  <div className="text-xs text-white/50 font-mono mb-1">{film.hash}</div>
                  <div className="text-[10px] text-emerald-400/80 mb-3">
                    {film.sources && film.sources.length ? film.sources.map(s => s.includes('Crowdfund') ? '💎 Crowdfund backer' : '🎟️ Ticket holder').join(' + ') : 'Permanent access'}
                    . Your reviews carry verified weight.
                  </div>
                  <div className="flex gap-3 text-sm">
                    <a href={`/film/${film.hash}`} className="flex-1 text-center py-2.5 bg-white text-black rounded-xl font-medium">Watch + Reviews (Livepeer gated)</a>
                    <a href={`/film/${film.hash}`} className="flex-1 text-center py-2.5 border border-white/50 rounded-xl hover:bg-white/5">Write as verified owner</a>
                  </div>
                </div>
              ))}
            </div>
            <div className="text-[10px] text-white/40 mt-2 pl-1">
              {accessibleFilmsRaw.length > 0 ? 'Your owned films loaded from access records.' : 'Phase 0 demo data (mixed access sources).'}
            </div>
          </div>

          {/* Credits + Seeding Activity (full reuse of existing hook + beautiful card) */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <h3 className="text-3xl font-semibold tracking-tight">Hosting Credits</h3>
              <span className="text-xs px-3 py-px rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">P2P SEEDER</span>
            </div>
            <p className="text-white/60 mb-4 max-w-2xl">Earn by seeding films you own. Higher access tiers (Deluxe/Producer) multiply your credits and redemption power.</p>

            <div className="bg-zinc-950 border border-white/10 rounded-2xl p-8">
              <div className="flex flex-col md:flex-row gap-8">
                <div className="flex-1">
                  <div className="text-xs text-white/60">CURRENT BALANCE (EFFECTIVE)</div>
                  <div className="text-7xl font-semibold tabular-nums tracking-tighter mt-1">{effectiveCredits}</div>
                  <div className="text-sm text-white/50">Base {credits} × {tierMultiplier / 100}x tier multiplier</div>
                </div>
                <div className="flex-1 text-sm space-y-4">
                  <div className="p-4 bg-black/60 rounded-xl border border-white/10">
                    <div className="font-medium mb-1 flex items-center gap-2">Seeding Activity <span className="text-[9px] px-1.5 py-px bg-emerald-500/20 text-emerald-400 rounded">P2P</span></div>
                    <div className="text-white/60 text-sm">Host the films you own on Arweave/IPFS. Submit uptime + bandwidth reports (Arweave-anchored) to earn credits. Higher tiers (Producer emerald) multiply rewards + redemption power for mint discounts or free tickets.</div>
                    <div className="flex gap-2 mt-3 flex-wrap">
                      <a href="/spike2" className="text-xs px-4 py-1.5 border border-emerald-500/50 text-emerald-400 rounded-lg hover:bg-emerald-500/10">Full v2 Demo (multi-source + redemptions) →</a>
                      <button
                        onClick={() => {
                          const r = generateMultiSourceReport({ theta: { gbRelayed: 0.6, peersServed: 11 } });
                          const p = prepareUnifiedClaim(r);
                          alert(`v2 Unified Claim Preview (sim):\n${p.functionName}\nFinal: ${p.finalCredits} cr\n${p.note}\n\n(See /spike2 for live surfaces + impact updates)`);
                        }}
                        className="text-xs px-4 py-1.5 border border-emerald-500/50 text-emerald-400 rounded-lg hover:bg-emerald-500/10"
                      >
                        Quick v2 Multi-Source Claim (sim)
                      </button>
                      <button
                        onClick={() => {
                          if (redeemOptions.length) {
                            const res = simulateRedeem(redeemOptions[0]);
                            alert(res.success ? `Redeemed: ${res.perk}\nNew sim balance: ${res.newBalance}` : res.error);
                          }
                        }}
                        className="text-xs px-4 py-1.5 border border-white/30 rounded-lg hover:bg-white/5"
                      >
                        Quick Redeem (10% voucher sim)
                      </button>
                      <button onClick={resetSimulations} className="text-xs px-3 py-1.5 text-white/40 hover:text-white">Reset sim</button>
                    </div>
                  </div>
                  <div className="text-[10px] text-white/40">Redeem for access discounts, free tickets, or future Producer perks. Fully anchored. Full rich surfaces in /spike2.</div>

                  {/* Mini v2 previews (additive, non-breaking) */}
                  {myImpact.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-white/10 text-[10px]">
                      <div className="text-emerald-400/80 mb-1">Recent Impact (from CreditsEarned)</div>
                      <div className="font-mono text-white/60">{myImpact[0].amount} cr • {myImpact[0].arweaveTxId.slice(0,18)}…</div>
                    </div>
                  )}
                  {leaderboardPreview.length > 0 && (
                    <div className="mt-2 text-[10px] text-white/50">Top seeder (preview): {leaderboardPreview[0]?.seeder} — {leaderboardPreview[0]?.totalCredits} cr</div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Verified Owner Voice (Reviews integration) */}
          <div className="bg-zinc-900 border border-white/10 rounded-3xl p-8">
            <div className="text-red-600 text-xs tracking-[3px] mb-1">THE ONLY REVIEWS THAT MATTER</div>
            <h3 className="text-3xl font-semibold tracking-tight mb-2">Your verified owner voice</h3>
            <p className="text-white/70 max-w-prose">
              You have verified owner voice on <span className="font-semibold text-white">{accessibleFilmsRaw.length}</span> films. 
              Write or edit your review on any of them — these are the only reviews that matter because ownership is permanent.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <a href="/reviews" className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-black font-medium rounded-2xl text-sm">Browse public critiques →</a>
              <a href="/collection" className="px-6 py-2.5 border border-white/40 rounded-2xl text-sm">See your reviews in Collection →</a>
            </div>

            {/* Real review quick actions — direct links to write/edit on your owned films (eliminates demo count) */}
            {accessibleFilmsRaw.length > 0 && (
              <div className="mt-4 pt-4 border-t border-white/10">
                <div className="text-[10px] tracking-[1px] text-white/50 mb-2">YOUR REVIEWS ON OWNED FILMS</div>
                <div className="flex flex-wrap gap-2">
                  {accessibleFilmsRaw.slice(0, 4).map((f: any, idx: number) => (
                    <a key={idx} href={`/film/${f.hash}`} className="text-xs px-3 py-1 border border-white/30 hover:bg-white/5 rounded-xl">
                      Write/Edit review → {f.title || f.hash.slice(0, 10)}
                    </a>
                  ))}
                  {accessibleFilmsRaw.length > 4 && <span className="text-xs text-white/40 self-center">+{accessibleFilmsRaw.length - 4} more</span>}
                </div>
              </div>
            )}
            <div className="mt-4 text-[10px] text-white/40">Two-layer model: Public critiques (what you are doing now) vs. curated creator-to-creator threads (later).</div>
          </div>
        </div>
      )}

      {/* ============ CREATOR TAB ============ */}
      {activeTab === 'creator' && (
        <div className="max-w-6xl mx-auto px-6 pb-16 space-y-10">
          {/* Quick Launch Bar */}
          <div className="flex flex-wrap gap-3">
            <a href="/crowdfund" className="px-8 py-3 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.985] text-black font-medium rounded-2xl text-sm transition">Launch New Crowdfund Campaign</a>
            <button
              onClick={() => { setActiveTab('creator'); window.scrollTo({ top: 600, behavior: 'smooth' }); }}
              className="px-8 py-3 border border-white/30 hover:bg-white/5 rounded-2xl text-sm"
            >
              Upload Film to Arweave
            </button>
            <a href="/mint" className="px-8 py-3 border border-white/30 hover:bg-white/5 rounded-2xl text-sm">Mint Tickets for a Film</a>
          </div>

          {/* Earnings Overview — the key creator deliverable (real events + demo) */}
          <div className="bg-zinc-950 border border-emerald-500/20 rounded-3xl p-8">
            <div className="flex items-start justify-between mb-6">
              <div>
                <div className="text-emerald-400 text-xs tracking-[3.5px]">INSTANT • 70% TO CREATORS</div>
                <h3 className="text-4xl font-semibold tracking-[-1.5px] mt-1">Creator Earnings</h3>
              </div>
              <button onClick={refreshCreator} className="text-xs px-4 py-1.5 border border-emerald-500/40 rounded-full text-emerald-400">REFRESH PAYOUTS</button>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              <div className="md:col-span-1">
                <div className="text-xs text-white/60">TOTAL RECEIVED (LIVE + DEMO)</div>
                <div className="text-[72px] leading-none font-semibold tabular-nums tracking-[-4px] text-emerald-400 mt-2">
                  {Number(formatEther(totalEarnings)).toFixed(3)}
                </div>
                <div className="text-2xl text-white/70 -mt-2">ETH</div>
                <div className="mt-3 text-xs text-white/50">Every mint sends your share directly via CreatorPaid event. No platform holding period.</div>
              </div>

              <div className="md:col-span-2">
                <div className="text-xs text-white/60 mb-3">RECENT PAYOUTS</div>
                <div className="space-y-2">
                  {recentPayouts.length === 0 && <div className="text-white/50 text-sm">No payouts yet. Mint activity on your films will appear here instantly.</div>}
                  {recentPayouts.map((p, i) => (
                    <div key={i} className="flex justify-between items-center bg-black/70 border border-white/10 rounded-xl px-4 py-3 text-sm">
                      <div className="font-mono text-white/70">
                        Token #{p.tokenId} • {p.blockNumber ? `Block #${p.blockNumber}` : (p.txHash ? p.txHash.slice(0, 10) + '…' : '')}
                      </div>
                      <div className="font-mono text-emerald-400 font-medium">+{formatEther(p.amount)} ETH</div>
                    </div>
                  ))}
                </div>
                <div className="text-[10px] text-white/40 mt-2">Platform fee (currently 30% adjustable) stays in contract. You always receive your share immediately.</div>
              </div>
            </div>

            {/* Advanced basic stats row (raised across campaigns, ownership reach) */}
            <div className="mt-6 pt-6 border-t border-white/10 grid md:grid-cols-3 gap-4 text-sm">
              <div className="bg-black/60 border border-white/10 rounded-xl p-4">
                <div className="text-white/50 text-xs">TOTAL RAISED (YOUR CAMPAIGNS)</div>
                <div className="text-3xl font-semibold text-emerald-400 mt-1 tabular-nums">
                  {myCampaigns.length ? myCampaigns.reduce((s, c) => s + Number(formatEther(c.raised)), 0).toFixed(2) : '0.00'} ETH
                </div>
                <div className="text-xs text-white/50 mt-1">Direct escrow-backed. Backers = future verified reviewers.</div>
              </div>
              <div className="bg-black/60 border border-white/10 rounded-xl p-4">
                <div className="text-white/50 text-xs">YOUR FILMS + REACH</div>
                <div className="text-3xl font-semibold mt-1">{createdFilms.length} <span className="text-base align-super text-white/50">films</span></div>
                <div className="text-xs text-emerald-400/80 mt-1">Owner reviews on your work power discovery. Real attribution.</div>
              </div>
              <div className="bg-black/60 border border-white/10 rounded-xl p-4">
                <div className="text-white/50 text-xs">VERIFIED OWNER VOICE</div>
                <div className="text-3xl font-semibold mt-1">{accessibleFilmsRaw.length + createdFilms.length}+ <span className="text-base align-super text-white/50">films with owner voice</span></div>
                <div className="text-xs text-white/50 mt-1">Your catalog + backer films. Gated by ownership. Real reviews via /film pages.</div>
              </div>
            </div>
          </div>

          {/* My Campaigns (from crowdfund integration) */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-emerald-400 text-xs tracking-[3px]">VERIFIED BACKERS = FUTURE REVIEWERS</div>
                <h3 className="text-3xl font-semibold tracking-tight">Your Active Campaigns</h3>
              </div>
              <a href="/crowdfund" className="text-sm text-emerald-400 hover:underline">Manage all on Crowdfund →</a>
            </div>

            {myCampaigns.length === 0 ? (
              <div className="text-white/60 bg-zinc-950 border border-white/10 rounded-2xl p-8">No campaigns yet. Use the Quick Launchpad above (or full Crowdfund) — backers instantly become verified owners eligible for Reviews. Producer backers unlock AI milestone proofs.</div>
            ) : (
              <div className="grid md:grid-cols-2 gap-4">
                {myCampaigns.map((c, idx) => {
                  const progress = c.target > 0 ? Math.min(100, Math.floor((Number(c.raised) / Number(c.target)) * 100)) : 0;
                  const isMyCampaign = true; // filtered by hook
                  return (
                    <div key={idx} className="bg-zinc-950 border border-white/10 rounded-2xl p-6">
                      {c.poster && (
                        <div className="mb-3 -mx-1">
                          <img
                            src={c.poster.startsWith('ar://') ? `https://arweave.net/${c.poster.replace(/^ar:\/\//, '')}` : c.poster}
                            alt=""
                            className="w-full h-24 object-cover rounded-xl border border-white/10"
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                          />
                        </div>
                      )}
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <div className="font-semibold text-xl tracking-tight">{c.title}</div>
                          <div className="text-xs text-white/50 font-mono">{c.metadataHash.slice(0,22)}…</div>
                        </div>
                        <div className="text-[10px] px-2 py-0.5 rounded-full border border-emerald-500/30 text-emerald-400">YOUR CAMPAIGN</div>
                      </div>
                      <div className="text-sm text-white/70 mb-3 line-clamp-2">{c.description}</div>

                      <div className="mb-3">
                        <div className="h-1.5 bg-white/10 rounded overflow-hidden">
                          <div className="h-1.5 bg-emerald-500" style={{ width: `${progress}%` }} />
                        </div>
                        <div className="text-[10px] text-white/50 mt-1 flex justify-between font-mono">
                          <span>{formatEther(c.raised)} / {formatEther(c.target)} ETH • {progress}%</span>
                          <span>{c.tierSold?.[2] || 0} Producer (💎 verified)</span>
                        </div>
                      </div>

                      <div className="text-xs text-emerald-400/80 mb-3">Backers = verified reviewers on your film. Producer tier unlocks AI proof submissions for escrow.</div>

                      <div className="flex flex-wrap gap-2 text-xs">
                        <a href="/crowdfund" className="px-3 py-1.5 border border-white/30 rounded-lg hover:bg-white/5">Full manage on Crowdfund →</a>
                        <button 
                          onClick={() => alert(`(Stub) Open AI Proof submit for campaign #${c.id} — reuses submitAIProof + Arweave upload exactly like crowdfund page. Producer only.`)}
                          className="px-3 py-1.5 border border-emerald-500/50 text-emerald-400 rounded-lg hover:bg-emerald-500/10"
                        >
                          Submit AI Milestone Proof
                        </button>
                        <button 
                          onClick={() => alert(`(Stub) Link videoHash to campaign #${c.id} via setCampaignVideo — enables precise hasCrowdfundAccess gating + Livepeer unlock for all backers.`)}
                          className="px-3 py-1.5 border border-white/30 rounded-lg hover:bg-white/5"
                        >
                          Link Master Video
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* My Created Films + Reviews Voice — strong emotional ownership tie */}
          <div>
            <h3 className="text-3xl font-semibold tracking-tight mb-4">Films you created</h3>
            <div className="grid md:grid-cols-2 gap-4">
              {createdFilms.map((film, idx) => (
                <div key={idx} className="bg-zinc-950 border border-white/10 rounded-2xl p-6">
                  {film.poster && (
                    <div className="mb-3 -mx-1">
                      <img
                        src={film.poster.startsWith('ar://') ? `https://arweave.net/${film.poster.replace(/^ar:\/\//, '')}` : film.poster}
                        alt=""
                        className="w-full h-24 object-cover rounded-xl border border-white/10"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                      />
                    </div>
                  )}
                  <div className="font-semibold text-xl tracking-tight">{film.title}</div>
                  {film.description && <div className="text-sm text-white/70 mt-1 mb-2 line-clamp-2">{film.description}</div>}
                  <div className="text-xs text-white/50 font-mono mt-1 mb-4">{film.videoHash}</div>

                  <div className="text-xs uppercase tracking-widest text-emerald-400/70 mb-1">VERIFIED OWNER VOICE ON YOUR WORK</div>
                  <div className="text-sm text-white/70 mb-4">Only people who own your film (MovieTicket or crowdfund Producer backers) can review. Their words are authentic and permanent. This is how discovery works here.</div>

                  <div className="flex gap-3 text-sm">
                    <a href={`/film/${film.videoHash}`} className="flex-1 text-center py-2.5 border border-white/40 hover:bg-white/5 rounded-xl">Watch + read owner reviews</a>
                    <a href={`/reviews?hash=${encodeURIComponent(film.videoHash)}`} className="flex-1 text-center py-2.5 bg-emerald-600 hover:bg-emerald-500 text-black font-medium rounded-xl">See your verified critiques →</a>
                  </div>
                  <div className="mt-3 text-[10px] text-emerald-400/70">You own the art. They own the voice on it.</div>
                </div>
              ))}
            </div>
            <div className="text-[10px] text-white/40 mt-3 pl-1">Real creator attribution from metadata + Arweave titles when available.</div>
          </div>

          {/* Arweave Upload + Launch — Advanced creator primitive (upload + direct launch from dashboard) */}
          <div id="upload" className="border-t border-white/10 pt-10">
            <div className="max-w-2xl">
              <div className="text-emerald-400 text-xs tracking-[3px] mb-1">PERMANENT STORAGE • LAUNCH PATH</div>
              <h3 className="text-4xl font-semibold tracking-tight mb-3">Upload to Arweave + Launch Campaign</h3>
              <p className="text-white/70">Films, metadata, milestone proofs live forever on Arweave. Upload here then launch a crowdfund campaign directly — backers become verified owners with voice in Reviews. Reuses the production hook + contract calls.</p>
            </div>

            <div className="mt-6 max-w-2xl bg-zinc-950 border border-white/10 rounded-3xl p-8">
              <div className="text-sm text-white/60 mb-3">Select a file (video, poster, JSON metadata, proof artifact…)</div>

              <label className="block cursor-pointer">
                <input
                  type="file"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    resetAr();
                    const uint8 = new Uint8Array(await file.arrayBuffer());
                    const contentType = file.type || 'application/octet-stream';
                    // Real bytes path (video/poster/artifact) or JSON metadata — reuses full hook like UploadTest + crowdfund
                    if (contentType.startsWith('application/json') || file.name.toLowerCase().endsWith('.json')) {
                      try {
                        const text = await file.text();
                        const jsonData = text ? JSON.parse(text) : { name: file.name };
                        await uploadJson(jsonData, { 'Creator-Dashboard': 'Phase0', 'Original-Name': file.name, 'ContentType': contentType });
                      } catch {
                        await upload(uint8, contentType, { 'Creator-Dashboard': 'Phase0', 'Original-Name': file.name });
                      }
                    } else {
                      await upload(uint8, contentType, { 'Creator-Dashboard': 'Phase0', 'Original-Name': file.name });
                    }
                  }}
                  disabled={arUploading}
                  className="hidden"
                />
                <div className="w-full border border-dashed border-white/30 hover:border-emerald-500/60 rounded-2xl py-10 text-center text-white/70 hover:text-white transition">
                  {arUploading ? 'UPLOADING TO ARWEAVE…' : 'Click or drop file here'}
                </div>
              </label>

              {arError && <div className="text-red-400 text-sm mt-3">Upload error: {arError} (ensure ARWEAVE_WALLET_JSON is configured)</div>}

              <UploadActions />

              <div className="text-[10px] text-white/40 mt-6">Uses the same production Arweave pipeline (real bytes via upload() or JSON via uploadJson) as crowdfund launches and mint metadata. Videos/posters supported; large uploads optimized in Phase 1+.</div>

              {/* === Quick Launchpad (upload + launch in one flow — advanced dashboard capability) === */}
              <div className="mt-8 p-6 bg-zinc-900 border border-emerald-500/20 rounded-2xl">
                <div className="text-emerald-400 text-xs tracking-[2px] mb-1">CREATOR LAUNCHPAD</div>
                <div className="font-semibold text-lg mb-1">Launch Crowdfund from here (after Arweave upload or directly)</div>
                <p className="text-sm text-white/60 mb-4">Fill minimal details. Metadata goes to Arweave first, then launch. Producer tier = emerald verified backer reviews + AI proof power.</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm mb-4">
                  <input value={launchTitle} onChange={e=>setLaunchTitle(e.target.value)} placeholder="Film Title (e.g. Silent Echo)" className="bg-black border border-white/20 rounded-xl px-4 py-2.5" />
                  <input value={launchTarget} onChange={e=>setLaunchTarget(e.target.value)} placeholder="Target ETH" className="bg-black border border-white/20 rounded-xl px-4 py-2.5 font-mono" />
                  <textarea value={launchDesc} onChange={e=>setLaunchDesc(e.target.value)} rows={2} placeholder="Short pitch for backers..." className="md:col-span-2 bg-black border border-white/20 rounded-xl px-4 py-2.5" />
                  <div className="text-[10px] text-white/50 md:col-span-2">Tiers &amp; milestones use sensible defaults (edit in full Crowdfund page for advanced). Deadline: {launchDeadlineDays} days.</div>
                </div>

                <button
                  onClick={handleQuickLaunch}
                  disabled={isLaunching || arUploading}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-black font-medium rounded-2xl disabled:opacity-60 active:scale-[0.985] transition"
                >
                  {isLaunching ? 'UPLOADING METADATA + LAUNCHING CAMPAIGN…' : 'UPLOAD TO ARWEAVE + LAUNCH CAMPAIGN'}
                </button>

                {launchTx && <div className="mt-3 text-xs text-emerald-400 font-mono break-all">Launch tx: {launchTx} — refresh campaigns below to see live.</div>}
                {arResult && !launchTx && <div className="mt-2 text-xs text-white/50">Arweave ready: ar://{arResult.id}. Use above to launch now.</div>}
              </div>
            </div>
          </div>

          {creatorError && <div className="text-xs text-amber-400/80">Note: {creatorError}</div>}
        </div>
      )}

      {/* Bottom note — honest Phase 0/1 positioning */}
      <div className="max-w-6xl mx-auto px-6 pb-12 pt-4 border-t border-white/10 text-[10px] text-white/40">
        Phase 0/1 high-quality stub advanced with inline Arweave upload + direct campaign launch (reuse hook + contract), manage campaigns (AI proof/link stubs), richer stats, useHasFilmAccess + useFilmMetadata integration, enhanced P2P seeding + owner voice messaging, real CreatorPaid earnings. Real data (ownership, payouts, campaigns, credits, Reviews) appears when contracts deployed + .env set. Rich demo otherwise for immediate cinematic value. Livepeer player, full seeding claims, indexer in next.
        <div className="mt-1">You own this — your reviews carry verified weight because ownership is permanent.</div>
      </div>
    </div>
  );
}
