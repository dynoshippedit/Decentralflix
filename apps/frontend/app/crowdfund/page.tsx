'use client';

import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useState } from 'react';
import { createWalletClient, custom, parseEther, defineChain, formatEther } from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import { FILMMAKER_CAMPAIGN_ADDRESS, FILMMAKER_CAMPAIGN_ABI, useFilmmakerCampaign } from '@/lib/contracts';
import { useArweaveUpload } from '@/hooks/useArweaveUpload';
import LegalConsentModal, { hasLegalConsent, acceptLegalConsent } from '@/components/LegalConsentModal';

// Local Hardhat detection (matches mint/page.tsx exactly)
const hardhatLocal = defineChain({
  id: 31337,
  name: 'Hardhat',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['http://127.0.0.1:8545'] } },
});

type Tier = 'BASIC' | 'DELUXE' | 'PRODUCER';
const TIER_VALUES: Record<Tier, number> = { BASIC: 0, DELUXE: 1, PRODUCER: 2 };
const TIER_LABELS = ['BASIC', 'DELUXE', 'PRODUCER'] as const;

export default function CrowdfundPage() {
  const { ready, authenticated, login, user } = usePrivy();
  const { wallets } = useWallets();

  const connectedAddress = user?.wallet?.address as `0x${string}` | undefined;

  // Hook: on-chain + rich Phase 0 demo campaigns (exact same read pattern)
  const { campaigns, aiReviewWindow, isLoading, refresh, getStatusLabel, getProgress, isActive, isProducerBackerDemo } = useFilmmakerCampaign();

  // Arweave upload (reused exactly)
  const { uploadJson, uploading: arUploading, result: arResult, error: arError, reset: resetAr } = useArweaveUpload();

  // Network handling (exact copy of mint pattern)
  const isLocalAddress = FILMMAKER_CAMPAIGN_ADDRESS.toLowerCase() === '0x5fbdb2315678afecb367f032d93f642f64180aa3';
  const targetNetworkName = isLocalAddress ? 'Hardhat Local (31337)' : 'Arbitrum Sepolia';
  const targetChain = isLocalAddress ? hardhatLocal : arbitrumSepolia;

  // Launch Campaign form state
  const [launchTitle, setLaunchTitle] = useState('');
  const [launchDesc, setLaunchDesc] = useState('');
  const [launchTarget, setLaunchTarget] = useState('2.5');
  const [launchDeadlineDays, setLaunchDeadlineDays] = useState('14');
  const [tierPrices, setTierPrices] = useState(['0.025', '0.08', '0.25']);
  const [tierSupplies, setTierSupplies] = useState(['120', '40', '12']);
  const [milestoneAmounts, setMilestoneAmounts] = useState(['0.8', '1.0', '0.7']);
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchTx, setLaunchTx] = useState<string | null>(null);

  // Contribute state
  const [contributingId, setContributingId] = useState<number | null>(null);
  const [contributeTier, setContributeTier] = useState<Tier>('BASIC');
  const [contributeTx, setContributeTx] = useState<string | null>(null);

  // AI Proof submit (Producer-only flow)
  const [aiCampaignId, setAiCampaignId] = useState<number | null>(null);
  const [aiMilestoneId, setAiMilestoneId] = useState(0);
  const [aiProofText, setAiProofText] = useState('Rough cut milestone complete with VFX plates and temp score. Full deliverables attached.');
  const [isSubmittingAI, setIsSubmittingAI] = useState(false);
  const [aiSubmitTx, setAiSubmitTx] = useState<string | null>(null);

  const [showConsentModal, setShowConsentModal] = useState(false);

  if (!ready) return <div className="p-8 bg-black text-white min-h-screen">Loading...</div>;

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-6">🎬</div>
          <h1 className="text-4xl font-semibold tracking-tight mb-3">Back verified creators.</h1>
          <p className="text-white/70 mb-8">Fund independent films. Receive licensed streaming access. Your backing gives you a verified voice in Reviews — exactly like ticket holders.</p>
          <button onClick={login} className="px-10 py-4 bg-white text-black rounded-full font-medium">Sign in to Back Films</button>
          <div className="mt-6 text-xs text-white/50">Arbitrum • Arweave • Escrow-protected</div>
        </div>
      </div>
    );
  }

  // Step 3 Legal: Global high-risk crowdfund banner (Producer escrow = highest legal exposure area)
  const showCrowdfundLegal = (
    <div className="max-w-6xl mx-auto px-6 pt-6">
      <div className="p-4 bg-red-500/10 border border-red-500/40 rounded-xl text-xs text-white/80">
        <div className="font-semibold text-red-400 mb-1">⚠️ HIGH-RISK LEGAL NOTICE — CROWDFUNDING / PRODUCER TIER</div>
        <div>
          Producer-tier crowdfunding + milestone escrow involves on-chain value transfer and AI review windows. Per the legal research: this carries elevated Howey securities risk if any profit expectation is created. All NFTs and backings are strictly utility/access only. No returns, no repayment promises, no investment contracts. Fully non-custodial. You must have accepted the consent modal. Platform provides no custody or financial services.
        </div>
        {!hasLegalConsent() && <div className="mt-2 text-amber-400 font-medium">Consent modal required before any launch or contribute actions are enabled.</div>}
      </div>
    </div>
  );

  {showCrowdfundLegal}

  // Reusable beautiful tier picker (elevated version of mint's simple select — Producer gets emerald treatment)
  function TierPicker({ value, onChange, prices }: { value: Tier; onChange: (t: Tier) => void; prices?: string[] }) {
    return (
      <div className="grid grid-cols-3 gap-2">
        {TIER_LABELS.map((label, idx) => {
          const t = label as Tier;
          const isProducer = t === 'PRODUCER';
          const active = value === t;
          return (
            <button
              key={t}
              onClick={() => onChange(t)}
              className={`px-3 py-2.5 rounded-xl text-sm border transition font-medium ${
                active
                  ? isProducer
                    ? 'bg-emerald-500/15 border-emerald-500 text-emerald-400'
                    : 'bg-white/10 border-white text-white'
                  : 'bg-zinc-950 border-white/20 text-white/70 hover:border-white/40'
              }`}
            >
              <div>{label}</div>
              {prices && <div className="text-[10px] opacity-60 font-mono mt-0.5">{prices[idx]} ETH</div>}
            </button>
          );
        })}
      </div>
    );
  }

  // === WRITE HELPERS (exact same Privy + viem walletClient pattern as mint/page.tsx) ===
  const getWalletClient = async () => {
    const wallet = wallets[0];
    const provider = await wallet.getEthereumProvider();
    return createWalletClient({
      account: connectedAddress,
      chain: targetChain,
      transport: custom(provider),
    });
  };

  const handleLaunchCampaign = async () => {
    if (!hasLegalConsent()) {
      setShowConsentModal(true);
      return;
    }
    if (!launchTitle || !launchDesc) {
      alert('Title and pitch required');
      return;
    }
    if (FILMMAKER_CAMPAIGN_ADDRESS === '0x0000000000000000000000000000000000000000') {
      alert('Set NEXT_PUBLIC_FILMMAKER_CAMPAIGN_ADDRESS in .env.local (see deploy output)');
      return;
    }

    setIsLaunching(true);
    setLaunchTx(null);
    resetAr();

    try {
      // 1. Build rich metadata JSON (Arweave-first, per core principles)
      const metadata = {
        title: launchTitle,
        description: launchDesc,
        filmmaker: connectedAddress,
        target: launchTarget,
        created: Date.now(),
        tiers: TIER_LABELS.map((label, i) => ({
          tier: label,
          price: tierPrices[i],
          maxSupply: parseInt(tierSupplies[i]),
        })),
        milestones: milestoneAmounts.map((amt, i) => ({ id: i, amount: amt, desc: `Milestone ${i + 1}` })),
        version: 'phase0',
      };

      // 2. Upload JSON via existing hook (Arweave)
      const uploadRes = await uploadJson(metadata, {
        'Type': 'FilmmakerCampaign',
        'Title': launchTitle,
      });
      if (!uploadRes) throw new Error(arError || 'Arweave metadata upload failed');

      const metadataHash = `ar://${uploadRes.id}`;

      // 3. Prepare on-chain args (exact contract signature)
      const targetWei = parseEther(launchTarget);
      const mAmts = milestoneAmounts.map(a => parseEther(a));
      const tPrices = tierPrices.map(p => parseEther(p)) as [bigint, bigint, bigint];
      const tSupplies = tierSupplies.map(s => BigInt(parseInt(s))) as [bigint, bigint, bigint];
      const deadline = BigInt(Math.floor(Date.now() / 1000) + parseInt(launchDeadlineDays) * 86400);

      // 4. Write to contract (identical pattern to mint)
      const walletClient = await getWalletClient();
      const hash = await walletClient.writeContract({
        address: FILMMAKER_CAMPAIGN_ADDRESS,
        abi: FILMMAKER_CAMPAIGN_ABI,
        functionName: 'launchCampaign',
        account: connectedAddress!,
        args: [metadataHash, targetWei, mAmts, tPrices, tSupplies, deadline],
      });

      setLaunchTx(hash);
      // Reset form + refresh list
      setLaunchTitle(''); setLaunchDesc(''); setLaunchTarget('2.5');
      await refresh();
    } catch (err: any) {
      console.error(err);
      let msg = err?.message || 'Launch failed';
      if (msg.includes('user rejected')) msg = 'Transaction rejected.';
      alert(`Campaign launch failed: ${msg}`);
    } finally {
      setIsLaunching(false);
    }
  };

  // New: Wire setCampaignVideo for precise crowdfund backer gating (filmmaker/owner only, Phase 0 link after delivery)
  const [linkCampaignId, setLinkCampaignId] = useState('');
  const [linkVideoHash, setLinkVideoHash] = useState('');
  const [isLinking, setIsLinking] = useState(false);

  const handleLinkVideo = async () => {
    if (!linkCampaignId || !linkVideoHash || FILMMAKER_CAMPAIGN_ADDRESS === '0x0000000000000000000000000000000000000000') {
      alert('Campaign ID and video hash required, and contract must be configured');
      return;
    }
    setIsLinking(true);
    try {
      const walletClient = await getWalletClient();
      const hash = await walletClient.writeContract({
        address: FILMMAKER_CAMPAIGN_ADDRESS,
        abi: FILMMAKER_CAMPAIGN_ABI,
        functionName: 'setCampaignVideo',
        account: connectedAddress!,
        args: [BigInt(linkCampaignId), linkVideoHash],
      });
      alert(`Linked! Tx: ${hash}. This enables precise hasCrowdfundAccess for the video.`);
      setLinkCampaignId(''); setLinkVideoHash('');
      await refresh();
    } catch (err: any) {
      alert(`Link failed: ${err?.message || err}`);
    } finally {
      setIsLinking(false);
    }
  };

  const handleContribute = async (campaignId: number, tier: Tier) => {
    if (!hasLegalConsent()) {
      setShowConsentModal(true);
      return;
    }
    if (FILMMAKER_CAMPAIGN_ADDRESS === '0x0000000000000000000000000000000000000000') {
      alert('Contract address not configured');
      return;
    }

    const campaign = campaigns.find(c => c.id === campaignId);
    if (!campaign) return;

    const price = campaign.tierPrices[TIER_VALUES[tier]];
    if (!price) return;

    setContributingId(campaignId);
    setContributeTx(null);

    try {
      const walletClient = await getWalletClient();
      const tierValue = TIER_VALUES[tier];

      const hash = await walletClient.writeContract({
        address: FILMMAKER_CAMPAIGN_ADDRESS,
        abi: FILMMAKER_CAMPAIGN_ABI,
        functionName: 'contribute',
        account: connectedAddress!,
        args: [BigInt(campaignId), tierValue],
        value: price,
      });

      setContributeTx(hash);
      setContributeTier(tier);
      await refresh();
    } catch (err: any) {
      console.error(err);
      let msg = err?.message || 'Contribute failed';
      if (msg.includes('user rejected')) msg = 'Rejected by user.';
      else if (msg.includes('Insufficient payment')) msg = 'Payment below tier price.';
      alert(`Contribution failed: ${msg}`);
    } finally {
      setContributingId(null);
    }
  };

  const handleSubmitAIProof = async () => {
    if (!hasLegalConsent()) {
      setShowConsentModal(true);
      return;
    }
    if (aiCampaignId === null) return;

    setIsSubmittingAI(true);
    setAiSubmitTx(null);

    try {
      // Upload proof text (or could be file) as JSON via existing Arweave hook
      const proofPayload = {
        campaignId: aiCampaignId,
        milestone: aiMilestoneId,
        proof: aiProofText,
        submittedBy: connectedAddress,
        timestamp: Date.now(),
        type: 'AI_MILESTONE_PROOF',
      };
      const uploadRes = await uploadJson(proofPayload, { 'Type': 'AIMilestoneProof', 'Campaign': String(aiCampaignId) });
      if (!uploadRes) throw new Error('Proof upload failed');

      const proofHash = `ar://${uploadRes.id}`;

      const walletClient = await getWalletClient();
      const hash = await walletClient.writeContract({
        address: FILMMAKER_CAMPAIGN_ADDRESS,
        abi: FILMMAKER_CAMPAIGN_ABI,
        functionName: 'submitAIProof',
        account: connectedAddress!,
        args: [BigInt(aiCampaignId), BigInt(aiMilestoneId), proofHash],
      });

      setAiSubmitTx(hash);
      setAiProofText('');
      await refresh();
    } catch (err: any) {
      console.error(err);
      alert(`AI proof submit failed: ${err?.message || err}`);
    } finally {
      setIsSubmittingAI(false);
    }
  };

  const closeAIForm = () => {
    setAiCampaignId(null);
    setAiMilestoneId(0);
    setAiSubmitTx(null);
  };

  const handleConsentAccepted = () => {
    setShowConsentModal(false);
    // Optional: could re-trigger the original action here in future, but for now user can click again
  };

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Cinematic minimal nav */}
      <div className="border-b border-white/10">
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <a href="/" className="text-white/60 hover:text-white text-sm tracking-widest">← DECENTRALFLIX</a>
            <div className="text-xl font-semibold tracking-[-1px]">Crowdfund</div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <a href="/dashboard" className="text-emerald-400 hover:text-emerald-300 font-medium">Dashboard</a>
            <a href="/mint" className="text-white/60 hover:text-white">Mint Tickets</a>
            <a href="/collection" className="text-white/60 hover:text-white">Collection</a>
            <a href="/reviews" className="text-white/60 hover:text-white">Reviews</a>
            <div className="px-3 py-1 text-xs rounded-full bg-white/10 border border-white/20 font-mono">{targetNetworkName}</div>
          </div>
        </div>
      </div>

      {/* Hero messaging — strong "back verified creators" + Reviews tie-in */}
      <div className="max-w-5xl mx-auto px-6 pt-12 pb-8 text-center">
        <div className="inline-block px-4 py-1 mb-4 text-xs tracking-[3px] border border-emerald-500/40 text-emerald-400 rounded-full">ESCROW • MILESTONES • AI REVIEW WINDOW</div>
        <h1 className="text-6xl md:text-7xl font-semibold tracking-[-3.5px] leading-none mb-4">Back the films.<br />Own the proof.</h1>
        <p className="max-w-2xl mx-auto text-2xl text-white/70 tracking-[-0.5px]">Fund verified creators. Receive licensed streaming access. Your support makes you a <span className="text-emerald-400">verified owner</span> eligible to review — exactly like ticket holders.</p>
        <p className="mt-4 text-sm text-white/50">Producer-tier backers unlock a special power: submit milestone proofs for platform review (48–72h window) before escrow release.</p>
        <p className="mt-2 text-[10px] text-emerald-400/70">After final milestone, filmmakers/owners can link the master videoHash (new tool below) for precise crowdfund backer gating.</p>
      </div>

      {/* New: Link Video tool (filmmaker/owner) - wires the new setCampaignVideo for precise hasCrowdfundAccess gating */}
      <div className="max-w-4xl mx-auto px-6 pb-8">
        <div className="p-5 bg-zinc-900 border border-white/10 rounded-2xl">
          <div className="text-sm font-medium mb-2">Link VideoHash to Campaign (for exact crowdfund backer gating)</div>
          <div className="flex flex-wrap gap-2">
            <input value={linkCampaignId} onChange={e => setLinkCampaignId(e.target.value)} placeholder="Campaign ID" className="bg-black border border-white/20 rounded px-3 py-1 w-32" />
            <input value={linkVideoHash} onChange={e => setLinkVideoHash(e.target.value)} placeholder="ar://... or txid for the master film" className="bg-black border border-white/20 rounded px-3 py-1 flex-1 min-w-[220px]" />
            <button onClick={handleLinkVideo} disabled={isLinking} className="px-4 py-1 bg-emerald-600 hover:bg-emerald-500 rounded text-sm disabled:opacity-50">
              {isLinking ? '...' : 'Link Video'}
            </button>
          </div>
          <div className="text-[10px] text-white/40 mt-1">Call setCampaignVideo. Then backers of this campaign will pass the new hasCrowdfundAccess check for the video (used in player gating and Reviews).</div>
        </div>
      </div>

      {/* Active Campaigns — beautiful list (stub + real fetch) */}
      <div className="max-w-6xl mx-auto px-6 pb-12">
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="text-emerald-400 text-xs tracking-[3px] mb-1">VERIFIED CREATORS • ESCROW PROTECTED</div>
            <h2 className="text-3xl font-semibold tracking-tight">Active Campaigns</h2>
          </div>
          <button onClick={refresh} disabled={isLoading} className="text-xs px-4 py-2 border border-white/20 hover:bg-white/5 rounded-full disabled:opacity-50">
            {isLoading ? 'SCANNING…' : 'REFRESH'}
          </button>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {campaigns.map((c) => {
            const status = getStatusLabel(c.status);
            const progress = getProgress(c);
            const active = isActive(c);
            const canContribute = active && status === 'ACTIVE';
            const producerEligible = isProducerBackerDemo(connectedAddress, c.id);

            return (
              <div key={c.id} className="bg-zinc-950 border border-white/10 rounded-2xl p-6 flex flex-col">
                {c.poster && (
                  <div className="mb-3 -mx-1">
                    <img
                      src={c.poster.startsWith('ar://') ? `https://arweave.net/${c.poster.replace(/^ar:\/\//, '')}` : c.poster}
                      alt=""
                      className="w-full h-28 object-cover rounded-xl border border-white/10"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                    />
                  </div>
                )}
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <div className="font-semibold text-xl tracking-tight">{c.title}</div>
                    <div className="text-xs text-white/50 font-mono mt-0.5">{c.filmmaker.slice(0, 10)}… • {c.metadataHash.slice(0, 18)}…</div>
                  </div>
                  <div className={`text-[10px] px-2.5 py-0.5 rounded-full border ${status === 'ACTIVE' ? 'border-emerald-500/40 text-emerald-400' : 'border-white/30 text-white/60'}`}>
                    {status}
                  </div>
                </div>

                <p className="text-sm text-white/70 line-clamp-3 mb-4">{c.description}</p>

                {/* Progress + numbers (emerald ownership accent) */}
                <div className="mb-4">
                  <div className="flex justify-between text-xs mb-1.5 text-white/60">
                    <span>Raised</span>
                    <span className="font-mono text-emerald-400">{formatEther(c.raised)} / {formatEther(c.target)} ETH</span>
                  </div>
                  <div className="h-1.5 bg-white/10 rounded overflow-hidden">
                    <div className="h-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} />
                  </div>
                  <div className="text-right text-[10px] text-white/50 mt-0.5">{progress}% funded • {Math.ceil((c.deadline - Date.now()/1000)/86400)} days left</div>
                </div>

                {/* Tier summary + Contribute (reuses/enhances mint tier selection) */}
                <div className="mt-auto">
                  <div className="text-xs text-white/60 mb-2 flex items-center gap-2">
                    BACK THIS FILM
                    <span className="text-[10px] px-1.5 py-px border border-white/20 rounded">Licensed streaming access included</span>
                  </div>

                  <TierPicker
                    value={contributeTier}
                    onChange={setContributeTier}
                    prices={c.tierPrices.map(p => formatEther(p))}
                  />

                  <button
                    onClick={() => handleContribute(c.id, contributeTier)}
                    disabled={!canContribute || contributingId === c.id || !hasLegalConsent()}
                    className="mt-3 w-full py-3 rounded-2xl bg-white text-black font-medium disabled:opacity-60 active:scale-[0.985] transition"
                  >
                    {!hasLegalConsent() ? 'ACCEPT LEGAL TERMS TO BACK' : contributingId === c.id ? 'CONFIRMING…' : `BACK ${contributeTier} — ${formatEther(c.tierPrices[TIER_VALUES[contributeTier]])} ETH`}
                  </button>

                  {/* Producer-only AI Proof entry point — emerald callout */}
                  {producerEligible && canContribute && (
                    <button
                      onClick={() => { setAiCampaignId(c.id); setAiMilestoneId(0); }}
                      className="mt-2 w-full py-2.5 text-sm rounded-2xl border border-emerald-500/60 hover:bg-emerald-500/10 text-emerald-400 transition flex items-center justify-center gap-2"
                    >
                      ★ SUBMIT AI MILESTONE PROOF (Producer)
                    </button>
                  )}

                  <div className="text-[10px] text-white/40 mt-2 leading-snug">
                    Backing = licensed streaming access + verified reviewer status on this film. Producer tier unlocks AI-proof submissions for escrow releases.
                  </div>
                </div>

                {contributeTx && contributingId === null && (
                  <div className="mt-3 text-xs text-emerald-400 font-mono break-all">Contribute tx: {contributeTx}</div>
                )}
              </div>
            );
          })}
        </div>

        <p className="text-center text-xs text-white/40 mt-6">Phase 0 demo campaigns shown with rich data. Real campaigns appear automatically when deployed + address set.</p>
      </div>

      {/* Launch Campaign Form — uses useArweaveUpload then contract write */}
      <div className="border-t border-white/10 bg-zinc-950/50">
        <div className="max-w-3xl mx-auto px-6 py-12">
          <div className="mb-6">
            <div className="text-emerald-400 text-xs tracking-[3px]">ANTI-GATEKEEPING • ANY CREATOR</div>
            <h3 className="text-3xl font-semibold tracking-tight mt-1">Launch Your Campaign</h3>
            <p className="text-white/60 mt-2">Upload rich metadata to Arweave first (permanent), then launch the escrow-protected campaign. Backers receive licensed streaming access and become verified voices in Reviews.</p>
          </div>

          <div className="space-y-4 bg-zinc-900 border border-white/10 rounded-2xl p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-white/60 mb-1">FILM TITLE</label>
                <input value={launchTitle} onChange={e => setLaunchTitle(e.target.value)} placeholder="The Last Signal" className="w-full bg-black border border-white/20 rounded-xl px-4 py-3 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-white/60 mb-1">TARGET (ETH)</label>
                <input value={launchTarget} onChange={e => setLaunchTarget(e.target.value)} className="w-full bg-black border border-white/20 rounded-xl px-4 py-3 font-mono text-sm" />
              </div>
            </div>

            <div>
              <label className="block text-xs text-white/60 mb-1">PITCH / DESCRIPTION (goes to Arweave JSON)</label>
              <textarea value={launchDesc} onChange={e => setLaunchDesc(e.target.value)} rows={3} placeholder="A cinematic story about..." className="w-full bg-black border border-white/20 rounded-xl px-4 py-3 text-sm" />
            </div>

            <div>
              <label className="block text-xs text-white/60 mb-2">TIER PRICING + SUPPLY (BASIC / DELUXE / PRODUCER)</label>
              <div className="grid grid-cols-3 gap-3 text-sm">
                {[0,1,2].map(i => (
                  <div key={i} className="bg-black border border-white/10 rounded-xl p-3">
                    <div className={`text-xs mb-1 ${i===2 ? 'text-emerald-400' : 'text-white/60'}`}>{TIER_LABELS[i]}</div>
                    <input value={tierPrices[i]} onChange={e => { const v=[...tierPrices]; v[i]=e.target.value; setTierPrices(v); }} className="w-full bg-zinc-950 border border-white/20 font-mono rounded px-2 py-1 text-xs mb-1" placeholder="price ETH" />
                    <input value={tierSupplies[i]} onChange={e => { const v=[...tierSupplies]; v[i]=e.target.value; setTierSupplies(v); }} className="w-full bg-zinc-950 border border-white/20 font-mono rounded px-2 py-1 text-xs" placeholder="max supply" />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs text-white/60 mb-2">MILESTONE TRANCHE AMOUNTS (ETH) — released on platform approval</label>
              <div className="grid grid-cols-3 gap-3">
                {milestoneAmounts.map((amt, i) => (
                  <input key={i} value={amt} onChange={e => { const v=[...milestoneAmounts]; v[i]=e.target.value; setMilestoneAmounts(v); }} className="bg-black border border-white/20 rounded-xl px-4 py-2 font-mono text-sm" />
                ))}
              </div>
              <div className="text-[10px] text-white/40 mt-1">Descriptions live in the Arweave metadata JSON (immutable &amp; censorship-resistant).</div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-white/60 mb-1">DEADLINE (DAYS FROM NOW)</label>
                <input type="number" value={launchDeadlineDays} onChange={e => setLaunchDeadlineDays(e.target.value)} className="w-full bg-black border border-white/20 rounded-xl px-4 py-3 font-mono text-sm" />
              </div>
              <div className="flex items-end">
                <button
                  onClick={handleLaunchCampaign}
                  disabled={isLaunching || arUploading || !hasLegalConsent()}
                  className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-white/20 text-black font-medium rounded-2xl active:scale-[0.985] transition"
                >
                  {!hasLegalConsent() ? 'ACCEPT LEGAL CONSENT TO LAUNCH' : arUploading ? 'UPLOADING METADATA TO ARWEAVE…' : isLaunching ? 'LAUNCHING CAMPAIGN…' : 'UPLOAD METADATA + LAUNCH CAMPAIGN'}
                </button>
              </div>
            </div>

            {arResult && <div className="text-xs text-emerald-400">Arweave metadata: ar://{arResult.id}</div>}
            {launchTx && <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs font-mono break-all">Launch tx: {launchTx}<br />Refresh campaigns above to see it live.</div>}
          </div>
          <p className="text-center text-[10px] text-white/40 mt-4">Funds held in contract escrow. Released tranche-by-tranche only after platform milestone approval (with special 48-72h AI review window for Producer submissions).</p>
        </div>
      </div>

      {/* Producer AI Proof Modal / Inline Form (beautiful, emerald) */}
      {aiCampaignId !== null && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4" onClick={closeAIForm}>
          <div className="bg-zinc-950 border border-emerald-500/40 rounded-2xl max-w-lg w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="text-emerald-400 text-xs tracking-widest mb-1">PRODUCER TIER ONLY • AI REVIEW WINDOW ({Math.floor(aiReviewWindow / 3600)}h)</div>
            <h4 className="text-2xl font-semibold tracking-tight mb-2">Submit AI Milestone Proof</h4>
            <p className="text-sm text-white/70 mb-5">For campaign #{aiCampaignId}. Upload proof artifact to Arweave, then submit the hash. Platform reviews within the window before approving release from escrow.</p>

            <div className="mb-4">
              <label className="text-xs text-white/60">MILESTONE INDEX</label>
              <input type="number" value={aiMilestoneId} onChange={e => setAiMilestoneId(parseInt(e.target.value) || 0)} className="w-full mt-1 bg-black border border-white/20 rounded-xl px-4 py-2 font-mono" />
            </div>

            <div>
              <label className="text-xs text-white/60">AI PROOF NOTES / HASH SUMMARY</label>
              <textarea value={aiProofText} onChange={e => setAiProofText(e.target.value)} rows={4} className="w-full mt-1 bg-black border border-white/20 rounded-xl px-4 py-3 text-sm font-mono" />
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={closeAIForm} className="flex-1 py-3 border border-white/30 rounded-2xl text-sm">CANCEL</button>
              <button onClick={handleSubmitAIProof} disabled={isSubmittingAI || arUploading} className="flex-1 py-3 bg-emerald-600 text-black font-medium rounded-2xl disabled:opacity-60">
                {arUploading || isSubmittingAI ? 'UPLOADING + SUBMITTING…' : 'UPLOAD PROOF TO ARWEAVE + SUBMIT'}
              </button>
            </div>

            {aiSubmitTx && <div className="mt-4 text-xs text-emerald-400 font-mono break-all">Submitted: {aiSubmitTx}</div>}
            <div className="text-[10px] text-white/40 mt-4">This is the unique power of Producer-tier crowdfund backers — direct influence on milestone releases.</div>
          </div>
        </div>
      )}

      {/* Footer tie-back to core Reviews experience */}
      <div className="max-w-3xl mx-auto px-6 py-10 text-center text-xs text-white/40 border-t border-white/10 mt-8">
        Every crowdfund backer is a verified owner. Your licensed access gives you the same weight in public film reviews as anyone who holds a ticket.<br />
        <a href="/reviews" className="text-emerald-400 hover:underline">See how ownership powers the reviews layer →</a>
      </div>

      {/* Clickwrap Consent Modal — enforced on launch, contribute, and AI proof submission */}
      <LegalConsentModal
        open={showConsentModal}
        onAccepted={handleConsentAccepted}
      />
    </div>
  );
}
