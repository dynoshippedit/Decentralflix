# Findings — Logic & Correctness Reviewer (BUG)
<!-- C12 · BUG · 2026-09-29 · Phase 2 (Pass 3: critical-flow tracing) · Status of these entries: NEW (triage/verification in Phase 4) -->
Scope: browse → purchase → stream and pass create → redeem, traced hop by hop through
`apps/lifeboat/server.js` (handleApi), `apps/lifeboat/lib/{pass,receipts,auth,store,cdn,stripe}.js`,
`apps/lifeboat/public/` (the lifeboat's own UI), and the frontend purchase math in
`apps/frontend/lib/{pricing,licensing}.ts` + `apps/frontend/lib/web3/wrappers/payPerView.ts`.
ID range: BUG-001… (this lane).

Repro method for Confirmed-live items: scratch copy of `apps/lifeboat/` run on 127.0.0.1:18099
with a throwaway `data/` dir (no repo files touched, no network beyond localhost).
Repro scripts: `~/workspace/bugwork/bugauth.sh`, `~/workspace/bugwork/bugdup.sh`
(local scratch; the pass-mint check was inline curl).

## Index

| ID | Severity | Confidence | Title |
|---|---|---|---|
| BUG-001 | S1 | Confirmed | DUPLICATE of STR-001: Lifeboat static UI never sends auth — browser purchase/stream journey always 401s |
| BUG-002 | S1 | Confirmed | DUPLICATE of SEC-002/DAT-001: `store.remove` missing — logout no-op, sessions never purged |
| BUG-003 | S2 | Confirmed | `testPurchase` grants duplicate entitlements on repeat purchase (no already-owned guard) |
| BUG-004 | S2 | Confirmed | `POST /api/passes/test` mints a credit on every call — no billing-period guard |
| BUG-005 | S2 | Confirmed | `passRedeem`: credit debited before entitlement granted, no rollback on failure |
| BUG-006 | S2 | Confirmed | Bundle math mismatch: "15% off / 3+ films" advertised, full price / ≥2 films charged |
| BUG-007 | S2 | Confirmed | Pass copy says 2 credits at $10/mo; code issues 1 credit at $9.99/mo |
| BUG-008 | S2 | Confirmed | On-chain `buyAccess` grants no lifeboat streaming entitlement — two unreconciled rails |
| BUG-009 | S3 | Confirmed | `setPlatformFeeBps` wrapper allows ≤10000 bps; contract caps at 2500 |
| BUG-010 | S3 | Confirmed | `buyAccess` wrapper doc says value "must cover" price; contract requires exact equality |
| BUG-011 | S2 | Likely | Pass endpoints have no auth — anyone with a pass_id can burn the holder's credits |
| BUG-012 | S2 | Likely | Stripe pass webhooks not idempotent / out-of-order-unsafe; canceled passes keep credits |
| BUG-013 | S3 | Confirmed | `licensing.ts` says "never a rental window" but claim flow accepts `purchase_type: 'rent'` |
| BUG-014 | S3 | Suspected | `parseMultipart` truncates uploads containing `\r\n--boundary` in the bytes |
| BUG-015 | S3 | Confirmed | Wrong-method API calls return 404 instead of 405 |
| BUG-016 | S3 | Confirmed | UI collects buyer email; server ignores it and binds purchase to the session account |
| BUG-017 | S3 | Confirmed | `Range: bytes=-` served as full-file 206 instead of rejected |
| BUG-018 | S3 | Confirmed | Buyer-library route double-decodes the email path param |

---

### BUG-001 · Lifeboat static UI never sends auth — browser purchase/stream journey always 401s
**S1 · Confirmed · DUPLICATE (of STR-001) · Effort S · Lens COR · Found by BUG in Phase 2 on 2026-09-29**

> Logged independently before reading the Journal; STR's Phase 2 entry (STR-001)
> covers the identical defect with the same evidence. Keeping this entry as a
> DUPLICATE pointer so the merge in Phase 4 keeps the best-evidenced one.
> (My independent reproduction — unauth POST → 401 on a scratch server — is
> preserved in `devteam/repro/bug-auth-mint-dupe.sh` for the Fixer.)

**Location:** `apps/lifeboat/public/app.js:63-92` (getJSON/postJSON — no Authorization header anywhere),
`apps/lifeboat/public/film.html` (buy button + `<video>` player)

**Evidence (quoted):**
```js
// app.js:63 — every API call the UI makes:
function getJSON(path) {
    return fetch(api(path), { headers: { Accept: "application/json" } })...
// film.html — the player can never authenticate:
document.getElementById("player").src = streamUrl;   // streamUrl = /api/films/<id>/stream
// film.html — the buy button sends no token:
D.postJSON("/api/purchases/test", { film_id: filmId, email: email })
```
Grep over the whole UI confirms it: zero hits for `Bearer`, `localStorage`, `auth/login`, `auth/signup` in `apps/lifeboat/public/`.
The server side requires auth on exactly these routes: `testPurchase` (`server.js:642`
`requireAuth`), `/stream` and `/download` (`server.js:1107-1128`, both `requireAuth`).

**Reproduce:** scratch lifeboat on :18099 — `POST /api/purchases/test` with no
Authorization header → `{"error":"authentication required"}` http=401. Same for the
curl equivalent of the `<video>` GET.

**What's wrong:** the intended behavior (per RUN.md and the 1 AM demo-journey claim) is
browse → buy → watch in the browser. The UI has no login screen, stores no token, and
attaches no Authorization header, so the buy button 401s and the video element — which
cannot send bearer headers at all — can never play an authed stream. The server-side
flow is fine (test.sh proves it with curl + tokens); the shipped UI cannot complete it.

**Impact:** the core demo journey is broken for any real browser user; the "verified
end-to-end" claim only holds for curl, not for the UI Dino would actually click through.

**Suggested fix:** add a minimal login/signup screen to the lifeboat UI, persist the
token (sessionStorage), attach `Authorization: Bearer` in getJSON/postJSON/patchJSON,
and serve stream/download via an authenticated mechanism the `<video>` element can use
(e.g. short-lived signed playback URLs or cookie auth for the media routes only).

**Related:** notes/flows/purchase-stream.md; TST (test.sh covers the curl path only).

---

### BUG-002 · `store.remove` does not exist — logout is a no-op, expired sessions never purged
**S1 · Confirmed · DUPLICATE (of SEC-002 / DAT-001) · Effort XS · Lens COR · Found by BUG in Phase 2 on 2026-09-29**

> Logged independently before reading the Journal; SEC-002 and DAT-001 cover the
> identical defect (`store.remove` not a function, TypeError swallowed). Keeping as
> a DUPLICATE pointer. My independent live reproduction (logout → 200, token still
> valid on /api/auth/me) is preserved in `devteam/repro/bug-auth-mint-dupe.sh`.

**Location:** `apps/lifeboat/server.js:324` (logout), `apps/lifeboat/server.js:210`
(expired-session cleanup in getAuthAccount); `apps/lifeboat/lib/store.js:94`
(exports `{ all, get, insert, update, DATA_DIR }` — no `remove`)

**Evidence (quoted):**
```js
// server.js:324
if (m) { try { store.remove('sessions', m[1].trim()); } catch {} }
// lib/store.js exports: all,get,insert,update,DATA_DIR  (verified live: typeof store.remove === 'undefined')
```
`store.remove(...)` throws TypeError, which the `try {}` swallows. The 200
`{logged_out: true}` response is a lie: the session row is untouched.

**Reproduce:** scratch lifeboat — signup → token → `POST /api/auth/logout`
(200) → `GET /api/auth/me` with the same token → **200 with the full account**.
Same at `:210`: expired sessions are "removed" by the same nonexistent call.

**What's wrong:** intended behavior is that logout invalidates the token and expired
sessions are cleaned up. Neither happens; tokens stay valid for the full 30-day TTL
(`auth.js` `SESSION_TTL_MS`) and `sessions.json` grows forever.

**Impact:** no way to revoke a compromised/leaked token short of hand-editing the
JSON file; "logged out" users are still authenticated.

**Suggested fix:** add `remove(name, id)` to `lib/store.js` (read-all, filter, atomic
saveAll — same pattern as `update`), or rewrite `sessions.json` without the row.
Add a test: logout → token reuse → 401.

**Related:** SEC lane (session management); notes/flows/purchase-stream.md.

---

### BUG-003 · `testPurchase` grants duplicate entitlements on repeat purchase (no already-owned guard)
**S2 · Confirmed · NEW · Effort XS · Lens COR · Found by BUG in Phase 2 on 2026-09-29**

**Location:** `apps/lifeboat/server.js:641-663` (`testPurchase`)

**Evidence (quoted):**
```js
async function testPurchase(req, res) {
  const account = requireAuth(req, res);
  ...
  const { entitlement, receipt, signature } = grantEntitlement({   // no alreadyEntitled check
    film, email: account.email, source: 'purchase', testMode: true,
  });
```
Contrast `bundleTestPurchase` (`server.js:696`: `if (alreadyEntitled(...)) { alreadyOwned.push...; continue; }`),
`passRedeem` (`server.js:926`: returns `already_owned: true` before debiting), and
`stripeWebhook` (`server.js:778`: `if (!alreadyEntitled(...))`).

**Reproduce:** scratch lifeboat — two identical `POST /api/purchases/test` →
two different `entitlement_id`s and two signed receipts for the same film+email.

**What's wrong:** every other grant path is idempotent; this one mints a fresh
entitlement + receipt per call. Intended behavior (per the sibling paths) is one
entitlement per buyer per film.

**Impact:** duplicate receipts/entitlements pollute the sales ledger and the audience
CSV; a receipt-verifier sees two "valid" receipts for one purchase.

**Suggested fix:** mirror `passRedeem`: check `alreadyEntitled` first and return 200
with `already_owned: true` (no new entitlement/receipt).

**Related:** notes/flows/purchase-stream.md; BUG-005 (ordering).

---

### BUG-004 · `POST /api/passes/test` mints a credit on every call — no billing-period guard
**S2 · Confirmed · NEW · Effort S · Lens COR · Found by BUG in Phase 2 on 2026-09-29**

**Location:** `apps/lifeboat/server.js:875-897` (`passTestSubscribe`)

**Evidence (quoted):**
```js
async function passTestSubscribe(req, res) {
  ...
  let p = passLib.getPassByEmail(email);
  if (!p) {
    p = passLib.createPass({ email, testMode: true });
  } else if (p.status !== 'active') {
    store.update('passes', p.pass_id, { status: 'active' });   // re-activates canceled passes
    p = passLib.getPass(p.pass_id);
  }
  const grant = passLib.issueCredits({                          // unconditional, every call
    pass_id: p.pass_id, credits: passLib.CREDITS_PER_BILLING_PERIOD, reason: 'test_grant',
  });
```
The pass header (`lib/pass.js:30`) defines the model as "1 credit per month". Nothing
tracks the last grant date, so the endpoint is a credit faucet.

**Reproduce:** scratch lifeboat — 3× `POST /api/passes/test` with the same email →
balances 1, 2, 3.

**What's wrong:** intended behavior is one credit per billing period. Any caller (or
the pass.html UI's Subscribe button, clicked repeatedly) can mint unbounded credits.

**Impact:** test-mode only today, but the endpoint is the stand-in for the real
billing flow — the period guard must exist before keys land, or the first real
subscriber can self-mint.

**Suggested fix:** record `last_credit_grant_at` on the pass; refuse (or no-op) when
the current billing period already granted. test.sh's "test pass subscription grants
1 credit" assertion must still pass.

**Related:** notes/flows/pass-redeem.md; BUG-012; SEC-001 (unauthenticated pass endpoints mint credits — same endpoint family; this entry is the missing *period guard*, SEC-001 is the missing *auth* — Lead to cluster).

---

### BUG-005 · `passRedeem`: credit debited before entitlement granted, no rollback on failure
**S2 · Confirmed (unambiguous code path) · NEW · Effort S · Lens COR · Found by BUG in Phase 2 on 2026-09-29**

**Location:** `apps/lifeboat/server.js:941-948` (`passRedeem`)

**Evidence (quoted):**
```js
  redemption = passLib.redeemCredit({ pass_id: passId, film_id: film.film_id, email });  // :941 — debit COMMITTED (sync file write)
  ...
  const { entitlement } = grantEntitlement({ film, email, source: 'pass_redemption' });   // :948 — can throw after the debit
```
`redeemCredit` (`lib/pass.js:127-160`) does check-then-debit synchronously (no await
between `balance()` and the ledger insert, so a single process can't interleave there —
TST's double-spend claim holds for the debit itself). But between the committed debit
(:941) and the entitlement grant (:948), `grantEntitlement` performs two more
`store.insert` calls plus `receipts.sign` → `getKeys()` (which does a
`fs.writeFileSync` on first run). Any throw in that window (disk full, permission
error, key-file failure) leaves the credit spent with no film and no compensating
entry. There is no try/catch or rollback.

**What's wrong:** the debit and the grant must be atomic from the buyer's perspective;
a failure after the debit must refund the credit (compensating ledger entry) or the
grant must happen first.

**Impact:** rare in the demo, but it is a real money-path atomicity hole: lost credit,
no film, no receipt, and the ledger shows a `-1` with no matching entitlement.

**Suggested fix:** grant first, then debit; or wrap in try/catch and append a
`+1 reason: 'refund_grant_failed'` ledger entry on failure.

**Related:** notes/flows/pass-redeem.md; BUG-003 (same grant path); DAT-002 (non-atomic multi-write grants — same root-cause class; Lead to merge).

---

### BUG-006 · Bundle math mismatch: "15% off / 3+ films" advertised, full price / ≥2 films charged
**S2 · Confirmed · NEW · Effort S · Lens COR · Found by BUG in Phase 2 on 2026-09-29**

**Location:** `apps/frontend/lib/pricing.ts:158-173` (VIEWER_OPTIONS bundles) vs
`apps/lifeboat/server.js:670-750` (`bundleTestPurchase`)

**Evidence (quoted):**
```ts
// pricing.ts — the marketing promise:
price: "15% off",
priceNote: "Draft mechanic — 3+ films, one filmmaker",
features: [ ..., "15% bundle discount (draft)", ... ]
```
```js
// server.js:728-737 — the actual math:
const allocations = granted.map((g) => {
  const film = films.find((f) => f.film_id === g.film_id);
  return { film_id: film.film_id, amount_usd_cents: film.price_usd_cents };  // full list price, no discount
});
const total = allocations.reduce((s, a) => s + a.amount_usd_cents, 0);
// ... and the gate: server.js:677
if (!Array.isArray(ids) || ids.length < 2)   // ≥2, not 3+
```

**What's wrong:** the single source of truth for pricing promises 15% off for 3+
films; the checkout charges the straight sum of list prices and accepts 2-film
bundles. One of them is wrong.

**Impact:** a buyer shown "15% off" pays full price — the exact pricing-honesty
failure the pricing tests were written to prevent (7 pricing-honesty tests, all on
the copy side, none on the checkout math).

**Suggested fix:** pick one spec (recommend: implement the 15% discount for ≥3 films
in `bundleTestPurchase`, since the copy is already customer-facing), and add a
checkout-math test. Note the rounding policy for the discount (per-film vs total).

**Related:** MUS lane (money math — possible overlap with mus.md findings; Lead to dedup); notes/flows/purchase-stream.md.

---

### BUG-007 · Pass copy says 2 credits at $10/mo; code issues 1 credit at $9.99/mo
**S2 · Confirmed · NEW · Effort XS · Lens COR · Found by BUG in Phase 2 on 2026-09-29**

**Location:** `apps/frontend/lib/pricing.ts` (ECONOMICS_WARNING + header comment:
"$10/mo pass with two $8 credits") vs `apps/lifeboat/lib/pass.js:29-30`:
`PASS_PRICE_USD_CENTS = 999`, `CREDITS_PER_BILLING_PERIOD = 1`

**What's wrong:** the economics warning that "must appear on every surface" models
a 2-credit pass; the implementation grants 1 credit per period at $9.99. The unit
economics in the warning don't describe the thing being built.

**Suggested fix:** align the copy with the implemented model (1 credit, $9.99) or
decide the real model first — this is the undefined-allocation problem the warning
itself flags.

**Related:** DOC lane (possible overlap with doc.md pass-copy findings; Lead to dedup); BUG-004; notes/flows/pass-redeem.md.

---

### BUG-008 · On-chain `buyAccess` grants no lifeboat streaming entitlement — two unreconciled rails
**S2 · Confirmed · NEW · Effort M · Lens COR · Found by BUG in Phase 2 on 2026-09-29**

**Location:** `packages/contracts/contracts/PayPerView.sol:99-107` (`buyAccess` writes
`_access[filmId][msg.sender]`) vs `apps/lifeboat/server.js:248-256` (`hasEntitlement`
reads only the `entitlements` file collection)

**What's wrong:** the Next.js frontend's purchase path is on-chain (wrappers in
`apps/frontend/lib/web3/wrappers/payPerView.ts`); the streaming gate is off-chain
(lifeboat file store). No code anywhere bridges them: an on-chain buyer's
`hasAccess` is true on-chain but `GET /api/films/:id/stream` returns 403, and a
lifeboat test-buyer's purchase has no on-chain record. The Next.js app contains zero
references to lifeboat/stream/playback_url (verified by grep), so the "real"
frontend's buyers currently have no way to watch.

**Impact:** whichever rail Dino demonstrates, the other rail's buyers are locked out;
revenue accounting (orders ledger vs `_filmRevenue`) will also diverge.

**Suggested fix:** decide the canonical purchase rail (recommend: lifeboat first,
per the project split — nothing downstream until the device/RF-equivalent evidence
exists is a different project, but here: pick one buyer record). Until then, label
the on-chain buy as not granting streaming.

**Related:** W3B lane; DAT-008 (no on-chain/off-chain reconciliation — same gap from the data side; Lead to merge); notes/flows/purchase-stream.md (open question Q2).

---

### BUG-009 · `setPlatformFeeBps` wrapper allows ≤10000 bps; contract caps at 2500
**S3 · Confirmed · NEW · Effort XS · Lens COR · Found by BUG in Phase 2 on 2026-09-29**

**Location:** `apps/frontend/lib/web3/wrappers/payPerView.ts:110-121` vs
`packages/contracts/contracts/PayPerView.sol:28` (`MAX_PLATFORM_FEE_BPS = 2500`)
and `:153-154` (`if (newFeeBps > MAX_PLATFORM_FEE_BPS) revert FeeTooHigh(...)`)

**Evidence (quoted):** wrapper: `if (bps > BigInt(10000)) throw ... 'must be ≤ 10000 (100%)'`.
Any value in (2500, 10000] passes the wrapper and reverts on-chain.

**Suggested fix:** validate `<= 2500` in the wrapper (read `MAX_PLATFORM_FEE_BPS`
from the contract instead of hardcoding).

---

### BUG-010 · `buyAccess` wrapper doc says value "must cover" price; contract requires exact equality
**S3 · Confirmed · NEW · Effort XS · Lens COR · Found by BUG in Phase 2 on 2026-09-29**

**Location:** `apps/frontend/lib/web3/wrappers/payPerView.ts:27` vs
`packages/contracts/contracts/PayPerView.sol:102`:
`if (msg.value != film.priceWei) revert IncorrectPayment(film.priceWei, msg.value);`

**What's wrong:** "must cover" implies overpay is fine; the contract reverts on any
overpay. A caller following the doc wastes gas on a revert.

**Suggested fix:** doc: "`valueWei` must equal the film price exactly."

---

### BUG-011 · Pass endpoints have no auth — anyone with a pass_id can burn the holder's credits
**S2 · Likely · NEW · Effort S · Lens COR · Found by BUG in Phase 2 on 2026-09-29**
*Assumption: an attacker can learn a pass_id (it's returned by the API, shown in the
pass.html DOM, and `GET /api/passes/:id` is unauthenticated).*

**Location:** `apps/lifeboat/server.js:875-897` (`passTestSubscribe`),
`:903-913` (`passDetail`), `:915-960` (`passRedeem`) — none call `requireAuth`

**Evidence:** `passRedeem` checks only that `body.email` matches `pass.email`
(`lib/pass.js:147-152`) — there is no binding between the pass and an authenticated
session. So a third party who learns `pass_abc123` can POST
`/api/passes/pass_abc123/redeem` with the holder's email and burn their credits on
films they didn't choose. No theft is possible (the entitlement still goes to the
holder's email), but it is denial-of-value: credits are non-refundable by design.
`GET /api/passes/:id` additionally exposes the full credit ledger unauthenticated.

**Suggested fix:** require auth on pass routes and bind pass.email to the session
account email at subscribe/redeem time.

**Related:** SEC lane (authz matrix); SEC-001 (same unauthenticated pass endpoints; Lead to cluster); notes/flows/pass-redeem.md.

---

### BUG-012 · Stripe pass webhooks not idempotent / out-of-order-unsafe; canceled passes keep credits
**S2 · Likely · NEW · Effort M · Lens COR · Found by BUG in Phase 2 on 2026-09-29**
*Assumption: real Stripe keys + live webhooks (currently stubbed — the logic will run
as written once keys land).*

**Location:** `apps/lifeboat/server.js:752-815` (`stripeWebhook`)

**Evidence (quoted):**
```js
// :789-801 — renewal requires the pass to already exist AND be active:
if (event.type === 'invoice.payment_succeeded') {
  ...
  if (p && p.status === 'active') { passLib.issueCredits({... reason: 'subscription_renewal' ...}); }
}
// :803-809 — cancellation only flips status:
if (event.type === 'customer.subscription.deleted') {
  ...
  if (p) store.update('passes', p.pass_id, { status: 'canceled' });
}
```
Two gaps: (1) Stripe can deliver `invoice.payment_succeeded` before
`customer.subscription.created` (retries/out-of-order delivery are normal); the
guard then silently drops a paid renewal — no retry, no dead-letter, the subscriber
paid for a credit they never got. (2) On cancel, already-issued but unredeemed
credits remain spendable forever (no expiry anywhere in `lib/pass.js`) — the
ECONOMICS_WARNING itself lists "credit expiration/rollover … post-membership access"
as undefined, and the code agrees by omission.

**Suggested fix:** on `invoice.payment_succeeded`, create-and-activate the pass if
missing (same as the `created` handler) instead of skipping; define and implement
the cancel/expire policy for unredeemed credits before any real-money launch.

**Related:** DAT lane; DAT-009 (non-idempotent Stripe credit webhook — same defect; Lead to merge); notes/flows/pass-redeem.md (Q4).

---

### BUG-013 · `licensing.ts` says "never a rental window" but claim flow accepts `purchase_type: 'rent'`
**S3 · Confirmed · NEW · Effort XS · Lens COR · Found by BUG in Phase 2 on 2026-09-29**

**Location:** `apps/frontend/lib/licensing.ts:30` ("Licensed streaming access — never
a rental window") vs `apps/lifeboat/server.js:550-553` (`fileClaim`:
`if (purchaseType !== 'buy' && purchaseType !== 'rent') return 400...`)

**What's wrong:** the license model promises no rentals; the migration-claim flow
explicitly models rentals. Either rentals exist (then the copy is wrong) or they
don't (then the claim enum is wrong).

**Suggested fix:** decide; if rentals are out, drop `'rent'` from the claim flow.

---

### BUG-014 · `parseMultipart` truncates uploads containing `\r\n--boundary` in the bytes
**S3 · Suspected · NEW · Effort S · Lens COR · Found by BUG in Phase 2 on 2026-09-29**
*Would confirm with a crafted multipart body where the file part contains the
boundary bytes; refute if the client boundary is always high-entropy (it usually is,
but nothing enforces it).*

**Location:** `apps/lifeboat/server.js:148-180` (`parseMultipart`)

**Evidence (quoted):**
```js
const end = body.indexOf(crlfDelim, cursor);   // first \r\n--boundary wins, even inside file bytes
...
const data = sep === -1 ? Buffer.alloc(0) : partBuf.subarray(sep + 4);
```
The parser splits parts by naive byte search. If the uploaded master contains the
boundary string (possible with client-chosen boundaries; mp4 bytes are arbitrary),
the file is silently truncated at that point and the tail becomes a bogus part
(ignored — `fieldName` won't match). The stored master is then corrupt, with a 201
returned as if all were well.

**Suggested fix:** use a real multipart parser, or at minimum verify
`masterData.length` against the part's declared size / reject ambiguous parses.

**Related:** STR lane (upload integrity).

---

### BUG-015 · Wrong-method API calls return 404 instead of 405
**S3 · Confirmed · NEW · Effort XS · Lens COR · Found by BUG in Phase 2 on 2026-09-29**

**Location:** `apps/lifeboat/server.js:1098-1319` (`handleApi` dispatch, fallthrough
at `:1317`: `return sendError(res, 404, 'not found')`)

**What's wrong:** every route match includes the method, so e.g.
`GET /api/purchases/test` falls through to 404 'not found' although the path exists.
Intended behavior per HTTP semantics: 405 Method Not Allowed. (Note `serveStatic`
does return 405 for non-GET/HEAD — inconsistent with the API router.)

**Suggested fix:** track whether any route matched on path regardless of method and
return 405 in that case.

---

### BUG-016 · UI collects buyer email; server ignores it and binds purchase to the session account
**S3 · Confirmed · NEW · Effort XS · Lens COR · Found by BUG in Phase 2 on 2026-09-29**

**Location:** `apps/lifeboat/public/film.html` (buy-box email input, posts
`{film_id, email}`) vs `apps/lifeboat/server.js:641-663` (`testPurchase` uses
`account.email` only — `body.email` is never read)

**What's wrong:** the UI asks "Buyer email" and the user reasonably believes the
purchase binds to that address; the server silently binds to the logged-in account.
If they differ, the buyer looks in the wrong inbox/library. (test.sh notes this:
"email from session" — the UI never got the memo.)

**Suggested fix:** either use the posted email (with verification) or remove the
input and label the button with the session account email.

**Related:** BUG-001 (the UI needs an auth rework anyway).

---

### BUG-017 · `Range: bytes=-` served as full-file 206 instead of rejected
**S3 · Confirmed · NEW · Effort XS · Lens COR · Found by BUG in Phase 2 on 2026-09-29**

**Location:** `apps/lifeboat/lib/cdn.js:52-62` (`streamFile` range parsing)

**Evidence:** `^bytes=(\d*)-(\d*)$` matches `bytes=-` with both groups empty; the
else-branch then sets `start = 0, end = total - 1` and serves 206. Per RFC 9110 a
suffix-byte-range-spec requires the suffix length; `bytes=-` is invalid and should
be 416 (or at least not a synthetic 0- full range).

**Suggested fix:** treat empty suffix length as malformed → 416.

---

### BUG-018 · Buyer-library route double-decodes the email path param
**S3 · Confirmed · NEW · Effort XS · Lens COR · Found by BUG in Phase 2 on 2026-09-29**

**Location:** `apps/lifeboat/server.js:1296-1301`

**Evidence (quoted):**
```js
const requested = decodeURIComponent(seg[1]).trim().toLowerCase();  // decode #1 (authz check)
if (requested !== account.email.toLowerCase())
  return sendError(res, 403, 'you can only view your own library');
return buyerLibrary(req, res, seg[1]);   // buyerLibrary does decodeURIComponent AGAIN (:1071)
```
For an email containing a literal `%` (valid per RFC, passes `isEmail`'s
`[^\s@]+`), decode #1 yields `%`, decode #2 throws URIError (uncaught → 500 via
the server catch-all) or yields a different string, so the authz check and the
lookup disagree.

**Suggested fix:** decode once in the route and pass the decoded value down.

---

*End of BUG findings for Phase 2. Flow notes: `devteam/notes/flows/purchase-stream.md`,
`devteam/notes/flows/pass-redeem.md`.*
