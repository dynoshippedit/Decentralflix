import { Address } from 'viem';
import {
  MOVIE_TICKET_ABI_FULL,
  FILMMAKER_CAMPAIGN_ABI_FULL,
  REVIEWS_ABI_FULL,
  SEEDER_CREDITS_ABI_FULL,
  TICKET_NFT_ABI_FULL,
  SUBSCRIPTION_MANAGER_ABI_FULL,
  PAY_PER_VIEW_ABI_FULL,
  DFLIX_ABI_FULL,
} from './abis.generated';

// Contract addresses - set via .env after deployment
export const MOVIE_TICKET_ADDRESS = (process.env.NEXT_PUBLIC_MOVIE_TICKET_ADDRESS || '0x0000000000000000000000000000000000000000') as Address;
export const REVIEWS_ADDRESS = (process.env.NEXT_PUBLIC_REVIEWS_ADDRESS || '0x0000000000000000000000000000000000000000') as Address;
export const SEEDER_CREDITS_ADDRESS = (process.env.NEXT_PUBLIC_SEEDER_CREDITS_ADDRESS || '0x0000000000000000000000000000000000000000') as Address;
export const FILMMAKER_CAMPAIGN_ADDRESS = (process.env.NEXT_PUBLIC_FILMMAKER_CAMPAIGN_ADDRESS || '0x0000000000000000000000000000000000000000') as Address;

// ── Phase 2 (ethers v6 wallet layer) deployments ─────────────────────────────
// Sepolia addresses are filled in by Phase 2 step 9 (testnet deploy) via the
// NEXT_PUBLIC_* env vars. Until then every address is the zero address and
// lib/web3/contracts.ts throws a clear UNDEPLOYED error instead of building
// a contract handle that would send calls into the void.
export const TICKET_NFT_ADDRESS = (process.env.NEXT_PUBLIC_TICKET_NFT_ADDRESS || '0x0000000000000000000000000000000000000000') as Address;
export const SUBSCRIPTION_MANAGER_ADDRESS = (process.env.NEXT_PUBLIC_SUBSCRIPTION_MANAGER_ADDRESS || '0x0000000000000000000000000000000000000000') as Address;

// ── MUS-001 / df-cycle-12/13: canonical fee constants ─────────────────────────
// Mirror of the immutable RevenueSplitter.PLATFORM_FEE_BPS on-chain constant
// (2500 = 25% platform, 75% creator), inherited by SubscriptionManager,
// PayPerView, MovieTicket and TicketNFT. Hooks read the live on-chain value
// when a deployment exists; this is the build-time source of truth so
// marketing copy and code cannot drift.
export const PLATFORM_FEE_BPS = 2500;
export const CREATOR_SHARE_BPS = 10000 - PLATFORM_FEE_BPS; // 7500
export const SUBSCRIPTION_PLATFORM_FEE_BPS = PLATFORM_FEE_BPS;
export const SUBSCRIPTION_CREATOR_SHARE_BPS = CREATOR_SHARE_BPS;
export const PAY_PER_VIEW_ADDRESS = (process.env.NEXT_PUBLIC_PAY_PER_VIEW_ADDRESS || '0x0000000000000000000000000000000000000000') as Address;
export const DFLIX_ADDRESS = (process.env.NEXT_PUBLIC_DFLIX_ADDRESS || '0x0000000000000000000000000000000000000000') as Address;

export const ARBITRUM_SEPOLIA_CHAIN_ID = 421614;

// ABIs are sourced directly from the compiled contracts via abis.generated.ts
// (regenerate with `npm run export:abi` in packages/contracts). This keeps the frontend in
// lockstep with the real on-chain interfaces — no hand-maintained drift.
export const MOVIE_TICKET_ABI = MOVIE_TICKET_ABI_FULL;
export const FILMMAKER_CAMPAIGN_ABI = FILMMAKER_CAMPAIGN_ABI_FULL;
export const REVIEWS_ABI = REVIEWS_ABI_FULL;

// Phase 2 contract ABIs (ethers v6 wallet layer consumes these).
export const TICKET_NFT_ABI = TICKET_NFT_ABI_FULL;
export const SUBSCRIPTION_MANAGER_ABI = SUBSCRIPTION_MANAGER_ABI_FULL;
export const PAY_PER_VIEW_ABI = PAY_PER_VIEW_ABI_FULL;
export const DFLIX_ABI = DFLIX_ABI_FULL;

// SeederCredits: the real compiled ABI plus one frontend-only forward-looking entry
// (submitMultiSourceReport) that the v2 seeding UI references. The on-chain v2 will add this;
// until then it lets the spike UI compile against the intended shape. Everything else is real.
export const SEEDER_CREDITS_ABI = [
  ...SEEDER_CREDITS_ABI_FULL,
  {
    inputs: [
      { name: 'arweaveReportTxId', type: 'string' },
      { name: 'claimedAmount', type: 'uint256' },
      { name: 'platformSignature', type: 'bytes' },
      { name: 'sourceMask', type: 'bytes32' }, // bitmask: 1=Theta, 2=Filecoin, 4=Livepeer etc.
    ],
    name: 'submitMultiSourceReport',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

// v2 Redemption rewardType constants (bytes32(keccak256) or ascii packed; used in redeem + UI)
export const SEEDER_REWARD_MINT_DISCOUNT = '0x4d494e545f444953434f554e545f313000000000000000000000000000000000' as const; // "MINT_DISCOUNT_10"
export const SEEDER_REWARD_FREE_TICKET = '0x465245455f4255524e41424c455f5449434b4554000000000000000000000000' as const; // "FREE_BURNABLE_TICKET"
export const SEEDER_REWARD_PRODUCER_BOOST = '0x50524f44554345525f424f4f5354000000000000000000000000000000000000' as const; // "PRODUCER_BOOST"
export const SEEDER_REWARD_AI_CREDITS = '0x41495f434f4c4c41425f43524544495453000000000000000000000000000000' as const; // "AI_COLLAB_CREDITS" (32-byte bytes32; was malformed 33-byte value)
