'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useVideoAccess } from '@/hooks/useVideoAccess';
import VideoPlayer from '@/components/VideoPlayer';
import { getDemoFilm } from '@/lib/demo-content';

export default function WatchPage() {
  const params = useParams();
  const router = useRouter();
  const filmHash = params.hash as string;
  const { hasAccess, loading, signedUrl, needsMint, mintUrl, error } = useVideoAccess(filmHash);
  const demoFilm = getDemoFilm(filmHash);
  const title = demoFilm?.title ?? filmHash;

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white/50 text-sm tracking-widest">VERIFYING ACCESS</p>
        </div>
      </div>
    );
  }

  // No access — needs purchase
  if (needsMint || !hasAccess) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center px-6">
        <div className="max-w-md w-full text-center">
          <div className="text-6xl mb-6">🔒</div>
          <h1 className="text-3xl font-semibold tracking-tight mb-3">{title}</h1>
          <p className="text-white/50 mb-8 leading-relaxed">
            Get permanent access to watch this film. One-time purchase — own it forever. No subscriptions.
          </p>
          {demoFilm && (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-5 mb-8 text-left">
              <div className="text-xs text-white/40 tracking-widest mb-3">PERMANENT ACCESS</div>
              <div className="flex justify-between items-center">
                <div>
                  <div className="font-semibold">{title}</div>
                  <div className="text-white/50 text-sm">{demoFilm.genre} · {demoFilm.duration}</div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-semibold">{demoFilm.price} ETH</div>
                  <div className="text-white/40 text-xs">one time</div>
                </div>
              </div>
            </div>
          )}
          <div className="flex flex-col gap-3">
            <Link
              href={mintUrl || `/mint?film=${encodeURIComponent(filmHash)}`}
              className="px-8 py-4 bg-white text-black font-semibold rounded-full hover:bg-white/90 transition text-center"
            >
              Get Permanent Access
            </Link>
            <button
              onClick={() => router.back()}
              className="px-8 py-3 border border-white/20 rounded-full text-white/60 hover:text-white transition text-sm"
            >
              Go Back
            </button>
          </div>
          {error && (
            <p className="mt-4 text-red-400 text-xs">{error}</p>
          )}
        </div>
      </div>
    );
  }

  // Has access — show player
  return (
    <div className="min-h-screen bg-black text-white">

      {/* Player */}
      <div className="bg-black pt-4">
        <div className="max-w-5xl mx-auto">
          <VideoPlayer
            videoHash={filmHash}
            livepeerPlaybackId={signedUrl ?? undefined}
            title={title}
            isPermanentPass
            accessSources={['cloudflare']}
          />
        </div>
      </div>

      {/* Film info */}
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight mb-1">{title}</h1>
            {demoFilm && (
              <div className="text-white/40 text-sm">{demoFilm.genre} · {demoFilm.duration} · {demoFilm.releaseYear}</div>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 rounded-full">
              You own this
            </div>
          </div>
        </div>

        {demoFilm?.description && (
          <p className="text-white/60 leading-relaxed mb-8 max-w-2xl">{demoFilm.description}</p>
        )}

        {demoFilm?.isDeplatformed && (
          <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl">
            <div className="text-amber-400 font-semibold text-sm mb-1">Removed from other platforms</div>
            <p className="text-amber-200/60 text-sm">{demoFilm.deplatformedReason}</p>
            <p className="text-amber-200/40 text-xs mt-2">This content lives permanently on DecentralFlix. It cannot be removed.</p>
          </div>
        )}

        {/* Censorship proof */}
        <div className="border border-white/10 rounded-2xl p-5 bg-white/[0.02] mb-6">
          <div className="text-xs text-white/30 tracking-widest mb-3">CENSORSHIP PROOF</div>
          <div className="space-y-2 font-mono text-xs text-white/50">
            <div className="flex gap-3">
              <span className="text-white/30 w-20 shrink-0">Film ID</span>
              <span className="break-all">{filmHash}</span>
            </div>
            {demoFilm && (
              <>
                <div className="flex gap-3">
                  <span className="text-white/30 w-20 shrink-0">IPFS CID</span>
                  <span className="break-all">{demoFilm.filecoinCid}</span>
                </div>
                <div className="flex gap-3">
                  <span className="text-white/30 w-20 shrink-0">Arweave</span>
                  <span className="break-all">{demoFilm.arweaveMetaTxId}</span>
                </div>
              </>
            )}
          </div>
          <p className="text-white/30 text-xs mt-3">
            This film is permanently stored on Filecoin/IPFS and Arweave. No corporation or government can remove it.
          </p>
        </div>

        <div className="flex gap-3 flex-wrap">
          <Link href={`/film/${filmHash}`} className="text-sm text-white/50 hover:text-white border border-white/20 px-4 py-2 rounded-full transition">
            Film Details & Reviews
          </Link>
          <Link href="/catalog" className="text-sm text-white/50 hover:text-white border border-white/20 px-4 py-2 rounded-full transition">
            Browse More Films
          </Link>
        </div>
      </div>
    </div>
  );
}
