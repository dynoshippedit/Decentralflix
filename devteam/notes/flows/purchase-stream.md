# Flow note — Browse → purchase → stream (lifeboat)
<!-- C12 · BUG · 2026-09-29 · Phase 2 (Pass 3) -->
How the money-and-access path works in the lifeboat service, hop by hop, with
`path:line` at every hop. Server code: `apps/lifeboat/server.js` + `apps/lifeboat/lib/`.
The lifeboat's own browser UI lives in `apps/lifeboat/public/`. (The Next.js
marketing app in `apps/frontend/` does NOT call the lifeboat — verified by grep;
its purchase path is on-chain only. See "Cross-rail inconsistency" below.)

## How it works

### 1. Browse (unauthenticated reads)
- `GET /api/films` → `handleApi` (`server.js:1098`) → list, optional `?q=`/`?genre=`
  filters, mapped through `publicFilm` (`server.js:371-380`: film_id, title,
  price_usd_cents, download_allowed, genres, filmmaker ref). No auth.
- `GET /api/films/:id` → `handleApi` (`server.js:1144`) → `fullFilm`
  (`server.js:382-387`): everything in the film record **plus** `playback_url`
  (`cdn.js:25-27` → `/api/films/<id>/stream`). No auth — the URL is not the access;
  the gate is at the stream route.
- The lifeboat UI renders these via `app.js:63` getJSON and `filmCard`
  (`app.js:120-146`).

### 2. Test purchase (the only working purchase path — no money moves)
- UI: `film.html` buy button → `POST /api/purchases/test {film_id, email}` via
  `app.js:74` postJSON. **No Authorization header is ever attached** (BUG-001).
- Route: `handleApi` (`server.js:1228`) → `testPurchase` (`server.js:641-663`):
  1. `requireAuth` (`server.js:235-239`) → `getAuthAccount` (`server.js:200-222`):
     `Authorization: Bearer <token>` → `store.get('sessions', token)` →
     `authLib.sessionValid` (`lib/auth.js:52-54`, 30-day TTL) → account lookup.
     No token → 401 here. **This is where the UI's buy always dies.**
  2. `store.get('films', body.film_id)` → 404 if missing.
  3. `grantEntitlement({film, email: account.email, source: 'purchase', testMode: true})`
     (`server.js:387-421`):
     - builds receipt fields (receipt_id, film_id, buyer_email_sha256, price,
       currency USD, granted_at, terms_hash, transferable:false),
     - `receipts.sign` (`lib/receipts.js:75-81`): Ed25519 over canonical JSON
       (keys sorted recursively); keypair auto-generated once at
       `data/receipt-key.pem` (0600) on first run (`lib/receipts.js:48-64`),
     - `store.insert('receipts', ...)` and `store.insert('entitlements', ...`)
       with `entitlement_id`, `email` (lowercased), `email_sha256`, `source`,
       `price_usd_cents`, `receipt_id`, `test_mode: true`.
  4. 201 with `{test_mode: true, entitlement, receipt, signature}`.
- **No already-owned guard here** (BUG-003): repeat POSTs mint duplicate
  entitlements + receipts. The sibling paths (`bundleTestPurchase` `:696`,
  `passRedeem` `:926`, `stripeWebhook` `:778`) all check `alreadyEntitled`
  (`server.js:423-426`, sha256 comparison) first — this one doesn't.
- **The posted `email` is ignored** (BUG-016): the UI's "Buyer email" input is
  decorative; the entitlement binds to the session account.
- Bundle variant: `POST /api/purchases/bundle/test` → `bundleTestPurchase`
  (`server.js:670-750`): ≥2 films (not 3+), single filmmaker enforced via
  `filmmaker_email` set comparison, per-film already-owned skip, writes an
  `orders` record with per-film allocations at **full list price** (BUG-006:
  no 15% discount despite `pricing.ts`).
- Real-money variant: stubbed. `stripeWebhook` (`server.js:752-815`) handles
  `checkout.session.completed` → `grantEntitlement({source:'purchase'})`
  (with `alreadyEntitled` guard); requires `STRIPE_WEBHOOK_SECRET`, else 503.
  Signature verification is a faithful HMAC implementation (`lib/stripe.js:88-118`,
  300s tolerance).

### 3. Entitlement gate (the real CJ1 gate)
- `GET /api/films/:id/stream` → `handleApi` (`server.js:1107-1114`):
  1. `requireAuth` → 401 without token (test.sh proves this).
  2. film lookup → 404.
  3. `ownsFilm(account, film)` (`server.js:241-246`: filmmaker_email match — the
     filmmaker streams free) **OR** `hasEntitlement(account, film_id)`
     (`server.js:248-256`): any entitlement with matching film_id + email whose
     `status` is not `revoked`/`refunded`.
  4. Else 403 'purchase required to stream this film' (test.sh proves this).
  5. `CDN.streamFile` (`lib/cdn.js:33-88`): stat → 404 'master not found' if the
     file is gone; no Range → 200 full; `Range: bytes=<s>-<e>` → 206 with
     Content-Range; suffix ranges supported; malformed/out-of-range → 416 with
     `Content-Range: bytes */total`. BUG-017: `bytes=-` slips through as full 206.
- `GET /api/films/:id/download` → same gate (`server.js:1116-1124`) → `downloadFilm`
  (`server.js:843-858`): refuses with 403 + AB2426 message when
  `download_allowed` is false; otherwise streams as attachment.
- `hasEntitlement`'s `status !== 'revoked'` check is **dead code**: entitlements are
  never written with a `status` field and no endpoint revokes them (takedown is
  on-chain only per TST-008). Revocation is unenforceable on this path today.
- The `<video>` element in `film.html` sets `src` to the stream URL with no way to
  attach the bearer token — even a correctly purchased film cannot play in the
  shipped UI (BUG-001).

### 4. Receipt verification
- `POST /api/receipts/verify` (`server.js:1253-1273`): accepts shape 1
  `{receipt, signature}` or shape 2 `{...fields, signature}` (extra keys ignored
  in shape 1); `receipts.verify` (`lib/receipts.js:87-101`) is pure Ed25519 over
  canonical bytes — **it does NOT consult the entitlement DB**, so a receipt for
  a refunded/revoked (hypothetical) entitlement still "verifies". Returns
  `{valid: true/false}` with 200 in both cases.
- `GET /api/receipts/pubkey` + `GET /api/receipts/terms` support offline
  verification. Tampered receipts fail (test.sh:335-345 proves this).
- Note: a receipt for a **pass redemption** records the film's full list price
  (`grantEntitlement` always uses `film.price_usd_cents`) even though no money
  moved — the receipt evidences the license grant, not payment, but nothing says
  so on the receipt itself.

### 5. Buyer library
- `GET /api/buyers/:email/library` (`server.js:1296-1301`): auth + the email in the
  path must equal the session email (else 403) → `buyerLibrary` (`server.js:1068-1093`)
  joins entitlements → films → receipts. BUG-018: the email is decoded twice
  (once for the authz check, once inside `buyerLibrary`).

## Cross-rail inconsistency (frontend vs lifeboat vs contracts)
- The Next.js app's purchase path (`apps/frontend/lib/web3/wrappers/payPerView.ts`
  → `PayPerView.buyAccess`) writes `_access[filmId][msg.sender] = true` on-chain
  (`PayPerView.sol:99-107`). The lifeboat gate reads only its file store. **Neither
  rail grants the other's access** (BUG-008). The Next.js app has zero references to
  lifeboat/stream/playback_url — its buyers currently cannot watch anything.
- Money-math mismatches: bundle discount (BUG-006), pass credit count (BUG-007).
- Wrapper validation mismatches: fee cap 10000 vs 2500 (BUG-009); "must cover" vs
  exact payment (BUG-010).

## Observations
- O1. Single-Node-process atomicity holds for the purchase grant (no awaits between
  the writes in `grantEntitlement`), but the file store's read-modify-write is not
  safe across processes — a multi-instance deployment could double-grant. (PRF/ARC.)
- O2. `GET /api/films/:id` (unauthenticated) exposes the filmmaker's email address
  (`fullFilm` includes the whole film record). Flagging for SEC rather than filing.
- O3. Uploads buffer the entire body in memory before writing (`readBody` with
  `MAX_UPLOAD_BYTES` = 1 GiB in `importFilm`, `server.js:435-441`). PRF.
- O4. Territories are collected at import and displayed, but never enforced at
  stream time. Unclear if intentional — see Q3.
- O5. Receipts never expire and are bound to the node's keypair; losing
  `data/receipt-key.pem` orphans every issued receipt (documented in
  `lib/receipts.js:14-17`, no rotation story). Later milestone per the header.

## Open questions
- Q1. **Which purchase rail is canonical — lifeboat test-purchase or on-chain
  buyAccess?** Until one grants the other's access, buyers are split across two
  systems. *Recommended default:* lifeboat entitlements are canonical for streaming
  during the demo phase; label the on-chain buy as "collectible record, does not
  grant streaming" (matches `licensing.ts`'s Apple-note posture) until a bridge exists.
- Q2. **Is the lifeboat static UI (`apps/lifeboat/public/`) the demo surface or is
  the Next.js app?** The 1 AM deadline promised a browser demo journey; only the
  lifeboat UI has the buy/watch screens, and it's the one that's broken (BUG-001).
  *Recommended default:* treat the lifeboat UI as the demo surface and fix BUG-001
  there.
- Q3. **Are territories meant to be enforced at stream time?** Currently display-only.
  *Recommended default:* document as display-only for the demo; enforcement is a
  geolocation feature, not a bug fix.
- Q4. **Should repeat test purchases be idempotent?** Sibling paths say yes.
  *Recommended default:* yes — mirror `passRedeem`'s already-owned 200.

## Related issue IDs
BUG-001, BUG-002, BUG-003, BUG-006, BUG-007, BUG-008, BUG-009, BUG-010, BUG-013,
BUG-015, BUG-016, BUG-017, BUG-018 · Related lanes: SEC (authz matrix, filmmaker
email exposure), TST (test.sh covers the curl path only), MUS (money math), W3B
(on-chain rail), DOC (pricing copy), STR (upload/range behavior).
