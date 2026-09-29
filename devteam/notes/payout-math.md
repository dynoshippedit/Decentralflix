# Creator payout math — per-path money traces
Owner: Music Data & Rights Specialist (MUS) · Last updated: 2026-09-29
Scope: `packages/contracts/contracts/{PayPerView,SubscriptionManager,TicketNFT,MovieTicket,DFLIX,SeederCredits,FilmmakerCampaign}.sol`, `apps/frontend/lib/pricing.ts`, `apps/frontend/lib/licensing.ts`, plus cross-layer surfaces (`apps/frontend/app/mint/page.tsx`, `useMovieTicket.ts`, `docs/WHITEPAPER.md`, `scripts/deploy.ts`).
Static review only — every line cited below was read in full. Arithmetic verified by hand; contract suites were executed by TST in Phase 1 (217/217), not re-run here.

## How it works (with path:line references)

Conventions everywhere: fees in **basis points** (10000 = 100%); the fee formula is
`fee = (amount * feeBps) / 10000` with integer division (floor); the residual is always
given to the other party as `amount - fee`, so **each split sums exactly** and rounding
dust favors the *recipient*, never the fee-taker. All withdrawals are pull-pattern
(the payee calls to collect); no contract pushes to an arbitrary address.

### Path 1 — PayPerView: PPV purchase → filmmaker withdrawal
`packages/contracts/contracts/PayPerView.sol` (188 lines, full read)
- Purchase (`buyAccess`, L103–111): `msg.value` must **exactly** equal `film.priceWei`
  (`IncorrectPayment` otherwise — overpayment reverts, no dust possible). Accrues to
  `_filmRevenue[filmId]`.
- Withdrawal (`withdrawRevenue`, L120–138): filmmaker-only.
  `fee = (amount * platformFeeBps) / 10000` (L131); `_accruedPlatformFees += fee` (L132);
  `filmmakerAmount = amount - fee` (L133); pays filmmaker. **fee + filmmakerAmount = amount, exactly.**
- Fee cap (`setPlatformFeeBps`, L151–160): `onlyOwner`; reverts `FeeTooHigh` if
  `newFeeBps > MAX_PLATFORM_FEE_BPS = 2500` (L29). The cap is enforced at the **only**
  writer, so no path can exceed 25%. Note `platformFeeBps` defaults to **0** at
  construction — 75/25 holds only after the owner sets 2500. The fee rate applied is
  the rate **at withdrawal time**, not purchase time (documented in the L145–150 docstring).
- Owner fee sweep (`withdrawPlatformFees`, L141–149): pull, `onlyOwner`, zeros the ledger first.
- Refunds: none by design (exact payment). Pull pattern throughout. ✓

### Path 2 — MovieTicket: NFT mint → immediate creator payment
`packages/contracts/contracts/MovieTicket.sol` (434 lines, full read)
- Mint (`mintPermanentPass` L217–273, `mintBurnableTicket` L277–333): both `onlyOwner`,
  `nonReentrant`, `whenNotPaused`. Requires `msg.value >= price` — **overpayment is
  accepted and NOT refunded** (see MUS-003). Split computed on `price`, not `msg.value`:
  `platformFee = (price * platformFeeBps) / 10000` (L228); `creatorShare = price - platformFee`
  (L229). **platformFee + creatorShare = price, exactly.** Creator paid immediately via
  `.call`; platform fee portion stays in the contract balance (no separate ledger —
  unlike PayPerView's `_accruedPlatformFees`), sweepable by the owner via `withdraw()`
  (L177–180, sends `address(this).balance`).
- Fee cap: constructor (L122–125) and `setPlatformFee` (L169–175) both `require(newFeeBps <= 2500)`.
  Deploy script sets **2500** (`scripts/deploy.ts:19-24`), so deployed behavior is 75/25.
- Frontend mirror: `apps/frontend/lib/contracts/useMovieTicket.ts:54-61` reads the live
  `platformFeeBps` on-chain and applies the *identical* formula — cross-layer consistent.
  **Exception:** `apps/frontend/app/mint/page.tsx:69` falls back to a hardcoded `'30'`
  (see MUS-004).
- Secondary transfers: **no royalty/fee** — transfers pay nobody (ERC721A default; the
  `_afterTokenTransfers` hook only maintains the access/tier indexes).
- Refunds: none.

### Path 3 — SubscriptionManager: subscription revenue → owner
`packages/contracts/contracts/SubscriptionManager.sol` (186 lines, full read)
- `subscribe` (L114–126) / `renew` (L134–150): exact payment of plan price; renew extends
  from the *current* expiry (`sub.expiresAt += plan.durationSecs`, L146) and must be called
  while active; `cancel` (L156–162) forfeits paid time — **no refund** (documented).
- **There is no fee variable, no per-filmmaker ledger, no creator share in this contract**
  (verified: zero occurrences of "fee"/"filmmaker"/"creator" in the file). The only money
  exit is `withdraw()` (onlyOwner) sending **100% of the balance to the owner**.
  Arithmetic is exact (nothing is split, nothing is lost) — but the path pays creators **0%**.
  Whitepaper §3.2 says plans are defined by "Filmmakers or the operator"; the contract's
  `createPlan` is `onlyOwner` — filmmakers have no on-chain role here. See MUS-001.
- Boundary: `hasActiveSubscription` = `expiresAt > block.timestamp` (strict); renew reverts
  when `expiresAt <= block.timestamp` — consistent, no one-second gap bug.

### Path 4 — TicketNFT: ticket mint → direct filmmaker forward
`packages/contracts/contracts/TicketNFT.sol` (241 lines, full read)
- `mintTicket` (L289–312): exact payment; **forwards 100% of `msg.value` to the filmmaker**;
  docstring states "No platform fee is taken here." Money math exact; the effective split is
  **100/0 filmmaker** — contradicts the 25% platform claim in the generous direction
  (see MUS-002). Secondary transfers pay nobody (no royalty hook).
- Pull pattern: payment is pushed to the filmmaker *chosen at registration* (onlyOwner
  registration), not an arbitrary address.

### Path 5 — DFLIX: staking accrual + seed-to-earn allocation → claim
`packages/contracts/contracts/DFLIX.sol` (307 lines, full read)
- Staking accrual (`_checkpoint`, L296–306): `reward = (staked * rewardPerTokenPerSecond * elapsed) / 1e18`
  — integer division rounds down (dust stays in the pool, favors remaining stakers). Called
  before every `stake`/`unstake`/`claimRewards`, so partial unstakes can't over-count. 18
  decimals throughout with 1e18 scaling — no decimals mismatch.
- Claim (`claimRewards`, L238–256): `total = stakingPart + seedPart`; reverts on 0 and on
  `total > rewardPool`; zeroes accruals, `rewardPool -= total`, single transfer. **Exact.**
- Seed allocation (`allocateSeedReward`, L164–183): replay-protected by `reportHash`;
  guards `allocatedSeedRewards + amount <= rewardPool` — but **staking accruals are not
  pre-reserved** (the code admits this at the L150–154 docstring), so accrued staking
  rewards can be made unclaimable by later seed allocations (see MUS-005).
- Boundaries: `STAKE_LOCK_PERIOD = 7 days` from **first** stake; full unstake resets the
  lock clock (documented behavior). No fixed epochs — continuous accrual, no cliff.
- Mint cap (`mint`, L126–135): `totalSupply + amount > MAX_SUPPLY (1e9 * 1e18)` reverts. Exact.

### Path 6 — SeederCredits: attested report → credit mint → perk redemption
`packages/contracts/contracts/SeederCredits.sol` (161 lines, full read)
- `submitSeedingReport` (L74–104): `finalAmount = (claimedAmount * multiplier) / 100`
  with multiplier ∈ {100, 125, 150} from `MovieTicket.highestTierMultiplier` (basis 100).
  Floor division; credits are unitless points (no wei), no value lost.
- **The "recent report" requirement is not implemented**: `MAX_REPORT_AGE = 7 days`
  (L36) is declared but never used, and the signed message binds no timestamp/nonce —
  one attestor signature can be re-claimed once per cooldown day, forever (see MUS-006).
- `redeemCredits` burns credits and emits an event; perks are applied off-chain
  (documented Phase-0 stub). `emergencySlash` is owner-only and no-ops silently when
  `credits < amount` — owner power, not money math.

### Path 7 — FilmmakerCampaign: escrow → milestone tranches / refunds
`packages/contracts/contracts/FilmmakerCampaign.sol` (376 lines, full read; contract is
**DEFERRED** — prominent banner at file top, not deployed by `scripts/deploy.ts`, UI route
shows a deferral notice)
- `contribute` (L188–214): requires `msg.value >= tier price`; **full `msg.value`** is
  credited to `raised`/`campaignEscrow`/`backerTotals` — no platform fee anywhere in this
  contract (0% fee path; overpayment is credited, not lost). Exact.
- `approveMilestoneAndRelease` (L242–267): `campaignEscrow -= m.amount`, pays filmmaker
  `m.amount` exactly. Pull-by-owner-approval; filmmaker receives via push. Exact per tranche.
- `claimRefund` (L269–281): pulls `backerTotals[caller]` exactly; zeroes before payment. ✓
- **No validation that Σ(milestoneAmounts) relates to `target`/`raised`** (see MUS-007):
  oversized milestones deadlock escrow; undersized leave residual trapped after DELIVERED
  (no sweep path).

### Frontend pricing layer (marketing truth, not on-chain)
- `apps/frontend/lib/pricing.ts`: `CREATOR_SHARE = 0.75` (L19); `CONTRIBUTION_TABLE`
  arithmetic re-verified by hand and **exact**: e.g. "$4 at 75%" → creator 3.0,
  card 0.416 (4×0.029+0.30), delivery 0.1, ops 0.2, platform contribution
  4−3.0−0.416−0.1−0.2 = **0.284** ✓ (all four rows check out). These are USD-float
  *marketing models* — they never touch wei and don't need wei precision.
- `licensing.ts`: license-model text only, no money math.
- Decimals: contracts are ETH-wei (18) and DFLIX (18, 1e18-scaled); the mint UI sends
  `parseEther(price)` — consistent. No USDC/stablecoin payout path exists
  (stablecoin checkout is in the deferred list; the only "USDC" hit is
  `pricing.ts:231` in `DEFERRED_FEATURE_PHRASES`).

## Observations

1. **Rounding policy is consistent everywhere**: the fee is floored, the residual goes to
   the creator/recipient. Dust never accrues to the fee-taker. (DFLIX rewards floor in
   favor of the pool — the correct direction for a shared pool.)
2. **Withdrawal is pull-pattern on every money path**; no contract pushes to an arbitrary
   address. The one push (`MovieTicket` creatorShare) goes to the `creator` address the
   *owner* supplied on an `onlyOwner` mint.
3. **Refund discipline varies by design**: PayPerView/TicketNFT use exact-payment (no refund
   needed); SubscriptionManager forfeits on cancel (documented); MovieTicket silently keeps
   overpayment (MUS-003); FilmmakerCampaign refunds exactly (pull).
4. **The fee is owner-adjustable 0–2500 bps on PayPerView and MovieTicket.** "75% creator
   share" is true only when the owner sets 2500 — the contract guarantees *at most* 25%,
   not *exactly* 25%. The whitepaper (§45) phrases this correctly ("capped at 2500 = 25%,
   adjustable by the owner"); several marketing surfaces say "75% on every sale" without the
   qualifier (MUS-001/-002/-004 touch this).
5. **Fee-rate timing**: PayPerView applies the fee at *withdrawal*, not purchase — an owner
   can change the rate between a buyer's purchase and the filmmaker's withdrawal (within
   the 2500 cap). Documented; filmmakers can mitigate by withdrawing promptly.
6. FilmmakerCampaign has duplicated `pragma solidity ^0.8.20;` and its four import lines
   (L14–19 vs L21–26). Compiles (idempotent imports), but sloppy — cleanup candidate.
7. MovieTicket's platform fee accrues invisibly in the contract balance (no ledger like
   PayPerView's `_accruedPlatformFees`); indexers must reconstruct from `VideoMinted`
   events. Not wrong, but less auditable.

## Open questions (recommended defaults in parentheses)

- Q1. Should SubscriptionManager revenue carry a creator share? (Default: treat 100%-to-owner
  as intentional *platform product* revenue and qualify the "75% on every sale" copy to
  exclude subscriptions — or design per-film subscription splits before launch.)
- Q2. Should TicketNFT take the 25% platform fee? (Default: keep 0% as a deliberate
  filmmaker-friendly choice and fix the take-rate copy — do not silently add a fee.)
- Q3. MovieTicket overpayment: exact-payment or split-on-msg.value? (Default: require
  exact payment like PayPerView — simplest, matches the whitepaper's stated design.)
- Q4. Mint page fee fallback when the contract read fails? (Default: show "—"/loading and
  never a hardcoded money figure; derive from `CREATOR_SHARE` only as a labeled draft.)
- Q5. DFLIX pool: pre-reserve staking accruals or accept first-come-first-served?
  (Default: document the policy explicitly; code comment is honest but users can't see it.)
- Q6. SeederCredits report freshness: enforce `MAX_REPORT_AGE`/nonce in the signed message
  or remove the constant and fix the docstring? (Default: enforce — the attestor-signed
  message should bind a timestamp.)

## Related IDs

TST-002 (no reentrancy tests — W3B owns guard placement), TST-009 (no cross-layer test
pins 75% copy to fee caps — MUS-004 proves the gap), DOC-002 (PayPerView escrow not
wallet-to-wallet), DOC-004 (stale 70/30 docs). W3B owns: reentrancy exploitability,
signature replay on SeederCredits (MUS-006 cross-ref), `withdraw()` sweep of force-fed
ETH.
