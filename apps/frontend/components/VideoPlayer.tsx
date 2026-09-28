'use client';

import React, { useState, useEffect } from 'react';
import * as LivepeerPlayer from '@livepeer/react/player';
import { useVideoSources, VideoSource } from '@/hooks/useVideoSources';
import { useThetaP2PSeeder } from '@/hooks/useThetaP2PSeeder';

/**
 * Production VideoPlayer — now wired to the R2-primary hybrid architecture per GROK.md.
 *
 * Replaces the old Arweave-primary model (the scalability mistake called out in GROK.md).
 *
 * Source priority (from useVideoSources, R2 primary per corrected architecture):
 * 1. Cloudflare R2 signed URL (primary, zero egress)
 * 2. Theta P2P (community seeding, optional)
 * 3. Livepeer adaptive HLS
 * 4. Filecoin + Saturn/Beam (durable storage)
 * 5. Arweave (metadata fallback only)
 *
 * This is the component investors will actually see in the demo.
 */
interface VideoPlayerProps {
  videoHash?: string;
  filecoinCID?: string;
  livepeerPlaybackId?: string;
  thetaVideoId?: string;
  r2SignedUrl?: string;
  title: string;
  isPermanentPass?: boolean;
  accessSources?: string[];
  onWatchComplete?: () => void;
}

export default function VideoPlayer({
  videoHash,
  filecoinCID,
  livepeerPlaybackId,
  thetaVideoId,
  r2SignedUrl,
  title,
  isPermanentPass = true,
  accessSources = [],
  onWatchComplete,
}: VideoPlayerProps) {
  const [selectedSourceIndex, setSelectedSourceIndex] = useState(0);
  const [sourceError, setSourceError] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  const { sources, primarySource, isLoading, error, filmIdForSeeding, isDemoMode } = useVideoSources({
    videoHash,
    filecoinCID,
    livepeerPlaybackId,
    thetaVideoId,
    r2SignedUrl,
  });

  const currentSource: VideoSource | null = sources[selectedSourceIndex] || primarySource;

  // Enhanced error handling: auto-fallback + manual retry support + user feedback
  const handleSourceError = () => {
    setSourceError(true);
    if (selectedSourceIndex < sources.length - 1) {
      setSelectedSourceIndex(selectedSourceIndex + 1);
    } else {
      // Last source failed — surface retry that resets to primary (graceful degradation)
      // Player remains usable; user can manually select or refresh
    }
  };

  const retryPrimarySource = () => {
    setSourceError(false);
    setSelectedSourceIndex(0);
  };

  // Track actual playback for smarter seeder controls (only seed while consuming)
  const handlePlay = () => setIsPlaying(true);
  const handlePause = () => setIsPlaying(false);

  // Real P2P seeding integration (uses the existing Theta seeder spike, now surfaced in the actual player)
  const seeder = useThetaP2PSeeder();
  // Robust access: hook exports `contributing` (defensive for graceful)
  const isSeeding = !!seeder.contributing;

  // Auto-stop seeding when user switches away from a P2P-capable source (good UX + prevents phantom earning)
  useEffect(() => {
    if (isSeeding && !currentSource?.isP2P) {
      seeder.toggleContribute(filmIdForSeeding); // this should stop it
    }
  }, [currentSource, isSeeding, filmIdForSeeding]);

  // Premium access source display
  const accessLabel = accessSources && accessSources.length > 0
    ? accessSources.map(s => s === 'MovieTicket' ? '🎟️ MovieTicket' : '💎 Crowdfund InvestmentNFT').join(' + ')
    : 'Licensed Pass';

  if (!isPermanentPass) {
    return (
      <div className="w-full bg-black rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
        <div className="relative aspect-video bg-zinc-950 flex items-center justify-center">
          <div className="text-center p-8">
            <div className="text-4xl mb-4">🔒</div>
            <div className="text-xl font-medium mb-2">Premium experience — gated</div>
            <div className="text-white/70 max-w-md">
              Full cinematic playback + verified owner reviews require on-chain access for this film.
            </div>
            <div className="mt-4 text-sm text-emerald-400">
              Hold a 🎟️ MovieTicket or 💎 crowdfund InvestmentNFT to unlock.
            </div>
          </div>
        </div>
        <div className="px-5 py-3.5 bg-zinc-950 border-t border-white/10 text-xs text-white/50 text-center">
          Gated by on-chain ownership • Hybrid delivery (Theta + Filecoin + Livepeer)
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="w-full bg-black rounded-2xl overflow-hidden border border-white/10 aspect-video flex items-center justify-center">
        <div className="text-white/60">Resolving best hybrid source…</div>
      </div>
    );
  }

  if (error || !currentSource) {
    return (
      <div className="w-full bg-black rounded-2xl overflow-hidden border border-red-500/30 p-8 text-center">
        <div className="text-red-400">Failed to load video sources.</div>
        <div className="text-white/60 text-sm mt-2">{error || 'No sources configured for this film.'}</div>
        <button
          onClick={retryPrimarySource}
          className="mt-4 px-4 py-1.5 text-xs border border-white/30 rounded hover:bg-white/5"
        >
          Retry primary source
        </button>
        <div className="text-[10px] text-white/40 mt-3">Hybrid player: graceful degradation active. Check film metadata CIDs.</div>
      </div>
    );
  }

  const isArweaveOnly = currentSource.type === 'arweave';
  const currentUrl = currentSource.url;

  return (
    <div className="w-full bg-black rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
      <div className="relative aspect-video bg-black">
        {currentSource.type === 'livepeer' || currentSource.url.includes('.m3u8') ? (
          <LivepeerPlayer.Root
            src={[{ src: currentUrl as `${string}m3u8`, type: 'hls', mime: 'application/vnd.apple.mpegurl', width: null, height: null }]}
            autoPlay={false}
          >
            <LivepeerPlayer.Container className="w-full h-full">
              <LivepeerPlayer.Video
                title={title}
                className="w-full h-full object-contain"
                onError={handleSourceError}
                onPlay={handlePlay}
                onPause={handlePause}
              />
              <LivepeerPlayer.Controls className="absolute inset-0" autoHide={3000}>
                <LivepeerPlayer.PlayPauseTrigger className="absolute bottom-4 left-4 w-10 h-10 flex items-center justify-center bg-black/60 rounded-full hover:bg-black/80 transition" />
                <LivepeerPlayer.Time className="absolute bottom-4 right-4 text-xs text-white/70" />
              </LivepeerPlayer.Controls>
              <LivepeerPlayer.LoadingIndicator className="absolute inset-0 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              </LivepeerPlayer.LoadingIndicator>
            </LivepeerPlayer.Container>
          </LivepeerPlayer.Root>
        ) : (
          <video
            key={currentUrl}
            controls
            className="w-full h-full object-contain"
            src={currentUrl}
            onError={handleSourceError}
            onPlay={handlePlay}
            onPause={handlePause}
          >
            Your browser does not support the video tag.
          </video>
        )}
      </div>

      {/* Source selector + status bar — this is the visible proof of hybrid architecture */}
      <div className="px-5 py-3 bg-zinc-950 border-t border-white/10">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <div className="text-white/70 truncate">
            {title} • Playing via <span className="font-medium text-emerald-400">{currentSource.label}</span>
          </div>

          <div className="flex items-center gap-2 text-xs">
            {sources.length > 1 && (
              <div className="flex gap-1">
                {sources.map((src, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSelectedSourceIndex(idx)}
                    className={`px-2 py-0.5 rounded border text-[10px] transition flex items-center gap-1 ${
                      idx === selectedSourceIndex 
                        ? 'bg-white text-black border-white' 
                        : 'border-white/20 hover:border-white/50 text-white/60'
                    }`}
                  >
                    {src.type.toUpperCase()}
                    {src.isP2P && <span className="text-[8px] opacity-60">P2P</span>}
                    {src.recommended && <span className="text-[8px] opacity-60">★</span>}
                  </button>
                ))}
              </div>
            )}

            {isPermanentPass ? (
              <span className="text-emerald-400 font-medium ml-2">Unlocked via {accessLabel}</span>
            ) : (
              <button onClick={onWatchComplete} className="text-amber-400 hover:text-amber-300 font-medium">
                Burn ticket after watch
              </button>
            )}
          </div>
        </div>

        <div className="text-[10px] text-white/40 mt-1.5 leading-tight">
          Hybrid delivery (ADR-001): {currentSource.label}
          {currentSource.isP2P && ' • Seeding available while watching'}
          {isArweaveOnly && ' (fallback only)'}
          {isDemoMode && ' • DEMO MODE (no real CIDs — simulation sources)'}
          {sourceError && ' • Source error — auto-fallback engaged'}
        </div>

        {/* P2P Seeding — PROMINENT metrics panel (when active: full real-time stats for visibility + credits UX) */}
        {currentSource?.isP2P && (
          <div className={`mt-2 pt-2 border-t ${isSeeding ? 'border-emerald-500/40 bg-emerald-950/20' : 'border-white/10'} rounded-b px-3 py-2`}>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span className={`uppercase tracking-[1px] text-[10px] font-medium ${isSeeding ? 'text-emerald-400' : 'text-white/50'}`}>
                  P2P SEEDER {isSeeding ? '● LIVE' : '○ OFF'}
                </span>
                {isSeeding && (
                  <span className="px-1.5 py-px bg-emerald-500/20 text-emerald-400 text-[9px] rounded">EARNING CREDITS</span>
                )}
                {isDemoMode && isSeeding && (
                  <span className="px-1.5 py-px bg-amber-500/20 text-amber-400 text-[9px] rounded">DEMO METRICS</span>
                )}
              </div>
              <button
                onClick={() => seeder.toggleContribute(filmIdForSeeding)}
                disabled={!isPlaying && !isSeeding}
                className={`px-3 py-0.5 rounded-full text-[10px] border transition font-medium ${
                  isSeeding 
                    ? 'border-emerald-500 text-emerald-400 hover:bg-emerald-500/10' 
                    : 'border-white/20 hover:border-white/50 disabled:opacity-40'
                }`}
              >
                {isSeeding ? 'STOP SEEDING' : 'SEED WHILE WATCHING → EARN'}
              </button>
            </div>

            {/* Prominent live metrics grid when active — much more visible than prior tiny line */}
            {isSeeding && seeder.metrics ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-[11px] font-mono bg-black/40 rounded p-2 border border-emerald-500/30">
                <div className="text-emerald-400/90">
                  <span className="text-white/50">SERVED:</span> {(seeder.metrics.bytesServed / 1024 / 1024).toFixed(2)} MB
                </div>
                <div className="text-emerald-400/90">
                  <span className="text-white/50">PEERS:</span> {seeder.metrics.currentPeers} active / {seeder.metrics.peersServed} total
                </div>
                <div className="text-emerald-400/90">
                  <span className="text-white/50">UPTIME:</span> {Math.floor(seeder.metrics.uptimeSec / 60)}m {seeder.metrics.uptimeSec % 60}s
                </div>
                <div className="text-emerald-400/90">
                  <span className="text-white/50">RATE:</span> {seeder.metrics.avgUploadMbps.toFixed(1)} / {seeder.metrics.peakUploadMbps.toFixed(1)} Mbps
                </div>
                <div className="col-span-2 sm:col-span-4 text-[10px] text-emerald-300/70 mt-0.5 flex gap-3">
                  <span>SEGMENTS: {seeder.metrics.segmentsRelayed}</span>
                  <span>EST. CREDITS: ~{((seeder.metrics.bytesServed / (1024**3)) * 42).toFixed(1)}</span>
                  <span className="text-white/40">• Theta P2P relay (sim)</span>
                </div>
              </div>
            ) : (
              <div className="text-[10px] text-white/50">Enable to contribute bandwidth and earn platform credits in real time. (Playback required to start)</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
