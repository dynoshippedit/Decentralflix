"use client";

import { useSubscriptionManager } from "@/lib/contracts/useSubscriptionManager";

/**
 * Filmmaker headline for the pricing page. The displayed creator share is
 * read from the SubscriptionManager contract's immutable PLATFORM_FEE_BPS
 * constant (MUS-001: 75% creator / 25% platform), falling back to the
 * canonical shared-config mirror when no deployment exists yet — so the
 * marketing copy can never drift from the code.
 */
export function CreatorShareHeadline() {
  const { creatorSharePct, isOnChain } = useSubscriptionManager();
  return (
    <div className="mb-10">
      <div className="text-red-500 text-xs tracking-[3px] mb-2">FOR FILMMAKERS</div>
      <h2 className="text-3xl md:text-4xl font-semibold tracking-[-2px]">
        Upload. Set your price. Keep {creatorSharePct}.
      </h2>
      <p className="text-white/50 mt-3 max-w-2xl text-sm leading-relaxed">
        Every tier pays the same {creatorSharePct} creator share on every sale.
        The tiers differ in catalog size and tooling — never in your cut.
        {isOnChain ? null : (
          <span className="block mt-1 text-white/30 text-xs">
            Backed by the on-chain split — enforced by the contract, not by us.
          </span>
        )}
      </p>
    </div>
  );
}
