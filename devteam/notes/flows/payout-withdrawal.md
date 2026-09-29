<!-- W3B · 2026-09-29 · Critical-flow trace: payout / withdrawal -->
<!-- Contracts UNAUDITED. All path:line refs verified by line-read. -->

# Flow: payout / withdrawal (W3B trace)

Two different payout models exist side by side. This trace follows each hop: sale → escrow → split → creator withdraw.

## Model A — PayPerView: escrow + pull withdrawal + fee split at withdrawal

1. **Sale** — `buyAccess(filmId)` (`PayPerView.sol:100-107`): buyer pays EXACTLY `priceWei` (over/underpayment reverts, `:104`). `_access[filmId][buyer] = true`; `msg.value` accrues in `_filmRevenue[filmId]`. Event `AccessPurchased`.
2. **Escrow** — funds sit in the contract under `_filmRevenue[filmId]`. No time limit, no auto-release.
3. **Split** — happens ONLY inside `withdrawRevenue` (`:112-131`): `fee = amount * platformFeeBps / 10000` (rounds down); `_accruedPlatformFees += fee`; `filmmakerAmount = amount - fee`; filmmaker receives `filmmakerAmount` via `.call`.
4. **Creator withdraw** — `withdrawRevenue(filmId)`: ONLY the film's filmmaker (`:115-116`). Pull pattern; `nonReentrant`; balance zeroed before the external call.
5. **Platform withdraw** — `withdrawPlatformFees()` (`:134-143`): ONLY owner, pulls `_accruedPlatformFees`.

**Fee-cap enforcement points:** `setPlatformFeeBps` reverts if `> 2500` (`:142-144`); `MAX_PLATFORM_FEE_BPS` is a public constant (`:27`). **The fee applied is the CURRENT fee at withdrawal time, not at purchase time** — an owner hike between sale and withdrawal retroactively increases the fee on already-accrued revenue (NatSpec documents this, `:139-141`). Deploy default is 2500 (`scripts/deploy.ts:21`).

**Who can withdraw what, when:**
| Actor | What | When | Gate |
|---|---|---|---|
| Filmmaker | film's accrued revenue minus current platform fee | anytime after sales | `film.filmmaker == msg.sender` |
| Owner | accrued platform fees | anytime after a filmmaker withdrawal created them | `onlyOwner` |
| Anyone else | nothing | — | — |

**Stuck funds:** if the filmmaker never calls `withdrawRevenue`, the ETH is stuck FOREVER — no sweep, no expiry, no owner recovery. Platform fees on that revenue likewise never materialize (they accrue only at withdrawal). There is no `delistFilm`/unregister in PayPerView.

> **SUPERSEDED 2026-09-29 (owner decision, df-cycle-13):** TicketNFT now inherits the shared `RevenueSplitter` — mint splits **75/25** at purchase (75% + rounding remainder to the filmmaker, 25% platform, `MissingCreator` revert, owner cannot redirect or alter). The 100%-to-filmmaker text below is kept for history; do not treat it as current.

## Model B — MovieTicket / TicketNFT: immediate forward, no escrow

- **TicketNFT.mintTicket** (`TicketNFT.sol:134-156`): exact payment, 100% forwarded to the filmmaker in the same transaction. No platform fee, no escrow, nothing to withdraw. If the filmmaker address can't receive ETH, the whole mint reverts (W3B-006: no way to change the payee).
- **MovieTicket.mintPermanentPass / mintBurnableTicket** (`MovieTicket.sol:220-281 / 283-344`): creator is paid immediately (`creatorShare`), the platform fee stays as residual contract balance. Owner sweeps the ENTIRE balance via `withdraw()` (`:200-203`) — platform fees are commingled with buyer overpayments (W3B-002); there is no per-film or per-fee accounting.

## Model C — SubscriptionManager: accumulate, owner-only sweep

- `subscribe`/`renew` (`SubscriptionManager.sol:112-148`): exact payment accumulates in contract balance. **There is no creator split** — `withdraw()` (`:160-167`) sends everything to the owner. No filmmaker is recorded per plan. (W3B-004: the documented Collector Pass creator-payout economics cannot be expressed.)

## Model D — FilmmakerCampaign (DEFERRED): milestone escrow + pull refunds

- `contribute` → escrow in `campaignEscrow[campaignId]`. Owner releases tranches via `approveMilestoneAndRelease` (per-milestone escrow check). Backers pull refunds via `claimRefund` only when FAILED or past-deadline-and-under-target. Owner `emergencyRefundAll` forces FAILED. If a campaign is FUNDED and the filmmaker disappears, funds are stuck unless the owner triggers the emergency path. (W3B-003, W3B-007, W3B-017.)

## DFLIX rewards (related money-out flow)

- `claimRewards` (`DFLIX.sol:230-253`): staking + seed rewards paid ONLY from `rewardPool`; reverts if `total > rewardPool`. Staked principal is never reachable via claims (separate ledger). No owner sweep of the pool exists — overfunded pool cannot be recovered.

## Cross-cutting observations

- **Pull-over-push:** PayPerView, FilmmakerCampaign, DFLIX, and SubscriptionManager all use pull withdrawals — no push-to-arbitrary-address loops, no failing-receiver DoS on payouts. (MovieTicket/TicketNFT push to the creator, but single-recipient with revert-on-failure; a rejecting creator reverts that mint only.)
- **Rounding:** every split is `floor(x * bps / 10000)` with the remainder going to the creator/filmmaker (`amount - fee`). Splits always sum EXACTLY to the input — no dust. (MUS cross-check: money-math precision is W3B-verified exact; MUS owns the economics.)
- **Events:** every state-changing hop emits an event EXCEPT: FilmmakerCampaign ACTIVE→FUNDED and →DELIVERED transitions (silent), SeederCredits `emergencySlash` (no event — W3B-010).
- **What the frontend does:** wrappers in `apps/frontend/lib/web3/wrappers/` expose `withdrawRevenue`, `withdrawPlatformFees`, `withdraw` (all three contracts), `claimRewards`, `claimRefund`. NOTE: the `withdrawRevenue` wrapper docstring says "(owner only)" — wrong; it's filmmaker-only (W3B-008).
