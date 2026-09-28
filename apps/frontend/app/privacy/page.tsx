'use client';

import Link from 'next/link';

const PRIVACY_CONTENT = `Last Updated: May 29, 2026

We collect minimal data: wallet addresses (on-chain and public), IP addresses (for security only), and basic usage analytics via cookies. We do not collect KYC, personal identifying information, or private keys. All transactions are public on blockchain. We do not sell data. Data sharing occurs only as required by law or with service providers (e.g., hosting). CCPA/GDPR rights apply where required — contact us for deletion requests (limited to off-chain data). We are non-custodial; we cannot delete on-chain data. Updates posted here; continued use = acceptance.`;

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link href="/" className="text-sm text-white/60 hover:text-white">← Back to Decentralflix</Link>
        
        <div className="mt-8">
          <div className="inline-block px-4 py-1 text-xs tracking-[3px] border border-white/30 rounded-full mb-4">
            MINIMAL DATA • NON-CUSTODIAL • NO KYC
          </div>
          <h1 className="text-6xl font-semibold tracking-[-2.5px]">Privacy Policy</h1>
        </div>

        <div className="mt-10 text-[15px] leading-relaxed text-white/90 whitespace-pre-line">
          {PRIVACY_CONTENT}
        </div>

        <div className="mt-12 p-6 bg-white/5 border border-white/10 rounded-2xl text-sm">
          <div className="font-medium text-emerald-400 mb-2">Non-Custodial Notice</div>
          <p className="text-white/80">
            Because we never control private keys or user funds, we cannot access, modify, or delete on-chain activity. Any deletion requests apply only to off-chain records we actually hold (minimal by design).
          </p>
        </div>

        <div className="mt-10 text-xs text-white/50">
          Full Terms of Service: <Link href="/tos" className="underline hover:text-white">/tos</Link>
        </div>
      </div>
    </div>
  );
}
