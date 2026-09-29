<!-- W3B · 2026-09-29 · Critical-flow trace: subscription purchase -->
<!-- Contracts UNAUDITED. All path:line refs verified by line-read. -->

# Flow: subscription purchase (W3B trace)

Contract: `packages/contracts/contracts/SubscriptionManager.sol` (186 lines). Frontend wrappers: `apps/frontend/lib/web3/wrappers/subscriptionManager.ts`.

## Hop-by-hop

1. **Plan setup (owner only)** — `createPlan(planId, name, priceWei, durationSecs)` (`:76-98`): validates non-empty name, `priceWei > 0`, `durationSecs > 0`; plan starts `active = true`. Emits `PlanCreated`. Plan IDs are owner-chosen (no zero-ID guard — `_plans[0]` is usable; harmless).
2. **Subscribe** — `subscribe(planId)` (`:112-124`), payable, `nonReentrant`:
   - plan must exist and be `active` (`:114-115`)
   - caller must NOT already have an active subscription (`:116` → `AlreadySubscribed`)
   - `msg.value` must EXACTLY equal `plan.priceWei` (`:117` → `IncorrectPayment`; overpayment reverts, no partial credit)
   - sets `_subscriptions[msg.sender] = {planId, expiresAt: block.timestamp + durationSecs}`; emits `Subscribed`.
3. **Entitlement** — `hasActiveSubscription(holder)` (`:171-173`): pure view, `expiresAt > block.timestamp`. `subscriptionOf` returns `(planId, expiresAt)` (`:176-184`). No token is minted; the entitlement is the mapping entry.
4. **Renewal** — `renew(planId)` (`:132-148`), payable, `nonReentrant`:
   - subscription must be currently ACTIVE (`:134` — expired subs cannot renew; must `subscribe` fresh)
   - must be the SAME plan (`:135` → `PlanMismatch` — no plan switching via renew)
   - plan must still be `active` (`:138` — deactivated plans block renewals)
   - exact payment (`:139`); `expiresAt += durationSecs` (extends from current expiry, not from now — early renewal doesn't lose time). Emits `Renewed`.
5. **Cancel** — `cancel()` (`:150-157`): requires an active subscription; sets `expiresAt = block.timestamp` (immediately inactive); emits `Cancelled`. **NO REFUND — confirmed in code: no value transfer, and the NatSpec states "No refund is issued; already-paid time is forfeited" (`:151-153`).** Matches the DOC-verified claim.
6. **Revenue** — payments accumulate as raw contract balance; `withdraw()` (`:160-167`, `onlyOwner`, `nonReentrant`) sweeps everything to the owner. No split, no per-plan accounting (W3B-004).

## Edge cases

- **Subscribe while active** → reverts `AlreadySubscribed` (must cancel or expire first). Cancel-then-resubscribe forfeits remaining time (no refund).
- **Renew after expiry** → reverts `SubscriptionNotActive`; the user subscribes fresh (expiry resets from `block.timestamp`, no back-credit for lapsed time).
- **Plan deactivated mid-subscription** → existing subscribers keep access until expiry (`:100-103` documents this); new subs and renewals revert `PlanInactive`. Deactivation is IRREVERSIBLE for that planId (no reactivate function).
- **Price change** → there is no `setPlanPrice`; price is immutable per plan (owner would create a new plan). Renewals always charge the plan's original price.
- **Front-running** → exact-payment requirement means a price/plan race reverts the buyer's tx (gas cost only, no fund loss).
- **Owner key loss** → accumulated revenue stuck forever (onlyOwner withdraw, no recovery).

## Frontend wiring

- Wrappers `subscribe` / `renew` / `cancel` / `hasActiveSubscription` / `subscriptionOf` exist with input validation (`reqUint`, `reqWei`, `reqAddress`). Docstrings say value "must cover the plan price" — inaccurate; the contract requires EXACT payment (W3B-008).
- UNDEPLOYED guard: `getSubscriptionManager` throws `UndeployedError` until `NEXT_PUBLIC_SUBSCRIPTION_MANAGER_ADDRESS` is set (verified: `lib/web3/contracts.ts:62-65` + tests in `lib/web3/contracts.test.ts:25-28`).
- The whitepaper (`docs/WHITEPAPER.md:39-41`) describes this flow accurately, including no-refund cancel.
