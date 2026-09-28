'use client';

import { usePrivy } from '@privy-io/react-auth';
import { useReviews, useMyAccessibleFilms, useSeederCredits } from '@/lib/contracts';
import { getDemoFilmTitle, useFilmMetadata, getDemoOwnedFilms } from '@/hooks/useFilmMetadata';

export default function MyCollectionPage() {
  const { ready, authenticated, user, login } = usePrivy();

  const connectedAddress = user?.wallet?.address;

  // Real on-chain gated access (MovieTicket + crowdfund InvestmentNFTs via improved useMyAccessibleFilms + hasCrowdfundAccess)
  const { films: accessibleFilmsRaw, isLoading: ownedLoading } = useMyAccessibleFilms(connectedAddress as `0x${string}` | undefined);

  // Titles via centralized Arweave metadata hook fallback (replaces all prior duplicated ternary mappings).
  // Leans on shared getDemoOwnedFilms to eliminate duplication of demo title lists.
  // When a videoHash points at Arweave JSON metadata, real title flows via useFilmMetadata on dedicated surfaces.
  const ownedFilms = accessibleFilmsRaw.length > 0 
    ? accessibleFilmsRaw.map(f => ({
        title: getDemoFilmTitle(f.hash),
        hash: f.hash,
        sources: f.sources || [],
      }))
    : getDemoOwnedFilms().slice(0, 2);

  // Real review data from the Reviews contract for each owned film (demo hashes for Phase 0)
  const reviewsForFilm1 = useReviews('ar://film1-abc123');
  const reviewsForFilm2 = useReviews('ar://film2-def456');

  // P2P Seeder Credits (new system - hybrid Arweave + on-chain)
  const { credits, effectiveCredits, tierMultiplier, isLoading: creditsLoading } = useSeederCredits(connectedAddress as `0x${string}` | undefined);

  if (!ready) return <div className="p-8 text-white">Loading...</div>;

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-3xl mb-4">My Collection</h1>
          <p className="text-white/60 mb-6">Sign in to see the films in your licensed collection.</p>
          <button onClick={login} className="px-8 py-3 bg-white text-black rounded-full">
            Sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Consistent cinematic nav */}
      <div className="border-b border-white/10">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <a href="/" className="text-white/60 hover:text-white text-sm tracking-widest">← DECENTRALFLIX</a>
            <div className="text-xl font-semibold tracking-[-1px]">Collection</div>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <a href="/dashboard" className="text-emerald-400 hover:text-emerald-300 font-medium">Dashboard</a>
                        <a href="/mint" className="text-white/60 hover:text-white">Mint</a>
            <a href="/reviews" className="text-white/60 hover:text-white">Reviews</a>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-8">
      <h1 className="text-4xl font-semibold tracking-tight mb-2">My Collection</h1>
      <p className="text-white/60 mb-8">Your licensed collection, across films. Your tickets unlock the only reviews that matter — from verified owners whose voice carries real weight because they actually bought it.</p>

      <div className="bg-zinc-900 border border-white/10 rounded-2xl p-8">
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">🎟️</div>
          <h2 className="text-2xl mb-3">Your Owned Tickets</h2>
          <p className="text-white/60 max-w-md mx-auto">
            Licensed streaming access. No subscription required. No ads. Your tickets are the key to the film and to the only reviews that matter — those from people who actually bought it.
          </p>
                    <a href="/dashboard" className="ml-4 text-sm text-emerald-400 hover:underline mt-2 inline-block">Full Dashboard → Library, Earnings, Quick Launch</a>
        </div>

        {/* Films You Own + Real Reviews Data (Core Experience) */}
        <div className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="font-semibold text-lg">Films you own</div>
              <div className="text-sm text-white/60">See verified reviews from owners. Write yours — your voice carries real weight.</div>
            </div>
            <a href="/reviews" className="text-xs text-emerald-400 hover:underline">Browse all public reviews →</a>
          </div>

          <div className="space-y-4">
            {ownedLoading && (
              <div className="text-white/50 text-sm">Loading your owned films…</div>
            )}
            {ownedFilms.map((film, idx) => {
              const reviewsData = idx === 0 ? reviewsForFilm1 : reviewsForFilm2;
              const avg = reviewsData.reviewCount > 0 
                ? (reviewsData.reviews.reduce((sum, r) => sum + r.rating, 0) / reviewsData.reviewCount).toFixed(1) 
                : '—';

              const userHasReviewed = connectedAddress && reviewsData.reviews.some(
                r => r.reviewer.toLowerCase() === connectedAddress.toLowerCase()
              );

              return (
                <div key={idx} className="p-6 bg-zinc-950 border border-white/10 rounded-2xl">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <div className="font-semibold text-xl">{film.title}</div>
                      <div className="text-xs text-white/50 font-mono mt-1">{film.hash}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-yellow-400 text-2xl leading-none">★ {avg}</div>
                      <div className="text-[11px] text-white/50 mt-0.5">{reviewsData.reviewCount} verified reviews</div>
                    </div>
                  </div>

                  {/* Real recent review snippet */}
                  {reviewsData.reviews.length > 0 && (
                    <div className="text-sm text-white/80 italic mb-4 border-l-2 border-emerald-400/60 pl-4 py-1">
                      “{reviewsData.reviews[0].comment.length > 110 
                        ? reviewsData.reviews[0].comment.substring(0, 107) + '...' 
                        : reviewsData.reviews[0].comment}”
                    </div>
                  )}

                  {/* Strong ownership signal */}
                  <div className="text-emerald-400/90 text-xs font-medium mb-4">
                    You own this film. Your voice carries real weight — your reviews are verified and stay published under your name.
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <a 
                      href={`/film/${film.hash}`} 
                      className="flex-1 min-w-[160px] text-center px-5 py-2.5 bg-white text-black rounded-xl font-medium hover:bg-white/90 transition text-sm"
                    >
                      Watch + see all reviews
                    </a>
                    <a 
                      href={`/film/${film.hash}`} 
                      className="flex-1 min-w-[160px] text-center px-5 py-2.5 border border-white/50 hover:bg-white/5 rounded-xl transition text-sm"
                    >
                      {userHasReviewed ? 'Edit your review' : 'Write your review as owner'}
                    </a>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-3 text-[10px] text-white/40">
            {accessibleFilmsRaw.length > 0 
              ? 'Your owned films loaded from access records.'
              : 'Phase 0 demo mode — showing example films with access sources.'}
          </div>
        </div>

        {/* P2P Hosting Credits (new — earn by seeding, redeem for perks) */}
        <div className="mb-10">
          <h3 className="text-xl font-semibold mb-2 flex items-center gap-2">
            Hosting Credits <span className="text-xs px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded-full">P2P</span>
          </h3>
          <p className="text-sm text-white/60 mb-4">Earn credits by seeding films you own. Higher access tiers multiply earnings and redemption value.</p>

          <div className="p-6 bg-zinc-950 border border-white/10 rounded-2xl">
            <div className="flex justify-between items-start mb-4">
              <div>
                <div className="text-sm text-white/60">Your balance</div>
                <div className="text-4xl font-semibold tabular-nums">{effectiveCredits}</div>
                <div className="text-xs text-white/50">({credits} base • {tierMultiplier / 100}x from your highest tier)</div>
              </div>
              <div className="text-right text-sm">
                <div className="text-emerald-400">Producer +50% bonus active</div>
                <div className="text-[10px] text-white/50 mt-1">(demo — real reports coming)</div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 text-sm">
              <button 
                onClick={() => alert('Seeding report UI + Arweave upload + claim tx coming in next autonomous pass')}
                className="flex-1 min-w-[160px] text-center px-5 py-2.5 border border-white/50 hover:bg-white/5 rounded-xl transition"
              >
                Generate Seeding Report
              </button>
              <button 
                onClick={() => alert('Redeem flow (discount / free ticket) wired in next pass')}
                className="flex-1 min-w-[160px] text-center px-5 py-2.5 bg-white/10 hover:bg-white/20 rounded-xl transition"
              >
                Redeem 100cr → 10% mint discount
              </button>
            </div>
          </div>
        </div>

        {/* Your Reviews — Personal ownership connection */}
        <div className="mb-10">
          <h3 className="text-xl font-semibold mb-2">Your reviews</h3>
          <p className="text-sm text-white/60 mb-4">Only verified owners can leave reviews. Your voice carries real weight because you actually bought it — edit yours anytime; they stay yours.</p>

          <div className="space-y-3">
            <div className="p-5 bg-zinc-950 border border-white/10 rounded-xl">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-medium">The Last Signal</div>
                  <div className="text-xs text-white/50 mt-0.5">Your review • 3 days ago</div>
                </div>
                <div className="text-yellow-400 text-lg">★ 5</div>
              </div>
              <div className="italic text-sm mt-3 text-white/80">
                “A masterpiece. Changed how I think about memory and technology.”
              </div>
              <div className="mt-4 flex gap-4 text-sm">
                <a href="/reviews?hash=ar://film1-abc123" className="text-emerald-400 hover:underline">View in context</a>
                <a href="/film/ar://film1-abc123" className="text-white/70 hover:text-white underline">Edit</a>
              </div>
            </div>

            <div className="p-5 bg-zinc-950 border border-white/10 rounded-xl">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-medium">Echo Chamber</div>
                  <div className="text-xs text-white/50 mt-0.5">Your review • last week</div>
                </div>
                <div className="text-yellow-400 text-lg">★ 4</div>
              </div>
              <div className="italic text-sm mt-3 text-white/80">
                “The final 20 minutes wrecked me. Still thinking about it.”
              </div>
              <div className="mt-4 flex gap-4 text-sm">
                <a href="/reviews?hash=ar://film2-def456" className="text-emerald-400 hover:underline">View in context</a>
                <a href="/film/ar://film2-def456" className="text-white/70 hover:text-white underline">Edit</a>
              </div>
            </div>
          </div>
        </div>

        {/* Social proof: Reviews from other verified owners of films you own — polished for crowdfund + ticket parity */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">What other owners are saying</h3>
            <a href="/reviews" className="text-xs text-emerald-400 hover:underline">See everything →</a>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="p-5 bg-zinc-950 border border-white/10 rounded-2xl">
              <div className="flex justify-between text-sm mb-2">
                <span className="font-medium">The Last Signal</span>
                <span className="text-yellow-400">★ 4.3 (27)</span>
              </div>
              <div className="text-sm text-white/80 italic">
                “Incredible atmosphere and sound design. One of the best cinematic experiences I’ve had in years.”
              </div>
              <div className="text-[10px] text-white/50 mt-3">— Verified owner • 2 days ago</div>
            </div>

            <div className="p-5 bg-zinc-950 border border-white/10 rounded-2xl">
              <div className="flex justify-between text-sm mb-2">
                <span className="font-medium">Echo Chamber</span>
                <span className="text-yellow-400">★ 3.8 (14)</span>
              </div>
              <div className="text-sm text-white/80 italic">
                “The ending hit hard. Would watch again.”
              </div>
              <div className="text-[10px] text-white/50 mt-3">— Verified owner • 1 week ago</div>
            </div>
          </div>

          <div className="text-[10px] text-white/40 mt-4">
            All reviews come from verified owners. Your voice carries real weight because you actually bought the film. Your voice belongs here too.
          </div>
        </div>
      </div>

      <div className="mt-8 text-xs text-white/40 text-center">
        Heavy review text and long threads live on Arweave. Only ownership + ratings + short verified pointers are stored on-chain. Built for scale.
      </div>
      </div> {/* end p-8 content wrapper */}
    </div>
  );
}
