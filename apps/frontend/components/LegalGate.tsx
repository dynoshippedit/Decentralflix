'use client';

import { useState, useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import LegalConsentModal, { hasLegalConsent } from './LegalConsentModal';

export default function LegalGate({ children }: { children: React.ReactNode }) {
  const { authenticated, ready } = usePrivy();
  const [consentOpen, setConsentOpen] = useState(false);
  const [hasConsent, setHasConsent] = useState(true); // default true until checked

  useEffect(() => {
    const check = () => {
      const ok = hasLegalConsent();
      setHasConsent(ok);
      if (authenticated && ready && !ok) {
        setConsentOpen(true);
      }
    };
    check();

    const handler = () => check();
    window.addEventListener('df-legal-consent-changed', handler);
    return () => window.removeEventListener('df-legal-consent-changed', handler);
  }, [authenticated, ready]);

  const handleAccepted = () => {
    setConsentOpen(false);
    setHasConsent(true);
  };

  return (
    <>
      {children}
      <LegalConsentModal
        open={consentOpen}
        onAccepted={handleAccepted}
      />
    </>
  );
}
