# findings/doc — Product & Docs Auditor (DOC lane)
<!-- C12 · DOC · 2026-09-29 · Phase 1 · Status of these entries: NEW (triage/verification in Phase 4) -->

## DOC-001 — Legal page claims contracts are audited and deployed on Arbitrum
- **Severity:** S1 (user/investor-facing trust claim about money-handling contracts; a user could act on it) · **Confidence:** Confirmed · **Status:** NEW · **Effort:** XS
- **Location:** `apps/frontend/app/legal/page.tsx:25`
- **Evidence (quoted):** "Non-Custodial Architecture — Zero custody of funds, NFTs, or keys. All value movement is direct wallet-to-wallet via audited smart contracts on Arbitrum."
- **What's wrong:** Three falsehoods in one line. (1) "audited" — no third-party audit exists; `AGENTS.md:39` and `GROK.md:§2` state "UNAUDITED", and `docs/WHITEPAPER.md:209` says "no third-party security audit … Mainnet deployment without an audit would be reckless". (2) "on Arbitrum" — no contract has ever been deployed to any network: `packages/contracts/deployments/` contains only `dry-run-local.json`; `AGENTS.md:39` ("never been deployed"); `docs/WHITEPAPER.md:3` ("No tokens have been issued on any public network"). (3) "direct wallet-to-wallet" — `PayPerView.buyAccess` escrows `msg.value` in `_filmRevenue[filmId]`; filmmakers receive funds only via `withdrawRevenue` (`packages/contracts/contracts/PayPerView.sol:100-131`).
- **Related:** same line also asserts "No money transmission surface under FinCEN or Ohio law" as settled fact, while the project's own docs require a "transaction-specific legal assessment" (`docs/WHITEPAPER.md:140-142`) and a money-transmission opinion letter before launch (`apps/lifeboat/README.md:101-104`). The legal-conclusion half is for counsel to adjudicate; the audited/deployed halves are factually false.
- **Impact:** The page is explicitly written "for transparency with investors and partners" (page.tsx:41). A filmmaker or investor could trust unaudited, undeployed contracts with real funds on the strength of this sentence.
- **Suggested fix:** Rewrite to match the whitepaper §8/§14 honesty posture, e.g. "Contracts are unaudited and undeployed; no audit has been performed. Do not send real funds." Do not assert legal conclusions (money-transmission, custody) without counsel's written read.

## DOC-002 — Whitepaper overstates "wallet-to-wallet settlement" for the PPV path
- **Severity:** S3 (docs inaccuracy; the correct mechanism is described elsewhere in the same doc) · **Confidence:** Confirmed · **Status:** NEW · **Effort:** XS
- **Location:** `docs/WHITEPAPER.md:9` ("receive payment without an intermediary taking custody of funds"), `:134` ("payments flow wallet-to-wallet"), `:199` ("75% to the filmmaker with wallet-to-wallet settlement versus platform-held balances")
- **Evidence:** `packages/contracts/contracts/PayPerView.sol:100-107` — `buyAccess` records `msg.value` into `_filmRevenue[filmId]`; `:117-131` — funds leave only via `withdrawRevenue` (filmmaker) / `withdrawPlatformFees` (owner). The contract custodies revenue between purchase and withdrawal. (TicketNFT mint is genuinely direct-forward — `TicketNFT.sol:151` — so the claim is true for tickets, false for PPV.)
- **What's wrong:** The whitepaper's own §3.3 (`WHITEPAPER.md:45`) describes the pull/withdrawal design accurately, so §§1/7/13 contradict §3.3 within the same document. `AGENTS.md:31` mandates describing "the split/withdraw mechanism without promising timing".
- **Impact:** A reader (or counsel reviewing the non-custodial posture) gets the wrong custody picture for the PPV flow; weakens the legal framing the whitepaper is trying to build.
- **Suggested fix:** Qualify: wallet-to-wallet at mint for TicketNFT; contract-escrowed with pull-withdrawal for PayPerView. Align with AGENTS.md wording.

## DOC-003 — Dashboard offers crowdfund campaign launch while crowdfunding is DEFERRED
- **Severity:** S2 (user-facing product copy offering a legally-deferred feature; docs materially mislead) · **Confidence:** Confirmed · **Status:** NEW · **Effort:** S
- **Location:** `apps/frontend/app/dashboard/page.tsx:563-566` (section "Upload to Arweave + Launch Campaign": "Upload here then launch a crowdfund campaign directly — backers become verified owners with voice in Reviews.")
- **Evidence:** `AGENTS.md:33-35` — "Crowdfunding — DEFERRED. Offering crowdfunding without a registered funding portal risks an unregistered securities offering … Do not re-add crowdfunding UI, links, or flows." `docs/WHITEPAPER.md:241-243` — the `FilmmakerCampaign` contract "is not deployed" and "carries a prominent DEFERRED warning". The `/crowdfund` route itself shows a deferral notice (`apps/frontend/app/crowdfund/page.tsx:2-10`). The dashboard bottom note (:641) confirms the section is wired to "direct campaign launch (reuse hook + contract)".
- **What's wrong:** Phase-0-era dashboard copy invites launching the exact flow the standing rules defer for securities-law reasons. A filmmaker could act on it.
- **Impact:** Legal-risk exposure (unregistered offering framing) and a direct violation of the project's own DEFERRED policy.
- **Suggested fix:** Replace the section with the deferral notice (same as `/crowdfund`), or remove the launch affordance until counsel clears it. (Fixer: confirm whether the button actually submits a campaign tx — if it does, that is a BUG/W3B issue too; DOC scope is the copy.)

## DOC-004 — Stale Phase-0-era docs contradict the current business model and phase
- **Severity:** S3 (repo hygiene / stale docs; no user money at risk, but misleads contributors) · **Confidence:** Confirmed · **Status:** NEW · **Effort:** S
- **Instances (one pattern: superseded docs left as if current):**
  1. `DEPLOYMENT_CHECKLIST.md:11` — "`platformFeeBps` … (default 3000 = 30%)"; `:40-41` — "Creator gets their share (e.g. 70%) … Platform keeps its cut (e.g. 30%)". Both payment contracts cap at 2500 and the deploy script uses 2500 (`PayPerView.sol:27-28`, `MovieTicket.sol:114`, `scripts/deploy.ts:21`); a 3000 default could never deploy.
  2. `ARCHITECTURE_REVIEW_v2.md:242-243` — "Creator cut (70%) … Platform cut (30%)". Contradicts the 75% rule; also `:Risk 3` advises the UI copy "permanent access to this video" — banned copy per `AGENTS.md:25-27`.
  3. `ROADMAP.md:18` — "Current Phase: Phase 0 – Foundation (Still Active)"; `TODO.md:3` — "Phase 0 Tasks (Current)". The whitepaper is the Phase 2 draft (2026-09-28); the Phase 2 audit records Phase 2 complete (commit ccf762c).
  4. `README.md` (root) and `apps/frontend/README.md` — stock create-next-app boilerplate; describe a template, not Decentralflix.
- **Impact:** A new contributor (or an agent, per `autonomy.md`'s "keep TODO.md/ROADMAP.md updated") follows the wrong phase plan, the wrong fee numbers, or the banned copy. Checklists that instruct invalid fees erode trust in all checklists.
- **Suggested fix:** Archive superseded docs under `docs/archive/` with a one-line pointer to the canonical doc, or add dated "SUPERSEDED" banners. Rewrite the two READMEs to describe the actual project. (NEEDS-OWNER only if the owner prefers deletion over archiving — default: archive, don't delete.)

## DOC-005 — Admin "immutable audit trail" is a client-side localStorage list
- **Severity:** S3 (misleading trust label on an admin surface) · **Confidence:** Confirmed · **Status:** NEW · **Effort:** XS
- **Location:** `apps/frontend/app/admin/page.tsx:394-397` ("Audit Log (immutable)"); storage at `:85-98`
- **Evidence:** The log persists to `window.localStorage` key `'dfx-admin-audit'` (:85) and is truncated with `auditLog.slice(0, 50)` (:98). localStorage is editable by the browser owner; the log is neither immutable nor complete.
- **What's wrong:** An admin relying on this for dispute review or accountability would be relying on a client-mutable, truncated list labeled immutable.
- **Impact:** Low today (local admin tool), but the label teaches the wrong trust model.
- **Suggested fix:** Rename to "Audit Log (local)" with a note that it is a browser-local convenience record, not tamper-evident; or move to server-side append-only storage (lifeboat) if the audit trail matters.

## DOC-006 — "Immediate payouts" language persists in comments/checklists
- **Severity:** S3 (banned mental model encoded in non-user-facing text) · **Confidence:** Confirmed · **Status:** NEW · **Effort:** XS
- **Location:** `apps/frontend/lib/contracts/useCreatorDashboard.ts:13` — "Real earnings overview via CreatorPaid events (immediate payouts at mint time)"; `DEPLOYMENT_CHECKLIST.md:44` — "Confirm creator receives their share immediately (check their balance)"
- **Evidence:** `AGENTS.md:31` — "No instant-payout promises. Do not promise payment 'instantly', 'immediately', or 'at the moment of sale'."
- **What's wrong:** Comments and checklists, not UI copy, but they encode the exact promise the business rules ban and will be copied into future user-facing text. (UI copy itself is clean on this point — verified in the banned-copy sweep.)
- **Impact:** Low; hygiene.
- **Suggested fix:** Reword to the AGENTS.md-sanctioned framing ("contract splits payment; creators withdraw").

---
**Index:** DOC-001 S1 NEW · DOC-002 S3 NEW · DOC-003 S2 NEW · DOC-004 S3 NEW · DOC-005 S3 NEW · DOC-006 S3 NEW
