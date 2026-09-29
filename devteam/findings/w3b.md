<!-- C12 · W3B · 2026-09-29 · Phase 2/3 · Status of these entries: NEW (triage/verification in Phase 4) -->
<!-- Contracts: UNAUDITED (owner-stated). No Slither/Aderyn available in this environment. Reviewed by full line-read. -->

## W3B-001 — SeederCredits: attestor signatures replayable across cooldowns (no nonce/timestamp; MAX_REPORT_AGE unenforced)
- **Severity:** S1 (one legitimate attestor signature → unbounded credit minting every 24h; credits redeem for fee discounts / free tickets — real economic value) · **Confidence:** Confirmed · **Status:** DUPLICATE → SEC-012 (SEC owns the ledger entry; W3B owns the deep fix) · **Effort:** S
- **Location:** `packages/contracts/contracts/SeederCredits.sol:88-112` (`submitSeedingReport`), constants `:58-59`
- **Evidence (quoted):**
  ```solidity
  bytes32 messageHash = keccak256(
      abi.encodePacked(msg.sender, arweaveTxId, claimedAmount, block.chainid)
  );
  ```
  No nonce, no timestamp, no expiry in the signed payload. The only replay throttle is `lastClaimTimestamp[msg.sender] + MIN_CLAIM_COOLDOWN` (:95-98). `MAX_REPORT_AGE = 7 days` is declared (:59) but never referenced in `submitSeedingReport` — the "report must be recent" docstring (:84) is unenforced, so a stale signature is accepted forever.
- **What's wrong:** A seeder who legitimately earns one attestor signature (for their own address) can replay the identical `(arweaveTxId, claimedAmount, signature)` tuple every cooldown window indefinitely, minting `claimedAmount * tierMultiplier / 100` credits each time without doing any further seeding. Credits are the on-chain source of truth for the perk ledger (`redeemCredits` burns them; perks = fee discounts, free tickets per the contract docstring).
- **Impact:** Undermines the entire seed-to-earn incentive: unlimited free tickets / fee discounts from a single signature. Needs only one valid signature, then permissionless replay.
- **Reproduced:** `devteam/repro/w3b-signature-replay.test.ts` — one attestor signature for (seeder, txid, 1000) submitted, cooldown advanced via `evm_increaseTime`, identical signature submitted again → `credits == 2000` (2x from one signature). Run: `cd packages/contracts && npx hardhat test ../../devteam/repro/w3b-signature-replay.test.ts` → 1 passing.
- **Suggested fix:** Add a per-seeder nonce (or a signature expiry timestamp) to the signed message and enforce it on-chain; enforce `MAX_REPORT_AGE` against a signed report timestamp. (Fixer: coordinate with SEC-012.)
- **Related:** SEC-012 (primary).

## W3B-002 — MovieTicket: overpayments silently captured; platform fees commingle with overpayments, no accounting
- **Severity:** S2 (buyer funds silently diverted to owner; invisible to indexers) · **Confidence:** Confirmed · **Status:** NEW · **Effort:** S
- **Location:** `packages/contracts/contracts/MovieTicket.sol:231` (`require(msg.value >= price, ...)` in `mintPermanentPass`; same pattern `:288` in `mintBurnableTicket`); `withdraw()` `:200-203`; `VideoMinted` event `:94-104`
- **Evidence (quoted):** `require(msg.value >= price, "Insufficient payment");` — any excess `msg.value - price` stays in the contract. `withdraw()` sweeps `address(this).balance` to the owner with no ledger distinguishing platform fees from buyer overpayments. The `VideoMinted` event records `price`, not `msg.value`, so an overpayment is invisible to off-chain accounting.
- **What's wrong:** (1) Accidental overpayment (wrong value in the dApp, fat-fingered wei) is silently kept — no refund, no record. (2) Platform fees are not credited to any mapping; they are whatever residual balance remains, commingled with overpayments. Contrast `PayPerView.buyAccess`, which requires EXACT payment (`PayPerView.sol:104`) — the two payment contracts have opposite overpayment policies.
- **Impact:** Buyer loss on overpay; owner cannot distinguish earned fees from captured overpayments (accounting/audit problem; MUS cross-check).
- **Suggested fix:** Require exact payment like PayPerView, or refund `msg.value - price` and credit `platformFee` to an explicit `_accruedPlatformFees` mapping with its own withdrawal (mirrors PayPerView).
- **Related:** W3B-003 (same pattern class in FilmmakerCampaign).

## W3B-003 — FilmmakerCampaign.contribute: overpayment inflates raised/escrow and can push a campaign over target
- **Severity:** S2 · **Confidence:** Confirmed · **Status:** NEW · **Effort:** S
- **Location:** `packages/contracts/contracts/FilmmakerCampaign.sol:181-206`
- **Evidence (quoted):** `require(msg.value >= tc.price, "Insufficient payment");` then `c.raised += msg.value; campaignEscrow[campaignId] += msg.value; backerTotals[campaignId][msg.sender] += msg.value;` and `if (c.raised >= c.target) { c.status = CampaignStatus.FUNDED; }`.
- **What's wrong:** The full `msg.value` (including any overpay above tier price) counts toward the funding target. A single overpaying backer can flip a campaign ACTIVE→FUNDED, which shuts off further contributions and blocks the refund path (`claimRefund` requires FAILED or past-deadline-and-under-target). Unlike PayPerView/TicketNFT, the exact-payment pattern is not used here.
- **Impact:** Target manipulation via overpayment; backers who overpay lock the excess into escrow until milestone release or refund.
- **Suggested fix:** Require exact tier payment (or refund excess); count only `tc.price` toward `raised`. NOTE: contract is business-DEFERRED (header banner) — fix before any deploy, not for current use.
- **Related:** W3B-002 (same pattern class).

## W3B-004 — SubscriptionManager: 100% of subscription revenue goes to the owner; no creator split exists
- **Severity:** S2 (the documented Collector Pass economics cannot be expressed by this contract) · **Confidence:** Confirmed · **Status:** NEW · **Effort:** M (needs product decision)
- **Location:** `packages/contracts/contracts/SubscriptionManager.sol:160-167` (`withdraw()` — owner sweeps `address(this).balance`); `Plan` struct `:20-28` has no filmmaker/payee field
- **Evidence (quoted):** `@notice ... All payments accumulate in the contract; only the owner can withdraw.` There is no split, no per-plan filmmaker, no fee-cap concept — unlike PayPerView (fee-capped split at withdrawal) and MovieTicket (immediate creator forward).
- **What's wrong:** The whitepaper's Collector Pass economics (`docs/WHITEPAPER.md:108`) model "$12.00 in creator payouts against $10.00 of revenue" — but `SubscriptionManager` has no mechanism to pay creators anything from subscription revenue. §3.2 (`WHITEPAPER.md:39-41`) describes subscriptions as the Collector Pass primitive without mentioning the missing split, so a reader assumes the 75/25 economics apply.
- **Impact:** If subscriptions are meant to compensate filmmakers, the contract cannot do it; if 100%-to-platform is intended, the docs should say so explicitly (the "75% creator share" narrative in WHITEPAPER.md:104/199 doesn't carve subscriptions out).
- **Suggested fix:** Product decision (MUS owns the economics cross-check): either add a filmmaker + fee-capped split to plans, or document that subscription revenue is platform-only. Default recommendation: document explicitly; do not silently extend the 75% claim to subscriptions.
- **Related:** MUS lane (money checks on creator payouts); DOC-002 (wallet-to-wallet claim family).

## W3B-005 — ProofRegistry: first-come manifest registration can be front-run/squatted (no filmmaker identity binding)
- **Severity:** S2 (content-integrity primitive; acknowledged in NatSpec, no on-chain mitigation) · **Confidence:** Confirmed · **Status:** NEW · **Effort:** M
- **Location:** `packages/contracts/contracts/ProofRegistry.sol:92-113` (`registerManifest`); trust-model docstring `:80-88`
- **Evidence (quoted):** "the first caller to register a `filmId` becomes its `registrant`; afterwards only the registrant or the contract owner may update the manifest. There is no on-chain filmmaker identity check here — front-running a `filmId` registration is possible, so integrators should register manifests promptly".
- **What's wrong:** The documented mitigation is purely procedural ("register promptly"). An attacker who front-runs a filmmaker's `registerManifest` for a filmId permanently controls the Merkle root that clients verify fragments against (unless the contract owner intervenes) — i.e., can substitute the "verified" content.
- **Impact:** Undermines the tamper-evidence guarantee the registry exists to provide; squatting is cheap and permissionless.
- **Suggested fix:** Bind registration to the filmmaker registry (e.g., only the `filmmaker` recorded in TicketNFT/PayPerView for that filmId, or the contract owner, may first-register). Until then, keep the NatSpec warning and add it to deployment runbooks.

## W3B-006 — TicketNFT: no way to update a film's filmmaker address; broken payee bricks minting permanently
- **Severity:** S2 (permanent per-film DoS; no recovery path) · **Confidence:** Confirmed · **Status:** NEW · **Effort:** S
- **Location:** `packages/contracts/contracts/TicketNFT.sol:71-98` (`registerFilm` sets `filmmaker` once; no setter exists in the file); `mintTicket` `:151-155`
- **Evidence (quoted):** `if (msg.value > 0) { (bool ok, ) = film.filmmaker.call{value: msg.value}(""); if (!ok) revert PaymentFailed(); }` — the full mint reverts if the filmmaker address cannot receive ETH. There is no `setFilmFilmmaker` function; `setFilmActive`/`setFilmPrice` exist but cannot change the payee.
- **What's wrong:** If the filmmaker address is wrong at registration, is a contract that rejects ETH, or its key is lost/compromised, every future `mintTicket` for that film reverts — permanently. The owner cannot redirect payments or recover.
- **Impact:** One bad registration (or one compromised filmmaker key) permanently kills that film's ticket sales.
- **Suggested fix:** Add `onlyOwner setFilmFilmmaker(filmId, newFilmmaker)` with zero-address check + event (mirrors `setFilmPrice`).

## W3B-007 — FilmmakerCampaign.reviewAISubmission "approve" is a state no-op; release still requires the full window
- **Severity:** S3 (dead logic; approval UX implies an effect that doesn't exist) · **Confidence:** Confirmed · **Status:** NEW · **Effort:** XS
- **Location:** `packages/contracts/contracts/FilmmakerCampaign.sol:219-232` vs `:236-256`
- **Evidence (quoted):** `reviewAISubmission` with `approved=true` only emits `AIReviewed` — it never sets `m.approved`. `approveMilestoneAndRelease` requires `block.timestamp > m.aiReviewDeadline || m.approved` for AI milestones, and `m.approved` can only become true inside `approveMilestoneAndRelease` itself. So an owner "approval" changes nothing; the milestone still cannot release until the 72h window elapses.
- **What's wrong:** The approve path is cosmetically recorded but semantically void; contradicts the header "released only on owner-approved milestones" for the AI path (the actual release approval is `approveMilestoneAndRelease`, which the window gate then delays).
- **Impact:** Confusing for any future operator; the review step's approve/reject asymmetry (reject clears the proof, approve does nothing) suggests the intended state transition was forgotten.
- **Suggested fix:** Either set a distinct `m.aiApproved` flag in `reviewAISubmission` and gate release on it, or document that the window must always fully elapse and remove the approve parameter's implied effect. NOTE: contract is business-DEFERRED — fix before any deploy.

## W3B-008 — Web3 wrapper docstrings contradict contract behavior (access + caps + exact-payment)
- **Severity:** S3 (integrator-facing docs; wrong mental model, contract still enforces) · **Confidence:** Confirmed · **Status:** NEW · **Effort:** XS
- **Location:** `apps/frontend/lib/web3/wrappers/payPerView.ts:33` (`buyAccess` "must cover the film price"), `:116-123` (`setPlatformFeeBps` "owner only, ≤ 10000"), `:138` (`withdrawRevenue` "(owner only)"); `apps/frontend/lib/web3/wrappers/subscriptionManager.ts:78` (`subscribe` "must cover"), `:97` (`renew` "must cover"); `apps/frontend/lib/web3/wrappers/ticketNft.ts:80` (`mintTicket` "must cover")
- **Evidence:** (1) `withdrawRevenue`'s docstring says "(owner only)" but `PayPerView.sol:115-116` requires `film.filmmaker == msg.sender` — the FILMMAKER withdraws, not the owner. (2) `setPlatformFeeBps` wrapper caps at 10000 bps while the contract hard-caps at 2500 (`PayPerView.sol:27,142-144`) — the wrapper permits 2501–10000, which the contract then reverts. (3) "must cover the price" on `buyAccess`/`mintTicket`/`subscribe`/`renew` — all four require EXACT payment (`msg.value != price` reverts); overpayment doesn't "cover", it reverts (PayPerView/TicketNFT/SubscriptionManager) — and for MovieTicket it is silently kept (W3B-002), which "cover" also misdescribes.
- **What's wrong:** Three distinct falsehoods in the typed API surface integrators program against.
- **Impact:** An integrator building a filmmaker dashboard on `withdrawRevenue` "(owner only)" wires the wrong signer; fee-cap confusion; overpayment handling misunderstood.
- **Suggested fix:** Correct the docstrings to: withdrawRevenue = filmmaker-only; fee cap = 2500 bps; exact payment required (or refund/keep per contract).

## W3B-009 — MovieTicket: fragile tokenId invariant (`_videoCounter` vs ERC721A `_nextTokenId`) + dead `isDelisted` struct field
- **Severity:** S3 (maintainability; silent corruption risk on future edits) · **Confidence:** Confirmed · **Status:** NEW · **Effort:** S
- **Location:** `packages/contracts/contracts/MovieTicket.sol:236` (`uint256 tokenId = _videoCounter++;` then `_safeMint(to, 1)`), `:48-55` (`VideoMetadata.isDelisted`)
- **Evidence:** The code relies on `_videoCounter` staying equal to ERC721A's `_nextTokenId()` — true today only because `_startTokenId()==0`, every mint is exactly one token, and burns don't decrement `_nextTokenId`. Any future mint path (batch mint, different start id) silently desyncs `videoMetadata`/`ticketTypes`/`tokenTiers` keys from real token IDs. Separately, `VideoMetadata.isDelisted` is written as `false` at mint and never updated — `delistFilm` only touches the `isDelisted` mapping (`:206-213`) — so the struct field is dead and contradicts the mapping for delisted films.
- **Impact:** Future-edit footgun; the dead field misleads readers into checking the wrong source of truth.
- **Suggested fix:** Derive `tokenId` from `_nextTokenId()` (or assert equality); remove the struct `isDelisted` field or keep it in sync in `delistFilm`/`restoreFilm`.

## W3B-010 — SeederCredits.emergencySlash: no event, silent no-op when amount exceeds balance
- **Severity:** S3 (admin action with no audit trail; silent failure) · **Confidence:** Confirmed · **Status:** NEW · **Effort:** XS
- **Location:** `packages/contracts/contracts/SeederCredits.sol:143-147`
- **Evidence (quoted):** `function emergencySlash(address seeder, uint256 amount) external onlyOwner { if (credits[seeder] >= amount) { credits[seeder] -= amount; } }` — no event emitted (every other state change in the file emits one), and if `amount > credits[seeder]` it silently does nothing instead of reverting.
- **Impact:** Slashes are invisible to indexers; a caller can't distinguish "slashed" from "nothing happened".
- **Suggested fix:** Emit an event (e.g. `CreditsSlashed(seeder, amount, actual)`) and revert (or slash-to-zero explicitly) when `amount > balance`.

## W3B-011 — Reviews: constructor doesn't validate the MovieTicket address (zero address bricks all reviews)
- **Severity:** S3 (deployment hygiene) · **Confidence:** Confirmed · **Status:** NEW · **Effort:** XS
- **Location:** `packages/contracts/contracts/Reviews.sol:55-58`
- **Evidence:** `constructor(address _movieTicket, address _filmmakerCampaign)` stores both immutables with no zero-check. The `onlyVerifiedOwner` modifier anticipates `filmmakerCampaign == address(0)` (skips that check) but a zero `movieTicket` makes every `submitReview`/`getReview*` revert (high-level call to an EOA with no code returns no data → ABI decode revert).
- **Impact:** One bad deploy argument silently bricks the whole review system; failure mode is total, not partial.
- **Suggested fix:** `require(_movieTicket != address(0))` in the constructor (mirrors `SeederCredits.sol:47` and `FilmmakerCampaign.sol:124`).

## W3B-012 — DFLIX.setRewardRate applies retroactively to elapsed-but-uncheckpointed time
- **Severity:** S3 (admin-trusted design note; reward math changes meaning of past time) · **Confidence:** Confirmed · **Status:** NEW · **Effort:** S
- **Location:** `packages/contracts/contracts/DFLIX.sol:133-137` (`setRewardRate`); `_checkpoint` `:296-306`
- **Evidence:** `setRewardRate` writes `rewardPerTokenPerSecond` without checkpointing anyone. `_checkpoint` later accrues `(staked * rewardPerTokenPerSecond * elapsed) / 1e18` using the NEW rate over the whole elapsed window since the user's last interaction. Raising the rate retroactively inflates rewards for time already passed.
- **Impact:** Limited — the admin is fully trusted in this design (controls attestor, rate, pool, minting roles). But the accounting is surprising: the "rate" is not purely prospective.
- **Suggested fix:** Document as intended, or add a global accrual checkpoint on rate change (heavier). Default: document.

## W3B-013 — CJ1: on-chain entitlements and the lifeboat entitlement system are completely disjoint
- **Severity:** S2 (crown jewel 1: the two access-control systems cannot see each other; whitepaper describes a key-release architecture that doesn't exist) · **Confidence:** Confirmed · **Status:** NEW · **Effort:** L (architecture decision)
- **Location:** `apps/lifeboat/` + `cloudflare-worker/access-control.js` (zero references to any on-chain entitlement view); `docs/WHITEPAPER.md:62,170`
- **Evidence:** `grep -rn 'hasAccessToVideo|hasValidTicket|hasActiveSubscription|hasCrowdfundAccess|filmRevenue|delistFilm' apps/lifeboat/ cloudflare-worker/` returns NOTHING — the running content server never reads chain state. Conversely, the chain contracts know nothing of lifeboat receipts. The whitepaper claims (`:62` "the wallet layer ... checks `hasValidTicket` / subscription / PPV access on-chain, and only then requests the decryption key"; `:170` "the access-control worker performs the same check server-side against chain state before releasing the key") — but there is no decryption-key flow anywhere: no key server, no key-request endpoint, no encrypted masters in the serving path (`apps/lifeboat/lib/cdn.js` serves unencrypted `data/masters/*.mp4` behind lifeboat's own entitlement checks, `server.js:1128-1152`). The storage module's AES-256-GCM encryption exists but is unwired (MAP §1).
- **What's wrong:** Two failure modes: (1) on-chain YES → lifeboat NO: a buyer who pays on-chain (when contracts go live) cannot watch — the lifeboat doesn't recognize chain entitlements. (2) lifeboat YES → on-chain NO: lifeboat test-purchases/receipts grant access the chain never sees. And TST-008's instance: on-chain `delistFilm` (illegal content) has no effect on the lifeboat, which keeps serving the film. Additionally the identifier spaces don't even align (chain: `uint256 filmId` / `string videoHash`; lifeboat: its own film ids) — there is no mapping table between them.
- **Impact:** Today: none (contracts undeployed; lifeboat is the only live gate and it does gate). At chain launch: the purchase→watch flow is broken by design unless a bridge is built; the whitepaper's key-release architecture would need to be built for real (key server + encrypted masters + chain checks in the worker, which is currently SIMULATION MODE).
- **Suggested fix:** Architecture decision for the Lead: either (a) build the whitepaper's design for real (wire encrypted fragments + key server gated on chain views + lifeboat consults chain), or (b) amend the whitepaper to describe the actual two-system reality and define which system is authoritative per flow. Default: (b) now, (a) as a Phase-gated roadmap item. Do NOT present the :62/:170 flow as current behavior.
- **Related:** TST-008 (delistFilm never consulted); DOC owns the whitepaper-claims half (claims audit).

## W3B-014 — MovieTicket header NatSpec claims "fully non-custodial / never takes custody" — false
- **Severity:** S3 (contract-embedded docs falsehood; feeds the DOC-001 claim family) · **Confidence:** Confirmed · **Status:** NEW · **Effort:** XS
- **Location:** `packages/contracts/contracts/MovieTicket.sol:11-19`
- **Evidence (quoted):** "Fully non-custodial: all value flows wallet-to-wallet via direct contract calls. Platform (operator) never takes custody of funds or NFTs." In fact the contract custodies platform fees AND buyer overpayments (W3B-002) until the owner calls `withdraw()` (`:200-203`), and minting is `onlyOwner` — the operator is the sole minter.
- **Impact:** Anyone auditing custody posture from the NatSpec (counsel, DOC-001's legal page author) gets the wrong answer; weakens the non-custodial legal framing.
- **Suggested fix:** Rewrite to match reality: contract escrows platform fees (+ any overpayments) until owner withdrawal; minting is operator-mediated. (TicketNFT/PayPerView headers are accurate — PayPerView correctly describes escrow + pull-withdrawal.)
- **Related:** DOC-001 (legal page "audited / wallet-to-wallet" claims); DOC-002 (whitepaper wallet-to-wallet overstatement).

## W3B-015 — `string indexed` event params store only the keccak hash (indexer-unfriendly)
- **Severity:** S4 (observability) · **Confidence:** Confirmed · **Status:** NEW · **Effort:** XS
- **Location:** `packages/contracts/contracts/Reviews.sol:44-57` (`ReviewSubmitted`/`ReviewUpdated`: `string indexed videoHash`); `packages/contracts/contracts/MovieTicket.sol:108-109` (`ContentDelisted`/`ContentRestored`: `string indexed videoHash`)
- **Evidence:** Indexed dynamic types log `keccak256(value)` as the topic — an indexer filtering by these topics cannot recover the original `videoHash` string from the log alone.
- **Suggested fix:** Emit the hash twice (indexed `bytes32` key + non-indexed `string`), or index `keccak256(videoHash)` explicitly and keep the string unindexed.

## W3B-016 — Hygiene: duplicated pragma/imports; stale comments; placeholder logo; wrapper strictness mismatches
- **Severity:** S4 · **Confidence:** Confirmed · **Status:** NEW · **Effort:** XS
- **Instances:**
  1. `packages/contracts/contracts/FilmmakerCampaign.sol:1-26` — the `pragma solidity ^0.8.20;` + all four imports appear TWICE (compiles, but sloppy; suggests a bad merge).
  2. `packages/contracts/contracts/mocks/MockTicketGate.sol:8-9` — comment says MovieTicket's access check "is a Phase-0 stub that always returns false"; it is now a real O(1) index (`MovieTicket.sol:380-383`). Stale.
  3. `apps/frontend/providers/PrivyProvider.tsx:26` — logo URL is the placeholder `https://arweave.net/your-logo-txid` (marked TODO).
  4. `apps/frontend/lib/web3/wrappers/ticketNft.ts:104` — `registerFilm` requires non-empty `metadataURI`, but the contract documents it as "may be empty" (`TicketNFT.sol:69`).
  5. `apps/frontend/lib/web3/wrappers/dflix.ts:118-126` — `fundRewardPool` docstring implies an approval "may" be needed; the contract does an internal `_transfer` (`DFLIX.sol:150`) — no allowance is ever needed, only token balance. `:63-67` — `allocateSeedReward` docstring says "attestor/minter role"; the contract requires admin OR attestor (`onlyAdminOrAttestor`, `DFLIX.sol:122`), not MINTER_ROLE.

## W3B-017 — FilmmakerCampaign: no check that milestone amounts fit the target (unreleasable milestones possible)
- **Severity:** S3 · **Confidence:** Confirmed · **Status:** NEW · **Effort:** XS
- **Location:** `packages/contracts/contracts/FilmmakerCampaign.sol:158-176` (`launchCampaign`)
- **Evidence:** `milestoneAmounts` are pushed with no validation against `target`. Milestones totaling more than `raised` can never all release (`approveMilestoneAndRelease` requires `campaignEscrow >= m.amount` per milestone, `:244`). No event is emitted on the ACTIVE→FUNDED or →DELIVERED transitions either (DELIVERED set silently at `:254`).
- **Impact:** Misconfigured campaigns strand funds in milestones that can never release (backer remedy: only via owner `emergencyRefundAll` → FAILED → pull refunds).
- **Suggested fix:** Require `sum(milestoneAmounts) <= target` (or == target) at launch; emit events on FUNDED/DELIVERED transitions. NOTE: contract is business-DEFERRED — fix before any deploy.

---

**Index:** W3B-001 S1 DUPLICATE→SEC-012 · W3B-002 S2 NEW · W3B-003 S2 NEW · W3B-004 S2 NEW · W3B-005 S2 NEW · W3B-006 S2 NEW · W3B-007 S3 NEW · W3B-008 S3 NEW · W3B-009 S3 NEW · W3B-010 S3 NEW · W3B-011 S3 NEW · W3B-012 S3 NEW · W3B-013 S2 NEW · W3B-014 S3 NEW · W3B-015 S4 NEW · W3B-016 S4 NEW · W3B-017 S3 NEW

**Reentrancy / access-control verdicts (all 7 ETH-moving contracts):** every value-moving function carries OpenZeppelin `ReentrancyGuard.nonReentrant`, and the single guard is contract-wide, so cross-function reentry is blocked everywhere. No adversarial tests exist (TST-002), so this was verified by manual line-read:
- PayPerView — SAFE (checks-effects-interactions clean: balances zeroed before `.call`; filmmaker-only / owner-only gates correct)
- MovieTicket — SAFE via guard (external `creator.call` precedes mint + index writes — CEI order imperfect but reentry reverts on the guard; `onlyOwner` mint/pause/delist/withdraw correct)
- TicketNFT — SAFE (state + `_safeMint` before payment forward; exact payment; per-ticket-owner redeem; onlyOwner registry)
- FilmmakerCampaign — SAFE via guard (`_safeMint` before accounting writes in `contribute`, reentry blocked; pull-refund pattern; owner gates correct). DEFERRED — do not deploy.
- DFLIX — SAFE (no external calls at all in stake/unstake/claim; AccessControl roles correct; pool-bounded claims)
- SubscriptionManager — SAFE (no external calls in subscribe/renew; owner-only withdraw of accumulated balance)
- SeederCredits — SAFE for reentrancy (no external calls); the real issue is signature replay (W3B-001/SEC-012), not reentry.
- Read-only reentrancy: view functions are unguarded, but the only observable window is a stale `hasAccessToVideo` during a `_safeMint` receiver callback — no funds at risk, no state corruption. Not exploitable.
- No `tx.origin`, `delegatecall`, `selfdestruct`, or block-value randomness in any contract. No `ecrecover` except SeederCredits (zero-address return is safe: compared against non-zero `platformAttestor`).

**Contracts are UNAUDITED (owner-stated). No Slither/Aderyn available in this environment — static analysis was manual.**
