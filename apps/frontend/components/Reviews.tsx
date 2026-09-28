'use client';

import { useState, useEffect } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { createWalletClient, custom, createPublicClient, http } from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import { REVIEWS_ADDRESS } from '@/lib/contracts/config';
import { REVIEWS_ABI, useHasFilmAccess, getFilmAccessSources } from '@/lib/contracts';
import { hasAccessToFilm } from '@/lib/indexer'; // Preferred modern Goldsky/event-driven path (GROK.md)

interface Review {
  reviewer: string;
  rating: number;
  comment: string;
  timestamp: number;
}

interface ReviewsProps {
  videoHash: string;
  reviews?: Review[];
  onReviewSubmitted?: () => void;
  isOwner?: boolean;
  isLoading?: boolean; // for premium loading state in lists
}

export default function Reviews({ videoHash, reviews = [], onReviewSubmitted, isOwner: isOwnerProp, isLoading = false }: ReviewsProps) {
  const { authenticated, user } = usePrivy();
  const { wallets } = useWallets();

  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const connectedAddress = user?.wallet?.address;

  // Prefer the rich combined hook (MovieTicket + CrowdfundInvestment) for eligibility + sources
  const { hasAccess: hookCanReview, isLoading: accessLoading, sources: mySources } = useHasFilmAccess(
    connectedAddress as `0x${string}` | undefined,
    videoHash
  );

  // Silent modernization: prefer modern indexer for the critical review gate (per GROK.md + T05)
  const [modernCanReview, setModernCanReview] = useState<boolean | null>(null);
  useEffect(() => {
    if (!connectedAddress || !videoHash) return;
    hasAccessToFilm(connectedAddress, videoHash).then(r => {
      if (r) setModernCanReview(r.hasAccess);
    }).catch(() => {});
  }, [connectedAddress, videoHash]);

  const canReview = modernCanReview ?? hookCanReview; // prefer modern, safe fallback

  const [existingReview, setExistingReview] = useState<Review | null>(null);

  // Per-reviewer ownership badges (MovieTicket vs Crowdfund backer) for lists + previews
  const [reviewerBadges, setReviewerBadges] = useState<Record<string, string[]>>({});

  // Load existing review for the connected user (edit mode) — independent of access hook
  useEffect(() => {
    const loadExisting = async () => {
      if (!authenticated || !connectedAddress || !videoHash || !REVIEWS_ADDRESS || REVIEWS_ADDRESS === '0x0000000000000000000000000000000000000000') {
        setExistingReview(null);
        return;
      }
      try {
        const publicClient = createPublicClient({
          chain: arbitrumSepolia,
          transport: http(),
        });
        const hasReviewed = await publicClient.readContract({
          address: REVIEWS_ADDRESS,
          abi: REVIEWS_ABI,
          functionName: 'hasReviewed',
          args: [videoHash, connectedAddress as `0x${string}`],
        });
        if (hasReviewed) {
          const review = await publicClient.readContract({
            address: REVIEWS_ADDRESS,
            abi: REVIEWS_ABI,
            functionName: 'getReview',
            args: [videoHash, connectedAddress as `0x${string}`],
          });
          const r = review as any;
          setExistingReview(r as Review);
          setRating(r.rating);
          setComment(r.comment || '');
        } else {
          setExistingReview(null);
        }
      } catch (e) {
        setExistingReview(null);
      }
    };
    loadExisting();
  }, [authenticated, connectedAddress, videoHash]);

  // Compute reviewer ownership badges (MovieTicket holder vs Crowdfund backer) for every review
  // Uses the shared getFilmAccessSources util so badges are accurate and consistent with useHasFilmAccess
  useEffect(() => {
    const loadReviewerBadges = async () => {
      if (!reviews || reviews.length === 0 || !videoHash) return;
      const uniqueReviewers = Array.from(new Set(reviews.map(r => r.reviewer.toLowerCase())));
      const newMap: Record<string, string[]> = { ...reviewerBadges };
      let changed = false;
      for (const reviewer of uniqueReviewers) {
        if (!newMap[reviewer]) {
          try {
            const srcs = await getFilmAccessSources(reviewer as `0x${string}`, videoHash);
            newMap[reviewer] = srcs;
            changed = true;
          } catch {
            newMap[reviewer] = [];
          }
        }
      }
      if (changed) setReviewerBadges(newMap);
    };
    loadReviewerBadges();
  }, [reviews, videoHash]);

  const handleSubmit = async () => {
    if (!authenticated || !videoHash || !comment.trim() || !connectedAddress) {
      alert('Please connect your wallet and fill out the review.');
      return;
    }

    if (!REVIEWS_ADDRESS || REVIEWS_ADDRESS === '0x0000000000000000000000000000000000000000') {
      alert('Reviews contract not deployed yet. Please deploy first.');
      return;
    }

    if (comment.length > 500) {
      alert('Comment must be 500 characters or less.');
      return;
    }

    setSubmitting(true);

    try {
      const wallet = wallets[0];
      const provider = await wallet.getEthereumProvider();

      const walletClient = createWalletClient({
        account: connectedAddress as `0x${string}`,
        chain: arbitrumSepolia,
        transport: custom(provider),
      });

      const hash = await walletClient.writeContract({
        address: REVIEWS_ADDRESS,
        abi: REVIEWS_ABI,
        functionName: 'submitReview',
        args: [videoHash, rating, comment],
      });

      const action = existingReview ? 'updated' : 'submitted';
      alert(`Review ${action}! Tx: ${hash}`);
      setComment('');
      setRating(5);
      setExistingReview(null);

      if (onReviewSubmitted) onReviewSubmitted();
    } catch (err: any) {
      console.error(err);
      let msg = err?.message || 'Failed to submit review';
      if (msg.includes('Must own a ticket')) {
        msg = 'You must own a ticket for this film to leave a review.';
      }
      alert(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Calculate average rating for display
  const averageRating = reviews.length > 0 
    ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1) 
    : null;

  // Premium badge renderer — distinguishes ownership sources clearly
  const renderOwnerBadge = (reviewerAddr: string, compact = false) => {
    const key = reviewerAddr.toLowerCase();
    const sources = reviewerBadges[key] || [];
    const isCurrentUser = connectedAddress && key === connectedAddress.toLowerCase();

    let label = 'Verified owner';
    let icon = '★';
    let classes = 'bg-white/5 text-white/60 border-white/10';

    if (sources.includes('MovieTicket') && sources.includes('CrowdfundInvestment')) {
      label = 'MovieTicket + InvestmentNFT';
      icon = '🎟️💎';
      classes = 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
    } else if (sources.includes('MovieTicket')) {
      label = 'MovieTicket holder';
      icon = '🎟️';
      classes = 'bg-sky-500/15 text-sky-300 border-sky-500/30';
    } else if (sources.includes('CrowdfundInvestment')) {
      label = 'Crowdfund InvestmentNFT backer';
      icon = '💎';
      classes = 'bg-violet-500/15 text-violet-300 border-violet-500/30';
    }

    if (isCurrentUser) {
      label = `You • ${label}`;
      classes = 'bg-emerald-500/20 text-emerald-400 border-emerald-400/40';
    }

    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-medium border ${classes} ${compact ? 'scale-90' : ''}`}
        title={sources.length ? `Verified via: ${sources.join(' + ')}` : 'Verified owner'}
      >
        {icon} {label}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <h3 className="text-xl font-semibold tracking-tight">Verified Owner Reviews</h3>
          {(isOwnerProp || mySources.length > 0) && (
            <span className="text-[10px] px-2.5 py-0.5 bg-emerald-500/20 text-emerald-400 rounded-full border border-emerald-500/30">
              You own this film — your voice carries real weight here
            </span>
          )}
        </div>
        {averageRating && (
          <div className="text-sm text-yellow-400 mb-2 flex items-center gap-2">
            Average: {averageRating} ★ <span className="text-white/40">({reviews.length} verified reviews)</span>
          </div>
        )}
        <p className="text-sm text-white/60 mb-4 leading-relaxed">
          Only verified owners — MovieTicket holders — can leave public critiques. 
          Because you own this film on-chain, your voice carries real weight. This is the decentralized, owner-first version of reviews.
        </p>

        {existingReview && (
          <div className="mb-3 text-xs text-emerald-400 bg-emerald-500/5 border border-emerald-500/20 rounded-lg px-3 py-1.5">
            You already left a review. Edit it below — your voice carries real weight because you own it on-chain; your words stay anchored to your on-chain proof.
          </div>
        )}
      </div>

      {/* Unified recent reviews previews (with owner type badges) */}
      {reviews.length > 0 && (
        <div className="mb-6">
          <div className="text-xs font-medium text-white/70 mb-2 tracking-wide">Recent verified owner reviews</div>
          {reviews.slice(0, 3).map((r, i) => (
            <div key={i} className="p-3.5 bg-zinc-950 border border-white/5 rounded-xl mb-2 text-sm">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex gap-1 text-yellow-400 text-xs">
                  {Array.from({ length: r.rating }).map((_, j) => <span key={j}>★</span>)}
                </div>
                {renderOwnerBadge(r.reviewer, true)}
              </div>
              <div className="italic text-white/85 leading-snug">“{r.comment.length > 115 ? r.comment.substring(0, 112) + '...' : r.comment}”</div>
              <div className="text-[10px] text-white/40 mt-2 flex items-center gap-1.5 font-mono">
                {r.reviewer.slice(0,6)}...{r.reviewer.slice(-4)}
              </div>
            </div>
          ))}
          {reviews.length > 3 && (
            <a href={`/reviews?hash=${videoHash}`} className="text-xs text-emerald-400 hover:underline">See all {reviews.length} verified reviews →</a>
          )}
        </div>
      )}

      {/* Submit Review - premium gated messaging */}
      {accessLoading && authenticated && (
        <div className="p-4 bg-zinc-900 border border-white/10 rounded-xl text-sm text-white/60 italic">
          Verifying your on-chain ownership… Your voice carries real weight because you own it.
        </div>
      )}

      {!accessLoading && !canReview && authenticated && (
        <div className="p-5 bg-zinc-900 border border-white/10 rounded-2xl text-sm">
          <div className="font-medium text-white/80 mb-1">Ownership required to participate</div>
          <div className="text-white/70 leading-snug">
            You must hold a MovieTicket for this film.<br />
            Your on-chain stake is what gives your voice authenticity and permanence here — your voice carries real weight because you own it.
          </div>
          <div className="mt-3 text-xs">
            <a href="/mint" className="text-emerald-400 hover:underline">Mint a ticket</a> <span className="text-white/40 mx-1">·</span> 
            
          </div>
        </div>
      )}

      {canReview && (
        <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6">
          <div className="uppercase tracking-[1px] text-[10px] text-emerald-400/70 mb-2 font-medium">Your verified owner review</div>

          <div className="flex gap-2 mb-4">
            {[1,2,3,4,5].map((n) => (
              <button
                key={n}
                onClick={() => setRating(n)}
                className={`text-2xl transition active:scale-90 ${rating >= n ? 'text-yellow-400' : 'text-white/30 hover:text-white/50'}`}
              >
                ★
              </button>
            ))}
          </div>

          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="As a verified owner, what stayed with you? Your voice carries real weight because you own it on-chain. Your honest perspective stays tied to your stake. (max 500 characters)"
            maxLength={500}
            className="w-full h-24 bg-black border border-white/20 rounded-xl p-4 text-sm resize-none mb-1 placeholder:text-white/40 focus:border-white/40 transition"
          />
          <div className="text-right text-[10px] text-white/40 mb-3 tabular-nums">
            {comment.length}/500
          </div>

          <button
            onClick={handleSubmit}
            disabled={submitting || !comment.trim()}
            className="px-7 py-2.5 bg-white text-black rounded-full text-sm font-medium disabled:opacity-50 hover:bg-white/90 active:bg-white/80 transition disabled:cursor-not-allowed"
          >
            {submitting 
              ? 'Anchoring to chain…' 
              : existingReview 
                ? 'Update Your Review' 
                : 'Submit Review as Verified Owner'
            }
          </button>

          <div className="text-[10px] text-emerald-400/80 mt-3 leading-relaxed">
            Your voice carries real weight because you own it on-chain. Your review stays published for everyone who cares about the work. 
            Edit anytime — your voice is inseparable from your ownership.
          </div>
        </div>
      )}

      {/* Full Reviews List — with beautiful owner badges + loading state */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="rounded-2xl border border-white/10 bg-zinc-950/60 p-6 text-center text-sm text-white/60">
            Curating verified owner voices from the chain… Your perspective joins a verifiable on-chain record.
          </div>
        ) : reviews.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-zinc-950/60 p-6 text-center">
            <div className="text-2xl mb-2">🎟️💎</div>
            <div className="font-medium text-white/80 mb-1">No verified reviews yet</div>
            <div className="text-sm text-white/60 max-w-xs mx-auto leading-snug">
              Be the first verified owner to share what this film meant to you. Your voice carries real weight because you own it on-chain — your words stay published here, tied to your on-chain proof of ownership.
            </div>
          </div>
        ) : (
          reviews.map((review, index) => (
            <div key={index} className="bg-zinc-900 border border-white/10 rounded-2xl p-5">
              <div className="flex items-start justify-between mb-2 gap-3">
                <div className="flex gap-1 text-yellow-400 text-sm pt-0.5">
                  {Array.from({ length: review.rating }).map((_, i) => <span key={i}>★</span>)}
                </div>
                <div className="text-xs text-white/40 font-mono tabular-nums flex-shrink-0">
                  {new Date(review.timestamp * 1000).toLocaleDateString()}
                </div>
              </div>
              <p className="text-[15px] leading-snug text-white/90 mb-4">{review.comment}</p>

              <div className="flex items-center justify-between text-[10px] text-white/50 font-mono">
                <div>{review.reviewer.slice(0, 6)}...{review.reviewer.slice(-4)}</div>
                {renderOwnerBadge(review.reviewer)}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
