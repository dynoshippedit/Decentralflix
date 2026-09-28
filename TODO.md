# TODO.md — Living Task List

## Phase 0 Tasks (Current)
- [x] Initialize Turborepo + pnpm monorepo
- [x] Create folder structure
- [x] Set up Hardhat
- [x] Align contract → Renamed to `MovieTicket.sol`
- [x] Add Privy + SIWE wallet connection (with cinematic button in hero)
- [x] Create Arweave upload pipeline (stable `arweave` package)
- [x] Add placeholder components & auth scaffolding
- [x] Create comprehensive .env.example with all required variables
- [x] Fix deploy script bug
- [x] Implement 5 contract improvements (onlyOwner, payable + price enforcement, correct creator, pause controls, improved events) + verified clean compile
- [x] Deploy script improved + tested locally
- [x] Frontend contract config + ABI created
- [x] Real viem + Privy contract write wired in /mint page
- [x] .env.example updated with contract address variable
- [ ] Deploy to Arbitrum Sepolia (requires funded PRIVATE_KEY)
- [ ] Full end-to-end test (upload → mint → view)
- [x] Frontend for FilmmakerCampaign (useFilmmakerCampaign hook + /crowdfund page with launch/contribute/AI-proof flows using Arweave + exact existing write patterns) — Phase 0 practical advance of crowdfunding (emerald Producer accents + verified backer → Reviews tie-in)
- [x] Phase 0/1 Creator + User Dashboard stub: new `/dashboard` route (tabbed User Library + Creator Studio), `useCreatorDashboard` hook (created films scan, real CreatorPaid event earnings, my campaigns filter, demo+on-chain), Arweave upload integration, strong reuse of useOwnedFilms/useSeederCredits/useReviews/useFilmmakerCampaign + tiers/credits/Reviews voice. Beautiful cinematic UI. Nav links added everywhere.

**Current Top Priority (Maximum Autonomy — Reviews as CORE FEATURE)**

Key improvement (per your latest requirement):
- **Strict gating**: Only users who own a ticket for the film can see or submit a review (enforced on-chain via `hasAccessToVideo` and in UI). Random users are blocked from the form.
- Single review per user per film + full edit capability (you can change your mind later).

This directly fulfills: "single film review only if they have watched the film or purchased it — random users cannot leave a review for something they do not own."

Continuing to push the 4 priorities for a real 9–10 experience.

Reviews is now the highest priority until it feels like a real, valuable, first-class social feature (target 9–10 in Phase 0).

Recent progress:
- FilmCard with ratings now on landing (discoverability) ✅
- Collection restructured as strong ownership + reviews hub ✅
- New `/film/[hash]` page created as the natural per-film experience where reviews live as first-class ✅
- Reviews component + /reviews page improved with recent reviews preview and stronger "I own this" messaging ✅

Continuing autonomously on the 4 priorities. Other work secondary.

**Checkpoint:** Created in marker.md (full review of all 5 items + new directive).

**Reviews Priorities Progress:**
1. Discoverable: FilmCard with average ratings on landing (Now Playing + Top Reviewed) ✅; recent reviews section in Collection ✅
2. Ownership flows: Collection restructured with per-film review CTAs and "Recent reviews from your films" ✅
3. UX: Reviews component + /reviews page improved with better structure and two-layer clarification ✅
4. Two-layer model: Public critiques prioritized and explained in UI/docs ✅

**ADR-001 Spikes (Clean Rewrite Architecture Track)**
- [x] Spike 1 (Livepeer + Filecoin VOD prototype) — see marker.md + apps/frontend/spikes/spike-1/README.md
- [x] Spike 2 (Theta P2P + seeding metrics prototype) — see marker.md + apps/frontend/spikes/spike-2/README.md
- [x] Spike 3+ progress: useVideoSources + VideoPlayer hybrid integration advanced (error handling, prominent seeder metrics panel, demo graceful degradation for missing CIDs). See live-build-status.log + Live-Build-OS/docs/TASK-HIERARCHY-AND-DEPENDENCIES.md. Indexer/SeederCredits v2 + gating next.

Other workstreams deprioritized. Continuing on making Reviews a real, usable social layer.

Gaps and next steps tracked in marker.md and ROADMAP.md.

**Progress Notes (autonomous night session):**
- Contract file renamed to `MovieTicket.sol` and contract name updated to `MovieTicket` (reasonable default to match PHASE0 spec).
- Installed `wagmi`, `viem`, `@privy-io/react-auth`, and `arweave`.
- Created `WalletConnectButton` component and placed it prominently in the landing hero.
- Arweave upload functions (`uploadToArweave`, `uploadJSON`) implemented and ready (requires `ARWEAVE_WALLET_JSON` in env).
- Privy provider is live in the root layout with dark cinematic theme.
- `.env.example` created with clear instructions.

**Next (still Phase 0):**
- [x] Add `useArweaveUpload` React hook
- [x] Minor landing page polish + "For Creators" section with live UploadTest demo
- [x] Improved Privy config with Arbitrum Sepolia chain support (viem)
- [x] Stabilized Hardhat setup (v2.28 + toolbox v2 + tsconfig for compatibility)
- [x] Final documentation + TODO cleanup

---

## Phase 0 Summary (Autonomous Night Work)

**Completed:**
- Full infrastructure alignment
- `MovieTicket.sol` contract (renamed + deployed script updated)
- Production-ready Arweave upload pipeline + hook
- Privy + SIWE authentication fully wired (beautiful Connect Wallet button in hero)
- Cinematic landing page with working creator section
- All necessary packages installed (`arweave`, `@privy-io/react-auth`, `wagmi`, `viem`)
- `.env.example` with clear instructions for wallet key and Privy App ID
- Hardhat stabilized + full compile verified (fixed OZ v5 Counters removal + Solidity 0.8.28 + Cancun EVM for mcopy)
- Live demo of Arweave upload in the landing page (UploadTest component)

**Step 1: Local Mint Testing — COMPLETE (Refined & Bug-Checked)** ✅

All gaps addressed. Local flow is polished and ready.

**Step 2: Sepolia Deployment — Polishing Complete**

All items from "option b" have been polished in detail:
- Creator profit protection against gas/crypto price changes (immediate payout + events)
- Constructor + fee governance improvements
- Significantly better indexed events
- Comprehensive deployment checklist

`marker.md` cleaned and usage documented in RULES.md.

**Fully prepared for real Sepolia deployment.**

## Proposal: Move to Phase 1?

Once you review this, reply with approval and I can begin Phase 1 immediately:
- Real NFT minting flow using the MovieTicket contract
- Token-gated video playback (Livepeer + Arweave)
- "My Library" page for owned films
- Basic creator upload UI that actually uses the Arweave pipeline

The project now has strong momentum. Ready when you are.

## Phase 1 Tasks (Next)
- Token-gated video playback
- NFT minting flow
- Record viewing (torn ticket)
- NFT-gated ratings & comments
- Admin delist tools

Update this file as you work.