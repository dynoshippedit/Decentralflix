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

export const CREATOR_SHARE = 0.75;
export const CREATOR_SHARE_PCT = "75%";

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
      "Same-seller bundles + Collector Pass eligibility",
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
    tagline: "Buy once. Yours to keep, forever.",
    features: [
      "Permanent access — never a rental window",
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
    ],
    cta: "Browse films",
  },
  {
    id: "collector-pass",
    name: "Collector Pass",
    price: "$10/mo",
    priceNote: "Draft price — not final",
    tagline: "Two films a month, on us-ish.",
    features: [
      "2 × $8 credits every month",
      "Redeem for any film priced $8 or less",
      "Unused credits expire monthly",
      "Cancel anytime; kept films stay yours",
    ],
    cta: "Get the pass",
    featured: true,
    warning: ECONOMICS_WARNING,
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
];
