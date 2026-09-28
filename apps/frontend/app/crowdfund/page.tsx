/**
 * /crowdfund — DEFERRED.
 *
 * Crowdfunding is deferred per the research PDFs: offering crowdfunding
 * without a registered funding portal risks an unregistered securities
 * offering. This route intentionally shows a deferral notice instead of the
 * campaign UI. The FilmmakerCampaign.sol contract file is retained for
 * history only (marked DEFERRED at the top) and is NOT deployed.
 */
export default function CrowdfundDeferredPage() {
  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center px-6">
      <div className="max-w-xl text-center border border-white/10 bg-zinc-950 rounded-3xl p-10">
        <div className="text-amber-400 text-xs tracking-[3px] mb-4">DEFERRED</div>
        <h1 className="text-3xl font-semibold tracking-tight mb-4">
          Crowdfunding is deferred
        </h1>
        <p className="text-white/60 text-sm leading-relaxed mb-6">
          We explored filmmaker crowdfunding, but offering it without a
          registered funding portal would risk an unregistered securities
          offering. Until the legal structure exists, crowdfunding is not
          available on DecentralFlix.
        </p>
        <p className="text-white/60 text-sm leading-relaxed mb-8">
          Filmmakers can still upload films and sell licensed streaming access
          today — with a 75% creator share on every sale.
        </p>
        <a
          href="/upload"
          className="inline-block px-8 py-3 bg-emerald-600 hover:bg-emerald-500 text-black font-medium rounded-2xl text-sm transition"
        >
          Upload a film instead
        </a>
      </div>
    </div>
  );
}
