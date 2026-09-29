# Claims Audit — Decentralflix docs vs code (Phase 1)
<!-- C12 · DOC lane · 2026-09-29 · Auditor: DOC (Product & Docs Auditor) -->
**Method:** every factual claim in the whitepaper and key docs was extracted with a `path:line` citation and quoted. Status per brief: `VERIFIED` (settled by a quick code read this phase), `CONTRADICTED` (code or a canonical doc disproves it), `UNVERIFIED` (left for Phase 3 / other lanes — the default in Phase 1). Canonical business-model source: `AGENTS.md` (itself: research PDFs win ties). Code paths are on the Threadripper at `/home/dino/Decentralflix`.

## A. docs/WHITEPAPER.md (v0.2, 2026-09-28)

| # | Claim (quoted) | Source | Status | Evidence / note |
|---|---|---|---|---|
| C-001 | "The tested basis is a **75% creator share**: on a $4.00 purchase, the filmmaker receives $3.00 and the protocol retains $1.00 … approximately **$0.28** … at a 90% share the same order loses roughly $0.32" | WHITEPAPER.md:104 | VERIFIED | `apps/frontend/lib/pricing.ts:19` `CREATOR_SHARE = 0.75`; pricing table:167 (`$4 at 75%`, payout 3.0, contribution 0.284; 90% → -0.316); README-lifeboat.md unit-economics table matches ($0.284 / -$0.316). Rounding $0.28/$0.32 consistent. |
| C-002 | PayPerView `platformFeeBps`, "capped at 2500 = 25%, adjustable by the owner"; "Filmmakers withdraw via `withdrawRevenue`; the owner withdraws accrued platform fees separately" | WHITEPAPER.md:45 | VERIFIED | `packages/contracts/contracts/PayPerView.sol:27-28` (`MAX_PLATFORM_FEE_BPS = 2500`), :55 (`platformFeeBps`), :100-143 (`buyAccess` escrows to `_filmRevenue`; `withdrawRevenue` splits fee to `_accruedPlatformFees`, forwards remainder; `withdrawPlatformFees` owner-only). Exact-payment revert :103. |
| C-003 | TicketNFT: "the full price is forwarded to the filmmaker"; "Soulbound tickets (per-film flag)"; "`redeemTicket(tokenId)` burns a single-use ticket"; "`hasValidTicket(holder, filmId)`" | WHITEPAPER.md:31-37 | VERIFIED | `packages/contracts/contracts/TicketNFT.sol:21` (is ERC721), :30 (`bool soulbound`), :132/151 (`call{value: msg.value}` forwards full price at mint), :160-166 (`redeemTicket` requires owner, `_burn`). |
| C-004 | DFLIX "hard cap of 1,000,000,000 tokens"; "restricted to addresses holding `MINTER_ROLE`"; "holders `stake()` DFLIX with a 7-day lock" | WHITEPAPER.md:77,79-80 | VERIFIED | `packages/contracts/contracts/DFLIX.sol:39` (`MAX_SUPPLY = 1_000_000_000 * 1e18`), :115-116 (cap enforced), :42 (`STAKE_LOCK_PERIOD = 7 days`). |
| C-005 | Storage: "default 1 MiB fragments"; "AES-256-GCM under a fresh random key, with a unique 12-byte IV per fragment"; SHA-256 hashing; manifest `{filmId, fragmentCount, fragmentHashes[], createdAt}`; "Uploads encrypted fragments to IPFS (Kubo API) with local pinning, and posts the manifest to Arweave"; "A mismatch throws `TamperError`" | WHITEPAPER.md:51-56 | VERIFIED (interface/mechanism) | `packages/storage/src/fragment.js:11` (`DEFAULT_FRAGMENT_SIZE = 1024 * 1024`), `packages/storage/src/encrypt.js:13` (`ALGORITHM = 'aes-256-gcm'`), :15 (`IV_BYTES = 12`), :28/:52 (randomBytes key + fresh IV). `storeFilm()` upload/pin behavior and `TamperError` throw path UNVERIFIED (STR lane, Phase 3). |
| C-006 | "`SeederReputation.reportSeeding(...)` … `score = uptimeHours + (GB served × 10) + (validProofs × 100)`"; "Reputation scores are **informational** … not Sybil-proof" | WHITEPAPER.md:69 | VERIFIED | `packages/contracts/contracts/SeederReputation.sol:122-126` (`(uptimeSecs/3600) + (bytesServed/1e9)*10 + validProofs*100`). docs/REPUTATION_LIMITATIONS.md states the non-guarantees plainly. |
| C-007 | "Merkle root of the fragment hashes stored on-chain in `ProofRegistry`. `verifyFragment(filmId, index, leafHash, proof)` … implements a matching SHA-256 verifier" | WHITEPAPER.md:118-121 | VERIFIED (exists) | `packages/contracts/contracts/ProofRegistry.sol:40` (`contract ProofRegistry`), :175 (`function verifyFragment`). Byte-identical round-trip claim UNVERIFIED (W3B/TST, Phase 3). |
| C-008 | Wallet layer "`apps/frontend/lib/web3/` connects MetaMask or Coinbase Wallet via EIP-6963"; "`switchChain()` targets Sepolia (11155111) … and Arbitrum Sepolia (421614)" | WHITEPAPER.md:62,169 | VERIFIED (exists) | `apps/frontend/lib/web3/` contains connect.ts, detect.ts, contracts.ts (+tests); `apps/frontend/lib/web3/types.ts:36-37` (`SEPOLIA_CHAIN_ID = 11155111`, `ARBITRUM_SEPOLIA_CHAIN_ID = 421614`). Liveness of wallet flows UNVERIFIED. |
| C-009 | SubscriptionManager: "`cancel()` ends access immediately with no refund (stated upfront, enforced in code)" | WHITEPAPER.md:41 | VERIFIED | `packages/contracts/contracts/SubscriptionManager.sol:143-148` (`expiresAt = block.timestamp`, emits `Cancelled`). |
| C-010 | "no third-party security audit"; "The test suite (217 contract tests) covers logic, not economic attacks"; "Mainnet deployment without an audit would be reckless" | WHITEPAPER.md:209 | VERIFIED (first two clauses: honesty statement; count UNVERIFIED) | Consistent with AGENTS.md ("Contracts are UNAUDITED and have never been deployed") and GROK.md ("Phase 2, UNAUDITED, UNDEPLOYED"). "217 tests" UNVERIFIED (TST lane). |
| C-011 | "No tokens have been issued on any public network" (header status line) | WHITEPAPER.md:3 | VERIFIED | `packages/contracts/deployments/` contains only `dry-run-local.json` — no testnet/mainnet deployment artifacts; AGENTS.md confirms never deployed. |
| C-012 | "`DFLIX.allocateSeedReward(seeder, amount, reportHash)` — attestor-only, replay-protected by `reportHash`"; "Rewards … are **not minted on demand**" | WHITEPAPER.md:68,89 | UNVERIFIED | Function-level check deferred to W3B (Phase 3). |
| C-013 | "Gas estimates are published with the deployment script" | WHITEPAPER.md:114 | UNVERIFIED | Whether `scripts/deploy.ts` prints gas estimates not checked this phase (BLD/W3B). |
| C-014 | "Arweave holds manifests and proofs (kilobytes); IPFS/Filecoin hold encrypted bytes with active pinning" | WHITEPAPER.md:231-233 | UNVERIFIED | Module exists; live pinning / who-pins not checked (STR/DAT, Phase 3). |
| C-015 | "payments flow wallet-to-wallet"; "receive payment without an intermediary taking custody of funds"; "75% to the filmmaker with wallet-to-wallet settlement versus platform-held balances" | WHITEPAPER.md:9,134,199 | CONTRADICTED (PPV path) | `PayPerView.buyAccess` escrows full `msg.value` into `_filmRevenue[filmId]`; the filmmaker only receives funds by calling `withdrawRevenue` (PayPerView.sol:100-131). The contract holds funds between purchase and withdrawal — not wallet-to-wallet for PPV. TRUE only for TicketNFT mint (direct forward, TicketNFT.sol:151). → DOC-002. |
| C-016 | Phase 2 = "this paper" (TicketNFT, SubscriptionManager, PayPerView, DFLIX, storage, wallet layer, proofs, reputation, Sepolia deploy script); Phase 3 = testnet pilot; Phase 4 = mainnet gated on legal assessment + audit + unit economics | WHITEPAPER.md:152-155 | UNVERIFIED (plan) | Roadmap claims, not facts; components individually verified where checked above. |
| C-017 | Collector Pass: "$10/month … two $8 credits … **$12.00 in creator payouts** against $10.00 of revenue … The pass is not offered until the price, allocation basis, included catalog, or usage design changes" | WHITEPAPER.md:106-108 | VERIFIED (consistency) | Matches pricing.ts:36 warning text and README-lifeboat.md economics warning; AGENTS.md lists Collector Pass as DEFERRED. |

## B. AGENTS.md / GROK.md (canonical rules — checked for internal consistency)

| # | Claim | Source | Status | Evidence |
|---|---|---|---|---|
| C-020 | "The on-chain platform fee is hard-capped at 25% (2500 bps) in every payment contract. The deploy script uses 2500 bps." | AGENTS.md:29-31 | VERIFIED | PayPerView.sol:27-28 (cap 2500); MovieTicket.sol:114 (cap 2500); `scripts/deploy.ts:19-21` (`INITIAL_PLATFORM_FEE_BPS = 2500`). |
| C-021 | "Contracts are UNAUDITED and have never been deployed to any network." | AGENTS.md:39 | VERIFIED | Whitepaper §14 agrees; no deployment artifacts; no audit report in repo (SEC lane to confirm absence). |
| C-022 | Deferred: crowdfunding, Collector Pass (as offer), stored credits, seeder rewards, NFT-gated access, P2P savings, stablecoin checkout | AGENTS.md:33-37 | VERIFIED (policy stated; `/crowdfund` shows deferral notice: `apps/frontend/app/crowdfund/page.tsx:2-10`) | BUT dashboard copy invites crowdfund launch → contradiction, DOC-003. |
| C-023 | Banned copy: "forever", "permanent access", "own it forever", "can't be taken away", "watch forever" | AGENTS.md:25-27 | VERIFIED (enforced by `apps/frontend/lib/copy-honesty.test.ts`; "Buy once, own forever" copy removed from frontend — current copy is "Buy once under a clear license") | Storage-permanence phrases ("live forever on Arweave") are explicitly allowlisted in the test's ALLOWLIST — project-sanctioned. |

## C. apps/lifeboat/README.md (302 lines — the honesty baseline)

| # | Claim | Source | Status | Evidence |
|---|---|---|---|---|
| C-030 | Stripe: "`createCheckoutSession` throws `"Stripe not configured — needs Dino's keys"`. No money can move." Webhook returns 503 when secret unset. | README-lifeboat.md:66-68 | VERIFIED | `apps/lifeboat/lib/stripe.js:80` (throws), :87/99 (not-configured errors). |
| C-031 | Bunny "Not activated … every method throws `"Bunny not configured — set env vars"` … M1 streams from `LocalOrigin`" | README-lifeboat.md:70-73 | VERIFIED | `apps/lifeboat/lib/cdn.js:9-13` (LocalOrigin comment), :103 (Bunny throws until env set). |
| C-032 | Unit economics: "the creator receives **75%**"; "$4/75% → $0.284 contribution"; "90% at $4 is loss-making (~-$0.32/order). Never advertise it." | README-lifeboat.md:88-104 | VERIFIED | Matches pricing.ts:167-170 exactly ($0.284 / -$0.316). |
| C-033 | "`POST /api/buyers/import` records **migration contacts** … **never creates entitlements** — an export row alone grants nothing. A test asserts this." | README-lifeboat.md:76-84 | UNVERIFIED | Server-code check deferred (BUG/DAT lanes, Phase 3). |
| C-034 | "91/91 tests green, 2026-09-28"; lifeboat test.sh 103 tests; frontend vitest counts | README-lifeboat.md:130 | UNVERIFIED | TST/BLD lane (BASELINE). |
| C-035 | External facts: "Vimeo On Demand shutdown … purchases stopped Sep 21, full shutdown Nov 20, 2026"; "Epic bought Bandcamp for **$273M** (Mar 2022)"; "Netflix stopped reporting paid memberships in 2025" | README-lifeboat.md:52-62,114-128 | UNVERIFIED | External-world claims; stated as "verified 2026-09-28" with primary sources named, but not re-verified by DOC this phase. |
| C-036 | "Deferred by policy (do not build)": stablecoin checkout, crowdfunding UI, "Any token/NFT mechanics — deferred pending a **transaction-specific legal assessment**" | README-lifeboat.md:106-112 | PARTIAL / tension noted | Crowdfunding UI: `/crowdfund` shows deferral notice (consistent), BUT `apps/frontend/app/dashboard/page.tsx:563-566` invites "launch a crowdfund campaign directly" (DOC-003). Token/NFT mechanics: Phase 2 TicketNFT/DFLIX contracts exist as code (undeployed) — README-lifeboat's "deferred" refers to shipping gated access without counsel's read; AGENTS.md clarifies as assessment-gated, not banned. No contradiction once scoped, but the two docs read differently to a newcomer. |

## D. RUN.md / SEPOLIA_DEPLOY.md / operational docs

| # | Claim | Source | Status | Evidence |
|---|---|---|---|---|
| C-040 | "What is NOT real yet: Stripe (no keys — `stripe_configured: false`), Bunny CDN (LocalOrigin fallback), on-chain contracts (test addresses in demo mode), Privy auth (demo mode), stored credit balances, seeder rewards, NFT access, P2P savings, stablecoins." | RUN.md:33-37 | VERIFIED | Stripe/Bunny verified stubbed in code (see C-030/C-031); Privy demo per PHASE2_AUDIT.md §5 ("Privy embedded-wallet auth (demo mode)") and whitepaper §3.5 ("degrades to the existing demo/test-mode flows"). |
| C-041 | SEPOLIA_DEPLOY.md describes a deployment procedure | SEPOLIA_DEPLOY.md:1-79 | VERIFIED (no broadcast claimed) | Doc is conditional ("Run the deploy command above when ready"); `deployments/` has only `dry-run-local.json`. AGENTS.md: never deployed. Dry-run only confirmed. |
| C-042 | Ports/URLs: marketing :3000, lifeboat :8080 on 100.85.119.8; `./scripts/run.sh` launches both | RUN.md:7-19 | UNVERIFIED | BLD lane (live smoke test). |
| C-043 | DEPLOYMENT_CHECKLIST.md: "`platformFeeBps` … (default 3000 = 30%)"; "Creator gets their share (e.g. 70%) … Platform keeps its cut (e.g. 30%)" | DEPLOYMENT_CHECKLIST.md:11,40-41 | CONTRADICTED | Both payment contracts cap at 2500 and the deploy script uses 2500 (C-020). A 3000 default could never deploy (would revert at `require`). Stale Phase-0 doc → DOC-004. |
| C-044 | LOCAL_TESTING.md: local Hardhat mint flow against `MovieTicket.sol` / `/mint` page | LOCAL_TESTING.md:1-60 | UNVERIFIED | Phase-0-era procedure; not re-run this phase (BLD). |

## E. Architecture/strategy docs (multiple generations — conflicts noted)

| # | Claim | Source | Status | Evidence |
|---|---|---|---|---|
| C-050 | ARCHITECTURE_REVIEW_v2.md: "Creator cut (70%) paid automatically … Platform cut (30%) at $1M/month revenue" | ARCHITECTURE_REVIEW_v2.md:242-243 | CONTRADICTED | 75% rule (C-001/C-020). Stale May-2026 doc → DOC-004. |
| C-051 | ROADMAP.md: "Current Phase: Phase 0 – Foundation (Still Active)"; TODO.md: "Phase 0 Tasks (Current)" | ROADMAP.md:18; TODO.md:3 | CONTRADICTED | Whitepaper is the "Phase 2 draft" (2026-09-28); Phase 2 audit (commit ccf762c) records Phase 2 complete. Stale → DOC-004. |
| C-052 | Root README.md and apps/frontend/README.md describe a stock create-next-app project | README.md:1-36; README-frontend.md:1-36 | CONTRADICTED (as project description) | Boilerplate; says nothing about Decentralflix. Misleading to a new clone → DOC-004. |
| C-053 | Cost models: ADR-001 §8 "Total estimated monthly infra at 120M MAU: **$5M – $10M USD**" vs ARCHITECTURE_REVIEW_v2 "**$60,000-200,000/month**" at 120M MAU | STORAGE_STREAMING_ARCHITECTURE_DECISION.md:§8; ARCHITECTURE_REVIEW_v2.md:§"Real Cost Model" | CONTRADICTED (docs disagree with each other) | The two docs' cost models differ by ~50× (different delivery architectures: DePIN hybrid vs Cloudflare R2). Neither is code-verifiable; both are modeled estimates. Flagged for owner: pick the canonical model. UNVERIFIED individually; contradiction is between docs. |
| C-054 | PINNING.md / packages/storage/LIMITATIONS.md / docs/REPUTATION_LIMITATIONS.md honesty statements (encryption ≠ DRM; availability ≠ durability; attestor trust; no Sybil-proofness) | PINNING.md; LIMITATIONS.md; REPUTATION_LIMITATIONS.md | CONSISTENT (no contradiction found) | These docs under-claim rather than over-claim; consistent with whitepaper §8. Deep verification of each technical caveat deferred to STR/W3B. |
| C-055 | "The user buys 'permanent access to this video'" (onboarding guidance) | ARCHITECTURE_REVIEW_v2.md (Risk 3) | CONTRADICTED | "permanent access" is banned copy per AGENTS.md:25-27 and the copy-honesty test. Stale doc → DOC-004. |
| C-056 | ARCHITECTURE.md: "Superseded by STORAGE_STREAMING_ARCHITECTURE_DECISION.md (ADR-001, 2026-05-29)" | ARCHITECTURE.md:1-3 | VERIFIED | Self-declared superseded; correctly labeled. (ARCHITECTURE_REVIEW_v2 in turn claims to supersede ADR-001 — the chain of supersession is itself a doc-governance issue; see IDEAS.md.) |

## F. User-facing product copy (frontend)

| # | Claim | Source | Status | Evidence |
|---|---|---|---|---|
| C-060 | Legal page: "Non-Custodial Architecture — Zero custody of funds, NFTs, or keys. All value movement is direct wallet-to-wallet via audited smart contracts on Arbitrum." | apps/frontend/app/legal/page.tsx:25 | CONTRADICTED | (a) "audited" — FALSE: no audit exists (AGENTS.md, GROK.md, whitepaper §14 all say UNAUDITED). (b) "on Arbitrum" — implies deployed; never deployed (C-011/C-021). (c) "direct wallet-to-wallet" — false for PPV (escrow, C-015). → DOC-001. |
| C-061 | Legal page: "No money transmission surface under FinCEN or Ohio law." | apps/frontend/app/legal/page.tsx:25 | CONTRADICTED (by the project's own legal posture) | Stated as settled fact while the project's own docs require "transaction-specific legal assessment" (whitepaper §8) and a money-transmission opinion "before launch" (README-lifeboat.md:101-104). The legal conclusion is asserted, not sourced. → DOC-001 (second clause; counsel to adjudicate). |
| C-062 | Dashboard: "Upload here then launch a crowdfund campaign directly — backers become verified owners with voice in Reviews." | apps/frontend/app/dashboard/page.tsx:566 | CONTRADICTED | AGENTS.md: "Crowdfunding — DEFERRED … Do not re-add crowdfunding UI, links, or flows." `/crowdfund` shows a deferral notice (page.tsx:2-10). The dashboard section header is literally "Upload to Arweave + Launch Campaign". → DOC-003. |
| C-063 | Admin: "Audit Log (immutable)" backed by browser localStorage `'dfx-admin-audit'`, trimmed to 50 entries | apps/frontend/app/admin/page.tsx:394-397; :85-98 | CONTRADICTED | localStorage is client-editable and the log is sliced to 50 (`auditLog.slice(0, 50)` at :98) — neither immutable nor complete. → DOC-005. |
| C-064 | `useCreatorDashboard.ts` comment: "Real earnings overview via CreatorPaid events (immediate payouts at mint time)" | apps/frontend/lib/contracts/useCreatorDashboard.ts:13 | CONTRADICTED | AGENTS.md bans promising payment "instantly"/"immediately"/"at the moment of sale" (AGENTS.md:31). A code comment, but it encodes the banned mental model. → DOC-006. |

## G. AIX check (no LLM features)

| # | Claim | Source | Status | Evidence |
|---|---|---|---|---|
| C-070 | No AI/LLM features exist in the repo | — | VERIFIED | Zero LLM SDKs in any `package.json` (openai/anthropic/groq/langchain/llamaindex — no matches). Source grep for recommendation engine / LLM endpoints: only false positives — "recommended <80MB" file-size copy, `recommended` boolean flags, spike-2 demo copy "AI credits" (a seeder-rewards perk label, not an LLM feature), Livepeer "real-time AI pipelines" mentions in ADR docs (aspirational architecture text). AGENTS.md mandates "No AI moderation" / "Do not build AI moderation". **AIX stays DEACTIVATED.** |

## Counts
- Claims listed: 40 (C-001…C-070, sparse numbering)
- VERIFIED: 19 · CONTRADICTED: 11 · PARTIAL/tension: 1 (C-036) · UNVERIFIED: 9
- CONTRADICTED claims → findings: DOC-001 (C-060, C-061), DOC-002 (C-015), DOC-003 (C-062), DOC-004 (C-043, C-050, C-051, C-052, C-055), DOC-005 (C-063), DOC-006 (C-064)

## Open items for Phase 3 / other lanes
- Test-count claims ("217 contract tests", "91/91", "103/103") → TST/BLD baseline.
- Live pinning / Kubo liveness, IPFS→Arweave fallback behavior → STR/DAT.
- `verifyFragment` byte-identical SHA-256 claim; attestor-only `allocateSeedReward`; over-commit guard → W3B.
- Vimeo contacts-only flow; "no entitlement from export row" test → BUG/DAT.
- Gas-estimate publication in deploy script → BLD/W3B.
- Which cost model is canonical (ADR-001 vs ARCHITECTURE_REVIEW_v2, 50× apart) → owner decision (QUESTIONS.md).
