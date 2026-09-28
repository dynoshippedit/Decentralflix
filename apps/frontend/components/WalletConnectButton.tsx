'use client';

import { usePrivy } from '@privy-io/react-auth';

/**
 * Cinematic Wallet Connect Button for Decentralflix
 * Placed in the hero for MVP as requested.
 */
export default function WalletConnectButton() {
  const { ready, authenticated, user, login, logout } = usePrivy();

  // Don't render until Privy is ready
  if (!ready) {
    return (
      <button
        disabled
        className="px-10 py-4 text-lg font-medium bg-white/50 text-black rounded-full cursor-not-allowed"
      >
        Loading...
      </button>
    );
  }

  // User is logged in
  if (authenticated && user) {
    const address = user.wallet?.address || user.email?.address || 'Connected';

    return (
      <div className="flex items-center gap-3">
        <div className="px-4 py-2 text-sm bg-white/10 border border-white/20 rounded-full text-white/80 font-mono tracking-tight">
          {address.slice(0, 6)}...{address.slice(-4)}
        </div>
        <button
          onClick={logout}
          className="px-6 py-3 text-sm font-medium border border-white/70 hover:bg-white/10 rounded-full transition-all active:scale-[0.985]"
        >
          Disconnect
        </button>
      </div>
    );
  }

  // Not logged in — show beautiful CTA
  return (
    <button
      onClick={login}
      className="px-10 py-4 text-lg font-medium bg-white text-black rounded-full hover:bg-white/90 transition-all active:scale-[0.985] shadow-xl"
    >
      Connect Wallet
    </button>
  );
}
