'use client';

import Link from 'next/link';

export default function LegalFooter() {
  return (
    <footer className="mt-auto border-t border-white/10 bg-black/80 text-white/60 text-xs py-8 px-6">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row gap-y-4 justify-between items-center">
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          <Link href="/tos" className="hover:text-white transition">Terms of Service</Link>
          <Link href="/privacy" className="hover:text-white transition">Privacy Policy</Link>
          <Link href="/legal" className="hover:text-white transition">Legal &amp; Compliance</Link>
          <span className="text-white/30">•</span>
          <span>Non-custodial • Utility-only NFTs • Section 230 protected</span>
        </div>

        <div className="text-[10px] text-white/40 text-center md:text-right">
          © Decentralflix — Legal documents available for review. DMCA agent registration and Delaware/Ohio LLC formation are required actions before launch.
        </div>
      </div>
    </footer>
  );
}
