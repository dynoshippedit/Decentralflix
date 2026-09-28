'use client';

import { useParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import Link from 'next/link';
import Reviews from '@/components/Reviews';
import VideoPlayer from '@/components/VideoPlayer';
import { useReviews, useHasFilmAccess } from '@/lib/contracts';
import { hasAccessToFilm } from '@/lib/indexer'; // Preferred modern path (Goldsky/event-driven, per GROK.md)
import { useFilmMetadata } from '@/hooks/useFilmMetadata';
import { getDemoFilm } from '@/lib/demo-content';

export default function FilmDetailPage() {
  const params = useParams();
  const videoHash = params.hash as string;
  const { authenticated, user } = usePrivy();
  const connectedAddress = user?.wallet?.address;
  const demoFilm = getDemoFilm(videoHash);

  const { reviews, reviewCount, isLoading } = useReviews(videoHash);
  const { hasAccess: isOwner, isLoading: accessLoading, sources } = useHasFilmAccess(
    connectedAddress as `0x${string}` | undefined,
    videoHash
  );

  // Prefer modern indexer (Goldsky + event-driven) when available — silent hardening toward GROK.md requirement
  // Falls back cleanly to legacy hook result.
  const [modernHasAccess, setModernHasAccess] = useState<boolean | null>(null);
  useEffect(() => {
    if (!connectedAddress || !videoHash) return;
    hasAccessToFilm(connectedAddress, videoHash).then(result => {
      if (result) setModernHasAccess(result.hasAccess);
    }).catch(() => {});
  }, [connectedAddress, videoHash]);

  const hasAccessFinal = modernHasAccess ?? isOwner;
  const avgRating = reviewCount > 0
    ? (reviews.reduce((sum, r: any) => sum + r.rating, 0) / reviewCount).toFixed(1)
    : '—';
  const { title: arweaveTitle, description: arweaveDesc, loading: metaLoading } = useFilmMetadata(videoHash);
  const title = demoFilm?.title ?? (metaLoading ? 'Loading...' : arweaveTitle);
  const description = demoFilm?.description ?? arweaveDesc;

  const tierPrices = demoFilm
    ? [
        { tier: 'Standard', price: demoFilm.price, desc: 'Watch forever' },
        { tier: 'Premium', price: (parseFloat(demoFilm.price) * 2.5).toFixed(3), desc: 'Watch + extras' },
        { tier: 'Producer', price: (parseFloat(demoFilm.price) * 10).toFixed(3), desc: 'Watch + producer credit' },
      ]
    : [];

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-4xl mx-auto px-6 py-12">

        {/* Deplatformed banner */}
        {demoFilm?.isDeplatformed && (
          <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl">
            <div className="text-amber-400 font-semibold text-sm mb-1">
              Removed from other platforms — permanent here
            </div>
            <p className="text-amber-200/60 text-sm">{demoFilm.deplatformedReason}</p>
          </div>
        )}

        {/* Film header */}
        <div className="mb-8">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              {demoFilm && (
                <div className="text-white/40 text-sm mb-1">
                  {demoFilm.genre} · {demoFilm.duration} · {demoFilm.releaseYear}
                </div>
              )}
              <h1 className="text-4xl font-semibold tracking-tight mb-2">{title}</h1>
              {description && (
                <p className="text-white/60 leading-relaxed max-w-2xl">{description}</p>
              )}
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <div className="flex items-center gap-1.5 text-yellow-400">
                <span className="text-xl">★</span>
                <span className="text-xl font-semibold text-white">{avgRating}</span>
                <span className="text-white/40 text-sm">({reviewCount})</span>
              </div>
              {demoFilm && (
                <div className="text-white/40 text-xs">{demoFilm.ownerCount.toLocaleString()} owners</div>
              )}
            </div>
          </div>
        </div>

        {/* Ownership banner */}
        {hasAccessFinal && authenticated && (
          <div className="mb-8 p-5 bg-emerald-500/10 border border-emerald-500/40 rounded-2xl flex items-center justify-between gap-4">
            <div>
              <div className="font-semibold text-emerald-400 text-lg tracking-tight">You own this film</div>
              <div className="text-sm text-white/70 mt-1">
                Your ownership is verified permanently. Only owners can leave reviews.
              </div>
            </div>
            <Link
              href={`/watch/${encodeURIComponent(videoHash)}`}
              className="shrink-0 px-6 py-3 bg-white text-black font-semibold rounded-full hover:bg-white/90 transition text-sm"
            >
              Watch Now
            </Link>
          </div>
        )}

        {/* Access / pricing for non-owners */}
        {!hasAccessFinal && !accessLoading && (
          <div className="mb-8">
            <div className="text-xs text-white/40 tracking-widest mb-4">GET PERMANENT ACCESS</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
              {tierPrices.map(t => (
                <Link
                  key={t.tier}
                  href={`/mint?film=${encodeURIComponent(videoHash)}`}
                  className="group p-5 bg-white/5 border border-white/10 hover:border-white/30 rounded-2xl transition text-center"
                >
                  <div className="font-semibold mb-1 group-hover:text-white">{t.tier}</div>
                  <div className="text-white/40 text-xs mb-3">{t.desc}</div>
                  <div className="text-xl font-semibold">{t.price} ETH</div>
                  <div className="text-white/30 text-xs mt-1">once, forever</div>
                </Link>
              ))}
            </div>
            {!tierPrices.length && (
              <Link
                href={`/mint?film=${encodeURIComponent(videoHash)}`}
                className="block w-full py-4 bg-white text-black font-semibold rounded-full hover:bg-white/90 transition text-center"
              >
                Get Permanent Access
              </Link>
            )}
          </div>
        )}

        {/* Video player (for owners) */}
        {hasAccessFinal && (
          <div className="mb-12">
            <VideoPlayer
              videoHash={videoHash}
              filecoinCID={demoFilm?.filecoinCid}
              livepeerPlaybackId={videoHash.length > 10 ? 'demo-' + videoHash.slice(0, 12) : undefined}
              title={title}
              isPermanentPass
              accessSources={sources}
            />
          </div>
        )}

        {/* Reviews */}
        <div className="mb-12">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Verified Owner Reviews</h2>
              <p className="text-white/40 text-sm mt-1">Only people who own this film can write reviews.</p>
            </div>
            <div className="text-yellow-400 text-sm">★ {avgRating} · {reviewCount} reviews</div>
          </div>
          <Reviews
            videoHash={videoHash}
            isOwner={isOwner && authenticated}
            isLoading={isLoading}
            reviews={reviews}
            onReviewSubmitted={() => {}}
          />
        </div>

        {/* Censorship proof */}
        <div className="border border-white/10 rounded-2xl p-6 bg-white/[0.02]">
          <div className="text-xs text-white/30 tracking-widest mb-4">CENSORSHIP PROOF</div>
          <div className="space-y-2 font-mono text-xs text-white/40">
            <div className="flex gap-3 flex-wrap">
              <span className="text-white/20 w-24 shrink-0">Film ID</span>
              <span className="break-all">{videoHash}</span>
            </div>
            {demoFilm && (
              <>
                <div className="flex gap-3 flex-wrap">
                  <span className="text-white/20 w-24 shrink-0">IPFS CID</span>
                  <span className="break-all">{demoFilm.filecoinCid}</span>
                </div>
                <div className="flex gap-3 flex-wrap">
                  <span className="text-white/20 w-24 shrink-0">Arweave</span>
                  <span className="break-all">{demoFilm.arweaveMetaTxId}</span>
                </div>
              </>
            )}
          </div>
          <p className="text-white/25 text-xs mt-4">
            This film is stored on Filecoin/IPFS and Arweave. No corporation or government can remove it.
          </p>
        </div>

        {/* Nav */}
        <div className="mt-8 flex gap-3 flex-wrap">
          <Link href="/catalog" className="text-sm text-white/40 hover:text-white border border-white/10 px-4 py-2 rounded-full transition">
            ← All Films
          </Link>
          {isOwner && (
            <Link href={`/watch/${encodeURIComponent(videoHash)}`} className="text-sm text-white/40 hover:text-white border border-white/10 px-4 py-2 rounded-full transition">
              Watch →
            </Link>
          )}
          <Link href="/collection" className="text-sm text-white/40 hover:text-white border border-white/10 px-4 py-2 rounded-full transition">
            My Collection
          </Link>
        </div>
      </div>
    </div>
  );
}
