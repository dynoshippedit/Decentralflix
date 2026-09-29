# Findings — Music Data & Rights Specialist (MUS)
Scope: creator payout economics across `packages/contracts/contracts/*.sol`, `apps/frontend/lib/{pricing,licensing}.ts`, fee-display surfaces, deploy script, whitepaper money claims · ID range: MUS-001…MUS-007
Lens: MUS (B9.11 — Money/Entities/Provenance checks applied to payouts). W3B owns exploitability of the same contracts; MUS owns arithmetic correctness and cross-layer money consistency. Money math verified statically (full line-by-line reads, hand-checked arithmetic); contract tests were executed by TST in Phase 1 (217/217), not re-run here.
## Coverage completed
- `packages/contracts/contracts/PayPerView.sol` (1–188) — MUS — full read
- `packages/contracts/contracts/SubscriptionManager.sol` (1–186) — MUS — full read
- `packages/contracts/contracts/TicketNFT.sol` (1–241) — MUS — full read
- `packages/contracts/contracts/MovieTicket.sol` (1–434) — MUS — full read
- `packages/contracts/contracts/DFLIX.sol` (1–307) — MUS — full read
- `packages/contracts/contracts/SeederCredits.sol` (1–161) — MUS — full read
- `packages/contracts/contracts/FilmmakerCampaign.sol` (1–376) — MUS — full read
- `apps/frontend/lib/pricing.ts` + `licensing.ts` (294 lines combined) — MUS — full read; CONTRIBUTION_TABLE arithmetic re-verified by hand
- Cross-layer: `apps/frontend/app/mint/page.tsx:57-69,179,273`, `apps/frontend/lib/contracts/useMovieTicket.ts:12-66`, `packages/contracts/scripts/deploy.ts:19-24`, `docs/WHITEPAPER.md` money lines (45, 82, 104, 108, 199), `apps/frontend/lib/web3/wrappers/payPerView.ts` (comment/doc check)
## Findings

### MUS-001 · SubscriptionManager pays creators 0% — an entire revenue path contradicts the advertised 75% creator share
**S1 · Confirmed · NEW · Effort M · Lens MUS · Found by MUS in Phase 2 on 2026-09-29**

**Location:** `packages/contracts/contracts/SubscriptionManager.sol` (whole file; money exit `withdraw()` ~L154–160)

**Evidence:**
```solidity
// The ONLY money exit in the contract:
/// @notice Withdraw all accumulated subscription revenue to the owner.
function withdraw() external onlyOwner nonReentrant {
    uint256 amount = address(this).balance;
    ...
```
A repo-wide grep confirms the absence: `grep -n -i 'fee|filmmaker|creator' packages/contracts/contracts/SubscriptionManager.sol` → **zero hits**. No fee variable, no per-filmmaker ledger, no split. `subscribe`/`renew` collect the exact plan price into the contract balance; 100% exits to the owner. Meanwhile the product promises "75% creator share on every sale": `apps/frontend/lib/pricing.ts` FILMMAKER_TIERS features (×3 tiers), `apps/frontend/app/pricing/page.tsx:40` ("Every tier pays the same 75% creator share on every sale"), `apps/frontend/app/dashboard/page.tsx:523` ("75% creator share on every sale"), `apps/frontend/app/crowdfund/page.tsx:26`. The whitepaper §3.2 says plans are defined by "Filmmakers or the operator" — but `createPlan` is `onlyOwner`; filmmakers have no on-chain role in subscription revenue at all. A subscription is a sale; on this path the creator share is 0%.

**What's wrong:** The money math is exact (nothing split, nothing lost) but the *model* is wrong against the binding business rule: one of the platform's primary revenue paths (subscriptions — the Collector Pass primitive) pays creators nothing, while every marketing surface says 75% on every sale. If subscriptions went live as built, creators would receive 0% contrary to the advertised economics.

**Impact:** Wrong money math affecting users once live (pre-launch today: no real funds have moved, hence S1 not S0). Also a take-rate story break: the "75/25" model is what pricing.ts's economics are modeled on.

**Reproduce / reasoning:** Static: read the contract (186 lines) — there is no code path that pays a non-owner anything. Compare with the four cited copy surfaces.

**Other instances (sibling search):** TicketNFT is the mirror image (100% to filmmaker, MUS-002); FilmmakerCampaign has 0% platform fee by design (deferred). Only PayPerView + MovieTicket implement the 75/25 split (when the owner sets 2500 bps).

**Suggested fix:** Either (a) design per-film subscription revenue splits before launch, or (b) keep 100%-to-owner as explicit *platform* product revenue and qualify the "75% on every sale" copy to exclude subscriptions. Do not leave the copy and the code disagreeing.

**Related:** notes/payout-math.md (Q1); TST-009 (the missing cross-layer test); DOC lane (copy claims).

### MUS-002 · TicketNFT takes a 0% platform fee — money math contradicts the 25% platform claim in the generous direction
**S3 · Confirmed · NEW · Effort S · Lens MUS · Found by MUS in Phase 2 on 2026-09-29**

**Location:** `packages/contracts/contracts/TicketNFT.sol` — `mintTicket` (~L289–312)

**Evidence:**
```solidity
/**
 * @notice Mint one ticket for `filmId`. Requires exact payment of the film's
 * current price; the full amount is forwarded to the filmmaker. No platform
 * fee is taken here.
 */
...
if (msg.value > 0) {
    (bool ok, ) = film.filmmaker.call{value: msg.value}("");
```
100% of every mint goes to the filmmaker. The whitepaper's take-rate story (L199: "75% to the filmmaker", L45: platform fee capped at 25%) assumes the platform retains ~25% to fund operations; this path retains 0%.

**What's wrong:** Deliberate (the docstring is explicit) but inconsistent with the platform's stated take rate. No user loses money — the filmmaker gets *more* than 75% — so this is a model/copy inconsistency, not a theft.

**Impact:** If ticket sales became a major channel, the platform's 25% funding assumption silently fails on this path; the "75/25" claim in the whitepaper is not universally true.

**Reproduce / reasoning:** Static read of `mintTicket`; the only other money path in the contract is the same forward.

**Suggested fix:** Dino's business call: either add the fee path or keep 0% as a deliberate filmmaker-friendly choice and correct the take-rate copy. Recommend the latter (simplest, no user harm).

**Related:** notes/payout-math.md (Q2); MUS-001.

### MUS-003 · MovieTicket accepts overpayment and silently captures the surplus for the owner
**S2 · Confirmed · NEW · Effort S · Lens MUS · Found by MUS in Phase 2 on 2026-09-29**

**Location:** `packages/contracts/contracts/MovieTicket.sol` — `mintPermanentPass` (L217–273), `mintBurnableTicket` (L277–333), `withdraw` (L177–180)

**Evidence:**
```solidity
require(msg.value >= price, "Insufficient payment");   // L224 / L284 — overpayment ACCEPTED
uint256 platformFee = (price * platformFeeBps) / 10000; // L228 — split computed on `price`
uint256 creatorShare = price - platformFee;             // L229 — NOT on msg.value
```
The excess `msg.value - price` is never refunded, never credited to anyone's ledger, never emitted in an event — it merges into the contract balance. `withdraw()` then sweeps `address(this).balance` to the owner (L177–180). Compare PayPerView (`PayPerView.sol:105`): `if (msg.value != film.priceWei) revert IncorrectPayment(...)` — exact-payment by design, and the whitepaper (L45) describes *that* design as "Overpayment is impossible by design".

**What's wrong:** Every wei should be accounted for in exactly one of {creator share, platform fee} — the surplus is in neither. It is captured by the owner with no disclosure and no accounting.

**Impact:** Conditional: the mint functions are `onlyOwner`, and the live UI sends exactly `priceWei` (`apps/frontend/app/mint/page.tsx` writeContract `value: priceWei`), so the surplus can only arise from direct owner/deployer calls today. A future permissionless mint would turn this into user fund loss. S2 (edge case, no user funds at risk through the UI flow).

**Reproduce / reasoning:** Static: `msg.value >= price` plus split-on-`price` plus balance-sweep `withdraw()`.

**Other instances (sibling search):** No — PayPerView and TicketNFT enforce exact payment; FilmmakerCampaign credits the full `msg.value` to the backer (refundable). This is the only path with unaccounted surplus.

**Suggested fix:** Require exact payment like PayPerView (recommended — simplest, matches the whitepaper's stated design), or compute the split on `msg.value` and add a refund path for the excess.

**Related:** notes/payout-math.md (Q3); whitepaper L45 claim is accurate only for PayPerView.

### MUS-004 · Mint page shows a hardcoded 30% platform fee ("70% to the creator") whenever the on-chain fee read fails
**S2 · Confirmed · NEW · Effort XS · Lens MUS · Found by MUS in Phase 2 on 2026-09-29**

**Location:** `apps/frontend/app/mint/page.tsx:69`, rendered at `:179` and `:273`

**Evidence:**
```tsx
const feePct = platformFeeBps ? (Number(platformFeeBps) / 100).toFixed(0) : '30'; // :69
...
<span className="text-emerald-400">{(100 - parseInt(feePct))}% to the creator</span> // :179 — renders "70% to the creator"
<span>{(100 - parseInt(feePct))}%</span> // :273 — "Goes directly to creator 70%"
```
`useMovieTicket` (`apps/frontend/lib/contracts/useMovieTicket.ts:27-29`) returns early when the contract address is unset — `platformFeeBps` stays `null` forever — so in demo/unconfigured states the purchase confirmation screen *permanently* displays 70% to the creator. That contradicts the contract cap (2500 bps = 25%), the deployed fee (2500), the whitepaper (75%), and pricing.ts (`CREATOR_SHARE = 0.75`). It also misfires when the fee is legitimately 0 (falsy → shows 30%). The copy-honesty test does not cover it (`grep feePct|30%|70% apps/frontend/lib/copy-honesty.test.ts` → no hits). This is the concrete instance of the TST-009 gap (no cross-layer test pins the 75% copy to the contract caps).

**What's wrong:** A hardcoded money figure in the purchase flow that disagrees with the contract, the deploy config, and the product's own pricing source of truth — shown exactly where the buyer decides to pay.

**Impact:** Misleading money copy on the purchase confirmation screen (conditional on the fee read failing/being unset). S2.

**Reproduce / reasoning:** Static: read `:69` and the two render sites; trace `useMovieTicket`'s early-return on the zero address.

**Suggested fix:** Never hardcode a money figure: show "—"/loading until the on-chain fee resolves, or derive the fallback from `CREATOR_SHARE` labeled as draft. Add a copy-honesty test asserting the rendered creator share equals the on-chain `platformFeeBps` (or the PRICING constant when unset).

**Related:** TST-009 (proves the gap); notes/payout-math.md (Q4); DOC lane for the copy side.

### MUS-005 · DFLIX: staking accruals are not pre-reserved against the reward pool — seed allocations can strand accrued rewards
**S2 · Confirmed · NEW · Effort M · Lens MUS · Found by MUS in Phase 2 on 2026-09-29**

**Location:** `packages/contracts/contracts/DFLIX.sol` — `allocateSeedReward` (~L164–183), `claimRewards` (~L238–256)

**Evidence:** `allocateSeedReward` guards only `allocatedSeedRewards + amount > rewardPool` (L171–173); it ignores checkpointed-but-unclaimed staking accruals (`_accruedRewards`). The code admits this at the L150–154 docstring: *"the total allocated seed rewards can never exceed the funded pool (best-effort guard — staking accruals are not pre-reserved against the pool)."* Meanwhile `claimRewards` reverts `InsufficientRewardPool` when `total > rewardPool` (L245). Sequence: staker accrues 100 DFLIX → attestor allocates 100% of the pool to seeders → staker's `claimRewards` reverts forever. The pool invariant "outstanding claims ≤ pool" is not enforced; payout order is first-come-first-served with the loser getting a revert, not a pro-rata share.

**What's wrong:** The money math of each individual claim is exact, but the *pool solvency* invariant isn't — accrued-but-unclaimed rewards are promises the pool may not be able to keep.

**Impact:** A staker's legitimately accrued rewards can become permanently unclaimable through no fault of their own (conditional on pool contention). The in-code comment is honest, but users can't see it. S2 (conditional, pre-launch).

**Reproduce / reasoning:** Static: compare the allocation guard (seed-only reservation) with the claim guard (total check). No test covers pool contention (TST inventory shows no such case).

**Suggested fix:** Either pre-reserve staking accruals against the pool at checkpoint time, or make the first-come-first-served policy explicit in user-facing docs (and emit an event when a claim fails for pool reasons so it's observable). Dino's policy call.

**Related:** notes/payout-math.md (Q5).

### MUS-006 · SeederCredits: MAX_REPORT_AGE is declared but never enforced — signed reports are replayable daily without bound
**S2 · Confirmed · NEW · Effort S · Lens MUS · Found by MUS in Phase 2 on 2026-09-29**

**Location:** `packages/contracts/contracts/SeederCredits.sol` — constant `MAX_REPORT_AGE` (L36), `submitSeedingReport` (L74–104)

**Evidence:** L36 declares `uint256 public constant MAX_REPORT_AGE = 7 days;` — the only reference in the file (`grep -n MAX_REPORT_AGE` → L36 only). The docstring (L70–73) says "Report must be recent", but `submitSeedingReport` checks only: claims not paused, non-empty txId, `claimedAmount > 0`, 1-day cooldown, attestor signature. The signed message is `keccak256(abi.encodePacked(msg.sender, arweaveTxId, claimedAmount, block.chainid))` — no timestamp, no nonce. So one attestor signature for a report can be re-claimed once per cooldown day, forever, minting `claimedAmount * multiplier / 100` credits each time.

**What's wrong:** Two gaps in one entry: (a) documented behavior ("report must be recent") is not implemented; (b) the credit economy has no issuance bound per report — unbounded minting from a single signed attestation.

**Impact:** Conditional on attestor-signature reuse (attestor is trusted in Phase 0/1, but a leaked or captured signature, or an attestor who changes their mind, yields unlimited credits — which redeem for fee discounts/free tickets). W3B owns the signature-replay exploitability; this entry owns the economy consequence and the doc-vs-code gap. S2.

**Reproduce / reasoning:** Static: L36 has no other references; the message hash has no freshness field; cooldown only rate-limits.

**Suggested fix:** Bind a timestamp/nonce (or expiry) into the signed message and enforce `MAX_REPORT_AGE` (recommended), or remove the constant and correct the docstring if replay is accepted as attestor-trust.

**Related:** notes/payout-math.md (Q6); W3B (signature replay).

### MUS-007 · FilmmakerCampaign: milestone amounts are never validated against target/raised — escrow can deadlock or trap residual funds
**S3 · Confirmed · NEW · Effort S · Lens MUS · Found by MUS in Phase 2 on 2026-09-29**

**Location:** `packages/contracts/contracts/FilmmakerCampaign.sol` — `launchCampaign` (~L156–190), `approveMilestoneAndRelease` (L242–267)

**Evidence:** `launchCampaign` accepts arbitrary `milestoneAmounts` with no check that Σ(milestones) ≤ `target` or relates to `raised`. `approveMilestoneAndRelease` requires `campaignEscrow >= m.amount` (L250) and pays exactly `m.amount`. Consequences: (a) if Σ(milestones) > raised, later milestones can never release — funds are stuck with no refund path once status leaves the refundable window (status may become FUNDED/DELIVERED); (b) if Σ(milestones) < raised, residual escrow is trapped after all milestones approve (status DELIVERED, no sweep path). Per-tranche math is exact; the campaign-level accounting can deadlock.

**What's wrong:** No campaign-level invariant; the contract is deferred (prominent banner, not deployed, UI shows deferral notice) so this is latent, but the code is live and the banner says "retained for architecture and test history."

**Impact:** Locked funds in edge-case campaign configurations. S3 (deferred contract, no live funds).

**Reproduce / reasoning:** Static: launch has no Σ check; release and refund paths enumerated; no residual-sweep function exists.

**Suggested fix:** Validate `Σ(milestoneAmounts) <= target` (or == target) at launch, and add a residual-sweep (to filmmaker after DELIVERED, or to backers pro-rata) — when/if the contract is ever undeferred. Also dedupe the doubled `pragma`+imports at L14–26 (hygiene).

**Related:** notes/payout-math.md (Q-section, observation 6).
