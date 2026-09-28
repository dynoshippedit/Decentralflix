import Link from 'next/link';
import { DEMO_FILMS } from '@/lib/demo-content';

const TECH_STACK = [
  { name: 'Arbitrum L2', role: 'Smart contracts + NFT ownership', detail: '~$0.05/mint' },
  { name: 'Cloudflare R2', role: 'Primary video delivery', detail: 'Zero egress · 310 global PoPs' },
  { name: 'Cloudflare Workers', role: 'Access control (signed URLs)', detail: 'NFT verified at edge' },
  { name: 'Livepeer', role: 'Video transcoding (HLS adaptive)', detail: '5-10x cheaper than AWS' },
  { name: 'Filecoin + IPFS', role: 'Censorship-resistant backup', detail: 'Permanent, distributed' },
  { name: 'Arweave', role: 'Permanent metadata proofs', detail: 'Manifests only — never video' },
  { name: 'Goldsky', role: 'Blockchain event indexer', detail: 'Real-time Arbitrum sync' },
  { name: 'Privy', role: 'Auth + embedded wallets', detail: 'Email/Google/Apple login' },
  { name: 'ERC721A', role: 'NFT standard', detail: '80% cheaper minting' },
  { name: 'Theta Network', role: 'P2P seeding (secondary)', detail: 'Opt-in community bandwidth' },
];

const METRICS = [
  { value: '2M+', label: 'Concurrent viewers capacity' },
  { value: '75%', label: 'Creator payout — on-chain' },
  { value: '$0.05', label: 'Cost per NFT mint (Arbitrum L2)' },
  { value: '$0', label: 'Video egress fees (Cloudflare R2)' },
  { value: 'Licensed', label: 'Access — stated terms, no perpetual promise' },
];

export default function DemoPage() {
  return (
    <div className="min-h-screen bg-black text-white">

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="relative min-h-[80vh] flex items-center justify-center overflow-hidden border-b border-white/10">
        <div className="absolute inset-0 bg-[radial-gradient(#1a1a1a_1px,transparent_1px)] bg-[length:4px_4px] opacity-40" />
        <div className="relative z-10 text-center px-6 max-w-5xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 mb-6 text-xs tracking-[3px] border border-white/20 rounded-full text-white/50">
            INVESTOR DEMO · DECENTRALFLIX
          </div>
          <h1 className="text-6xl md:text-8xl font-semibold tracking-[-4px] leading-[0.92] mb-6">
            Own Your Cinema.<br />
            <span className="text-white/40">Under a clear license.</span>
          </h1>
          <p className="text-xl text-white/60 max-w-2xl mx-auto mb-10 leading-snug">
            The censorship-resistant Netflix. Creators get 75% of every sale. Viewers buy under a clear license.
            No middlemen. No bans. Built for the influencer era.
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <Link href="/catalog" className="px-8 py-4 bg-white text-black font-semibold rounded-full hover:bg-white/90 transition">
              Browse Films
            </Link>
            <Link href="/mint" className="px-8 py-4 border border-white/30 hover:bg-white/10 rounded-full transition">
              Get Access
            </Link>
          </div>
        </div>
      </section>

      {/* ── Problem / Solution ───────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 py-24">
        <div className="grid md:grid-cols-2 gap-8">
          <div className="bg-red-500/5 border border-red-500/20 rounded-3xl p-8">
            <div className="text-red-400 text-xs tracking-widest mb-4">THE PROBLEM</div>
            <h2 className="text-3xl font-semibold tracking-tight mb-4">YouTube can delete you in seconds.</h2>
            <ul className="space-y-3 text-white/60">
              <li className="flex gap-3"><span className="text-red-400 mt-0.5">×</span> Creators lose millions of followers overnight with no recourse</li>
              <li className="flex gap-3"><span className="text-red-400 mt-0.5">×</span> Platforms take 45-55% of revenue</li>
              <li className="flex gap-3"><span className="text-red-400 mt-0.5">×</span> Content can be demonetized, shadowbanned, or removed for arbitrary reasons</li>
              <li className="flex gap-3"><span className="text-red-400 mt-0.5">×</span> Viewers pay monthly and own nothing</li>
            </ul>
          </div>
          <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-3xl p-8">
            <div className="text-emerald-400 text-xs tracking-widest mb-4">THE SOLUTION</div>
            <h2 className="text-3xl font-semibold tracking-tight mb-4">We can't delete anyone.</h2>
            <ul className="space-y-3 text-white/60">
              <li className="flex gap-3"><span className="text-emerald-400 mt-0.5">✓</span> Content stored on Filecoin — no single entity controls it</li>
              <li className="flex gap-3"><span className="text-emerald-400 mt-0.5">✓</span> Creators receive 75% of every sale, on-chain, no invoices</li>
              <li className="flex gap-3"><span className="text-emerald-400 mt-0.5">✓</span> Access is an NFT — verifiable, transferable, on-chain</li>
              <li className="flex gap-3"><span className="text-emerald-400 mt-0.5">✓</span> Viewers buy once under a clear license</li>
            </ul>
          </div>
        </div>
      </section>

      {/* ── Key metrics ──────────────────────────────────────────────── */}
      <section className="border-y border-white/10 bg-white/[0.02] py-16">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-xs text-white/30 tracking-widest text-center mb-10">KEY METRICS</div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
            {METRICS.map(m => (
              <div key={m.label} className="text-center">
                <div className="text-4xl font-semibold tracking-tight mb-1">{m.value}</div>
                <div className="text-white/40 text-sm">{m.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Who this is for ─────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 py-24">
        <div className="text-xs text-white/30 tracking-widest mb-8">WHO THIS IS FOR</div>
        <div className="grid md:grid-cols-2 gap-6 mb-12">
          <div className="bg-white/5 border border-white/10 rounded-3xl p-8">
            <div className="text-2xl font-semibold tracking-tight mb-2">Independent Filmmakers</div>
            <div className="text-white/40 text-sm mb-4">Direct-to-audience distribution</div>
            <p className="text-white/60 text-sm leading-relaxed">
              Sell licensed streaming access to your film. Keep 75%. No middlemen, no algorithms, no gatekeepers.
              Infrastructure engineered to survive a viral spike — Cloudflare R2 primary delivery, IPFS/Filecoin backup.
            </p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-3xl p-8">
            <div className="text-2xl font-semibold tracking-tight mb-2">Deplatformed Creators</div>
            <div className="text-white/40 text-sm mb-4">Content that survives</div>
            <p className="text-white/60 text-sm leading-relaxed">
              Content-addressed storage means your work cannot be silently removed. Ownership is recorded on-chain,
              files are mirrored across decentralized nodes. If a platform pulls your video, it still exists here.
            </p>
          </div>
        </div>
      </section>

      {/* ── Featured films ────────────────────────────────────────────── */}
      <section className="bg-white/[0.02] border-y border-white/10 py-16">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-xs text-white/30 tracking-widest mb-8">FEATURED FILMS</div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {DEMO_FILMS.map(film => (
              <Link key={film.filmHash} href={`/film/${film.filmHash}`} className="group rounded-2xl bg-white/5 border border-white/10 hover:border-white/20 overflow-hidden transition">
                <div className="aspect-video bg-gradient-to-br from-white/10 to-white/5 flex items-center justify-center relative">
                  <span className="text-3xl opacity-20">🎬</span>
                  {film.isDeplatformed && (
                    <span className="absolute top-2 left-2 text-[9px] tracking-widest bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded-full">
                      DEPLATFORMED
                    </span>
                  )}
                </div>
                <div className="p-3">
                  <div className="font-medium text-xs leading-tight mb-1 group-hover:text-white">{film.title}</div>
                  <div className="text-white/30 text-xs">{film.price} ETH · ★{film.averageRating}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── Tech stack ───────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 py-24">
        <div className="text-xs text-white/30 tracking-widest mb-8">TECHNOLOGY STACK</div>
        <div className="grid md:grid-cols-2 gap-3">
          {TECH_STACK.map(t => (
            <div key={t.name} className="flex items-start gap-4 bg-white/5 border border-white/10 rounded-2xl p-5">
              <div className="flex-1">
                <div className="font-semibold text-sm mb-0.5">{t.name}</div>
                <div className="text-white/50 text-xs">{t.role}</div>
              </div>
              <div className="text-white/30 text-xs shrink-0 text-right">{t.detail}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Economics ────────────────────────────────────────────────── */}
      <section className="border-t border-white/10 bg-white/[0.02] py-16">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-xs text-white/30 tracking-widest mb-8">PLATFORM ECONOMICS</div>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-white/5 border border-white/10 rounded-3xl p-6">
              <div className="text-3xl font-semibold mb-2">75%</div>
              <div className="text-white/50 text-sm">To the creator's wallet, on-chain. No invoices.</div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-3xl p-6">
              <div className="text-3xl font-semibold mb-2">30%</div>
              <div className="text-white/50 text-sm">Platform fee. Covers Cloudflare, Livepeer, Arbitrum gas, backend ops.</div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-3xl p-6">
              <div className="text-3xl font-semibold mb-2">$60K–$200K</div>
              <div className="text-white/50 text-sm">Estimated monthly infra cost at 120M MAU. Zero egress = cheap at scale.</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────── */}
      <section className="max-w-3xl mx-auto px-6 py-24 text-center">
        <h2 className="text-4xl font-semibold tracking-tight mb-4">Ready to see it live?</h2>
        <p className="text-white/50 mb-8">Browse the catalog, buy licensed access, or upload your film.</p>
        <div className="flex gap-3 justify-center flex-wrap">
          <Link href="/catalog" className="px-8 py-4 bg-white text-black font-semibold rounded-full hover:bg-white/90 transition">
            Browse Films
          </Link>
          <Link href="/upload" className="px-8 py-4 border border-white/30 hover:bg-white/10 rounded-full transition">
            Upload a Film
          </Link>
        </div>
      </section>

    </div>
  );
}
