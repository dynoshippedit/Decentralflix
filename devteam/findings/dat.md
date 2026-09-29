# Findings — Data & Integrations (DAT)
Scope: lifeboat file store + receipt keys, on-chain↔off-chain consistency, Stripe/Bunny/Privy/IPFS/Arweave/Vimeo/Cloudflare Worker integrations, Vimeo import→claim/approve flow · ID range: DAT-001…DAT-013
## Coverage completed
- `apps/lifeboat/server.js` (1–1319) — DAT — full read in chunks (1–60, 78–201, 202–338, 338–496, 496–640, 641–843, 843–967, 968–1098, 1098–1319); every store call site mapped
- `apps/lifeboat/lib/store.js` (1–94), `lib/receipts.js` (1–103), `lib/auth.js` (1–63), `lib/pass.js` (1–169), `lib/stripe.js` (1–133), `lib/cdn.js` (1–128) — DAT — full reads
- `apps/lifeboat/public/app.js` (1–173), `claim.html`, `film.html`, `dashboard.html` (140–195), `import.html` — DAT — stub-label honesty check on user-reachable pages
- `apps/lifeboat/tools/verify-receipt.js` (1–50) — DAT — header read (offline verifier, pubkey via `--pubkey`/`--server`)
- `apps/frontend/lib/indexer.ts` (full) — DAT — GraphQL real path vs simulation fallback, per-function guard comparison; `lib/demo-content.ts` (130–170), `lib/cloudflare-access.ts` (1–80), `providers/PrivyProvider.tsx` (full), `lib/arweave/upload.ts` (35–80), `hooks/useArweaveUpload.ts` (1–80), `lib/contracts/config.ts` (1–40) — DAT — integration status + stub boundaries
- `packages/storage/src/ipfs.js`, `src/arweave.js` — DAT — grep scan (real Kubo/Arweave HTTP calls, unwired — cf. TST-001)
- `cloudflare-worker/access-control.js` — DAT — grep scan (SIMULATION MODE flagging)
- `.env.example` — DAT — grep scan (R2 vars documented; BLD-006/007 own the env ledger — referenced, not duplicated)
- **Executed** `devteam/repro/dat-001-store-concurrency.js` on the Threadripper: `store.remove` TypeError demonstrated; lost-update interleaving demonstrated (real `store.js` code path, scratch data dir). Exit 0.
## Findings

### DAT-001 · Logout and expired-session pruning are dead code — `store.remove` is not a function
**S1 · Confirmed · NEW · Effort S · Lens DAT · Found by DAT in Phase 2 on 2026-09-29**

**Location:** `apps/lifeboat/server.js:210` (`getAuthAccount`), `apps/lifeboat/server.js:324` (`logout`); `apps/lifeboat/lib/store.js:94` (exports)

**Evidence:**
```js
// store.js:94
module.exports = { all, get, insert, update, DATA_DIR };   // <-- no `remove`
// server.js:210 — inside getAuthAccount, when the session is expired:
if (session) { try { store.remove('sessions', token); } catch {} }
// server.js:324 — logout:
if (m) { try { store.remove('sessions', m[1].trim()); } catch {} }
```
`node -e` against the real module: `store.remove throws: TypeError: s.remove is not a function`. The `try/catch{}` swallows it, so both call sites silently do nothing.

**What's wrong:** `POST /api/auth/logout` returns `{logged_out: true}` but the bearer token stays valid for its full 30-day TTL (`lib/auth.js:21`). Expired sessions are never deleted either — every `signup` (`server.js:284`) and `login` (`server.js:307`) appends to `sessions.json` forever. There is no delete path for any collection.
**Impact:** Session revocation does not exist: a stolen token (or a "logged out" token on a shared machine) remains usable until TTL expiry. `sessions.json` grows without bound. Operators cannot force-logout anyone.
**Reproduce / reasoning:** `devteam/repro/dat-001-store-concurrency.js` part (1) demonstrates the TypeError on the real module; exit 0.
**Other instances (sibling search):** `grep -n 'remove' apps/lifeboat/lib/store.js apps/lifeboat/server.js` → only these two call sites; no other delete-shaped API exists anywhere in the lifeboat.
**Suggested fix:** Add `store.remove(name, id)` (filter + `saveAll`), call it without the swallowing try/catch, and sweep expired sessions at startup. Smallest safe change; no API shape change.
**Related:** SEC lane (the auth half of this); `notes/data-model.md` §sessions.

### DAT-002 · Grant sequences span multiple non-atomic file writes — a crash between them leaves divergent state
**S2 · Confirmed · NEW · Effort M · Lens DAT · Found by DAT in Phase 2 on 2026-09-29**

**Location:** `apps/lifeboat/server.js:387-421` (`grantEntitlement`), `:617-633` (`approveClaim`), `:915-948` (`passRedeem`), `:670-738` (`bundleTestPurchase`)

**Evidence:** `grantEntitlement` performs two separate `store.insert` calls — `receipts` (`server.js:401`) then `entitlements` (`server.js:419`). Each `insert` is `all()` → `push` → `saveAll()` (`store.js:81-85`); `saveAll` is atomic per file (`store.js:80-88`, tmp+rename), but the *sequence* is not.
**What's wrong:** Crash/power-loss between the writes leaves:
- signed receipt with no entitlement (buyer holds verifiable proof, gets 403 on stream);
- `passRedeem`: credit debited (`redeemCredit` → `ledgerEntry`, `pass.js:152`) but no entitlement granted — the buyer paid a credit and got nothing;
- `approveClaim`: entitlement granted but `claims` status never flipped to `approved` (`server.js:628`) — the claim stays re-approvable (see DAT-003);
- `bundleTestPurchase`: N entitlements granted, `orders` insert (`server.js:738`) lost — sales ledger silently missing the bundle.
**Impact:** Money-adjacent ledger divergence with manual-JSON-edit as the only repair; no write-ahead log, no startup reconciliation.
**Reproduce / reasoning:** Code-evident (no assumptions): the insert calls are sequential statements with awaits/syscalls between them.
**Other instances (sibling search):** All four sequences above; same class in `signup` (accounts insert + sessions insert, `server.js:283-285`) — crash leaves an account that can't log in without re-signup (which then 409s).
**Suggested fix:** Reorder so the *record of intent* is durable first, or add a startup reconciliation pass (e.g. receipts without entitlements → re-grant or flag); document the crash-recovery procedure. Do not "fix" by merely reordering without a recovery story.
**Related:** DAT-003, DAT-004; `notes/data-model.md` §durability.

### DAT-003 · `approveClaim` never checks `alreadyEntitled` — a second approved claim double-grants
**S2 · Confirmed · NEW · Effort S · Lens DAT · Found by DAT in Phase 2 on 2026-09-29**

**Location:** `apps/lifeboat/server.js:617-633` (`approveClaim`); dedupe `server.js:571-579` (`fileClaim`)

**Evidence:** `fileClaim` rejects duplicates only while a claim is *open* (`status === 'pending' || 'needs_review'`). After approval, a second claim for the same film+email files cleanly, and `approveClaim` calls `grantEntitlement` unconditionally — a second `entitlement_id` and a second signed receipt for the same buyer+film.
**What's wrong:** No idempotency on (film_id, buyer). `audience.csv` (`server.js:827-842`) then double-counts the buyer, and `receipts.json`/`entitlements.json` accumulate duplicates. Note the inconsistency: the Stripe webhook path *does* guard with `alreadyEntitled` (`server.js:775-780`).
**Impact:** User-visible access is unaffected (`hasEntitlement` is set-membership), but license accounting inflates — one buyer, two "licenses" — which corrupts audience/export numbers a filmmaker relies on.
**Reproduce / reasoning:** Code-evident: no `alreadyEntitled`/`hasEntitlement` call exists in `approveClaim` (grep confirms).
**Other instances (sibling search):** `testPurchase` (`server.js:641`) also grants unconditionally — repeated test purchases mint unlimited duplicate receipts (test-mode, but the receipts are real signed artifacts).
**Suggested fix:** In `approveClaim`, if `alreadyEntitled(film.film_id, claim.email)` return the existing entitlement (or 409) instead of granting.
**Related:** DAT-002; `notes/flows/vimeo-import.md` hop 5.

### DAT-004 · Read-modify-write races: interleaved writers lose records (no locking, no transactions)
**S2 · Confirmed · NEW · Effort M · Lens DAT · Found by DAT in Phase 2 on 2026-09-29**

**Location:** `apps/lifeboat/lib/store.js:61-93` (`all`/`saveAll`/`insert`/`update`)

**Evidence:** Every write is: read whole file → mutate in memory → write tmp → rename. Two writers interleaving (A reads; B completes a full insert; A pushes onto its stale snapshot and renames) silently drop B's records. The `importBuyers` dedupe (`server.js:515-530`) is check-then-insert with the same TOCTOU shape.
**What's wrong:** Safe only as long as exactly one Node process ever touches `data/`. A second lifeboat (staging copy, a second `run.sh`, future clustering) or any external writer loses data with no error.
**Impact:** Silent data loss; currently latent in the single-process deployment, structural in the design.
**Reproduce / reasoning:** `devteam/repro/dat-001-store-concurrency.js` part (2) demonstrates the lost update against an exact copy of `store.js` (byte-identical bodies, scratch data dir); exit 0.
**Other instances (sibling search):** All `insert`/`update` call sites share the pattern; `passTestSubscribe` create-pass-then-issue (`server.js:872-883`) is also check-then-act across processes.
**Suggested fix:** Document the single-process constraint in RUN.md, and/or guard `saveAll` with a lockfile (`flock`); an append-only journal would be the durable fix.
**Related:** DAT-002; `notes/data-model.md` §durability.

### DAT-005 · `receipt-key.pem` is silently regenerated when missing — all prior receipts become unverifiable
**S2 · Confirmed · NEW · Effort S · Lens DAT · Found by DAT in Phase 2 on 2026-09-29**

**Location:** `apps/lifeboat/lib/receipts.js:51-63` (`getKeys`)

**Evidence:**
```js
if (fs.existsSync(KEY_PATH)) { /* load */ } else {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  fs.writeFileSync(KEY_PATH, ..., { mode: 0o600 });  // silent regen, no log, no error
}
```
The file header comment says "If the key file is lost, previously issued receipts can no longer be verified against a new key — back it up" (`receipts.js:14-18`), but the code fails *open*: `rm data/receipt-key.pem` (or a fresh volume/container) quietly mints a new key and every previously issued receipt fails `verify()` — including the offline CLI (`tools/verify-receipt.js`). Worse, even read-only callers (`verify`, `getPublicKeyBase64`) trigger key *creation* as a side effect.
**Impact:** All buyer proof-of-purchase voids with no alert; `buyerLibrary` receipts stop verifying; an operator gets no signal that anything is wrong.
**Reproduce / reasoning:** Code-evident; the regen path has no logging and no failure mode.
**Other instances (sibling search):** Same fail-open shape nowhere else; `verify-receipt.js` does the right thing (takes the pubkey as input).
**Suggested fix:** Fail closed on missing key for `verify`/`getPublicKeyBase64` (throw a clear "key missing — restore from backup" error); keep create-on-first-`sign` only, with a loud log line. Document key backup/restore in RUN.md.
**Related:** DAT-011 (same "no backup story" class); `notes/data-model.md` §receipt-key.pem.

### DAT-006 · `POST /api/buyers/import` has no server-side auth — unauthenticated appends to `migration_contacts.json`
**S2 · Confirmed · NEW · Effort S · Lens DAT · Found by DAT in Phase 2 on 2026-09-29**

**Location:** `apps/lifeboat/server.js:496-544` (`importBuyers`); route `server.js:1163-1165` (no `requireAuth`/`requireFilmmaker`)

**Evidence:** The handler validates `film_id` + `emails` and inserts contacts; nothing checks the caller. The filmmaker dashboard posts it with no token (`dashboard.html:175`) and the page itself has no auth gate. `curl -X POST /api/buyers/import` with any film_id works.
**What's wrong:** Anyone on the network can append arbitrary emails to any film's contact list — store pollution plus unbounded growth of `migration_contacts.json`, and a privacy wrinkle (attacker injects third-party emails into a filmmaker's audience list, which then receives migration notices).
**Impact:** Data-integrity + store-growth; existing rows are safe (dedupe prevents identical-row dupes, `server.js:522-525`).
**Reproduce / reasoning:** Code-evident: the route registration has no auth wrapper, unlike the sibling `POST /api/films/import` (`server.js:1123-1127`).
**Other instances (sibling search):** Same unauthenticated-append shape: `POST /api/filmmakers` (`createFilmmaker`, `server.js:968`) and `PATCH /api/filmmakers/:id` (`updateFilmmaker`, `server.js:998`) — anyone can create filmmaker records or set `payout_method: 'stripe_connect'` on any `filmmaker_id`.
**Suggested fix:** `requireFilmmaker` + `ownsFilm` on `importBuyers`; auth on the filmmaker endpoints. (Auth-model change → NEEDS APPROVAL per Playbook; logged, not fixed in review.)
**Related:** SEC lane (auth half); `notes/flows/vimeo-import.md` hop 1.

### DAT-007 · `getFilmCatalog` serves simulation films even in real-indexer mode when the query fails
**S2 · Confirmed · NEW · Effort S · Lens DAT · Found by DAT in Phase 2 on 2026-09-29**

**Location:** `apps/frontend/lib/indexer.ts` — `getFilmCatalog` else-branch (vs the guarded siblings)

**Evidence:** `graphqlQuery` swallows every error and returns `null`. Five functions then do `else if (!INDEXER_URL)` → simulation, else → empty/error. `getFilmCatalog` alone does a bare `else` → returns `SIM_FILMS` ("Raging Midlife", "Savage Midlife", …) **regardless of whether a real indexer URL is configured**. The result is cached for 30s.
**What's wrong:** Mock data leaks into user-visible behavior exactly when the real backend is down — the outage is masked by phantom films, and real catalog entries vanish.
**Impact:** Users see fake films presented as the catalog; filmmakers' real listings invisible during any GraphQL outage; trust damage.
**Reproduce / reasoning:** Code-evident by comparing the six functions' fallback branches; no live indexer exists to test against (TST-005).
**Other instances (sibling search):** The other five functions are correctly guarded; `getDemoPlaybackUrl` in `lib/cloudflare-access.ts` is the same class of fallback but is at least `console.info`-labeled as SIMULATION MODE.
**Suggested fix:** `else if (!INDEXER_URL)` → simulation; else → `[]` plus a surfaced error state. One-line-class fix.
**Related:** DOC lane (labeling); TST-005; `notes/integrations.md` §indexer.

### DAT-008 · No on-chain ↔ off-chain reconciliation — two parallel entitlement systems, nothing syncs them
**S2 · Confirmed · NEW · Effort L · Lens DAT · Found by DAT in Phase 2 on 2026-09-29**

**Location:** `apps/lifeboat` store vs `packages/contracts` + `apps/frontend/lib/web3`; `apps/frontend/lib/indexer.ts` (query-only)

**Evidence:** `PayPerView.buyAccess` (on-chain) writes no lifeboat record; lifeboat `testPurchase`/`grantEntitlement` writes no chain record. No event listener or indexer job exists in `apps/lifeboat` (no subscriptions to contract events anywhere). The Goldsky subgraph referenced by `cloudflare-worker/access-control.js` is not deployed; the frontend indexer is read-only with a 30s cache and no block cursor, reorg handling, or staleness signal.
**What's wrong:** Divergence is undetectable and unrepairable: chain reorgs, missed events, manual DB edits, on-chain `delistFilm` — none propagate. A buyer who pays on-chain cannot stream via lifeboat; a delisted film keeps streaming (TST-008's off-chain half).
**Impact:** Currently latent — all frontend contract addresses are `0x0` (`lib/contracts/config.ts:14-27`) and nothing is deployed — so this becomes S1 at first deploy, not before.
**Reproduce / reasoning:** Structural: grep finds no chain-event ingestion in the lifeboat and no write path from chain → store.
**Other instances (sibling search):** Same gap for passes/subscriptions: `SubscriptionManager` renewals never touch `passes.json`; DFLIX rewards never touch `credit_ledger`.
**Suggested fix:** Before deploy, declare the source of truth per entity (recommend: lifeboat store = streaming entitlements, chain = payment rail) and add an idempotent indexer job (last-processed-block cursor, reorg window) mirroring chain events → store; or explicitly scope the lifeboat as test-mode-only.
**Related:** TST-005, TST-008; `notes/data-model.md` §consistency; `notes/integrations.md` §indexer.

### DAT-009 · Stripe webhook credit grants are not idempotent — redelivered `invoice.payment_succeeded` double-issues credits
**S2 · Confirmed · NEW · Effort S · Lens DAT · Found by DAT in Phase 2 on 2026-09-29**

**Location:** `apps/lifeboat/server.js:791-800`; `apps/lifeboat/lib/pass.js:96-121`

**Evidence:** `invoice.payment_succeeded` → `passLib.issueCredits({…, stripe_invoice_id})`. The invoice id is *recorded* in the ledger entry (`pass.js:104`) but never *checked*. Stripe webhooks are at-least-once (redelivered on timeouts); the `checkout.session.completed` branch is guarded by `alreadyEntitled` (`server.js:775-780`) but the subscription-credit branch is not.
**What's wrong:** Credits are redeemable for films — a redelivery inflates a money-adjacent ledger with no detection.
**Impact:** Latent: the webhook returns 503 without `STRIPE_WEBHOOK_SECRET` (`server.js:753-756`), so this is unreachable until Stripe is configured; real the moment keys land.
**Reproduce / reasoning:** Code-evident: no `credit_ledger` lookup on `stripe_invoice_id` precedes `issueCredits`.
**Other instances (sibling search):** `customer.subscription.created` (`server.js:782-790`) re-sets `stripe_subscription_id` idempotently — fine; `customer.subscription.deleted` (`server.js:801-807`) idempotent — fine.
**Suggested fix:** Before `issueCredits`, skip when a ledger entry with the same `stripe_invoice_id` exists; same dedupe for checkout session ids in the purchase branch.
**Related:** DAT-002 (atomicity); `notes/integrations.md` §stripe.

### DAT-010 · `importFilm` crash between master publish and film-record insert orphans the .mp4
**S3 · Confirmed · NEW · Effort XS · Lens DAT · Found by DAT in Phase 2 on 2026-09-29**

**Location:** `apps/lifeboat/server.js:470-489`

**Evidence:** `fs.writeFileSync(tmpPath)` + `fs.renameSync(tmpPath, finalPath)` (`server.js:472-473`) is atomic for the bytes; `store.insert('films', film)` (`server.js:489`) is a separate later step. Crash between → `data/masters/<film_id>.mp4` with no film record; nothing ever sweeps it.
**What's wrong:** Dead bytes accumulate in `data/masters/` (up to 1 GiB each, `server.js:27`); no orphan sweep, no startup reconciliation.
**Impact:** Disk growth only — orphans are never served (`CDN.streamFile` is only reached via a film lookup, `server.js:1128-1137`).
**Reproduce / reasoning:** Code-evident ordering.
**Other instances (sibling search):** Same orphan class as DAT-002's receipt-without-entitlement.
**Suggested fix:** Startup sweep: masters with no film record → quarantine dir + log; or insert the film record *before* publishing the master (then the failure mode is a film with a missing master, which 404s cleanly via `cdn.js:39-44`).
**Related:** DAT-002.

### DAT-011 · One corrupt byte in any `data/*.json` 500s the whole service — no backup, no repair path
**S2 · Confirmed · NEW · Effort M · Lens DAT · Found by DAT in Phase 2 on 2026-09-29**

**Location:** `apps/lifeboat/lib/store.js:61-73` (`all`); `apps/lifeboat/server.js:1304-1312` (request catch → 500)

**Evidence:** `all()` catches only `ENOENT` (→ `[]`); any `JSON.parse` throw propagates, and the top-level request handler turns it into `500 'internal error'` for every route touching that collection. Atomic rename prevents torn writes *from the store itself*, but not manual edits, disk faults, or a bad `test.sh` stash-restore. There is no backup rotation, no `.bak`, no startup integrity check, no schema validation on read.
**What's wrong:** A single bad byte in `films.json` takes down catalog, purchase, streaming, and library — the operator's only recovery is hand-editing JSON with no documented procedure and no backup to restore from.
**Impact:** Availability; mean-time-to-repair is "however long hand-editing JSON takes".
**Reproduce / reasoning:** Code-evident error paths; not executed against live data (would require corrupting the real store — declined).
**Other instances (sibling search):** Same "no backup story" class as DAT-005 (receipt key).
**Suggested fix:** Validate all collections parse at startup (fail fast with a clear message); rotate N backups in `saveAll`; document the restore procedure in RUN.md.
**Related:** DAT-005.

### DAT-012 · Every read is a full-file scan — O(n) per request, no indexes
**S3 · Confirmed · NEW · Effort M · Lens DAT · Found by DAT in Phase 2 on 2026-09-29**

**Location:** `apps/lifeboat/lib/store.js:61-73`; callers `server.js:248-259` (`hasEntitlement`), `:423-426` (`alreadyEntitled`), `lib/pass.js:74-78` (`getPassByEmail`), `server.js:299-307` (login email scan), `lib/pass.js:113-117` (`balance`)

**Evidence:** `all()` reads and `JSON.parse`s the entire collection on every call; hot paths like `hasEntitlement` (every stream/download request) scan all entitlements, and `login` scans all accounts.
**What's wrong:** Latency and memory grow linearly with the store; no index matches the real query patterns (by film_id+email, by token, by email) — the DAT checklist's indexing item, unmet.
**Impact:** Fine at demo scale (tens of rows); at 10k entitlements every stream request parses a multi-MB file. Also a mild DoS amplifier (DAT-006's unauthenticated appends make the files bigger).
**Reproduce / reasoning:** Code-evident; measured scale is small today so this stays S3.
**Other instances (sibling search):** All `store.all(...)` call sites (20+); same file is re-read multiple times *within one request* (e.g. `approveClaim` reads claims, films, then writes twice).
**Suggested fix:** In-memory indexes rebuilt at startup with write-through invalidation; or document an explicit scale ceiling (single-digit thousands of rows) and revisit if exceeded.
**Related:** DAT-004, DAT-006.

### DAT-013 · `claim.html` cannot file a claim — the page omits `purchase_type`/`purchase_date` the server requires
**S1 · Confirmed · NEW · Effort XS · Lens DAT · Found by DAT in Phase 2 on 2026-09-29**

**Location:** `apps/lifeboat/public/claim.html:20-42` (form), `:94` (POST body); `apps/lifeboat/server.js:557-566` (`fileClaim` requirements)

**Evidence:** The form has exactly three fields — film select, email, Vimeo receipt reference — and posts `{film_id, email, vimeo_receipt_ref}` (`claim.html:94`). The server requires `purchase_type` ∈ `buy|rent` (400 otherwise, `server.js:557-560`) and a valid non-future `purchase_date` `YYYY-MM-DD` (400 otherwise, `server.js:561-566`). Grep confirms no `purchase_type`/`purchase_date` input exists anywhere in `apps/lifeboat/public/*.html`. Every claim submitted through the UI therefore fails with `400 'purchase_type must be "buy" or "rent"'`.
**What's wrong:** The Vimeo claim flow — a B3 critical flow — is broken end-to-end from its own user-facing page. The server hardening (research update 2026-09-28, `server.js:548-556` comment) landed without updating the page, so the UI and API disagree on the contract.
**Impact:** No buyer can file a claim through the UI; the filmmaker approval queue stays empty; the whole Vimeo migration path is dead for real users (curl with the extra fields still works).
**Reproduce / reasoning:** Code-evident contract mismatch; not executed (would need a running server + UI click — the 400 path is unambiguous from the validation order).
**Other instances (sibling search):** The only claim-filing UI is `claim.html`; `test.sh` posts the fields directly (it passes — the API is fine, the page is stale).
**Suggested fix:** Add `purchase_type` (buy/rent select) and `purchase_date` (date input) fields to `claim.html` and include them in the POST body. XS change, no API change.
**Related:** `notes/flows/vimeo-import.md` hop 3.
