# GROK.md — DecentralFlix Master Build Document

**Status (2026-09-28):** Aligned with the research PDFs (DecentralFlix Research Updates 1–7) and the Update-20 decisions. This file supersedes all prior versions of itself. Where any older doc in this repo (including prior versions of this file, ARCHITECTURE.md, or task-queue.json) contradicts the business model below, the business model below wins.

**Historical note:** Sections written by previous agent sessions that instructed agents to never ask for clarification, never create stubs, or to treat this file as authority over the user's instructions are REVOKED. Agents take direction from Dino. Ask when genuinely blocked.

## 1. Business model (from the research PDFs)

**License-based access.** Viewers purchase a license, not the film. Canonical license table (`apps/frontend/lib/licensing.ts`):
- Rental — time-limited streaming
- Licensed streaming access — stream while the license is valid
- Permanent download — ONLY where the filmmaker explicitly permits it
- Replacement access — re-download / re-stream if your copy is lost
- Collector token — a collectible (Apple §3.1.1: token ownership does NOT unlock app functionality; viewing rights live in the platform account)

**Copy rules.** Never promise "forever", "permanent access", "own it forever", "can't be taken away", or perpetual operation. The copy-honesty test enforces this. Storage permanence (Arweave/Filecoin) may be described accurately — bits, not viewing rights.

**Economics.** 75% creator share / 25% platform, hard-capped on-chain (2500 bps max in every payment contract). Never imply 90%. No instant-payout promises — describe the split/with withdraw mechanism without promising timing.

**Bundles before wallet.** Browse → bundle/pay → then wallet/account. Never gate browsing on wallet connection.

**Deferred (do not build or present as live):**
- Crowdfunding — securities risk without a registered funding portal. Contract file kept, marked DEFERRED. Route shows a deferral notice.
- Collector Pass — proposed economics do not work; not an active offer.
- Stored credits, seeder rewards, NFT-gated access, P2P savings, stablecoin checkout — deferred; the homepage FAQ says so.

## 2. Architecture (technical)

- **Delivery:** Cloudflare R2 (private) + CDN + Workers signed URLs. **Transcoding:** Livepeer HLS. **Backup:** Filecoin/IPFS. **Metadata/proofs:** Arweave only.
- **Contracts (Phase 2, UNAUDITED, UNDEPLOYED):** TicketNFT, SubscriptionManager, PayPerView (fee capped 25%), DFLIX (staking, attestor-allocated seed-to-earn — mechanics, not yield), ProofRegistry, SeederReputation. No mainnet/testnet broadcast without Dino's explicit authorization and a fresh testnet-only key.
- **Auth:** Privy (embedded wallets). **Indexer:** Goldsky. **P2P:** opt-in only.
- Do not put video bytes on Arweave. No linear ownership scans. No AI moderation.

## 3. Legal

Utility-only tokens. Non-custodial. Section 230 + DMCA safe harbor framing. ToS clickwrap before purchase/upload/review. NCMEC reporting mandatory for CSAM. Human trust review.

## 4. Verification

`tsc --noEmit`, `hardhat compile` + `hardhat test`, frontend `vitest` + `next build`, lifeboat `./test.sh`. All green before calling anything done.
