import Link from "next/link";
import { DEMO_FILMS } from "@/lib/demo-content";
import { getFilmCatalog } from "@/lib/indexer";
import DemoFilmGrid from "./DemoFilmGrid";
import { FILMMAKER_TIERS, VIEWER_OPTIONS, PRICING_DISCLAIMER } from "@/lib/pricing";

export default async function HomePage() {
  let films = await getFilmCatalog({ limit: 8 }).catch(() => null);
  if (!films || films.length === 0) {
    films = DEMO_FILMS.map((f) => ({
      filmHash: f.filmHash,
      title: f.title,
      creator: f.creator,
      price: BigInt(f.priceWei),
      tier: f.tier as "BASIC" | "DELUXE" | "PRODUCER",
      genre: f.genre,
      isDeplatformed: f.isDeplatformed,
      thumbnailUrl: f.thumbnailUrl,
    }));
  }
  const featured = films.slice(0, 4);
  const topReviewed = [...DEMO_FILMS].sort((a, b) => b.averageRating - a.averageRating).slice(0, 4);

  return (
    <div className="min-h-screen bg-black text-white antialiased">
      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="relative min-h-[100dvh] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/70 to-black z-10" />
        <div className="absolute inset-0 bg-[radial-gradient(#161616_1px,transparent_1px)] bg-[length:5px_5px] opacity-50" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_35%,rgba(220,38,38,0.12),transparent)]" />

        <div className="relative z-20 text-center px-6 max-w-5xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 mb-6 text-xs tracking-[3px] border border-white/20 rounded-full text-white/60">
            CENSORSHIP-RESISTANT · LICENSED ACCESS · 75% TO CREATORS
          </div>

          <h1 className="text-6xl md:text-8xl font-semibold tracking-[-4px] leading-[0.92] mb-6">
            Cinema that can&rsquo;t
            <br />
            be <span className="text-red-500">cancelled.</span>
          </h1>

          <p className="text-xl md:text-2xl text-white/60 tracking-tight max-w-2xl mx-auto mb-10 leading-snug">
            Independent films, sold directly by the people who made them.
            Buy once under a clear license — or upload your work and keep 75% of every sale.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
            <Link
              href="/catalog"
              className="px-8 py-4 bg-white text-black text-lg font-semibold rounded-full hover:bg-white/90 transition-all active:scale-[0.98]"
            >
              Watch Films
            </Link>
            <Link
              href="/pricing"
              className="px-8 py-4 text-lg font-medium border border-white/40 hover:bg-white/10 rounded-full transition-all"
            >
              See Pricing
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
          <span>75% CREATOR PAYOUT — INSTANT</span>
          <span>NO CENTRAL AUTHORITY</span>
          <span>BUY ONCE, LICENSED CLEARLY</span>
          <span>SIGNED RECEIPTS, VERIFIABLE OFFLINE</span>
        </div>
      </div>

      {/* ── Two paths ──────────────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-6 py-24">
        <div className="text-center mb-14">
          <div className="text-red-500 text-xs tracking-[3px] mb-3">TWO WAYS IN</div>
          <h2 className="text-4xl md:text-5xl font-semibold tracking-[-2px]">Watch it. Or sell it.</h2>
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-10 hover:bg-white/[0.05] transition group">
            <div className="text-4xl mb-6">🎟️</div>
            <h3 className="text-2xl font-semibold tracking-tight mb-3">For viewers</h3>
            <p className="text-white/55 leading-relaxed mb-8">
              Pay per film from $3.99, or bundle a filmmaker&rsquo;s catalog —
              two ways to watch under a clear license. Every purchase comes with
              a signed receipt you can verify offline.
            </p>
            <Link href="/pricing#viewers" className="inline-flex items-center gap-2 text-white font-medium group-hover:gap-3 transition-all">
              Viewer pricing <span>→</span>
            </Link>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-10 hover:bg-white/[0.05] transition group">
            <div className="text-4xl mb-6">🎬</div>
            <h3 className="text-2xl font-semibold tracking-tight mb-3">For filmmakers</h3>
            <p className="text-white/55 leading-relaxed mb-8">
              Upload your film, set your price, get paid instantly on 75% of every sale —
              no invoices, no net-30, no middlemen. Start free with the capped Migration
              Pilot, or pick a plan that fits your catalog.
            </p>
            <Link href="/pricing#filmmakers" className="inline-flex items-center gap-2 text-white font-medium group-hover:gap-3 transition-all">
              Filmmaker pricing <span>→</span>
            </Link>
          </div>
        </div>
      </section>

      {/* ── Featured films ─────────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-6 pb-20">
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

      {/* ── Pricing preview ────────────────────────────────────────────── */}
      <section className="border-y border-white/10 bg-zinc-950 py-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-14">
            <div className="text-red-500 text-xs tracking-[3px] mb-3">PRICING</div>
            <h2 className="text-4xl md:text-5xl font-semibold tracking-[-2px] mb-4">Simple, honest pricing.</h2>
            <p className="text-white/50 max-w-xl mx-auto text-sm">{PRICING_DISCLAIMER}</p>
          </div>

          <div className="grid md:grid-cols-3 gap-5 mb-12">
            {FILMMAKER_TIERS.map((t) => (
              <div key={t.id} className={`rounded-3xl border p-8 ${t.featured ? "border-red-500/60 bg-red-500/[0.04]" : "border-white/10 bg-white/[0.02]"}`}>
                <div className="text-xs tracking-[2px] text-white/40 mb-2">FILMMAKERS</div>
                <h3 className="text-xl font-semibold mb-1">{t.name}</h3>
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-4xl font-semibold tracking-tight">{t.price}</span>
                </div>
                <p className="text-xs text-white/40 mb-6">{t.priceNote} · {t.titleLimit}</p>
                <p className="text-sm text-white/60 mb-6">{t.tagline}</p>
                <ul className="space-y-2.5 mb-8">
                  {t.features.slice(0, 3).map((f) => (
                    <li key={f} className="text-sm text-white/55 flex gap-2"><span className="text-emerald-400">✓</span>{f}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="grid md:grid-cols-2 gap-5 mb-12 max-w-4xl">
            {VIEWER_OPTIONS.map((o) => (
              <div key={o.id} className={`rounded-3xl border p-8 ${o.featured ? "border-red-500/60 bg-red-500/[0.04]" : "border-white/10 bg-white/[0.02]"}`}>
                <div className="text-xs tracking-[2px] text-white/40 mb-2">VIEWERS</div>
                <h3 className="text-xl font-semibold mb-1">{o.name}</h3>
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-4xl font-semibold tracking-tight">{o.price}</span>
                </div>
                <p className="text-xs text-white/40 mb-6">{o.priceNote}</p>
                <p className="text-sm text-white/60 mb-6">{o.tagline}</p>
                <ul className="space-y-2.5 mb-8">
                  {o.features.slice(0, 3).map((f) => (
                    <li key={f} className="text-sm text-white/55 flex gap-2"><span className="text-emerald-400">✓</span>{f}</li>
                  ))}
                </ul>
                {o.warning && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs text-amber-200/80 leading-relaxed">
                    <span className="font-semibold text-amber-300">Unit-economics note: </span>
                    {o.warning.split(".")[0]}.
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="text-center">
            <Link href="/pricing" className="inline-block px-10 py-4 bg-white text-black font-semibold rounded-full hover:bg-white/90 transition">
              Full pricing details
            </Link>
          </div>
        </div>
      </section>

      {/* ── Honest economics ───────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 py-24">
        <div className="text-center mb-12">
          <div className="text-red-500 text-xs tracking-[3px] mb-3">THE MATH, IN PUBLIC</div>
          <h2 className="text-4xl md:text-5xl font-semibold tracking-[-2px]">We show our work.</h2>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-8 md:p-12">
          <div className="grid md:grid-cols-2 gap-10">
            <div>
              <h3 className="text-lg font-semibold mb-3">Where a $4 sale goes</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between border-b border-white/10 pb-2"><span className="text-white/55">Filmmaker (75%)</span><span className="font-mono">$3.00</span></div>
                <div className="flex justify-between border-b border-white/10 pb-2"><span className="text-white/55">Platform (operations, delivery)</span><span className="font-mono">$1.00</span></div>
                <div className="flex justify-between pt-1"><span className="text-white/55">Modeled platform contribution</span><span className="font-mono text-amber-300">~$0.28</span></div>
              </div>
              <p className="text-xs text-white/40 mt-4 leading-relaxed">
                Thin on purpose. We&rsquo;d rather show you the real margin than promise
                a 90% share the math can&rsquo;t support.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-3">The Collector Pass: deferred until the math works</h3>
              <p className="text-sm text-white/55 leading-relaxed">
                $10 a month, two $8 credits. At a 75% creator share that&rsquo;s $12 in
                creator payouts — before card processing and video delivery. The pass only
                works long-term with a different price, allocation, or catalog design, and
                we won&rsquo;t pretend breakage pays the bills.
              </p>
              <p className="text-xs text-white/40 mt-4 leading-relaxed">
                It&rsquo;s deferred, not launching: stored credits stay off the roadmap
                until repeat-purchase evidence and a reviewed allocation/legal design
                exist. If the numbers work with a different price, allocation, or
                catalog design, it comes back.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Top reviewed ───────────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-6 pb-20">
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
          {topReviewed.map((film) => (
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

      {/* ── Roadmap ────────────────────────────────────────────────────── */}
      <section className="border-t border-white/10 bg-zinc-950 py-24">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-12">
            <div className="text-red-500 text-xs tracking-[3px] mb-3">ROADMAP — A PLAN, NOT A PROMISE</div>
            <h2 className="text-4xl md:text-5xl font-semibold tracking-[-2px]">90 days to prove it.</h2>
            <p className="text-white/50 mt-4 max-w-xl mx-auto text-sm">
              Gated milestones. Each gate has to pass before the next one opens.
              Dates are targets, not guarantees.
            </p>
          </div>
          <div className="space-y-4">
            {[
              { date: "Oct 12", title: "First film, purchase to playback", desc: "One authorized film. Buy it, watch it, refunds and the creator ledger working." },
              { date: "Oct 26", title: "5–10 rights-reviewed titles", desc: "Real catalog depth. No fan-email-only grants — every title rights-cleared." },
              { date: "Nov 9", title: "Buyer-claim pilot", desc: "Vimeo migrators invite their audiences to claim access. Buyers actually claiming and watching." },
              { date: "Nov 20", title: "Only tested promises", desc: "Whatever survived testing ships. Everything else stays on the roadmap." },
            ].map((m, i) => (
              <div key={m.date} className="flex gap-6 items-start rounded-2xl border border-white/10 bg-white/[0.02] p-6">
                <div className="shrink-0 w-20 text-center">
                  <div className="text-xs text-white/40 tracking-widest">GATE {i + 1}</div>
                  <div className="font-semibold text-red-400">{m.date}</div>
                </div>
                <div>
                  <h3 className="font-semibold mb-1">{m.title}</h3>
                  <p className="text-sm text-white/50">{m.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ────────────────────────────────────────────────────────── */}
      <section className="max-w-3xl mx-auto px-6 py-24">
        <div className="text-center mb-12">
          <div className="text-red-500 text-xs tracking-[3px] mb-3">FAQ</div>
          <h2 className="text-4xl font-semibold tracking-[-2px]">Straight answers.</h2>
        </div>
        <div className="space-y-6">
          {[
            { q: "Is this launched? Can I pay real money today?", a: "No. Decentralflix is in development and testing. The storefront, checkout, and passes you see here run in test mode — no real payments are processed." },
            { q: "What exactly am I buying?", a: "A license under stated terms: rental is time-limited; streaming access carries honest limits and no promise of perpetual operation; permanent download is offered only where the filmmaker allows it and plays without an authorization server. Your receipt is cryptographically signed and verifiable offline. We don’t sell copyright." },
            { q: "I’m on Vimeo. What happens to my audience?", a: "Vimeo exports create contacts only — never automatic access. Your fans get an invitation to claim their access, and you approve each claim. Nobody is migrated without consent on both sides." },
            { q: "Why only 75% to creators? Others promise 90%.", a: "Because we did the math in public. At a $4 sale, a 90% share loses money on every order after processing and delivery. We’d rather pay 75% sustainably than 90% until we go broke." },
            { q: "What about NFTs, crypto, and P2P?", a: "Access tokens and decentralized storage are part of the long-term architecture, but native NFT access, seeder rewards, P2P delivery savings, and stablecoin checkout are deferred. We won’t market what isn’t built." },
          ].map((f) => (
            <div key={f.q} className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
              <h3 className="font-semibold mb-2">{f.q}</h3>
              <p className="text-sm text-white/55 leading-relaxed">{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Final CTA ──────────────────────────────────────────────────── */}
      <section className="border-t border-white/10 py-24 text-center px-6">
        <h2 className="text-5xl md:text-6xl font-semibold tracking-[-3px] mb-6">
          Own your cinema.
          <br />
          <span className="text-white/50">Or sell it.</span>
        </h2>
        <div className="flex flex-col sm:flex-row gap-3 justify-center mt-10">
          <Link href="/catalog" className="px-10 py-4 bg-white text-black font-semibold rounded-full hover:bg-white/90 transition">
            Browse Films
          </Link>
          <Link href="/pricing" className="px-10 py-4 border border-white/40 hover:bg-white/10 rounded-full transition">
            See Pricing
          </Link>
        </div>
        <p className="text-xs text-white/30 mt-8 tracking-widest">TEST MODE — NO REAL PAYMENTS</p>
      </section>
    </div>
  );
}
