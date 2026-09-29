'use client';

import Link from 'next/link';

export default function LegalCompliancePage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-4xl mx-auto px-6 py-16">
        <Link href="/" className="text-sm text-white/60 hover:text-white">← Back to Decentralflix</Link>

        <div className="mt-8">
          <div className="inline-block px-4 py-1 text-xs tracking-[3px] border border-emerald-400/50 text-emerald-400 rounded-full mb-4">
            SECTION 230 • DMCA SAFE HARBOR • NON-CUSTODIAL DESIGN
          </div>
          <h1 className="text-6xl font-semibold tracking-[-2.5px]">Legal &amp; Compliance</h1>
          <p className="mt-3 text-xl text-white/70">Our legal posture, stated plainly — including what registration alone does not cover.</p>
        </div>

        <div className="mt-12 grid gap-8">
          <section className="border border-white/10 rounded-3xl p-8 bg-zinc-950/50">
            <h2 className="text-2xl font-semibold tracking-tight mb-4">Core Legal Foundations</h2>
            <ul className="space-y-4 text-[15px] text-white/90">
              <li><span className="font-medium text-emerald-400">Section 230 (47 U.S.C. § 230)</span> — Strong immunity for interactive computer services regarding third-party user-generated content. Decentralflix qualifies as it does not materially contribute to films or reviews.</li>
              <li><span className="font-medium text-emerald-400">DMCA Safe Harbor (17 U.S.C. § 512)</span> — Designating a copyright agent is one element of safe harbor, not the whole program. Full compliance also requires a repeat-infringer policy, expeditious takedown handling, and the other statutory conditions; registration alone does not confer immunity. We delist access links expeditiously (blockchain immutability respected — data itself is not removed).</li>
              <li><span className="font-medium text-emerald-400">Non-Custodial Architecture</span> — Zero custody of funds, NFTs, or keys. All value movement is direct wallet-to-wallet. The smart contracts are unaudited and have not been deployed to any network — on-chain value movement is not live. No money transmission surface under FinCEN or Ohio law.</li>
              <li><span className="font-medium text-emerald-400">Utility-Only NFTs</span> — Basic / Deluxe / Producer tiers grant licensed access and review rights only. Crowdfunding is deferred and not offered. No profit expectations, no securities classification under Howey for pure access utility.</li>
            </ul>
          </section>

          <section className="border border-white/10 rounded-3xl p-8 bg-zinc-950/50">
            <h2 className="text-2xl font-semibold tracking-tight mb-4">Required Pre-Launch Human Actions</h2>
            <ol className="list-decimal list-inside space-y-2 text-[15px] text-white/90">
              <li>Form Delaware LLC (recommended) or Wyoming LLC — “Decentralflix LLC”. Appoint registered agent.</li>
              <li>File foreign qualification in Ohio (Form 617) if nexus exists.</li>
              <li>Register DMCA Copyright Agent at copyright.gov and insert real name/email/address into ToS §10.</li>
              <li>Draft operating agreement emphasizing non-custodial operation and asset separation.</li>
              <li>Obtain EIN, business banking/crypto accounts in LLC name.</li>
              <li>Full smart contract audit + D&amp;O / cyber insurance (recommended).</li>
              <li>Update all contracts and ToS to bind to the actual LLC entity.</li>
            </ol>
            <p className="mt-4 text-xs text-white/50">These steps are documented here for transparency with investors and partners. They are outside the scope of autonomous code execution.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold tracking-tight mb-3">Documents</h2>
            <div className="flex flex-wrap gap-4">
              <Link href="/tos" className="px-6 py-3 rounded-full border border-white/30 hover:bg-white hover:text-black transition">Full Terms of Service</Link>
              <Link href="/privacy" className="px-6 py-3 rounded-full border border-white/30 hover:bg-white hover:text-black transition">Privacy Policy</Link>
              <a href="/docs/legal/RESEARCH_AND_INTEGRATION.md" target="_blank" className="px-6 py-3 rounded-full border border-white/30 hover:bg-white hover:text-black transition">Internal Legal Research Summary</a>
            </div>
          </section>
        </div>

        <div className="mt-16 text-[10px] tracking-[2px] text-white/40 border-t border-white/10 pt-6">
          This overview is for transparency and investor review purposes. Consult licensed counsel in your jurisdiction before production mainnet launch. The architecture and text herein are designed for maximum practical protection under current U.S. federal and Ohio law.
        </div>
      </div>
    </div>
  );
}
