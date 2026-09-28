import Link from 'next/link';
import { DEMO_FILMS, DEMO_GENRES } from '@/lib/demo-content';
import { getFilmCatalog } from '@/lib/indexer';
import DemoFilmGrid from './DemoFilmGrid';

export default async function HomePage() {
  // Try real catalog; fall back to demo films
  let films = await getFilmCatalog({ limit: 8 }).catch(() => null);
  if (!films || films.length === 0) {
    films = DEMO_FILMS.map(f => ({
      filmHash: f.filmHash,
      title: f.title,
      creator: f.creator,
      price: BigInt(f.priceWei),
      tier: f.tier as 'BASIC' | 'DELUXE' | 'PRODUCER',
      genre: f.genre,
      isDeplatformed: f.isDeplatformed,
      thumbnailUrl: f.thumbnailUrl,
    }));
  }

  const featured = films.slice(0, 4);
  const topReviewed = [...DEMO_FILMS].sort((a, b) => b.averageRating - a.averageRating).slice(0, 4);

  return (
    <div className="min-h-screen bg-black text-white">

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="relative min-h-[100dvh] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/70 to-black z-10" />
        <div className="absolute inset-0 bg-[radial-gradient(#1a1a1a_1px,transparent_1px)] bg-[length:4px_4px] opacity-60" />

        <div className="relative z-20 text-center px-6 max-w-5xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 mb-6 text-xs tracking-[3px] border border-white/20 rounded-full text-white/60">
            CENSORSHIP-RESISTANT · PERMANENT ACCESS · 70% TO CREATORS
          </div>

          <h1 className="text-6xl md:text-8xl font-semibold tracking-[-4px] leading-[0.92] mb-6">
            Own Your Cinema.<br />
            <span className="text-white/50">Forever.</span>
          </h1>

          <p className="text-xl md:text-2xl text-white/60 tracking-tight max-w-2xl mx-auto mb-10 leading-snug">
            Watch exclusive films from independent creators.
            One-time purchase. No subscriptions. No bans.
            Your access is permanent and cannot be taken away.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
            <Link
              href="/catalog"
              className="px-8 py-4 bg-white text-black text-lg font-semibold rounded-full hover:bg-white/90 transition-all active:scale-[0.98]"
            >
              Browse Films
            </Link>
            <Link
              href="/mint"
              className="px-8 py-4 text-lg font-medium border border-white/40 hover:bg-white/10 rounded-full transition-all"
            >
              Get Permanent Access
            </Link>
            <Link
              href="/upload"
              className="px-8 py-4 text-lg font-medium border border-white/20 hover:bg-white/10 rounded-full transition-all text-white/70"
            >
              Upload Your Film
            </Link>
          </div>

          <p className="mt-10 text-xs text-white/30 tracking-[3px]">
            ARBITRUM · CLOUDFLARE R2 · FILECOIN · LIVEPEER · PRIVY
          </p>
        </div>

        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-2 text-[10px] tracking-[4px] text-white/30">
          SCROLL
          <div className="w-px h-10 bg-white/20" />
        </div>
      </section>

      {/* ── Stats bar ──────────────────────────────────────────────────── */}
      <div className="border-y border-white/10 py-4 bg-white/[0.02]">
        <div className="max-w-6xl mx-auto px-6 flex flex-wrap justify-center gap-x-12 gap-y-3 text-xs text-white/40 tracking-widest">
          <span>70% CREATOR PAYOUT — INSTANT</span>
          <span>NO CENTRAL AUTHORITY</span>
          <span>BUY ONCE, OWN FOREVER</span>
          <span>2M+ CONCURRENT VIEWER CAPACITY</span>
        </div>
      </div>

      {/* ── Featured films ─────────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-6 py-20">
        <div className="flex items-end justify-between mb-8">
          <div>
            <div className="text-red-500 text-xs tracking-[3px] mb-1">FEATURED</div>
            <h2 className="text-4xl font-semibold tracking-[-2px]">Now Playing</h2>
          </div>
          <Link href="/catalog" className="text-sm text-white/50 hover:text-white transition">
            Browse all →
          </Link>
        </div>
        <DemoFilmGrid films={featured} />
      </section>

      {/* ── Deplatformed / censorship-resistant ────────────────────────── */}
      {DEMO_FILMS.some(f => f.isDeplatformed) && (
        <section className="max-w-7xl mx-auto px-6 pb-16">
          <div className="flex items-end justify-between mb-8">
            <div>
              <div className="text-amber-400 text-xs tracking-[3px] mb-1">CENSORSHIP-RESISTANT</div>
              <h2 className="text-3xl font-semibold tracking-[-1.5px]">Removed Elsewhere. Permanent Here.</h2>
              <p className="text-sm text-white/50 mt-1 max-w-xl">
                These films were deplatformed from YouTube, Vimeo, or other services. They live permanently on DecentralFlix.
              </p>
            </div>
          </div>
          <DemoFilmGrid films={DEMO_FILMS.filter(f => f.isDeplatformed).map(f => ({
            filmHash: f.filmHash,
            title: f.title,
            creator: f.creator,
            price: BigInt(f.priceWei),
            tier: f.tier as 'BASIC' | 'DELUXE' | 'PRODUCER',
            genre: f.genre,
            isDeplatformed: true,
            thumbnailUrl: f.thumbnailUrl,
          }))} />
        </section>
      )}

      {/* ── Top reviewed ───────────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-6 pb-16">
        <div className="flex items-end justify-between mb-8">
          <div>
            <div className="text-emerald-400 text-xs tracking-[3px] mb-1">COMMUNITY VOICE</div>
            <h2 className="text-3xl font-semibold tracking-[-1.5px]">Top Reviewed</h2>
            <p className="text-sm text-white/50 mt-1">Only verified owners can review. No fake reviews.</p>
          </div>
          <Link href="/reviews" className="text-sm text-white/50 hover:text-white transition">
            All reviews →
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {topReviewed.map(film => (
            <Link key={film.filmHash} href={`/film/${film.filmHash}`} className="group rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 overflow-hidden transition-all">
              <div className="aspect-video bg-white/5 flex items-center justify-center">
                <span className="text-4xl opacity-30">🎬</span>
              </div>
              <div className="p-4">
                <h3 className="font-semibold text-sm leading-tight mb-1 group-hover:text-white/90">{film.title}</h3>
                <div className="flex items-center gap-1 text-yellow-400 text-xs">
                  ★ <span className="text-white/70">{film.averageRating.toFixed(1)}</span>
                  <span className="text-white/40 ml-1">({film.reviewCount})</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── For creators ───────────────────────────────────────────────── */}
      <section className="border-t border-white/10 bg-zinc-950 py-24">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <div className="text-red-500 text-xs tracking-[3px] mb-3">FOR FILMMAKERS</div>
          <h2 className="text-5xl md:text-6xl font-semibold tracking-[-3px] leading-tight mb-6">
            Own your work.<br />
            <span className="text-white/50">70% paid directly to you, instantly.</span>
          </h2>
          <p className="text-xl text-white/60 max-w-2xl mx-auto mb-10 leading-snug">
            Upload your film. Your audience gets permanent access. You get paid immediately
            on Arbitrum — no invoices, no net-30, no middlemen. No platform can remove your work.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/upload"
              className="px-10 py-4 bg-white text-black font-semibold rounded-full hover:bg-white/90 transition"
            >
              Upload Your Film
            </Link>
            <Link
              href="/dashboard"
              className="px-10 py-4 border border-white/40 hover:bg-white/10 rounded-full transition"
            >
              Creator Dashboard
            </Link>
          </div>
        </div>
      </section>

    </div>
  );
}
