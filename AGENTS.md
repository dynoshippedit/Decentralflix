# DecentralFlix — Agent Rules

**Single source of truth for the business model:** the research PDFs (DecentralFlix Research Updates 1–7) and the Update-20 decisions recorded in `DECISIONS.md`. If any doc in this repo contradicts them on business model, pricing, or legal posture, the research PDFs win — fix the doc.

## Business model (from the research PDFs — DO NOT DRIFT)

**License-based access, not ownership.** Viewers buy a license, not the film. The license table (`apps/frontend/lib/licensing.ts`) is canonical:
- Rental (time-limited streaming)
- Licensed streaming access (stream while the license is valid)
- Permanent download — ONLY where the filmmaker explicitly permits it
- Replacement access (re-download / re-stream if your copy is lost)
- Collector token (a collectible; see Apple §3.1.1 note below)

**Banned copy.** Never write, in UI copy, docs, or agent instructions: "forever", "permanent access", "own it forever", "can't be taken away", "watch forever", or any promise of perpetual operation. The `copy-honesty` test suite scans the frontend for these patterns and fails the build if they appear. Storage permanence (Arweave/Filecoin) may be described accurately — that is about bits, not about the viewer's right to watch.

**75% creator share.** The verified economics basis is 75% to the creator, 25% platform. Never imply 90%. The on-chain platform fee is hard-capped at 25% (2500 bps) in every payment contract. The deploy script uses 2500 bps.

**No instant-payout promises.** Do not promise payment "instantly", "immediately", or "at the moment of sale". Describe the mechanism honestly (contract splits payment to creator and platform on each sale; creators withdraw) without promising timing.

**Bundles before wallet.** Viewer onboarding is: browse → bundle/pay → then wallet/account. Never require a wallet connection before a viewer can see what they're buying.

**Apple §3.1.1.** Token ownership does NOT unlock app functionality. Viewing rights live in the platform account/entitlement, not in token ownership. Say this wherever tokens and access appear together.

**DEFERRED features (do not build, do not present as live):**
- **Crowdfunding** — DEFERRED. Offering crowdfunding without a registered funding portal risks an unregistered securities offering. The `FilmmakerCampaign.sol` contract file is retained for history only, marked DEFERRED at the top. The `/crowdfund` route shows a deferral notice. Do not re-add crowdfunding UI, links, or flows.
- **Collector Pass** — DEFERRED. The proposed economics do not work ($10/mo for two $8 credits = $16 of value; the math is public in the pricing page's economics warning). It is not an active offer. Do not present it as purchasable.
- **Stored credits, seeder rewards, NFT-gated access, P2P delivery savings, stablecoin checkout** — deferred. The homepage FAQ says this plainly; keep it that way. Never market what isn't built.

## Architecture (technical — unchanged)

- **Primary video delivery:** Cloudflare R2 (private) + Cloudflare CDN + Workers (signed URLs). Zero egress fees.
- **Transcoding:** Livepeer (HLS adaptive). **Backup:** Filecoin/IPFS (full mirror). **Metadata/proofs:** Arweave ONLY (never video bytes).
- **Blockchain (Phase 2, unaudited, undeployed):** TicketNFT (ERC721), SubscriptionManager, PayPerView (platform fee capped 25%), DFLIX (ERC20, staking, attestor-allocated seed-to-earn — protocol mechanics, NOT promised yield), ProofRegistry, SeederReputation. Contracts are UNAUDITED and have never been deployed to any network. Keep it that way until Dino explicitly authorizes a testnet deploy with a fresh testnet-only key.
- **Auth + wallets:** Privy (Google/Apple/Email embedded wallets). Never force MetaMask on day-1 users.
- **Indexer:** Goldsky (no linear on-chain scans in prod paths). **Backend:** Node.js + Postgres + Redis at scale.
- **P2P:** opt-in seeder layer only, never primary delivery.

## Legal (non-negotiable)

- All tokens are **utility-only access tokens** (not securities, not investment contracts).
- **Non-custodial everywhere**: wallet-to-wallet only. Platform never holds funds.
- Section 230 + DMCA safe harbor framing in user-facing copy. DMCA agent designated (one element of compliance, not the whole).
- ToS clickwrap required before purchase/upload/review actions.
- NCMEC CyberTipline reporting is mandatory federal law for CSAM (admin dashboard generates the report data).
- Human review for trust decisions. No AI content moderation.

## Verification (mandatory after every change)

1. `npx tsc --noEmit` — fix ALL errors in files you touched.
2. After Solidity changes: `npx hardhat compile` + `npx hardhat test` in `packages/contracts`.
3. Frontend changes: `vitest run` in `apps/frontend`, then `next build`.
4. Lifeboat changes: `./test.sh` in `apps/lifeboat`.
5. Never claim completion without running these. Never leave a suite red.

## What NOT to do

- Do not reintroduce the old model: no "own it forever", no NFT-gated permanent film access, no 70% fee, no instant payouts, no live crowdfunding, no live Collector Pass.
- Do not put video bytes on Arweave. Do not expose R2 credentials to client code.
- Do not use linear token scans for ownership. Do not build AI moderation.
- Do not promise what the research PDFs defer. When in doubt, the PDFs win.
