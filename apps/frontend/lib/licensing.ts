/**
 * The purchase license model (research update 2026-09-28, "Separate the file
 * from the access promise"). Streaming access is a licensed entitlement, not a
 * perpetual-operation promise. The on-chain token is an optional collectible
 * record — it never gates viewing.
 */
export interface LicenseRow {
  offer: string;
  receives: string;
  mustBeTrue: string;
}

export const LICENSE_TABLE: LicenseRow[] = [
  {
    offer: "Rental",
    receives: "A time-limited viewing entitlement.",
    mustBeTrue: "Clear start/expiry rules, device recovery, and delivery during the rental window.",
  },
  {
    offer: "Streaming access",
    receives: "Access under a stated consumer license and service terms.",
    mustBeTrue:
      "Honest limits, an ongoing hosting plan, and the applicable disclosures — no promise of perpetual operation.",
  },
  {
    offer: "Permanent download (where the filmmaker allows it)",
    receives: "An authorized offline copy with personal-use terms.",
    mustBeTrue:
      "The license must permit that distribution; the file plays without a continuing authorization server.",
  },
  {
    offer: "Replacement access",
    receives: "A new creator-approved entitlement for a verified earlier buyer.",
    mustBeTrue:
      "Authority to grant it, recorded claim evidence, and no implication that all Vimeo rights were transferred.",
  },
  {
    offer: "Collector token (optional)",
    receives: "An optional collectible or record tied to explicit terms.",
    mustBeTrue:
      "Separate treatment of collectible ownership, viewing rights, transfers, and platform restrictions — token ownership does not unlock app functionality (Apple App Store §3.1.1).",
  },
];

/**
 * Apple App Store constraint (§3.1.1): NFT ownership must not unlock app
 * functionality. The token is a collectible record; viewing uses the account license.
 */
export const APPLE_NFT_NOTE =
  "App-store note (Apple §3.1.1): the on-chain token is a collectible record of your purchase — owning it does not unlock app functionality. Your viewing license lives in your Decentralflix account and works on iOS without any token.";

/**
 * Update-20 logic applied to on-chain mints: test bundles before building any
 * stored-value wallet. The honest way to save on several films is a same-seller
 * bundle at checkout — one purchase, no unspent balances, no liabilities.
 */
export const BUNDLES_BEFORE_WALLET_NOTE =
  "This mint is not a wallet or stored balance. The honest way to save on several films is a same-seller bundle at checkout — one purchase, no unspent balances, no liabilities.";
