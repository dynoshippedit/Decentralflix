'use client';

import Link from 'next/link';

interface FilmCardProps {
  videoHash: string;
  title: string;
  averageRating?: number;
  reviewCount?: number;
  recentReview?: string; // optional snippet for discoverability
  arweaveHash?: string;
  className?: string;
}

export default function FilmCard({
  videoHash,
  title,
  averageRating,
  reviewCount = 0,
  recentReview,
  arweaveHash,
  className = '',
}: FilmCardProps) {
  const displayRating = averageRating ? averageRating.toFixed(1) : '—';
  const hasReviews = reviewCount > 0;

  return (
    <div className={`group relative aspect-video bg-zinc-950 border border-white/10 rounded-xl overflow-hidden flex flex-col ${className}`}>
      {/* Visual placeholder */}
      <div className="flex-1 bg-gradient-to-br from-zinc-900 to-black flex items-center justify-center relative">
        <div className="text-center">
          <div className="text-white/30 text-sm tracking-widest">FILM</div>
          <div className="text-white/50 text-xs mt-1 font-mono truncate max-w-[180px]">{videoHash.slice(0, 12)}...</div>
        </div>

        {/* Hover overlay with actions */}
        <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-3">
          <Link
            href={`/film/${videoHash}`}
            className="px-4 py-2 text-sm bg-white text-black rounded-full hover:bg-white/90 transition"
          >
            View Film &amp; Reviews
          </Link>
          <Link
            href={`/reviews?hash=${videoHash}`}
            className="px-4 py-2 text-sm border border-white/70 hover:bg-white/10 rounded-full transition"
          >
            Reviews
          </Link>
        </div>
      </div>

      {/* Info bar */}
      <div className="p-3 bg-zinc-950 border-t border-white/10 flex items-center justify-between text-sm">
        <div className="font-medium truncate pr-2">{title}</div>

        <div className="flex items-center gap-1 text-xs text-white/70 flex-shrink-0">
          {hasReviews ? (
            <>
              <span className="text-yellow-400">★</span>
              <span>{displayRating}</span>
              <span className="text-white/40">({reviewCount})</span>
            </>
          ) : (
            <span className="text-white/40">No reviews yet</span>
          )}
        </div>
      </div>

      {/* Recent review snippet for discoverability (optional) */}
      {recentReview && (
        <div className="px-3 pb-3 text-[10px] text-white/50 italic border-t border-white/5">
          “{recentReview.length > 80 ? recentReview.substring(0, 77) + '...' : recentReview}”
        </div>
      )}
    </div>
  );
}
