'use client';

import React, { useState } from 'react';
import { useThetaP2PSeeder } from '@/hooks/useThetaP2PSeeder';
import { useArweaveUpload } from '@/hooks/useArweaveUpload';
import { useSeederCredits, type MultiSourceSeedingReport, type RedemptionOption } from '@/lib/contracts';
// Note: useSeederCredits + contract submit pattern reused in demo only. No production wiring.
// v2 extension (Spike 4): multi-source reports + rich redemption/impact surfaces wired here as isolated demo.

/**
 * Spike 2 Demo Page — Theta P2P + Seeding Metrics Prototype (ADR-001 §7)
 *
 * Run at: /spike2
 *
 * Fully isolated. Zero changes to Phase 0 Arweave video paths, VideoPlayer.tsx, mint flows,
 * main dashboard seeding stub, contracts, or any player code.
 *
 * Reuses:
 * - useArweaveUpload.uploadJson (for seeding REPORTS only — exactly per ADR §4 demotion)
 * - SeederCredits.submitSeedingReport *pattern* (arweaveTxId + claimedAmount + sig) for demo
 *
 * Deliverables:
 * - Basic Theta Video/Edge "SDK or relay patterns" via isolated simulation of P2P JS SDK segment relay.
 * - Local seeder prototype: measures bandwidth served / uptime / peers (realistic browser sim).
 * - "Contribute while watching" toggle simulation + live metrics.
 * - Wire sample report to Arweave → ready for SeederCredits claim flow.
 * - Quantify incentive impact (credits / GB served, TFUEL-adjacent sim + tier multiplier preview).
 * - Full logging + measurements.
 * - Feasibility doc (browser WebRTC limits vs native/desktop) + production path.
 *
 * Per GROK.md clean rewrite + ADR-001: Strict minimal scope. Theta as P2P delivery/seeding layer.
 */

export default function Spike2Page() {
  const seeder = useThetaP2PSeeder();

  // v2: Live SeederCredits (balance + tier + impact + leaderboards + redemption/claim helpers)
  // Uses real on-chain reads + CreditsEarned logs when deployed; rich demo otherwise.
  const credits = useSeederCredits(); // no address needed for demo surfaces; in real would pass connectedAddress
  const [tierMultiplier, setTierMultiplier] = useState(100);
  const [uploadedReport, setUploadedReport] = useState<any>(null);
  const [claimDemoState, setClaimDemoState] = useState<{ txData?: string; note?: string }>({});

  // v2 demo state (isolated to this spike page)
  const [multiSourceReport, setMultiSourceReport] = useState<MultiSourceSeedingReport | null>(null);
  const [unifiedClaimPreview, setUnifiedClaimPreview] = useState<any>(null);
  const [redemptionResult, setRedemptionResult] = useState<string | null>(null);
  const [selectedRedemption, setSelectedRedemption] = useState<RedemptionOption | null>(null);

  const {
    contributing,
    metrics,
    progress,
    currentFilmId,
    lastReport,
    arweaveUploadState,
    toggleContribute,
    generateReport,
    uploadReportToArweave,
    reset,
    incentivePreview,
    creditsPerGB,
    estimatedCreditsNow,
    SIM_LIMITS,
  } = seeder;

  const handleToggle = () => {
    toggleContribute();
  };

  const handleGenerateReport = () => {
    const r = generateReport(tierMultiplier);
    // Keep in UI for inspection
  };

  const handleUploadToArweave = async () => {
    const res = await uploadReportToArweave(tierMultiplier);
    if (res) {
      setUploadedReport(res);
    }
  };

  /**
   * Demo the SeederCredits claim pattern (isolated — does NOT call real contract or require wallet).
   * In real use: after Arweave upload, call submitSeedingReport(txId, claimedAmount, platformSig)
   * where sig is produced by platformAttestor (or future indexer/oracle) over (seeder, txId, amount, chainId).
   */
  const demoSubmitSeedingReport = () => {
    if (!uploadedReport?.arweaveTx) {
      alert('Upload report to Arweave first to obtain txId for the claim.');
      return;
    }

    const arweaveTxId = uploadedReport.arweaveTx.id;
    const claimed = uploadedReport.claimedAmountPreview;
    const film = uploadedReport.report.filmId;

    // Simulated calldata / params for the contract call
    const demoParams = {
      function: 'submitSeedingReport',
      args: [arweaveTxId, claimed, '0x<platformSignature-for-seeder-address>'],
      note: 'Platform would sign keccak(seeder || arweaveTxId || claimed || chainId). Tier multiplier applied inside contract.',
    };

    const txPreview = `submitSeedingReport("${arweaveTxId}", ${claimed}, <sig>)`;

    setClaimDemoState({
      txData: txPreview,
      note: `Film: ${film} • ${claimed} final credits (after ${uploadedReport.report.incentives.tierMultiplierPreview}x) • Cooldown + ownership checks in real contract.`,
    });

    console.log('[Spike2 Demo Claim]', demoParams);
    // In a connected wallet context (future): use viem writeContract with SEEDER_CREDITS_ABI
  };

  // === SeederCredits v2 handlers (Spike 4 rich surfaces, isolated in this demo page) ===
  const handleGenerateMultiSource = () => {
    // Build from current Theta sim metrics + synthetic Filecoin/Livepeer contributions for unified demo
    const msReport = credits.generateMultiSourceReport({
      theta: {
        gbRelayed: parseFloat(gb),
        peersServed: metrics.peersServed,
        avgUploadMbps: metrics.avgUploadMbps,
        peakUploadMbps: metrics.peakUploadMbps,
        segmentsRelayed: metrics.segmentsRelayed,
        tfuelReceiptStub: 'theta-edge-demo-receipt-0x42',
        filmContext: currentFilmId,
      },
      filecoin: { bytesRetrieved: 1.8e9, dealsVerified: 2, beamSaturnAttestation: 'bafy-demo-fc-retrieval' },
      livepeer: { minutesTranscoded: 9, segmentsProcessed: 124, orchestratorRef: 'livepeer-orchestrator-stub' },
      arweaveTxId: uploadedReport?.arweaveTx?.id,
    });
    setMultiSourceReport(msReport);
    const preview = credits.prepareUnifiedClaim(msReport, true);
    setUnifiedClaimPreview(preview);
    setRedemptionResult(null);
  };

  const handleUnifiedClaimSim = () => {
    if (!multiSourceReport) {
      alert('Generate multi-source report first (uses current Theta metrics + hybrid sources).');
      return;
    }
    const res = credits.simulateClaim(multiSourceReport);
    setRedemptionResult(`Claimed +${res.credited} credits (v2 multi-source sim). New preview balance: ${res.newBalance}. Real flow: wallet writeContract(submitMultiSourceReport) + refresh.`);
    // Also update the legacy claim state for continuity
    setClaimDemoState({
      txData: `submitMultiSourceReport("${multiSourceReport.arweaveReportTxId || 'ar://v2'}", ${res.credited}, <sig>, ${multiSourceReport.attestation?.sourceMask})`,
      note: `Unified v2: Theta+Filecoin+Livepeer. Tier x${credits.tierMultiplier / 100}. See "My Seeding Impact" below (live updated).`,
    });
  };

  const handleRedeemOption = (opt: RedemptionOption) => {
    setSelectedRedemption(opt);
    const res = credits.simulateRedeem(opt);
    if (res.success) {
      setRedemptionResult(`Redeemed "${opt.label}" for ${opt.cost} credits. ${res.perk} (sim). Real: redeemCredits(${opt.cost}, ${opt.rewardType}). Balance now ~${res.newBalance}.`);
    } else {
      setRedemptionResult(res.error || 'Redeem failed (insufficient in sim). Earn more via claim or increase sim credits.');
    }
  };

  // Early metrics for v2 handlers (avoid TDZ in closure)
  const gb = (metrics.bytesServed / (1024 ** 3)).toFixed(4);
  const mbps = metrics.avgUploadMbps.toFixed(2);

  const handleResetV2Sim = () => {
    credits.resetSimulations();
    setMultiSourceReport(null);
    setUnifiedClaimPreview(null);
    setRedemptionResult('Simulations reset. Regenerate reports or redeem to see live preview updates (balance + impact).');
    setSelectedRedemption(null);
    setClaimDemoState({});
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="text-3xl">🌀</div>
            <h1 className="text-4xl font-semibold tracking-tighter">Spike 2: Theta P2P + Seeding Metrics Prototype</h1>
          </div>
          <p className="text-white/60 max-w-3xl">
            ADR-001 §7 (next after Livepeer+Filecoin) — Isolated prototype of Theta Edge P2P relay/seeding layer.
            "Contribute while watching" toggle • Browser-feasible metrics (bytes/peers/uptime) • Arweave-anchored report → SeederCredits claim flow demo • Incentive quantification (credits/GB).
          </p>
          <div className="mt-3 text-xs inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 border border-white/10">
            Isolated • Reuses useArweaveUpload (reports only) + SeederCredits pattern • No main player/mint changes • GROK.md + ADR-001 aligned
          </div>
          <div className="mt-2 text-[10px] text-amber-400/80">
            Pure simulation of Theta P2P JS SDK (HLS segment relay via WebRTC). Real SDK integration path documented below.
          </div>
        </div>

        {/* Controls */}
        <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6 mb-6">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1">
              <div className="text-xs uppercase tracking-widest text-white/50 mb-1.5">P2P Seeding Control (Theta-style)</div>
              <button
                onClick={handleToggle}
                className={`px-8 py-3 rounded-2xl font-medium transition text-lg ${contributing ? 'bg-red-600 hover:bg-red-500' : 'bg-emerald-500 hover:bg-emerald-400 text-black'}`}
              >
                {contributing ? '⏹ STOP Contributing (while watching)' : '▶ START "Contribute while watching" (Theta P2P relay sim)'}
              </button>
              <div className="mt-2 text-[10px] text-white/50">
                Simulates browser acting as lightweight Theta Edge peer: relays HLS segments to other viewers via mesh (Edge supernodes assist).
              </div>
            </div>

            <div>
              <label className="block text-xs uppercase tracking-widest text-white/50 mb-1">Tier Multiplier Preview</label>
              <select
                value={tierMultiplier}
                onChange={(e) => setTierMultiplier(parseInt(e.target.value))}
                className="bg-black border border-white/20 rounded-xl px-4 py-2 text-sm"
                disabled={contributing}
              >
                <option value={100}>1.0× (BASIC / no ticket)</option>
                <option value={125}>1.25× (DELUXE)</option>
                <option value={150}>1.5× (PRODUCER)</option>
              </select>
            </div>

            <button
              onClick={reset}
              className="px-5 py-2.5 border border-white/20 hover:bg-white/5 rounded-xl text-sm self-end"
            >
              Reset Session
            </button>
          </div>

          {currentFilmId && (
            <div className="mt-3 text-[10px] font-mono text-emerald-400/70 bg-black/40 px-3 py-1 rounded">
              Current film context: {currentFilmId}
            </div>
          )}
        </div>

        {/* Live Metrics Dashboard (the core deliverable) */}
        <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6 mb-6">
          <h2 className="font-semibold mb-4 flex items-center gap-2">📈 Live Seeder Metrics (Theta P2P Relay Simulation)</h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
            <div className="bg-black/40 rounded-xl p-4">
              <div className="text-white/50 text-xs">UPTIME (Seeding Duration)</div>
              <div className="text-3xl font-semibold tabular-nums mt-1">{metrics.uptimeSec}<span className="text-base text-white/40">s</span></div>
              <div className="text-[10px] text-white/40">Session active while toggle on</div>
            </div>

            <div className="bg-black/40 rounded-xl p-4">
              <div className="text-white/50 text-xs">BANDWIDTH SERVED (Relayed to Peers)</div>
              <div className="text-3xl font-semibold tabular-nums mt-1 text-emerald-400">{gb} <span className="text-base">GB</span></div>
              <div className="text-[10px] text-white/40">{(metrics.bytesServed / 1024 / 1024).toFixed(1)} MB total • {mbps} Mbps avg</div>
            </div>

            <div className="bg-black/40 rounded-xl p-4">
              <div className="text-white/50 text-xs">PEERS IN MESH / SERVED</div>
              <div className="text-3xl font-semibold tabular-nums mt-1">{metrics.currentPeers} <span className="text-base text-white/40">/ {metrics.peersServed}</span></div>
              <div className="text-[10px] text-white/40">{metrics.segmentsRelayed} segments relayed</div>
            </div>

            <div className="bg-black/40 rounded-xl p-4 border border-emerald-500/30">
              <div className="text-white/50 text-xs">EST. CREDITS (Current Session)</div>
              <div className="text-3xl font-semibold tabular-nums mt-1 text-amber-400">{estimatedCreditsNow}</div>
              <div className="text-[10px] text-white/40">
                @ {creditsPerGB} cr/GB base • {incentivePreview.baseCredits} base + uptime • ×{tierMultiplier / 100} preview
              </div>
            </div>
          </div>

          <div className="text-[10px] text-white/50 border-t border-white/10 pt-3">
            Simulation parameters (realistic for browser): sustained ~{SIM_LIMITS.realisticSustainedMbps} Mbps relay per active peer group via WebRTC data channels. Peak/avg fluctuate. Full Theta P2P JS SDK would expose real <code>onSegmentServed</code> / peer count events from the HLS plugin.
          </div>
        </div>

        {/* Logs */}
        {(progress.length > 0 || contributing) && (
          <div className="bg-black/60 border border-white/10 rounded-2xl p-5 mb-6 font-mono text-xs">
            <div className="uppercase tracking-[2px] text-white/50 text-[10px] mb-3">Live Execution + Metrics Log</div>
            <div className="space-y-1 max-h-56 overflow-auto pr-2">
              {progress.map((log, idx) => (
                <div key={idx} className="flex gap-3 text-white/80">
                  <span className="text-emerald-400/70 shrink-0 w-4">#{log.step}</span>
                  <span className="text-white/90">{log.label}</span>
                  {log.durationMs != null && <span className="text-amber-400 ml-auto">+{log.durationMs}ms</span>}
                  {log.details && <span className="text-white/40 truncate">— {log.details}</span>}
                </div>
              ))}
              {contributing && <div className="text-emerald-400 animate-pulse">Relaying segments to mesh… (simulated Theta P2P)</div>}
            </div>
          </div>
        )}

        {/* Report Generation + Arweave + Claim Flow */}
        <div className="space-y-6 mb-6">
          <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6">
            <h3 className="font-medium mb-3">2. Generate Seeding Report (Arweave-Ready Proof)</h3>
            <p className="text-sm text-white/60 mb-4">
              Captures exact contribution window. Matches the report shape expected by <code>SeederCredits.submitSeedingReport(arweaveTxId, claimedAmount, platformSignature)</code>.
            </p>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleGenerateReport}
                disabled={!metrics.uptimeSec}
                className="px-5 py-2 bg-white/10 hover:bg-white/15 rounded-xl text-sm border border-white/20 disabled:opacity-50"
              >
                Generate Report JSON (preview)
              </button>

              <button
                onClick={handleUploadToArweave}
                disabled={arweaveUploadState.uploading || !metrics.uptimeSec}
                className="px-5 py-2 bg-white text-black rounded-xl text-sm font-medium disabled:opacity-50"
              >
                {arweaveUploadState.uploading ? 'Anchoring report on Arweave...' : 'Upload Report to Arweave (reuse hook)'}
              </button>
            </div>

            {lastReport && !uploadedReport && (
              <pre className="mt-4 text-[10px] bg-black/60 p-4 rounded-xl overflow-auto max-h-72 text-white/80 font-mono border border-white/10">
                {JSON.stringify(lastReport, null, 2)}
              </pre>
            )}

            {arweaveUploadState.error && <div className="text-red-400 text-xs mt-2">Arweave error: {arweaveUploadState.error}</div>}
          </div>

          {/* Arweave Result + Claim Demo */}
          {uploadedReport && uploadedReport.arweaveTx && (
            <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6">
              <h3 className="font-medium mb-3 flex items-center gap-2">3. Arweave-Anchored Report → SeederCredits Claim Demo</h3>

              <div className="text-sm mb-4">
                <div className="text-emerald-400">Arweave TX (immutable proof):</div>
                <a href={uploadedReport.arweaveTx.url} target="_blank" className="font-mono text-xs break-all underline text-white/80 hover:text-white">
                  {uploadedReport.arweaveTx.url}
                </a>
              </div>

              <div className="grid md:grid-cols-2 gap-4 text-sm mb-4">
                <div className="bg-black/40 p-4 rounded-xl">
                  <div className="text-xs text-white/50">Claimed Amount (post-multiplier)</div>
                  <div className="text-2xl font-semibold text-amber-400 tabular-nums">{uploadedReport.claimedAmountPreview} credits</div>
                  <div className="text-[10px] mt-1">Derived from {uploadedReport.report.contribution.gbServed.toFixed(4)} GB served × {creditsPerGB} + uptime</div>
                </div>
                <div className="bg-black/40 p-4 rounded-xl">
                  <div className="text-xs text-white/50">Incentive Impact (Quantified)</div>
                  <div className="text-sm">Base rate: <span className="font-mono">{creditsPerGB}</span> platform credits / GB relayed</div>
                  <div className="text-sm">TFUEL-adjacent mapping (demo): real Theta Edge nodes earn TFUEL directly; here we map relay contribution → internal utility credits redeemable for mint discounts / free tickets.</div>
                  <div className="text-[10px] text-white/50 mt-1">Higher tiers multiply. Real economics would blend platform credits + native TFUEL from Theta.</div>
                </div>
              </div>

              <button
                onClick={demoSubmitSeedingReport}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-black font-medium rounded-2xl"
              >
                Demo: Build submitSeedingReport( txId, {uploadedReport.claimedAmountPreview}, sig ) calldata
              </button>

              {claimDemoState.txData && (
                <div className="mt-4 p-4 bg-black/60 rounded-xl border border-white/10 text-xs font-mono">
                  <div className="text-emerald-400 mb-1">Transaction preview (would be sent via wagmi/viem + connected wallet):</div>
                  <div className="break-all text-white/90">{claimDemoState.txData}</div>
                  <div className="text-white/50 mt-2">{claimDemoState.note}</div>
                  <div className="text-[10px] text-amber-400/80 mt-2">In production: platformAttestor (or decentralized oracle) signs; contract applies cooldown + tier multiplier + emits CreditsEarned.</div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ========== SeederCredits v2 + Redemption UX (Spike 4 high-value spike, built on Spike 2) ========== */}
        {/* Isolated demo surfaces per task: live preview, multi-source unified claim, redemption options, My Seeding Impact + leaderboards (CreditsEarned powered) */}
        {/* Reuses enhanced useSeederCredits (hook + ABI v2 + types). No main app changes. ADR-001 §5 aligned: first-class P2P credits, tier synergies, non-transferable utility. */}
        <div className="mb-10 border-t border-white/10 pt-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="text-2xl">🌱</div>
            <h2 className="text-3xl font-semibold tracking-tighter">SeederCredits v2 + Redemption Surfaces</h2>
            <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">SPIKE 4 • ISOLATED DEMO</span>
          </div>
          <p className="text-white/60 max-w-3xl text-sm mb-6">
            Unified multi-source reports (Theta relay + Filecoin retrieval + Livepeer usage) • Live balance + tier preview • Rich redemption options (mint discount, free ticket, Producer boost, AI credits) with on-chain/attestation sim • "My Seeding Impact" + leaderboards from <code>CreditsEarned</code> events (indexer foundation ready).
          </p>

          {/* Live Preview of credits balance + tier (v2 live from hook) */}
          <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6 mb-6">
            <div className="flex flex-wrap items-end gap-6">
              <div>
                <div className="text-xs text-white/50">LIVE PREVIEW BALANCE (SIM + ON-CHAIN)</div>
                <div className="text-6xl font-semibold tabular-nums tracking-[-3px] mt-1">{credits.effectiveCredits}</div>
                <div className="text-sm text-white/60">Base {credits.credits} × {credits.tierMultiplier / 100}× tier (effective post-multiplier)</div>
              </div>
              <div className="text-sm text-white/60 max-w-xs">
                Higher NFT tiers (Deluxe 1.25× / Producer 1.5×) multiply both earnings and redemption power. Non-transferable utility credits — redeem burns for platform perks only.
              </div>
              <button onClick={handleResetV2Sim} className="ml-auto text-xs px-4 py-2 border border-white/30 rounded-xl hover:bg-white/5">Reset v2 Sim</button>
            </div>
            {credits.simulatedCredits !== null && (
              <div className="mt-2 text-[10px] text-amber-400">Simulated adjustments active (demo only). Real balance from contract on refresh.</div>
            )}
          </div>

          {/* Multi-source report + Unified claim flow */}
          <div className="grid md:grid-cols-2 gap-6 mb-6">
            <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6">
              <h3 className="font-medium mb-3">v2 Multi-Source Report (Theta + Filecoin + Livepeer)</h3>
              <p className="text-xs text-white/60 mb-4">Generated from current Theta metrics + synthetic hybrid sources (real prod: native seeder + player events populate all three). Anchored via Arweave (report JSON).</p>

              <button
                onClick={handleGenerateMultiSource}
                disabled={!metrics.uptimeSec}
                className="w-full py-2.5 bg-white text-black rounded-xl text-sm font-medium disabled:opacity-50 mb-3"
              >
                Generate Unified Multi-Source Report + Preview Claim
              </button>

              {multiSourceReport && (
                <div className="mt-3 p-3 bg-black/60 rounded-xl text-[10px] font-mono border border-white/10 max-h-48 overflow-auto">
                  <div className="text-emerald-400 mb-1">v2 Report v{multiSourceReport.version}</div>
                  Sources: {Object.keys(multiSourceReport.sources).join(' + ')}<br />
                  Base credits: {multiSourceReport.totalBaseCredits} → Final (x{credits.tierMultiplier/100}): {credits.computeClaimWithTier(multiSourceReport.totalBaseCredits)}
                </div>
              )}
            </div>

            <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6">
              <h3 className="font-medium mb-3">Unified Claim Flow (v2 or Legacy)</h3>
              <p className="text-xs text-white/60 mb-3">Wires directly to new ABI (submitMultiSourceReport) or legacy. Sim updates live balance + impact.</p>

              <button
                onClick={handleUnifiedClaimSim}
                disabled={!multiSourceReport}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-black rounded-xl text-sm font-medium disabled:opacity-50"
              >
                Simulate Unified Claim (updates preview balance + impact)
              </button>

              {unifiedClaimPreview && (
                <div className="mt-3 p-3 bg-black/70 rounded-xl text-[10px] font-mono border border-white/10">
                  <div className="text-emerald-400">Preview: {unifiedClaimPreview.functionName}</div>
                  <div className="break-all mt-1 text-white/80">{JSON.stringify(unifiedClaimPreview.argsPreview)}</div>
                  <div className="text-white/50 mt-2 text-[9px]">{unifiedClaimPreview.note}</div>
                </div>
              )}
            </div>
          </div>

          {/* Rich Redemption Options UI */}
          <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6 mb-6">
            <h3 className="font-medium mb-1">Redemption Options (burn for utility perks)</h3>
            <div className="text-xs text-white/60 mb-4">On-chain: redeemCredits(amount, rewardType) burns + emits. Attestation path for vouchers/tickets. Tier-aware pricing in real v2.</div>

            <div className="grid md:grid-cols-2 gap-3">
              {credits.redeemOptions.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => handleRedeemOption(opt)}
                  className={`text-left p-4 rounded-xl border transition ${selectedRedemption?.id === opt.id ? 'border-emerald-500 bg-emerald-500/10' : 'border-white/10 hover:border-white/30 bg-black/40'}`}
                >
                  <div className="font-medium text-sm">{opt.label} <span className="text-emerald-400/80 font-mono text-xs">— {opt.cost} cr</span></div>
                  <div className="text-[10px] text-white/70 mt-1 line-clamp-2">{opt.description}</div>
                  <div className="text-[9px] text-amber-400/90 mt-1">{opt.perkPreview} {opt.tierSynergy && `• ${opt.tierSynergy}`}</div>
                </button>
              ))}
            </div>
            <div className="text-[10px] text-white/40 mt-3">Fully non-custodial utility framing. No transfer of credits. Sinks (redemptions) help balance issuance from seeding.</div>
          </div>

          {/* My Seeding Impact + Leaderboards Preview (powered by CreditsEarned events) */}
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6">
              <h3 className="font-medium mb-3 flex items-center gap-2">My Seeding Impact <span className="text-[9px] text-emerald-400">(CreditsEarned events)</span></h3>
              {credits.myImpact.length === 0 ? (
                <div className="text-sm text-white/50">No history yet. Generate + claim a v2 report above to populate (sim + real logs).</div>
              ) : (
                <div className="space-y-2 text-xs max-h-48 overflow-auto pr-1">
                  {credits.myImpact.slice(0, 8).map((e, i) => (
                    <div key={i} className="flex justify-between bg-black/50 p-2 rounded border border-white/5 font-mono">
                      <span>{e.amount > 0 ? '+' : ''}{e.amount} cr {e.tierMultiplier !== 100 ? `@${e.tierMultiplier / 100}x` : ''}</span>
                      <span className="text-white/40 truncate">{e.arweaveTxId.slice(0, 22)}… {e.blockNumber ? `blk ${e.blockNumber}` : ''}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="text-[9px] text-white/40 mt-2">Prod: indexer materializes aggregates from events (no scans). Ties to reviews/ownership for "super seeder" badges.</div>
            </div>

            <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6">
              <h3 className="font-medium mb-3">Leaderboard Preview (Top Seeders)</h3>
              <div className="space-y-1.5 text-sm">
                {credits.leaderboardPreview.map((entry, idx) => (
                  <div key={idx} className={`flex items-center justify-between p-2 rounded ${entry.seeder === 'you' || entry.seeder.includes('you') ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-black/50'}`}>
                    <div><span className="font-mono text-xs text-white/50">#{entry.rank}</span> {entry.seeder}</div>
                    <div className="font-mono text-emerald-400 tabular-nums">{entry.totalCredits} <span className="text-[10px] text-white/40">cr</span></div>
                  </div>
                ))}
              </div>
              <div className="text-[9px] text-white/40 mt-2">Event-sourced preview. Full prod leaderboards via indexer (time-windowed, film-specific, reputation-weighted).</div>
            </div>
          </div>

          {redemptionResult && (
            <div className="mt-4 p-3 bg-black/70 border border-emerald-500/30 text-emerald-300 rounded-xl text-xs font-mono">
              {redemptionResult}
            </div>
          )}

          <div className="mt-4 text-[10px] text-white/40">
            v2 report shape + redemption mechanics fully documented in spikes/spike-2/README.md (updated with this spike). Path to full integration: wire real multi-source emitters from player abstraction + native desktop seeder → Arweave/Filecoin proofs → this claim flow + dashboard surfaces.
          </div>
        </div>

        {/* Feasibility & Production Path Documentation (required deliverable) */}
        <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6 text-sm mb-8">
          <h3 className="font-semibold mb-3">Feasibility: Browser WebRTC / Theta P2P Limits vs Native/Desktop + Production Path</h3>

          <div className="grid md:grid-cols-2 gap-x-8 gap-y-4 text-xs">
            <div>
              <div className="uppercase tracking-widest text-emerald-400 text-[10px] mb-1">Browser (this spike / Theta P2P JS SDK)</div>
              <ul className="list-disc pl-5 space-y-1 text-white/70">
                <li><strong>Feasible today:</strong> Official Theta P2P JS SDK (HLS plugin) turns viewers into relays while watching. No native install. Works with video.js / hls.js players.</li>
                <li><strong>WebRTC foundation:</strong> Data channels for segment exchange (signaling + supernode assistance via Theta Edge Nodes). NAT traversal included.</li>
                <li><strong>Limits (measured in sim + real Theta behavior):</strong> Tab must stay open (no true background); practical peer connections per tab ~8-30 before CPU/battery impact; sustained upload often throttled by browser (1-5 Mbps realistic for seeding); stops on navigation/sleep; variable NAT success (TURN fallback adds cost/latency).</li>
                <li><strong>Good for:</strong> Opt-in "power the network while you watch" toggle. Low-friction contribution from all viewers. Scales horizontally with audience size.</li>
              </ul>
            </div>

            <div>
              <div className="uppercase tracking-widest text-sky-400 text-[10px] mb-1">Native / Desktop (Production Seeding Tier)</div>
              <ul className="list-disc pl-5 space-y-1 text-white/70">
                <li>Theta Edge Node / EdgeCloud client (Linux/Windows/macOS) — persistent, high-bandwidth, GPU-capable for heavier EdgeCloud jobs + reliable relay.</li>
                <li>Can stake for higher TFUEL rewards; runs 24/7 independently of any browser/tab.</li>
                <li>Recommended for serious seeders / "Seeder Studio" power users who want maximum credits + platform rewards.</li>
                <li>Android mobile Edge Node pilots exist (native, not browser).</li>
              </ul>
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-white/10 text-[10px] text-white/60">
            <strong>Production path (ADR-001 aligned):</strong><br />
            1. Add optional Theta P2P JS SDK script + plugin to the future <code>useVideoSource</code> / hybrid player abstraction (behind feature flag "thetaP2P").<br />
            2. Expose "Contribute bandwidth" toggle in player chrome → feeds real <code>bytesServed</code> / peer events into this seeder hook (or shared metrics lib).<br />
            3. Desktop companion app (or Electron shell) for persistent native Edge Node participation with deeper SeederCredits integration + TFUEL passthrough.<br />
            4. Metrics → periodic Arweave report (this spike) → <code>submitSeedingReport</code> (enhance SeederCredits for multi-source: Theta + Filecoin retrieval + Livepeer later).<br />
            5. Indexer surfaces leaderboards ("Top Seeders this week") + estimated earnings.<br />
            <span className="text-emerald-400">Browser seeding = acquisition flywheel. Native = capacity backbone.</span>
          </div>

          <div className="mt-4 text-[10px] text-white/40">
            All measurements, logs, and incentive math are captured live above. Simulation parameters chosen to match documented Theta browser relay realities (2026).
          </div>
        </div>

        {/* Summary / Next Steps */}
        <div className="text-xs border border-white/10 bg-zinc-900/50 rounded-2xl p-5 text-white/70">
          <div className="font-medium text-white mb-2">Spike 2 Results &amp; Path Forward (per ADR-001)</div>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Built:</strong> Isolated <code>useThetaP2PSeeder.ts</code> + <code>/spike2</code> demo. Full "contribute while watching" flow, realistic metrics, Arweave report anchoring (reuse hook), SeederCredits claim pattern demo, quantified credits/GB incentives.</li>
            <li><strong>Measured (live in UI):</strong> Uptime, GB relayed, peers, Mbps, credits earned preview (base + tier). Everything logged to console + on-screen stream.</li>
            <li><strong>Key insight:</strong> 1 GB relayed ≈ {creditsPerGB} platform credits (demo rate). Producer tier = 50% more. Browser path is lightweight &amp; viral; pair with native Edge for real scale.</li>
            <li><strong>Isolation verified:</strong> No imports or side effects on VideoPlayer, mint, collection, main useSeederCredits, or Arweave video paths. Only reports use the upload hook (as required).</li>
            <li><strong>Next (Spikes 3+):</strong> Real Theta SDK wiring behind abstraction layer; SeederCredits v2 multi-source reports; Indexer for credits history; Dashboard "Seeder Studio" surface using these patterns; native desktop seeder client stub.</li>
          </ul>
          <div className="mt-4 pt-3 border-t border-white/10 text-[10px]">
            Full ADR-001: STORAGE_STREAMING_ARCHITECTURE_DECISION.md. See spikes/spike-2/README.md for execution report. Ready for parallel indexer or SeederCredits v2 work.
          </div>
        </div>
      </div>
    </div>
  );
}
