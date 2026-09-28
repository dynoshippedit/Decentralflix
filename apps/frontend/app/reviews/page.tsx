'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import Reviews from '@/components/Reviews';
import { useFilmMetadata } from '@/hooks/useFilmMetadata';

function ReviewsPageInner() {
  const searchParams = useSearchParams();
  const videoHash = searchParams.get('hash') || 'ar://example-film-hash';

  // Arweave metadata title flows into the dedicated reviews surface (premium context)
  const { title, loading: metaLoading } = useFilmMetadata(videoHash);

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="border-b border-white/10">
        <div className="max-w-4xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <a href="/" className="text-white/60 hover:text-white text-sm tracking-widest">← DECENTRALFLIX</a>
            <div className="text-xl font-semibold tracking-[-1px]">Reviews</div>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <a href="/dashboard" className="text-emerald-400 hover:text-emerald-300 font-medium">Dashboard</a>
            <a href="/collection" className="text-white/60 hover:text-white">Collection</a>
            <a href="/crowdfund" className="text-white/60 hover:text-white">Crowdfund</a>
            <a href="/mint" className="text-white/60 hover:text-white">Mint</a>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-8">
      <div className="mb-8">
        <div className="flex items-baseline gap-3 mb-1">
          <h1 className="text-4xl font-semibold tracking-tight">Reviews for {title}</h1>
        </div>
        <p className="text-white/60 mt-2">
          Honest critiques from verified owners only — ticket holders and backers. 
          Your voice carries real weight because you own permanent access. This is the owner-first version of reviews.
        </p>
        <p className="text-xs text-white/40 mt-1 font-mono">
          {videoHash}
        </p>
        {metaLoading && <div className="text-[10px] text-white/40 mt-0.5">Resolving Arweave title…</div>}
      </div>

      <Reviews videoHash={videoHash} />

      <div className="mt-12 text-xs text-white/40 border-t border-white/10 pt-6">
        <strong>Note on the two-layer model:</strong><br />
        • <strong>Public Critiques</strong> (this page): Anyone can read. Only verified owners can write.<br />
        • <strong>Creator Communication</strong> (coming later): Private threads where the film creator personally selects which other creators can message them.
      </div>
      </div> {/* end padded content */}
    </div>
  );
}

export default function ReviewsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-black" />}>
      <ReviewsPageInner />
    </Suspense>
  );
}
