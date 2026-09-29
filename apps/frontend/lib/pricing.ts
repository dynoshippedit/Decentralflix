/**
 * Decentralflix pricing — SINGLE SOURCE OF TRUTH for all marketing surfaces.
 *
 * Every price on this page is DRAFT / PROPOSED. Dino has not approved pricing.
 * Verified economics that constrain this file (research update 5, 2026-09-28):
 *  - Tested basis is a 75% creator share. At $4/order the modeled creator
 *    contribution is ~$0.28. NEVER advertise 90%.
 *  - Collector Pass ($10/mo, 2x$8 credits) costs $12 in creator payouts at a
 *    75% share BEFORE processing and delivery. The economics warning must
 *    appear on EVERY surface that mentions the pass.
 * Deferred (must NOT be implied as existing): stored credits/balances, seeder
 * rewards, native NFT access, P2P swarm savings, stablecoin checkout.
 */

export const PRICING_STATUS = "draft" as const;
export const PRICING_DISCLAIMER =
  "All prices are proposed drafts. Decentralflix has not launched and no pricing is final.";

import { SUBSCRIPTION_CREATOR_SHARE_BPS } from "./contracts/config";

// MUS-001: derived from the immutable SubscriptionManager.PLATFORM_FEE_BPS
// split (75% creator / 25% platform) via the shared contract config — never
// a hardcoded literal, so copy and code cannot drift.
export const CREATOR_SHARE = SUBSCRIPTION_CREATOR_SHARE_BPS / 10000;
export const CREATOR_SHARE_PCT = `${SUBSCRIPTION_CREATOR_SHARE_BPS / 100}%`;

/**
 * Migration pilot cap (research update 2026-09-28): the free pilot is 10
 * titles within a FIXED migration budget. "Zero platform fee" is not zero
 * cost — storage, delivery, claim review, and support still cost money, and
 * the cap covers a bounded share of them.
 */
export const MIGRATION_PILOT_CAP =
  "Migration Pilot, capped on purpose: free migration help for up to 10 titles per filmmaker, " +
  "inside a fixed pilot migration budget. The cap covers storage, delivery, and manual claim " +
  "review for the pilot period. Zero platform fee does not mean zero cost — open-ended free " +
  "hosting would be a promise we can't keep, so we don't make it.";

export const ECONOMICS_WARNING =
  "Collector Pass economics (draft model, not final): a $10/mo pass with two $8 credits " +
  "costs $12 in creator payouts at a 75% creator share — before card processing and delivery. " +
  "This model only works with a different price, allocation basis, included catalog, or usage " +
  "design. Do not rely on subscribers forgetting to redeem. Credit expiration, refunds, " +
  "cancellation, and post-membership access must all be defined before any real-money launch.";

export interface FilmmakerTier {
  id: string;
  name: string;
  price: string;
  priceNote: string;
  tagline: string;
  titleLimit: string;
  features: string[];
  cta: string;
  featured?: boolean;
}

export const FILMMAKER_TIERS: FilmmakerTier[] = [
  {
    id: "migration-pilot",
    name: "Migration Pilot",
    price: "Free",
    priceNote: "Capped pilot for Vimeo migrators",
    tagline: "Leaving Vimeo? Bring your catalog home.",
    titleLimit: "Up to 10 titles",
    features: [
      "75% creator share on every sale",
      "Migration concierge — we help move your catalog",
      "Vimeo export creates contacts only; buyers claim access with your approval",
      "Standard review queue (24–72h)",
      "Signed receipts for every buyer",
    ],
    cta: "Apply for the pilot",
  },
  {
    id: "creator",
    name: "Creator",
    price: "$29/mo",
    priceNote: "Draft price — not final",
    tagline: "For working independent filmmakers.",
    titleLimit: "Up to 50 titles",
    features: [
      "75% creator share on every sale",
      "Analytics dashboard (views, sales, geography)",
      "Priority review queue (24h)",
      "Same-seller bundles",
      "Custom film pages",
    ],
    cta: "Start creating",
    featured: true,
  },
  {
    id: "studio",
    name: "Studio",
    price: "$99/mo",
    priceNote: "Draft price — not final",
    tagline: "For labels, distributors, and teams.",
    titleLimit: "Unlimited titles",
    features: [
      "75% creator share on every sale",
      "3 team seats with roles",
      "API access for catalog sync",
      "Dedicated support channel",
      "Featured placement eligibility",
    ],
    cta: "Talk to us",
  },
];

export interface ViewerOption {
  id: string;
  name: string;
  price: string;
  priceNote: string;
  tagline: string;
  features: string[];
  cta: string;
  featured?: boolean;
  warning?: string;
}

export const VIEWER_OPTIONS: ViewerOption[] = [
  {
    id: "pay-per-film",
    name: "Pay-per-film",
    price: "From $3.99",
    priceNote: "Filmmaker sets the price",
    tagline: "Buy once under a clear license.",
    features: [
      "Licensed streaming access — never a rental window",
      "Honest limits: streaming depends on the licensed service",
      "Signed receipt, verifiable offline",
      "Watch on web and mobile",
      "No account lock-in on your library",
    ],
    cta: "Browse films",
  },
  {
    id: "bundles",
    name: "Same-seller bundles",
    price: "15% off",
    priceNote: "Draft mechanic — 3+ films, one filmmaker",
    tagline: "Go deep on a creator you love.",
    features: [
      "One checkout, multiple films",
      "Single signed receipt per film",
      "15% bundle discount (draft)",
      "Same-seller only — no cross-creator splits yet",
      "No stored balance needed — the processing-fee saving happens at checkout",
    ],
    cta: "Browse films",
  },
];

export interface ContributionRow {
  scenario: string;
  creatorPayout: number;
  cardCost: number;
  deliveryAllowance: number;
  opsAllowance: number;
  platformContribution: number;
}

/**
 * Per-order contribution after variable costs (research update 2026-09-28).
 * Basis: creator gets 75% of pre-tax price; platform bears US domestic card
 * processing (2.9% + $0.30), a delivery allowance, and a $0.20 variable-ops
 * placeholder. Before storage, ingest/transcoding, payout fees, taxes, FX,
 * legal, acquisition, and fixed overhead.
 */
export const CONTRIBUTION_TABLE: ContributionRow[] = [
  { scenario: "$4 at 75%", creatorPayout: 3.0, cardCost: 0.416, deliveryAllowance: 0.1, opsAllowance: 0.2, platformContribution: 0.284 },
  { scenario: "$4 at 90% (loss-making — never offered)", creatorPayout: 3.6, cardCost: 0.416, deliveryAllowance: 0.1, opsAllowance: 0.2, platformContribution: -0.316 },
  { scenario: "$8 at 75%", creatorPayout: 6.0, cardCost: 0.532, deliveryAllowance: 0.1, opsAllowance: 0.2, platformContribution: 1.168 },
  { scenario: "$12 at 75%", creatorPayout: 9.0, cardCost: 0.648, deliveryAllowance: 0.15, opsAllowance: 0.2, platformContribution: 2.002 },
];

export interface DeferredItem {
  name: string;
  reason: string;
}

/**
 * Full defer list (research update 2026-09-28, "What to keep / defer or
 * redesign"). Each item carries its one-line reason for deferral. None of
 * these are built, priced, or implied as existing anywhere on the site.
 */
export const DEFERRED_ITEMS: DeferredItem[] = [
  {
    name: "Stored credits & Collector Pass",
    reason: "Deferred until repeat-purchase evidence exists and the redemption allocation has a reviewed provider/legal design.",
  },
  {
    name: "Stored-value wallet",
    reason: "Deferred — unspent balances create refunds, liabilities, and legal obligations a checkout bundle avoids.",
  },
  {
    name: "Seeder rewards",
    reason: "Deferred until measured net bandwidth savings exist; rewards pay only for validated useful delivery.",
  },
  {
    name: "Native NFT access",
    reason: "Deferred — Apple's rules: NFT ownership must not unlock app functionality. Viewing owned NFTs is allowed; gating features on them is not.",
  },
  {
    name: "AI cinema lane",
    reason: "Deferred until there is paying-audience evidence and defensible rights; an AI-provenance label alone clears nothing.",
  },
  {
    name: "Community-funded originals",
    reason: "Deferred until an engaged audience, financing terms, production capability, and a lawful funding structure exist.",
  },
  {
    name: "International rollout",
    reason: "Deferred until demand, payment acceptance, rights coverage, and delivery economics are proven per country.",
  },
  {
    name: "Stablecoin checkout",
    reason: "Deferred — product-specific rates, refund behavior, and eligible locations must be designed first.",
  },
  {
    name: "Cross-filmmaker bundles",
    reason: "Deferred — multi-seller bundles need explicit revenue allocation and a supported payment flow.",
  },
];

/** Phrases that must never appear in pricing/marketing copy as live features. */
export const DEFERRED_FEATURE_PHRASES = [
  "stored credits",
  "stored balance",
  "seeder rewards",
  "earn for seeding",
  "P2P savings",
  "swarm savings",
  "stablecoin",
  "pay with USDC",
  "native NFT access",
  "AI cinema",
  "community-funded",
];
