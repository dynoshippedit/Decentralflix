# Data model — Decentralflix (lifeboat store + on-chain state)
<!-- C12 · DAT lane · 2026-09-29 · Auditor: DAT (Data & Integrations Specialist) -->
**Method:** full read of `apps/lifeboat/lib/store.js` (1–94), `lib/receipts.js` (1–103), `lib/auth.js` (1–63), `lib/pass.js` (1–169); every `store.*` call site in `apps/lifeboat/server.js` (1–1319) mapped; frontend contract addresses and indexer read for the on-chain side. Findings: `../findings/dat.md` (DAT-001…DAT-012).

## 1. The store mechanism — `apps/lifeboat/lib/store.js:1-94`

- **What it is:** 11 JSON collections under `apps/lifeboat/data/` (gitignored runtime state; `DATA_DIR = lib/../data`, `store.js:13`), plus `data/receipt-key.pem` and `data/masters/*.mp4`. Zero dependencies (`node:fs` only). Deliberate: "No SQLite by design … human-inspectable and dependency-free" (`store.js:1-10`).
- **API:** `all(name)` (read+parse whole file; `ENOENT` → `[]`, any other error — incl. corrupt JSON — **throws**, `store.js:61-73`), `get(name, id)` (linear scan by the collection's id field, `store.js:75-78`), `insert(name, record)` (read → push → `saveAll`, `store.js:81-85`), `update(name, id, patch)` (`Object.assign` merge, no key deletion, `store.js:87-93`). **There is no `remove`/delete** (`store.js:94`) — DAT-001.
- **Atomicity:** `saveAll` writes `<file>.tmp` then `renameSync` (`store.js:80-88`) — readers never see a torn file. No `fsync` (OS-crash window), no locking, no transactions: every multi-record operation is a *sequence* of independent atomic file writes — DAT-002, DAT-004.
- **IDs:** `'prefix_' + crypto.randomBytes(6|8).toString('hex')` at each call site (no central sequence; collisions astronomically unlikely, never checked).

## 2. Collections — what's persisted, where it's written, where it's read

| Collection (file) | ID field | Record shape (as constructed) | Written at | Read at |
|---|---|---|---|---|
| `films` (`films.json`) | `film_id` | `{film_id, title, description, price_usd_cents, territories[], download_allowed, cleared_music_attested:true, filmmaker_email, genres[], master_bytes, original_filename, created_at}` | `importFilm` `server.js:489` | listing `server.js:1112-1126`, stream/download `server.js:1128-1148`, buyers-import `server.js:499`, claims `server.js:548`, purchases `server.js:646,678`, claims-approve `server.js:621`, csv `server.js:828`, library `server.js:1081` |
| `entitlements` | `entitlement_id` | `{entitlement_id, film_id, email, email_sha256, source, granted_at, price_usd_cents, receipt_id, [test_mode]}` — `source` ∈ `purchase`, `bundle_purchase`, `claim`, `pass_redemption` | `grantEntitlement` `server.js:419` | `hasEntitlement` `server.js:248-259`, `alreadyEntitled` `server.js:423-426`, `audienceCsv` `server.js:829-832`, `buyerLibrary` `server.js:1076-1091`, onboarding `server.js:1042-1045` |
| `claims` | `claim_id` | `{claim_id, film_id, film_title, email, email_sha256, vimeo_receipt_ref, purchase_type, purchase_date, status, created_at, [review_reason], [decided_at]}` — `status` ∈ `pending`, `needs_review`, `approved` (no `rejected` state — a rejected claim has no representation) | `fileClaim` `server.js:594`; status via `reviewClaim` `server.js:609`, `approveClaim` `server.js:630` | filmmaker `GET /api/claims` `server.js:1169-1179`, review-queue `server.js:1181-1190`, `reviewClaim` `server.js:600`, `approveClaim` `server.js:618` |
| `receipts` | `receipt_id` | `{receipt_id, film_id, receipt:{…signed fields…}, signature, created_at}` — signed fields: `receipt_id, film_id, buyer_email_sha256, price_usd_cents, currency:"USD", granted_at, terms_hash, transferable:false` | `grantEntitlement` `server.js:401` | `buyerLibrary` `server.js:1081`; offline via `tools/verify-receipt.js` |
| `passes` | `pass_id` | `{pass_id, email, status, stripe_subscription_id, test_mode, created_at}` — `status` ∈ `active`, `canceled` | `createPass` `lib/pass.js:80`; `server.js:791,816,884` | `getPass`/`getPassByEmail` `lib/pass.js:70-78`, `passDetail` `server.js:903-911` |
| `credit_ledger` | `ledger_id` | `{ledger_id, pass_id, delta, reason, film_id, stripe_invoice_id, transferable:false, cash_value_usd_cents:0, created_at}` — append-only, no updates | `ledgerEntry` `lib/pass.js:99` (via `issueCredits`/`redeemCredit`) | `balance`/`ledger` `lib/pass.js:113-121` |
| `filmmakers` | `filmmaker_id` | `{filmmaker_id, email, display_name, stripe_connect_account_id:null, connect_status, payout_method, payout_status, created_at}` | `createFilmmaker` `server.js:988`; `updateFilmmaker` `server.js:1018` | `filmmakerRef` `server.js:360-364`, onboarding `server.js:1031-1050`, profile `server.js:1052-1066` |
| `migration_contacts` | `contact_id` | `{contact_id, film_id, email, source:'vimeo_export', imported_at}` — **notices only, never entitlements** (`store.js:20-23`, `server.js:504-513`) | `importBuyers` `server.js:528` | dedupe `server.js:522-525`; onboarding check `server.js:1039-1040` |
| `orders` | `order_id` | `{order_id, email, film_ids[], allocations[{film_id, amount_usd_cents}], total_usd_cents, filmmaker_email, bundle:true, test_mode, created_at}` | `bundleTestPurchase` `server.js:738` | **nowhere — write-only.** No route, no report, no reconciliation reads it. |
| `accounts` | `account_id` | `{account_id, email, password_hash:'scrypt$<salt>$<hash>', role, name, created_at}` — `role` ∈ `buyer`, `filmmaker` | `signup` `server.js:283` | `login` `server.js:299-307`, `getAuthAccount` `server.js:211-215` |
| `sessions` | `token` | `{token, account_id, created_at, expires_at}` — 30-day TTL (`lib/auth.js:21`) | `signup` `server.js:285`, `login` `server.js:308` | `getAuthAccount` `server.js:206-209`; **deletion attempted but dead** (`server.js:210,324` → DAT-001) |
| `receipt-key.pem` | — | Ed25519 PKCS#8 private key, mode 0600 | `getKeys` `lib/receipts.js:51-63` (create-on-first-use) | `sign`/`verify`/`getPublicKeyBase64` `lib/receipts.js:65-101` |
| `masters/*.mp4` | — | Raw uploaded film bytes (`<film_id>.mp4`, ≤1 GiB, `server.js:27`) | `importFilm` `server.js:470-473` (tmp+rename) | `CDN.streamFile` `lib/cdn.js:37-100` |

**Integrity notes:**
- Money is integer cents everywhere off-chain (`price_usd_cents`, `amount_usd_cents`, `cash_value_usd_cents: 0`); no floats. Dates are ISO-8601 strings. Good.
- Joins are by **email string**, not foreign keys: `ownsFilm` matches `film.filmmaker_email` to `account.email` (`server.js:241-245`); `filmmakerRef` matches `filmmakers.email` (`server.js:360-364`). No account-email-change endpoint exists, so this is stable today but implicit — a future email-change feature would orphan film ownership silently.
- `orders` is a write-only sales ledger: bundles record per-film allocations (`server.js:713-724`) that nothing ever reads back. If the ledger matters, it needs a reader (filmmaker payout view); if it doesn't, it's dead weight.
- `claims` has no `rejected` terminal state — a claim the filmmaker won't approve sits in `needs_review`/`pending` forever (and blocks the buyer from re-filing via the open-claim dedupe, `server.js:571-578`).

## 3. `receipt-key.pem` — the crown-jewel key

- Generated once on first `sign`/`verify`/`pubkey` call, stored `0600` at `data/receipt-key.pem` (`lib/receipts.js:51-63`); `data/` is gitignored (verified — MAP non-issue).
- **Silent-regeneration hazard (DAT-005):** if the file is absent, a new keypair is minted with no log and no error; every previously issued receipt becomes unverifiable (offline CLI included). The comment says "back it up" (`receipts.js:14-18`); the code fails open.
- Rotation/KMS explicitly deferred ("M1 scope: single-node key", `receipts.js:18`). Terms are versioned (`TERMS_HASH`, bump-the-version-string instruction, `receipts.js:23-33`) — good.

## 4. Durability verdict

- **Crash-safety: MIXED.** Each individual file write is atomic (tmp+rename, `store.js:80-88`) — a crash mid-`saveAll` leaves either the old or the new file, never a torn one. But (a) no `fsync` — an OS crash can lose the tail; (b) every *business operation* spans 2–4 separate file writes with no transaction or write-ahead log — crash between them leaves divergent state (DAT-002: orphan receipts, debited-but-ungranted credits, re-approvable claims, ledger-less bundles); (c) a single corrupt byte in any collection 500s every route touching it, with no backup and no repair path (DAT-011).
- **Concurrency: UNSAFE beyond one process.** Read-modify-write with no locking — two processes sharing `data/` silently lose records (demonstrated: `devteam/repro/dat-001-store-concurrency.js`, exit 0; DAT-004). Within the single Node process all store ops are synchronous, so the deployed single-process topology is safe from interleaving; anything else (second instance, external editor, future clustering) is not.
- **Backup/migration story: NONE.** No backups, no `.bak` rotation, no export, no schema versioning, no migration framework (there is no schema to migrate — JSON blobs). `test.sh` stashes/restores `data/` for hermetic tests (TST verified), which is the only backup-like mechanism in the repo, and it's test-scoped. Recovery from corruption or key loss is hand-editing JSON / restoring from nothing (DAT-005, DAT-011).
- **Scale:** every read parses whole files; hot paths re-scan per request (DAT-012). Fine for hundreds of rows; linear degradation past that.

## 5. On-chain ↔ off-chain consistency

Two entitlement systems exist with **no sync between them** (DAT-008):

| Aspect | Off-chain (lifeboat store) | On-chain (contracts) |
|---|---|---|
| Purchases | `entitlements` via `grantEntitlement` (test-mode or claim/approve) | `PayPerView.buyAccess`, `TicketNFT.mint`, `SubscriptionManager.subscribe` — all `0x0` UNDEPLOYED (`apps/frontend/lib/contracts/config.ts:14-27`) |
| Passes/credits | `passes.json` + `credit_ledger` | `SubscriptionManager` / `SeederCredits` — no mirror |
| Delisting | **nothing** — lifeboat never consults on-chain `delistFilm` (TST-008) | `delistFilm` events exist on-chain |
| Indexer | none in the lifeboat | frontend `lib/indexer.ts` is query-only (30s cache, no cursor/reorg handling); Goldsky subgraph not deployed |

Divergence modes and their handling today: **reorg** — n/a (no event ingestion); **missed event** — n/a; **manual DB edit** — undetectable; **on-chain purchase** — creates no lifeboat entitlement (buyer can't stream); **on-chain delist** — ignored by lifeboat (film keeps streaming). All latent until deploy; the source-of-truth decision must precede deploy (recommended: lifeboat store = streaming entitlements, chain = payment rail, with an idempotent mirror job).
