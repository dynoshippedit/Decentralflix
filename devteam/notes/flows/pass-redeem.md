# Flow note — Pass create → redeem (Collector Pass)
<!-- C12 · BUG · 2026-09-29 · Phase 2 (Pass 3) -->
End-to-end trace of the Collector Pass lifecycle: subscribe (test) → credit grant →
redeem → entitlement. Server: `apps/lifeboat/server.js`; logic: `apps/lifeboat/lib/pass.js`;
store: `apps/lifeboat/lib/store.js`. UI: `apps/lifeboat/public/pass.html`.
The pass is TEST-MODE ONLY (no Stripe keys; `lib/stripe.js` stubs throw). Every response
carries `LEGAL_NOTICE` + `ECONOMICS_WARNING` — the money-transmission review is still open.

## How it works

### 1. Subscribe (test)
- UI: `pass.html` Subscribe button → `POST /api/passes/test {email}` via `app.js:74`
  postJSON. No auth involved (BUG-011).
- Route: `handleApi` (`server.js:1239`) → `passTestSubscribe` (`server.js:875-897`):
  1. `isEmail(body.email)` → 400 otherwise; normalized lowercase.
  2. `passLib.getPassByEmail(email)` (`lib/pass.js:62-66`): existing pass? If none,
     `createPass({email, testMode: true})` (`lib/pass.js:70-84`) → `pass_<12hex>`,
     `status: 'active'`, `stripe_subscription_id: null`. If one exists but isn't
     active, it is **re-activated** (`store.update` status → 'active').
  3. `passLib.issueCredits({pass_id, credits: CREDITS_PER_BILLING_PERIOD (1),
     reason: 'test_grant'})` (`lib/pass.js:103-108`) → validates positive integer →
     `ledgerEntry` (`lib/pass.js:90-101`): appends `{ledger_id, pass_id, delta: +1,
     reason, transferable: false, cash_value_usd_cents: 0}` to `credit_ledger`.
  4. 201 with `{test_mode: true, pass, credit_grant, balance}`.
- **BUG-004: no billing-period guard.** Every call mints another credit — reproduced:
  3 subscribes → balance 3. The header comment (`lib/pass.js:30`) says "1 credit per
  month"; nothing records the last grant, so the cadence is unenforced.
- Real-money shape (stubbed): `POST /api/passes/checkout` → `passCheckout`
  (`server.js:867-873`) → `stripe.createSubscriptionCheckout()` always throws →
  503. The intended real flow is `buildSubscriptionCheckoutParams`
  (`lib/stripe.js:42-72`: $9.99/mo, `metadata: {product: 'collector_pass'}`).

### 2. Inspect
- `GET /api/passes/:id` → `passDetail` (`server.js:903-913`): pass + `balance`
  (sum of deltas, `lib/pass.js:110-115`) + full `ledger` + legal/economics warnings.
  **No auth** — full ledger visible to anyone with the pass_id (BUG-011).

### 3. Redeem
- UI: `pass.html` redeem button → `POST /api/passes/:id/redeem {film_id, email}`.
- Route: `handleApi` (`server.js:1245`) → `passRedeem` (`server.js:915-960`):
  1. `store.get('films', body.film_id)` → 404 if missing.
  2. `isEmail(body.email)` → 400 otherwise; normalized lowercase.
  3. `alreadyEntitled(film_id, email)` (`server.js:423-426`) → if true, return 200
     with `already_owned: true`, **no credit spent** (test.sh proves: balance and
     ledger length unchanged). This is the duplicate-redemption guard — correct.
  4. `passLib.redeemCredit({pass_id, film_id, email})` (`lib/pass.js:127-160`):
     - pass must exist (else 404), `status === 'active'` (else 409),
     - **email must equal `pass.email` exactly** (else 403 — non-transferability;
       test.sh proves a thief email gets 403 and the balance is untouched),
     - `balance(pass_id) >= 1` (else 409 insufficient credits),
     - appends `{delta: -1, reason: 'redemption', film_id}`.
  5. `grantEntitlement({film, email, source: 'pass_redemption'})`
     (`server.js:387-421`) — the **same** entitlement+receipt path as a purchase,
     so the redeemed film lands in the buyer's library with a signed receipt and
     `license_term: 'permanent'`.
  6. 201 with `{entitlement, redemption, balance, license_term: 'permanent', ...}`.
- **BUG-005: debit-before-grant with no rollback.** Step 4 commits the `-1` to the
  file store; step 5 can still throw (disk/key failure) — the credit is then lost
  with no film and no compensating entry.

### Double-spend analysis (TST's claim, verified by reading — with a boundary)
- What TST proved (test.sh:560-660): sequential duplicate redemption is safe
  (already-owned check), non-holder redemption is rejected (403, balance intact),
  zero-balance redemption is rejected (409), and the ledger always shows
  `transferable: false, cash_value_usd_cents: 0`.
- What I verified additionally: within one Node process the check→debit→grant
  sequence in `passRedeem` contains **no `await`** between `alreadyEntitled`,
  `redeemCredit`'s internal `balance()`→`ledgerEntry()`, and `grantEntitlement` —
  all `store` calls are synchronous. The event loop cannot interleave two requests
  inside that window, so concurrent double-spend **cannot** slip through in a
  single-process deployment.
- Boundary: the file store's read-modify-write (`store.js:all` → push → `saveAll`
  rename) has no locking. Two server processes (cluster/multi-instance) could
  interleave `balance()` reads and both debit. Not exploitable in the current
  single-process `run.sh` setup; a scaling caveat for PRF/ARC.
- There is deliberately **no** `transferCredits()` (`lib/pass.js:162-163`) — the
  non-transferable invariant holds at the API level: no endpoint, UI control, or
  ledger operation moves credits between passes.

### Expiry, tamper, clock
- **No expiry anywhere**: credits never expire, passes have no `expires_at`, the
  ledger has no TTL. `redeemCredit` checks only `status === 'active'`.
- **Tamper**: the ledger is a plain JSON file; anyone with filesystem access can
  edit it (out of scope for the threat model — single box). API-level tampering
  isn't possible: `issueCredits` is only called from `passTestSubscribe` and the
  Stripe webhook, and `redeemCredit` validates all three preconditions.
- **Clock skew**: not a factor — no timestamps are compared in this flow (session
  TTL in `lib/auth.js` is the only time check in the service, 30 days).

### Stripe webhook lifecycle (real-money shape, currently unreachable)
- `customer.subscription.created` → find-or-create pass, set `status: 'active'`,
  `test_mode: false`, record `stripe_subscription_id` (`server.js:789-801`).
- `invoice.payment_succeeded` → issue 1 credit **only if the pass exists and is
  active** (`server.js:803-813`).
- `customer.subscription.deleted` → `status: 'canceled'` (`server.js:814-820`).
- **BUG-012**: out-of-order delivery (`invoice.payment_succeeded` before
  `subscription.created`) silently drops a paid renewal; cancellation leaves
  already-issued credits spendable forever (no expiry, no clawback); webhook
  retries are safe for `created`/`deleted` (idempotent updates) but a retried
  `invoice.payment_succeeded` after a successful grant would double-issue (no
  idempotency key on `stripe_invoice_id` — the field is recorded but never
  checked).

## Observations
- O1. Redemption grants a **permanent** entitlement + permanent download for a
  $9.99/mo credit redeemable against **any** film price — the unit-economics
  warning in the code itself flags this as not penciling (a >$12 film costs more
  in creator payout than the subscription price). Unresolved by design pending
  Dino's pricing decision (BUG-007).
- O2. `passTestSubscribe` re-activates canceled passes and grants a fresh credit —
  combined with BUG-004, "cancel" is meaningless in test mode.
- O3. The receipt for a redemption shows the film's full list price although the
  buyer paid a credit, and the receipt carries no `source` field — a verifier can't
  distinguish purchase from redemption (entitlement has `source`, receipt doesn't).
- O4. `GET /api/passes/:id` needs no auth, so pass IDs are bearer capabilities in
  practice; combined with no session binding, BUG-011 follows.

## Open questions
- Q1. **Should test-mode subscribe be rate/period-limited?** *Recommended default:*
  yes — one credit per 30 days per pass (record `last_credit_grant_at`), matching
  the documented "1 credit per month" model. (BUG-004)
- Q2. **Should pass routes require auth bound to the pass email?**
  *Recommended default:* yes — require a session whose email matches the pass
  holder for detail/redeem. (BUG-011)
- Q3. **What happens to unredeemed credits on cancellation, and do redeemed films
  survive membership end?** The code's ECONOMICS_WARNING lists these as undefined.
  *Recommended default:* decide before any real-money launch; until then, document
  the current behavior (credits survive, films are permanent) as the interim rule.
- Q4. **Should the Stripe webhook be idempotent on `stripe_invoice_id`?**
  *Recommended default:* yes — skip the grant if a ledger entry already carries
  that invoice id. (BUG-012)

## Related issue IDs
BUG-004, BUG-005, BUG-007, BUG-011, BUG-012 · Related lanes: SEC (authz matrix —
pass routes unauthenticated), TST (double-spend coverage boundary), DAT (webhook
idempotency), DOC (pass economics copy), MUS (credit/film-price economics).
