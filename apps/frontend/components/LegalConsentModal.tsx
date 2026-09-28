'use client';

import { useState, useEffect } from 'react';

const CONSENT_KEY = 'df_legal_consent_v1';

export function hasLegalConsent(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(CONSENT_KEY) === 'accepted';
}

export function acceptLegalConsent() {
  if (typeof window !== 'undefined') {
    localStorage.setItem(CONSENT_KEY, 'accepted');
    window.dispatchEvent(new Event('df-legal-consent-changed'));
  }
}

interface LegalConsentModalProps {
  open: boolean;
  onAccepted: () => void;
}

export default function LegalConsentModal({ open, onAccepted }: LegalConsentModalProps) {
  const [checked, setChecked] = useState(false);

  if (!open) return null;

  const handleAccept = () => {
    if (checked) {
      acceptLegalConsent();
      onAccepted();
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4">
      <div className="max-w-2xl w-full bg-zinc-950 border border-white/20 rounded-2xl p-8 text-white shadow-2xl">
        <div className="text-center mb-6">
          <div className="inline-block px-4 py-1 mb-4 text-xs tracking-[3px] border border-white/30 rounded-full">
            NON-CUSTODIAL • UTILITY ONLY • SECTION 230 PROTECTED
          </div>
          <h2 className="text-3xl font-semibold tracking-[-1.5px]">Before you continue</h2>
          <p className="text-white/70 mt-2 text-sm">Decentralflix is a fully non-custodial platform. You must understand and accept the terms.</p>
        </div>

        <div className="space-y-4 text-sm leading-relaxed bg-black/40 border border-white/10 rounded-xl p-6 mb-6 max-h-[320px] overflow-auto">
          <p className="font-medium text-emerald-400">Non-Custodial Decentralized Platform</p>
          <p>DecentralFlix is a non-custodial software interface. We do not hold, control, custody, or have access to any user funds, NFTs, credits, or assets. All transactions occur solely on-chain via your wallet and smart contracts. No financial services or money transmission.</p>

          <p className="font-medium text-emerald-400 mt-4">Utility-Only NFTs — No Securities or Investment Contracts</p>
          <p>All NFTs (Basic, Deluxe, Producer) are utility/access tokens only. They grant film access, review rights, and crowdfund participation. Producer-tier crowdfunding and milestone escrow create no expectation of profits or returns. These are not investments, securities, or financial products. You assume all risk of volatility and total loss.</p>

          <p className="font-medium text-emerald-400 mt-4">Zero Censorship + Section 230 + DMCA</p>
          <p>We support a zero-censorship policy for user-generated content to the maximum extent permitted by Section 230 of the Communications Decency Act. We respond to valid DMCA notices by delisting access links only. You are solely responsible for your content.</p>

          <p className="font-medium text-emerald-400 mt-4">Risks & Disclaimers</p>
          <p>Cryptocurrencies and NFTs are highly volatile. The platform is provided “AS IS” with no warranties. We provide no financial, investment, tax, or legal advice. You assume all risk. Limitation of liability and arbitration (Cleveland, Ohio / Delaware) apply per the full Terms.</p>

          <p className="text-[11px] text-white/50 mt-4 border-t border-white/10 pt-4">
            Full Terms of Service and Privacy Policy are available in the footer.
          </p>
        </div>

        <label className="flex items-start gap-3 text-sm cursor-pointer mb-6">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-1 accent-white"
          />
          <span>
            I have read, understand, and agree to the Terms of Service and Privacy Policy. I understand this is a non-custodial platform, NFTs are utility-only access tokens with no profit expectations, and I assume all crypto/NFT risks.
          </span>
        </label>

        <div className="flex gap-3">
          <button
            onClick={handleAccept}
            disabled={!checked}
            className="flex-1 px-8 py-4 bg-white text-black rounded-full font-medium disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.985] transition"
          >
            I Understand and Agree — Continue
          </button>
        </div>

        <p className="text-center text-[10px] text-white/40 mt-4 tracking-widest">
          ARBITRATION • CLASS ACTION WAIVER • DELAWARE/OHIO GOVERNING LAW
        </p>
      </div>
    </div>
  );
}
