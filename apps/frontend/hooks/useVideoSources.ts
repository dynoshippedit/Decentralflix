'use client';

import { useState, useEffect, useCallback } from 'react';

/**
 * Production-grade useVideoSources hook
 * 
 * Implements the canonical hybrid delivery model per GROK.md corrected architecture (R2 primary, zero egress).
 * 
 * Priority order for a given film (r2SignedUrl + videoHash or filecoinCID + livepeerPlaybackId + thetaId):
 * 1. Cloudflare R2 signed URL (via cloudflare-access) — primary, zero egress at scale
 * 2. Theta P2P Edge (optional boost, lowest latency)
 * 3. Livepeer orchestrated HLS (adaptive bitrate)
 * 4. Filecoin + Saturn/Beam (verifiable retrieval)
 * 5. Arweave gateway (permanent fallback / metadata-only — heavily demoted)
 * 
 * This hook is the single source of truth the real VideoPlayer.tsx must use.
 * It replaces the old Arweave-primary logic that caused the scalability rewrite.
 * 
 * Supports simulation mode for demos when no real endpoints are configured.
 * 
 * Non-custodial: No keys or data ever leave the user's browser except for standard gateway requests.
 */

export type VideoSourceType = 'theta' | 'livepeer' | 'filecoin' | 'arweave' | 'r2';

export interface VideoSource {
  type: VideoSourceType;
  url: string;
  label: string;
  priority: number;
  estimatedTTFB?: number; // ms - can be measured live
  isP2P?: boolean;
  recommended?: boolean;
  notes?: string;
}

export interface VideoSourcesResult {
  sources: VideoSource[];
  primarySource: VideoSource | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
  // For seeder integration
  filmIdForSeeding: string;
  // Graceful demo mode when no real dedicated CIDs/IDs provided (only videoHash or none)
  isDemoMode: boolean;
}

interface UseVideoSourcesOptions {
  videoHash?: string;           // legacy Arweave or general id
  filecoinCID?: string;         // root CID for HLS manifest on Filecoin/IPFS
  livepeerPlaybackId?: string;
  thetaVideoId?: string;
  r2SignedUrl?: string;         // Cloudflare R2 signed URL (via cloudflare-access) — primary per GROK.md
  preferSimulation?: boolean;
}

// Internal: sanitize IDs to prevent malformed CIDs/paths causing downstream player errors
function sanitizeId(id?: string): string | undefined {
  if (!id) return undefined;
  const trimmed = id.trim();
  if (!trimmed || trimmed.length < 3) return undefined;
  return trimmed;
}

const SIMULATION_BASE = 'https://sim-cdn.decentralflix.example'; // never real traffic

export function useVideoSources(options: UseVideoSourcesOptions): VideoSourcesResult {
  const {
    videoHash,
    filecoinCID,
    livepeerPlaybackId,
    thetaVideoId,
    r2SignedUrl,
    preferSimulation = false,
  } = options;

  const [sources, setSources] = useState<VideoSource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const buildSources = useCallback((): VideoSource[] => {
    const result: VideoSource[] = [];

    // Sanitized inputs for robust error handling + graceful degradation
    const sTheta = sanitizeId(thetaVideoId) || sanitizeId(videoHash);
    const sLivepeer = sanitizeId(livepeerPlaybackId);
    const sFilecoin = sanitizeId(filecoinCID);
    const sVideoHash = sanitizeId(videoHash);
    const sR2 = r2SignedUrl ? r2SignedUrl.trim() : undefined; // full signed URL for Cloudflare R2

    const hasRealDedicatedCids = !!(sFilecoin || sLivepeer || (thetaVideoId && sanitizeId(thetaVideoId)) || sR2);
    const useSim = preferSimulation || !hasRealDedicatedCids;

    // 1. Cloudflare R2 signed URL (via cloudflare-access) — PRIMARY per GROK.md (R2 primary, zero egress)
    if (sR2) {
      result.push({
        type: 'r2',
        url: sR2,
        label: 'Cloudflare R2 (signed)',
        priority: 1,
        notes: 'Primary. Zero egress cost. Delivered via cloudflare-access signed URL.',
      });
    }

    // 2. Theta P2P (demoted to optional boost; was primary per old ADR-001)
    if (sTheta) {
      const id = sTheta;
      result.push({
        type: 'theta',
        url: (useSim || preferSimulation)
          ? `${SIMULATION_BASE}/theta/${id}/master.m3u8`
          : `https://edge.theta.tv/v1/video/${id}/hls/master.m3u8`, // real pattern when integrated
        label: useSim ? 'Theta P2P Edge (demo)' : 'Theta P2P Edge',
        priority: 2,
        isP2P: true,
        recommended: false,
        notes: useSim 
          ? 'Demo simulation (no real CID). Community-seeded model active.'
          : 'Community-seeded. Lowest cost + best last-mile at scale. (optional boost)',
      });
    }

    // 3. Livepeer (excellent transcoding + orchestration; demoted below R2 primary)
    if (sLivepeer) {
      result.push({
        type: 'livepeer',
        url: `https://livepeercdn.studio/hls/${sLivepeer}/index.m3u8`,
        label: 'Livepeer (adaptive HLS)',
        priority: 3,
        notes: 'Decentralized GPU transcoding. Excellent quality ladder.',
      });
    }

    // 4. Filecoin (Saturn / Beam / w3s gateway) — demoted below R2 primary per GROK.md
    if (sFilecoin) {
      // Multiple gateway fallbacks for resilience (real production would use a smart gateway selector)
      // Improved error handling: distinct labels + notes for diagnostics
      result.push({
        type: 'filecoin',
        url: `https://saturn.ms/ipfs/${sFilecoin}/master.m3u8`,
        label: 'Filecoin + Saturn (dCDN)',
        priority: 4,
        notes: 'Verifiable. ~$0.014/GiB egress via Beam. Durable layer (optional).',
      });
      result.push({
        type: 'filecoin',
        url: `https://w3s.link/ipfs/${sFilecoin}/master.m3u8`,
        label: 'Filecoin (w3s gateway)',
        priority: 5,
        notes: 'Backup Filecoin retrieval path.',
      });
    }

    // 5. Arweave — strictly fallback / metadata only (heavily demoted per GROK.md)
    if (sVideoHash) {
      const arUrl = sVideoHash.startsWith('ar://')
        ? `https://arweave.net/${sVideoHash.replace('ar://', '')}`
        : `https://arweave.net/${sVideoHash}`;

      result.push({
        type: 'arweave',
        url: arUrl,
        label: 'Arweave Gateway (fallback)',
        priority: 10,
        notes: 'Permanent but high cost + poor hot delivery at Netflix scale. Use only as last resort.',
      });
    }

    // Graceful degradation: if NO sources at all (no ids provided), inject a safe demo theta sim source
    // to prevent hard failure in player when film metadata is partial.
    if (result.length === 0) {
      const demoId = 'demo-missing-cid-film';
      result.push({
        type: 'theta',
        url: `${SIMULATION_BASE}/theta/${demoId}/master.m3u8`,
        label: 'Theta P2P Edge (demo fallback)',
        priority: 1,
        isP2P: true,
        recommended: false,
        notes: 'No CIDs or hashes provided — operating in full demo mode. Upload pipeline incomplete for this film.',
      });
    }

    // Sort by priority
    return result.sort((a, b) => a.priority - b.priority);
  }, [videoHash, filecoinCID, livepeerPlaybackId, thetaVideoId, r2SignedUrl, preferSimulation]);

  const load = useCallback(() => {
    setIsLoading(true);
    setError(null);

    try {
      const built = buildSources();

      if (built.length === 0) {
        // Should never reach due to demo fallback in builder, but defensive
        setError('No video sources available for this film. Upload may be incomplete.');
        setSources([]);
      } else {
        setSources(built);
        // Clear transient errors on successful build (improved resilience)
        setError(null);
      }
    } catch (e: any) {
      // Improved error handling: always provide actionable message + keep partial sources if any
      const msg = e?.message || 'Failed to resolve hybrid video sources (malformed ID or network config).';
      setError(msg);
      // Do not wipe sources on transient build error — graceful keep prior or empty
      if (sources.length === 0) {
        setSources([]);
      }
    } finally {
      setIsLoading(false);
    }
  }, [buildSources]);

  useEffect(() => {
    load();
  }, [load]);

  const primarySource = sources.length > 0 ? sources[0] : null;

  // For the seeder hook — use the best available identifier. Falls back gracefully for demo.
  const filmIdForSeeding = sanitizeId(filecoinCID) || sanitizeId(thetaVideoId) || sanitizeId(videoHash) || 'unknown-film';

  // Determine demo mode for graceful UI (prominent when no real dedicated CIDs)
  const computedIsDemo = !sanitizeId(filecoinCID) && !sanitizeId(livepeerPlaybackId) && !sanitizeId(thetaVideoId);

  return {
    sources,
    primarySource,
    isLoading,
    error,
    refresh: load,
    filmIdForSeeding,
    isDemoMode: computedIsDemo || sources.some(s => s.label.includes('(demo')),
  };
}
