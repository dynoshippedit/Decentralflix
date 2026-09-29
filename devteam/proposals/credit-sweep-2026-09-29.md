# Credit-minting exploit replay + full credit-route sweep — 2026-09-29

**Task:** DF-AUDIT-CREDITS (Dino's direct order, decision #2)
**Type:** READ-ONLY audit. No code changed, no commits, no pushes.
**Source identity:** `/home/dino/Decentralflix`, branch `devteam/review-2026-09-29`,
HEAD `1e8fd59` ("df-cycle-09: TST-001 triage…"), tree clean at start.
Probe method: fresh server on ports 18110/18111/18112 with scratch data dir
(`data/` moved aside, restored afterward). **Never touched :8080.** No blockchain
interaction.

---

## 1. Endpoint inventory — every route that creates, changes, or spends credits

Derived from `apps/lifeboat/server.js` route dispatch + `lib/pass.js`
(`issueCredits`, `redeemCredit`, `credit_ledger`). There are exactly two
`issueCredits` call sites (server.js:922, server.js:834) and one
`redeemCredit` call site (server.js:986). No other route touches
`credit_ledger`.

| # | Method + path | Handler | Credit effect | Current auth (code-read) |
|---|---|---|---|---|
| 1 | `POST /api/passes/test` | `passTestSubscribe` | **Issues** 1 credit (`CREDITS_PER_BILLING_PERIOD`) per call | `requireAuth`; bound to `account.email`; request-body email ignored (fixed df-cycle-01) |
| 2 | `POST /api/passes/checkout` | `passCheckout` | Stub — always 503 "not configured", no credits move | N/A (unreachable success path) |
| 3 | `GET /api/passes/:id` | `passDetail` | Read-only: pass + balance + full ledger | **None** — public (see residual R2) |
| 4 | `POST /api/passes/:id/redeem` | `passRedeem` | **Spends** 1 credit + grants permanent entitlement via `grantEntitlement` | `requireAuth` + `pass.email === account.email` (403); entitlement email forced to `account.email`; `alreadyEntitled` checked before debit |
| 5 | `POST /api/purchases/test` | `testPurchase` | Grants entitlement (test mode; no credits involved) | `requireAuth`; bound to `account.email` |
| 6 | `POST /api/purchases/bundle/test` | `bundleTestPurchase` | Grants N entitlements + sales order (test mode; no credits involved) | `requireAuth`; bound to `account.email` |
| 7 | `POST /api/claims/:id/approve` | `approveClaim` | Grants entitlement via `grantEntitlement` | `requireFilmmaker` + `ownsFilm` (403); 409 on re-approve |
| 8 | `POST /api/webhooks/stripe` | `stripeWebhook` | Grants entitlement on `checkout.session.completed`; **issues** credits on `invoice.payment_succeeded` (collector_pass) | Stripe webhook signature (`stripe.verifyWebhookSignature` → 400 on bad signature); 503 when no keys configured |

Design constraints (lib/pass.js header): credits are NON-TRANSFERABLE (no
endpoint/UI/ledger op can move credits between passes; `redeemCredit` refuses
non-matching email) and NON-CASHABLE (`cash_value_usd_cents: 0` on every entry).

---

## 2. Exploit replay — original SEC-001 requests, exactly as the pre-fix demo received them

Pre-fix behavior (from devteam/findings/sec.md SEC-001): all three returned
success with no credentials — `POST /api/passes/test {"email":"a@x.com"}`
minted a credit per call for any address; `POST /api/passes/<id>/redeem
{"film_id":"<any>","email":"a@x.com"}` returned 201 with a permanent
entitlement + signed receipt.

Replayed **unauthenticated** against the current build (port 18110):

### R-a — `POST /api/passes/test` (original mint exploit)
```
REQUEST:  POST /api/passes/test
          Authorization: (none)
          Body: {"email":"attacker@evil.com"}
RESPONSE: HTTP 401
          Body: {"error":"authentication required"}
```
**Verdict: FIXED.** No credit minted, no pass created.

### R-b — `POST /api/purchases/test` (sibling test endpoint)
```
REQUEST:  POST /api/purchases/test
          Authorization: (none)
          Body: {"film_id":"<valid film>"}
RESPONSE: HTTP 401
          Body: {"error":"authentication required"}
```
**Verdict: PROTECTED** (was already auth-gated pre-fix).

### R-c — `POST /api/passes/:id/redeem` (original exploit step 2)
```
REQUEST:  POST /api/passes/pass_fake123/redeem
          Authorization: (none)
          Body: {"film_id":"<valid film>","email":"attacker@evil.com"}
RESPONSE: HTTP 401
          Body: {"error":"authentication required"}
```
**Verdict: FIXED.** Auth is checked before the pass is even looked up.

---

## 3. Sweep — every credit-affecting route, code + live probe

Setup: `attacker@evil.com` (buyer), `victim@victim.com` (buyer),
`fm@audit.test` (filmmaker), two films imported by the filmmaker (ports 18110/18112).

| Route | Code verdict | Live probe | Result |
|---|---|---|---|
| `POST /api/passes/test` | `requireAuth`; email = `account.email` | Unauth → 401 (R-a). Authed as attacker with body `{"email":"victim@victim.com"}` → 201, `pass.email` = `attacker@evil.com` (body email ignored) | **Protected** |
| `POST /api/passes/test` (repeat) | No per-pass cap in code | 2nd authed mint → `balance: 2` | **Protected from outsiders; UNCAPPED self-mint** — residual R1 |
| `POST /api/passes/checkout` | Always throws → 503 | Unauth → 503 "not configured" | **N/A** — no credit path exists |
| `GET /api/passes/:id` | No auth in `passDetail` | Unauth → 200 with `pass.email`, balance, full ledger entries | **Read-only; PII exposure** — residual R2 (no credit effect) |
| `POST /api/passes/:id/redeem` | `requireAuth`; `pass.email !== account.email` → 403; `alreadyEntitled` before debit; entitlement email = `account.email` | Unauth → 401 (R-c). Attacker redeeming victim's pass → **403** "pass does not belong to this account". Own pass → **201**, `delta: -1`, entitlement granted. Re-redeem same film → **200** `already_owned: true`, `redemption: null`, balance unchanged (no double-spend) | **Protected** |
| `POST /api/purchases/test` | `requireAuth`; email = `account.email` | Unauth → 401 (R-b) | **Protected** |
| `POST /api/purchases/bundle/test` | `requireAuth`; email = `account.email`; skips already-owned | Unauth → 401. Authed (2 films, 1 already owned) → 201, only the unowned film granted | **Protected** |
| `POST /api/claims/:id/approve` | `requireFilmmaker` + `ownsFilm` → 403; `approveClaim` 409 on non-pending | Unauth → **401**. Buyer (non-filmmaker) → **403** "filmmaker role required". Owning filmmaker → **200** approved. Re-approve → **409** "claim already approved" | **Protected** |
| `POST /api/webhooks/stripe` | `stripe.verifyWebhookSignature` → 400 on bad signature; 503 when unconfigured | No signature, no keys → **503** "Stripe webhook not configured" (config check precedes signature check) | **Protected per code**; signature path not live-exercisable without keys — residual R3 |

**Sweep coverage: 9/9 credit-affecting routes covered. 0 vulnerable to the
missing-auth/ownership class. The two original SEC-001 exploit paths both
return 401.**

The lifeboat suite's own pass section (test.sh:598-688) independently pins:
unauth `passes/test` → 401, authed mint bound to account, `passes/checkout` →
503, unauth redeem → 401, cross-user redeem → 403, double-redeem →
`already_owned`, balance accounting.

---

## 4. Residual issues (not the original exploit class — flagged, not fixed; read-only audit)

- **R1 — Uncapped authenticated test-mint.** SEC-001's suggested fix included
  "cap test grants per pass"; this was not implemented. Any authenticated user
  can call `POST /api/passes/test` repeatedly and accumulate unlimited
  test credits for themselves (verified: balance 1 → 2 on second call). Today:
  test-labeled, no money moves, grants marked `test_mode`. At real-money
  launch this is free content unless the test surface is capped or removed.
- **R2 — `GET /api/passes/:id` exposes PII without auth.** Returns the pass
  holder's email plus the full credit ledger to anyone who knows/guesses a
  `pass_id` (verified unauthenticated 200). Read-only — no credit effect.
  This is the SEC-007 class; noted here because the sweep touched the route.
- **R3 — Webhook signature path not live-verified.** With no Stripe keys
  configured the route returns 503 before reaching signature verification.
  Code read confirms `stripe.verifyWebhookSignature` → 400 "invalid webhook
  signature" on bad signatures. Recommend re-probing with a test webhook
  secret in a staging environment before any real-money wiring.

---

## 5. Notes for the controller

- `data/` was moved aside for hermetic probes and restored; the demo :8080
  service was never contacted; df-cycle-09's committed work was not touched;
  nothing was committed by this audit (this file is intentionally uncommitted).
- Probe scripts used: `/tmp/credit-audit-probe.sh`,
  `/tmp/credit-audit-probe2.sh` on the Threadripper; local copies at
  `~/workspace/credit-audit-probe.sh`, `~/workspace/credit-audit-probe2.sh`.
- Stale probe servers from earlier cycles are still listening on 18091,
  18092, 18097 (not started by this audit; left alone per the no-broad-kill rule).
