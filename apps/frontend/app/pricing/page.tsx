import Link from "next/link";
import {
  FILMMAKER_TIERS,
  VIEWER_OPTIONS,
  PRICING_DISCLAIMER,
  ECONOMICS_WARNING,
  MIGRATION_PILOT_CAP,
  CONTRIBUTION_TABLE,
  DEFERRED_ITEMS,
} from "@/lib/pricing";

export const metadata = {
  title: "Pricing — Decentralflix",
  description: "Draft subscription pricing for filmmakers and viewers. Honest numbers, in public.",
};

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-black text-white antialiased">
      {/* Header */}
      <section className="pt-28 pb-16 px-6 text-center max-w-4xl mx-auto">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 mb-6 text-xs tracking-[3px] border border-amber-500/40 rounded-full text-amber-300/90">
          DRAFT PRICING — NOT FINAL
        </div>
        <h1 className="text-5xl md:text-7xl font-semibold tracking-[-3px] mb-6">
          Pricing, <span className="text-white/50">in public.</span>
        </h1>
        <p className="text-lg text-white/55 max-w-2xl mx-auto leading-relaxed">
          {PRICING_DISCLAIMER} What&rsquo;s below is the model we&rsquo;re testing —
          including the parts where the math gets uncomfortable.
        </p>
      </section>

      {/* ── Filmmakers ─────────────────────────────────────────────── */}
      <section id="filmmakers" className="max-w-7xl mx-auto px-6 pb-20 scroll-mt-24">
        <div className="mb-10">
          <div className="text-red-500 text-xs tracking-[3px] mb-2">FOR FILMMAKERS</div>
          <h2 className="text-3xl md:text-4xl font-semibold tracking-[-2px]">Upload. Set your price. Keep 75%.</h2>
          <p className="text-white/50 mt-3 max-w-2xl text-sm leading-relaxed">
            Every tier pays the same 75% creator share on every sale.
            The tiers differ in catalog size and tooling — never in your cut.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-5">
          {FILMMAKER_TIERS.map((t) => (
            <div
              key={t.id}
              className={`rounded-3xl border p-8 flex flex-col ${
                t.featured ? "border-red-500/60 bg-red-500/[0.04]" : "border-white/10 bg-white/[0.02]"
              }`}
            >
              {t.featured && (
                <div className="text-[10px] tracking-[2px] text-red-400 mb-4">MOST POPULAR</div>
              )}
              <h3 className="text-xl font-semibold">{t.name}</h3>
              <p className="text-sm text-white/50 mt-1 mb-6">{t.tagline}</p>
              <div className="flex items-baseline gap-2">
                <span className="text-5xl font-semibold tracking-tight">{t.price}</span>
              </div>
              <p className="text-xs text-white/40 mt-1 mb-2">{t.priceNote}</p>
              <p className="text-xs text-white/60 font-medium mb-8">{t.titleLimit}</p>
              <ul className="space-y-3 mb-10 flex-1">
                {t.features.map((f) => (
                  <li key={f} className="text-sm text-white/60 flex gap-2.5">
                    <span className="text-emerald-400 shrink-0">✓</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/upload"
                className={`text-center px-6 py-3.5 rounded-full font-semibold transition ${
                  t.featured
                    ? "bg-white text-black hover:bg-white/90"
                    : "border border-white/30 hover:bg-white/10"
                }`}
              >
                {t.cta}
              </Link>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-sm text-white/50 leading-relaxed">
          {MIGRATION_PILOT_CAP}
        </div>
      </section>

      {/* ── Viewers ───────────────────────────────────────────────── */}
      <section id="viewers" className="border-t border-white/10 bg-zinc-950 py-20 scroll-mt-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="mb-10">
            <div className="text-red-500 text-xs tracking-[3px] mb-2">FOR VIEWERS</div>
            <h2 className="text-3xl md:text-4xl font-semibold tracking-[-2px]">Two ways to watch.</h2>
            <p className="text-white/50 mt-3 max-w-2xl text-sm leading-relaxed">
              Everything you buy comes with a clear license: a signed receipt, verifiable
              offline, that proves exactly what you purchased — streaming access under the
              film's terms, never a promise of perpetual operation.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-5">
            {VIEWER_OPTIONS.map((o) => (
              <div
                key={o.id}
                className={`rounded-3xl border p-8 flex flex-col ${
                  o.featured ? "border-red-500/60 bg-red-500/[0.04]" : "border-white/10 bg-white/[0.02]"
                }`}
              >
                {o.featured && (
                  <div className="text-[10px] tracking-[2px] text-red-400 mb-4">MOST POPULAR</div>
                )}
                <h3 className="text-xl font-semibold">{o.name}</h3>
                <p className="text-sm text-white/50 mt-1 mb-6">{o.tagline}</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-5xl font-semibold tracking-tight">{o.price}</span>
                </div>
                <p className="text-xs text-white/40 mt-1 mb-8">{o.priceNote}</p>
                <ul className="space-y-3 mb-8 flex-1">
                  {o.features.map((f) => (
                    <li key={f} className="text-sm text-white/60 flex gap-2.5">
                      <span className="text-emerald-400 shrink-0">✓</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                {o.warning && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 mb-8 text-xs text-amber-200/85 leading-relaxed">
                    <div className="font-semibold text-amber-300 mb-1.5 tracking-wide">
                      ⚠ UNIT-ECONOMICS WARNING
                    </div>
                    {o.warning}
                  </div>
                )}
                <Link
                  href="/catalog"
                  className={`text-center px-6 py-3.5 rounded-full font-semibold transition ${
                    o.featured
                      ? "bg-white text-black hover:bg-white/90"
                      : "border border-white/30 hover:bg-white/10"
                  }`}
                >
                  {o.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── The math ─────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 pb-20">
        <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-8 md:p-10">
          <h2 className="text-2xl font-semibold tracking-tight mb-2">What a sale contributes.</h2>
          <p className="text-sm text-white/55 leading-relaxed mb-6">
            Per-order contribution after variable costs, at the tested 75% creator-share basis.
            The platform bears card processing (2.9% + $0.30), a delivery allowance, and a $0.20
            operations placeholder — before storage, ingest, payout fees, taxes, and overhead.
            This is the model, not a configured payment account.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-white/40 text-xs tracking-wider">
                  <th className="py-2 pr-4 font-medium">Scenario</th>
                  <th className="py-2 pr-4 font-medium text-right">Creator payout</th>
                  <th className="py-2 pr-4 font-medium text-right">Card cost</th>
                  <th className="py-2 pr-4 font-medium text-right">Delivery</th>
                  <th className="py-2 pr-4 font-medium text-right">Ops</th>
                  <th className="py-2 font-medium text-right">Platform contribution</th>
                </tr>
              </thead>
              <tbody>
                {CONTRIBUTION_TABLE.map((r) => (
                  <tr key={r.scenario} className="border-t border-white/10">
                    <td className="py-3 pr-4 text-white/80">{r.scenario}</td>
                    <td className="py-3 pr-4 text-right text-white/60">${r.creatorPayout.toFixed(3)}</td>
                    <td className="py-3 pr-4 text-right text-white/60">${r.cardCost.toFixed(3)}</td>
                    <td className="py-3 pr-4 text-right text-white/60">${r.deliveryAllowance.toFixed(3)}</td>
                    <td className="py-3 pr-4 text-right text-white/60">${r.opsAllowance.toFixed(3)}</td>
                    <td className={`py-3 text-right font-semibold ${r.platformContribution < 0 ? "text-red-400" : "text-emerald-400"}`}>
                      {r.platformContribution < 0 ? "−" : ""}${Math.abs(r.platformContribution).toFixed(3)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-white/40 mt-4 leading-relaxed">
            A 90% gross share at $4 loses $0.316 per order — which is why 90% is never offered.
            Prices, fees, and allowances are modeled drafts, not final terms.
          </p>
        </div>
      </section>

      {/* ── Not yet built ─────────────────────────────────────────── */}
      <section className="max-w-4xl mx-auto px-6 py-20">
        <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-8 md:p-10">
          <h2 className="text-2xl font-semibold tracking-tight mb-4">What we&rsquo;re not selling you (yet)</h2>
          <p className="text-sm text-white/55 leading-relaxed mb-6">
            These are on the long-term roadmap. They are not built, not priced, and not
            implied anywhere on this page:
          </p>
          <ul className="grid gap-4 text-sm text-white/50">
            {DEFERRED_ITEMS.map((x) => (
              <li key={x.name} className="flex gap-2.5 items-start">
                <span className="text-white/25 mt-0.5">○</span>
                <span>
                  <span className="text-white/80 font-medium">{x.name}.</span>{" "}
                  {x.reason}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-6 rounded-2xl border border-amber-500/25 bg-amber-500/5 p-5 text-xs text-amber-200/80 leading-relaxed">
            <span className="font-semibold text-amber-300">Why the Collector Pass stays deferred: </span>
            {ECONOMICS_WARNING}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-white/10 py-20 text-center px-6">
        <h2 className="text-4xl font-semibold tracking-[-2px] mb-8">Questions? Read the math again.</h2>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/catalog" className="px-10 py-4 bg-white text-black font-semibold rounded-full hover:bg-white/90 transition">
            Browse Films
          </Link>
          <Link href="/upload" className="px-10 py-4 border border-white/40 hover:bg-white/10 rounded-full transition">
            Upload Your Film
          </Link>
        </div>
        <p className="text-xs text-white/30 mt-8 tracking-widest">TEST MODE — NO REAL PAYMENTS</p>
      </section>
    </div>
  );
}
