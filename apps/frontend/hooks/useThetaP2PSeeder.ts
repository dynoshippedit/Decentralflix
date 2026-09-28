'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useArweaveUpload } from './useArweaveUpload';

/**
 * Spike 2: Theta P2P + Seeding Metrics Prototype Hook (ADR-001 §7 next priority)
 *
 * Completely isolated from main player, mint, VideoPlayer.tsx, and all production flows.
 * Reuses ONLY existing useArweaveUpload (for seeding REPORT JSON — metadata/proofs only, per ADR).
 * Reuses SeederCredits.submitSeedingReport *pattern* (demo only; no contract writes here).
 *
 * Implements:
 * - Simulated "Theta P2P JS SDK + Edge relay" behavior (browser-feasible "contribute while watching").
 *   Real integration would load Theta P2P JS SDK (theta.umd + hls plugin) + wire HLS player events.
 * - Local seeder metrics: bandwidth served (bytes relayed), uptime, peers served (simulated mesh).
 * - "Contribute while watching" toggle: starts/stops background metric accumulation (simulates segment relay).
 * - Seeding report generation (ADR-aligned JSON for Arweave anchor).
 * - Wire report → Arweave upload (via reuse of hook) → ready for SeederCredits claim.
 * - Incentive quantification: credits estimate (TFUEL-adjacent sim: ~credits per GB served, with tier multiplier preview).
 *
 * Simulation is realistic:
 * - Peers join/leave stochastically while "watching".
 * - Bytes served grows with simulated upload rate (limited to browser-feasible ~1-5 Mbps sustained relay).
 * - No real WebRTC connections (would require full player integration + signaling; out of minimal spike scope).
 *
 * Measurements + logs: everything console + UI stream. Per GROK.md + ADR-001.
 *
 * Usage (in /spike2 only):
 *   const seeder = useThetaP2PSeeder();
 *   seeder.toggleContribute('some-video-cid-or-hash');
 *   const reportUpload = await seeder.generateAndUploadReport();
 *   // Then demo submitSeedingReport(arweaveTxId, claimedCredits, sig) in UI or via lib/contracts
 */

export interface ThetaSeederMetrics {
  uptimeSec: number;
  bytesServed: number; // total relayed/uploaded to peers (sim)
  peersServed: number; // cumulative unique peers relayed to (sim)
  currentPeers: number; // instantaneous active in mesh sim
  avgUploadMbps: number;
  peakUploadMbps: number;
  segmentsRelayed: number;
  filmContext?: string;
  sessionStart: number;
  lastUpdate: number;
}

export interface ThetaSeedingReport {
  version: 'spike2-theta-adr001';
  spike: '2';
  seederAddress?: string; // optional; filled in real claim flow from wallet
  filmId: string; // videoHash / CID / thetaVideoId — ties report to content
  period: {
    start: string; // ISO
    end: string;
    durationSec: number;
  };
  contribution: {
    bytesServed: number;
    gbServed: number;
    peersServed: number;
    uptimeSec: number;
    avgUploadMbps: number;
    peakUploadMbps: number;
    segmentsRelayed: number;
  };
  theta: {
    meshMode: 'simulated-p2p-relay' | 'sdk-hls-plugin';
    note: string;
    sdkIntegration: string; // guidance for real
  };
  incentives: {
    baseCreditsPerGB: number; // TFUEL-adjacent platform rate (sim)
    estimatedBaseCredits: number;
    tierMultiplierPreview: number; // 1.0x / 1.25x / 1.5x
    estimatedFinalCredits: number;
    rationale: string;
  };
  timestamp: number;
  signatureStub?: string; // placeholder for future ECDSA / platform attest
}

export interface SeederStepLog {
  step: number;
  label: string;
  timestamp: number;
  durationMs?: number;
  details?: string;
}

export interface ThetaSpike2Result {
  success: boolean;
  report: ThetaSeedingReport;
  arweaveTx?: { id: string; url: string }; // after upload
  metricsSnapshot: ThetaSeederMetrics;
  claimedAmountPreview: number; // final after multiplier
  simulated: boolean;
  logs: SeederStepLog[];
}

const SIM_UPLOAD_RATE_MBPS = 2.8; // realistic browser relay sustained (WebRTC data channel limits)
const SIM_PEER_JOIN_PROB = 0.35;
const SIM_PEER_LEAVE_PROB = 0.22;
const CREDITS_PER_GB_BASE = 42; // Platform sim: ~42 credits per GB served (maps TFUEL-adjacent economics for demo; tunable)

function generateFilmContext(): string {
  const samples = [
    'theta-demo-film-cid-bafy-spike2-001',
    'adr001-hybrid-test-video',
    'decentralflix-p2p-seed-example',
    'livepeer-filecoin-theta-spike-clip',
  ];
  return samples[Math.floor(Math.random() * samples.length)];
}

function estimateIncentives(
  gbServed: number,
  uptimeSec: number,
  tierMultiplier: number = 100
): {
  baseCredits: number;
  finalCredits: number;
  perGB: number;
} {
  const base = Math.max(0.1, gbServed * CREDITS_PER_GB_BASE);
  // Small uptime bonus (encourages persistence in real)
  const uptimeBonus = Math.min(15, (uptimeSec / 3600) * 3);
  const baseCredits = Math.floor(base + uptimeBonus);
  const finalCredits = Math.floor((baseCredits * tierMultiplier) / 100);
  return {
    baseCredits,
    finalCredits,
    perGB: CREDITS_PER_GB_BASE,
  };
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function useThetaP2PSeeder() {
  const [contributing, setContributing] = useState(false);
  const [metrics, setMetrics] = useState<ThetaSeederMetrics>({
    uptimeSec: 0,
    bytesServed: 0,
    peersServed: 0,
    currentPeers: 0,
    avgUploadMbps: 0,
    peakUploadMbps: 0,
    segmentsRelayed: 0,
    sessionStart: Date.now(),
    lastUpdate: Date.now(),
  });
  const [progress, setProgress] = useState<SeederStepLog[]>([]);
  const [currentFilmId, setCurrentFilmId] = useState<string>('');
  const [lastReport, setLastReport] = useState<ThetaSeedingReport | null>(null);
  const [arweaveUploadState, setArweaveUploadState] = useState<{ uploading: boolean; result?: any; error?: string }>({ uploading: false });

  const arweave = useArweaveUpload();

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);
  const bytesAtStartRef = useRef<number>(0);
  const logsRef = useRef<SeederStepLog[]>([]);

  const addLog = useCallback((step: number, label: string, durationMs?: number, details?: string) => {
    const entry: SeederStepLog = {
      step,
      label,
      timestamp: Date.now(),
      durationMs,
      details,
    };
    logsRef.current = [...logsRef.current, entry];
    setProgress((prev) => [...prev, entry]);
    console.log(`[Spike2 ThetaSeeder] Step ${step}: ${label}`, durationMs ? `+${durationMs}ms` : '', details || '');
    return entry;
  }, []);

  const reset = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setContributing(false);
    setProgress([]);
    logsRef.current = [];
    setMetrics({
      uptimeSec: 0,
      bytesServed: 0,
      peersServed: 0,
      currentPeers: 0,
      avgUploadMbps: 0,
      peakUploadMbps: 0,
      segmentsRelayed: 0,
      sessionStart: Date.now(),
      lastUpdate: Date.now(),
    });
    setCurrentFilmId('');
    setLastReport(null);
    setArweaveUploadState({ uploading: false });
    arweave.reset?.();
    startTimeRef.current = 0;
    bytesAtStartRef.current = 0;
  }, [arweave]);

  // Core simulation tick — mimics Theta P2P JS SDK + HLS segment relay callbacks
  const tickSimulation = useCallback(() => {
    setMetrics((prev) => {
      const now = Date.now();
      const elapsedSec = Math.max(0, Math.floor((now - prev.sessionStart) / 1000));
      const deltaSec = Math.max(0.2, (now - prev.lastUpdate) / 1000);

      // Simulate peer dynamics (WebRTC mesh behavior)
      let currentPeers = prev.currentPeers;
      if (Math.random() < SIM_PEER_JOIN_PROB && currentPeers < 12) {
        currentPeers += Math.random() > 0.6 ? 2 : 1;
      }
      if (Math.random() < SIM_PEER_LEAVE_PROB && currentPeers > 0) {
        currentPeers = Math.max(0, currentPeers - (Math.random() > 0.7 ? 1 : 0.5));
      }
      currentPeers = Math.floor(currentPeers);

      // Bandwidth served: browser-relay limited rate * active peers * time (realistic for data channels)
      const uploadRateMbps = SIM_UPLOAD_RATE_MBPS * (0.6 + Math.random() * 0.8); // variance
      const bytesThisTick = Math.floor((uploadRateMbps * 1024 * 1024 / 8) * deltaSec * Math.max(0.3, currentPeers / 3));

      const newBytes = prev.bytesServed + bytesThisTick;
      const newSegments = prev.segmentsRelayed + Math.max(1, Math.floor(bytesThisTick / (2 * 1024 * 1024))); // ~2MB segments sim

      // Cumulative peers (grows slowly)
      const newPeersServed = Math.max(prev.peersServed, prev.peersServed + Math.floor(currentPeers * 0.15));

      const totalTime = Math.max(1, elapsedSec);
      const avgMbps = (newBytes * 8) / (totalTime * 1024 * 1024);
      const peak = Math.max(prev.peakUploadMbps, uploadRateMbps);

      return {
        ...prev,
        uptimeSec: elapsedSec,
        bytesServed: newBytes,
        peersServed: newPeersServed,
        currentPeers,
        avgUploadMbps: Number(avgMbps.toFixed(2)),
        peakUploadMbps: Number(peak.toFixed(2)),
        segmentsRelayed: newSegments,
        lastUpdate: now,
      };
    });
  }, []);

  /**
   * Toggle "Contribute while watching" — the core user-facing P2P seeding opt-in.
   * In real Theta integration: this would enable the theta_hlsjs plugin relay mode
   * and listen to segment-served / peer-connected events from the SDK.
   */
  const toggleContribute = useCallback((filmIdOrHash?: string) => {
    const newContributing = !contributing;

    if (newContributing) {
      const film = filmIdOrHash || currentFilmId || generateFilmContext();
      setCurrentFilmId(film);

      if (!startTimeRef.current) {
        startTimeRef.current = Date.now();
        bytesAtStartRef.current = metrics.bytesServed;
      }

      setContributing(true);
      addLog(1, 'Started Theta P2P relay simulation (contribute while watching)', 0, `film: ${film} • browser WebRTC mesh (sim)`);

      // Start periodic metrics (every 650ms for lively UI, like real segment cadence)
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(() => {
        tickSimulation();
      }, 650);

      // Occasional "peer event" logs for realism
      const peerLogTimer = setTimeout(() => {
        if (contributing) { // still active
          addLog(2, 'Peer mesh update', undefined, `+${Math.floor(Math.random() * 3) + 1} peers joined relay swarm (Theta Edge supernode assisted)`);
        }
      }, 4200);

      // Cleanup the one-off
      setTimeout(() => clearTimeout(peerLogTimer), 10000);
    } else {
      setContributing(false);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      addLog(3, 'Stopped P2P contribution session', undefined, `Final: ${metrics.uptimeSec}s • ${(metrics.bytesServed / 1e9).toFixed(3)} GB relayed`);
    }
  }, [contributing, currentFilmId, metrics, addLog, tickSimulation]);

  /**
   * Generate the canonical seeding report (ready for Arweave + on-chain claim).
   * This is the exact shape that would be uploaded, then its txId passed to submitSeedingReport.
   */
  const generateReport = useCallback((tierMultiplier = 100): ThetaSeedingReport => {
    const now = Date.now();
    const m = metrics;
    const gb = m.bytesServed / (1024 ** 3);

    const incentives = estimateIncentives(gb, m.uptimeSec, tierMultiplier);

    const report: ThetaSeedingReport = {
      version: 'spike2-theta-adr001',
      spike: '2',
      filmId: currentFilmId || generateFilmContext(),
      period: {
        start: new Date(m.sessionStart).toISOString(),
        end: new Date(now).toISOString(),
        durationSec: m.uptimeSec,
      },
      contribution: {
        bytesServed: m.bytesServed,
        gbServed: Number(gb.toFixed(6)),
        peersServed: m.peersServed,
        uptimeSec: m.uptimeSec,
        avgUploadMbps: m.avgUploadMbps,
        peakUploadMbps: m.peakUploadMbps,
        segmentsRelayed: m.segmentsRelayed,
      },
      theta: {
        meshMode: 'simulated-p2p-relay',
        note: 'Browser simulation of Theta P2P JS SDK segment relay. Real path uses theta-hls-plugin + WebRTC data channels + Edge Node fallbacks.',
        sdkIntegration: 'Load https://cdn.thetatoken.org/.../theta.umd.min.js + theta-hls-plugin; configure videojs theta_hlsjs tech with videoId + onThetaReady peer callbacks to feed real bytes/peers.',
      },
      incentives: {
        baseCreditsPerGB: CREDITS_PER_GB_BASE,
        estimatedBaseCredits: incentives.baseCredits,
        tierMultiplierPreview: tierMultiplier / 100,
        estimatedFinalCredits: incentives.finalCredits,
        rationale: `Platform utility credits: ${CREDITS_PER_GB_BASE} per GB relayed (sim TFUEL-adjacent economics) + uptime bonus. Multiplied by NFT tier (Producer 1.5x). Arweave-anchored for submitSeedingReport.`,
      },
      timestamp: now,
    };

    setLastReport(report);
    addLog(4, 'Generated Theta seeding report', 0, `${gb.toFixed(3)} GB • ${incentives.finalCredits} est. final credits @ ${tierMultiplier / 100}x`);
    return report;
  }, [metrics, currentFilmId, addLog]);

  /**
   * Upload the report JSON to Arweave (reuses the exact existing hook + lib/arweave/upload).
   * This produces the txId for SeederCredits.submitSeedingReport(arweaveTxId, amount, platformSig).
   * Per ADR: reports are the immutable proof layer; Arweave only for proofs/metadata.
   */
  const uploadReportToArweave = useCallback(async (tierMultiplier = 100): Promise<ThetaSpike2Result | null> => {
    const report = lastReport || generateReport(tierMultiplier);
    setArweaveUploadState({ uploading: true, error: undefined });

    const start = Date.now();
    addLog(5, 'Uploading seeding report JSON to Arweave (metadata/proof only)', 0, 'Reusing useArweaveUpload.uploadJson — never video bytes');

    try {
      const tags = {
        'App-Name': 'Decentralflix-Spike2',
        'Spike': '2',
        'Type': 'Theta-Seeding-Report',
        'Film-Id': report.filmId,
        'Version': report.version,
      };

      const uploadRes = await arweave.uploadJson(report, tags);
      const duration = Date.now() - start;

      if (!uploadRes) {
        throw new Error(arweave.error || 'Arweave upload returned null');
      }

      const result: ThetaSpike2Result = {
        success: true,
        report,
        arweaveTx: { id: uploadRes.id, url: uploadRes.url },
        metricsSnapshot: { ...metrics },
        claimedAmountPreview: report.incentives.estimatedFinalCredits,
        simulated: true,
        logs: [...logsRef.current],
      };

      setArweaveUploadState({ uploading: false, result: uploadRes });
      addLog(6, 'Report anchored on Arweave', duration, `tx: ${uploadRes.id} • ready for submitSeedingReport claim`);
      console.log('[Spike2] Full Theta seeding report (Arweave payload):', report);

      return result;
    } catch (err: any) {
      const msg = err?.message || 'Arweave report upload failed';
      setArweaveUploadState({ uploading: false, error: msg });
      addLog(99, 'Arweave upload error', undefined, msg);
      return null;
    }
  }, [lastReport, generateReport, arweave, metrics, addLog]);

  // Auto-clean interval on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const gbServed = metrics.bytesServed / (1024 ** 3);
  const incentivePreview = estimateIncentives(gbServed, metrics.uptimeSec, 100);

  return {
    // State
    contributing,
    metrics,
    progress,
    currentFilmId,
    lastReport,
    arweaveUploadState,
    hasRealSdk: false, // Always sim in this spike (real Theta JS SDK load would go here)

    // Actions
    toggleContribute,
    generateReport,
    uploadReportToArweave,
    reset,

    // Quantified incentive helpers (for UI + docs)
    incentivePreview,
    creditsPerGB: CREDITS_PER_GB_BASE,
    estimatedCreditsNow: incentivePreview.finalCredits,

    // For docs / external
    SIM_LIMITS: {
      maxPracticalPeersPerTab: 12,
      realisticSustainedMbps: SIM_UPLOAD_RATE_MBPS,
      tabLifetimeOnly: true,
    },
  };
}
