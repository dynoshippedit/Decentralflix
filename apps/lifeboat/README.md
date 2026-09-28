# Decentralflix Lifeboat — M1 Backend

M1 is the **lifeboat backend**: a zero-dependency Node.js service (only
`node:http`, `node:crypto`, `node:fs` — no `npm install`) that lets a filmmaker
import a film master, grant/stream it to buyers, and issue portable signed
receipts. It is the smallest thing that can keep films selling if the primary
platform goes down.

## Run

```bash
node server.js            # PORT env configurable (default 8080), HOST optional
./test.sh                 # full end-to-end flow, must exit 0
```

Data lives in `./data/` (JSON files + `./data/masters/*.mp4` + the receipt
signing key). `data/` is gitignored — buyer data and the Ed25519 key are never
committed.

## Serving the frontend

The server also serves the Lifeboat frontend statically from `./public/`: any
non-`/api` path resolves under `./public` (`/` → `index.html`), with
traversal blocked and correct content types. Run one process — it serves both
the UI and the API. Service info (previously at `/`) moved to
`GET /api/health`.

Frontend contract details (aligned with `public/`):
- `POST /api/films/import`: the `meta` part arrives as a plain JSON **string**
  form field (`formData.append("meta", JSON.stringify(meta))`). The server
  `JSON.parse`s the field regardless of the part's content-type (a JSON
  content-type part is accepted too).
- `POST /api/receipts/verify`: the frontend posts the receipt object itself,
  unwrapped. Both `{receipt, signature}` and `{...fields, signature}` bodies
  are accepted.
- `POST /api/claims/:id/approve`: the frontend posts an empty `{}` body.

## API (all under `/api`, JSON unless noted)

| Method | Path | Notes |
|---|---|---|
| POST | `/api/films/import` | multipart/form-data: `master` (video file), `meta` (JSON: title, description, price_usd_cents, territories[], download_allowed, cleared_music_attested, filmmaker_email). Validates price > 0, territories non-empty, **cleared_music_attested must be true (music-rights rule — rejected otherwise)**. Returns `{film_id, playback_url, download_url?}` |
| GET | `/api/films` | List `{film_id, title, price_usd_cents, download_allowed}` |
| GET | `/api/films/:id` | Full metadata + `playback_url` |
| GET | `/api/films/:id/stream` | Video bytes via CDN abstraction; honors `Range` (206 Partial Content) |
| GET | `/api/films/:id/download` | File download **only if `download_allowed`**; else 403 with the AB 2426 message |
| POST | `/api/buyers/import` | `{film_id, emails[]}` — records Vimeo audience-export contacts for migration **NOTICES ONLY**. The export is opt-in contacts, not a purchase ledger; **no entitlement is granted**. Buyers claim access with their Vimeo receipt; the filmmaker approves. |
| POST | `/api/claims` | `{film_id, email, vimeo_receipt_ref}` — creates a PENDING claim |
| GET | `/api/claims?film_id=` | Filmmaker view of pending claims |
| POST | `/api/claims/:id/approve` | Approves → entitlement + signed receipt |
| POST | `/api/purchases/test` | **TEST-ONLY** simulated completed purchase `{film_id, email}` → entitlement + signed receipt, response carries `"test_mode": true` |
| POST | `/api/purchases/bundle/test` | **TEST-ONLY** same-seller multi-film bundle `{film_ids[], email}` → one checkout for N films from ONE filmmaker, explicit per-film allocation recorded in the sales ledger (`orders`), one signed receipt per film. Multi-seller bundles rejected (400). |
| POST | `/api/webhooks/stripe` | Real webhook shape; verifies `Stripe-Signature` against `STRIPE_WEBHOOK_SECRET`; **503 "not configured" when the secret is unset** |
| GET | `/api/films/:id/audience.csv` | CSV `email,granted_at,source,price_usd_cents` — the filmmaker owns their audience data |
| GET | `/api/receipts/pubkey` | Ed25519 public key (base64) |
| POST | `/api/receipts/verify` | `{receipt, signature}` **or** unwrapped `{...fields, signature}` → `{valid: bool}` |
| GET | `/api/health` | Service info (service, milestone, cdn backend, stripe_configured) |
| GET | `/` (and any non-`/api` path) | Static frontend from `./public/` (`index.html`, `app.js`, …) |

## What is real vs stubbed

- **Real:** film import + validation, JSON-file persistence (atomic tmp+rename
  writes), HTTP Range streaming (206), buyer-contact imports (migration
  notices only — **never access**), Vimeo claims flow, same-seller bundle
  checkout with per-film allocation in the sales ledger, Ed25519 signed
  receipts (keypair generated on first run into `./data/receipt-key.pem`),
  receipt verification, audience CSV export, Stripe webhook **signature
  verification** (HMAC, real when the secret is set).
- **Stubbed:** `lib/stripe.js` `createCheckoutSession` throws
  `"Stripe not configured — needs Dino's keys"`. No money can move.
- **Not activated:** `lib/cdn.js` `Bunny` backend — code-complete, but every
  method throws `"Bunny not configured — set env vars"` until
  `BUNNY_STORAGE_ZONE`, `BUNNY_API_KEY`, `BUNNY_PULLZONE_HOSTNAME` are set.
  M1 streams from `LocalOrigin` (`./data/masters`).

## Money-transmission warning

> **MONEY-TRANSMISSION WARNING: top-ups route through a Stripe-managed flow;
> needs lawyer's read before launch.** Do not wire real charges without counsel
> reviewing the money-transmission / marketplace-facilitator exposure. The
> webhook endpoint exists so the shape is ready; the secret is deliberately
> unset.

## Receipts are signed entitlements, not tokens

Receipts are bound to one buyer email hash + one film, `transferable: false`
always. They are never transferable, never cashable, and evidence a license
grant — not ownership of the file. See `lib/receipts.js`.

## "Buy" label rule (frontend)

Only render a **"Buy"** button for titles with `download_allowed: true`.
Streaming-only titles must not offer "Buy" — use "Watch"/"Stream" (a license,
not ownership; cf. the AB 2426 disclosure on the 403 download response).

## Layout

```
server.js          HTTP server + router
lib/store.js       JSON-file persistence (atomic writes)
lib/receipts.js    Ed25519 signed receipts
lib/cdn.js         CDN abstraction (LocalOrigin active, Bunny stubbed)
lib/stripe.js      Stripe checkout stub + real webhook-signature verification
data/              runtime state (gitignored): *.json, masters/, receipt-key.pem
public/            frontend static files, served by the server (not built here)
test.sh            end-to-end test (must exit 0)
```

## Feasibility corrections (2026-09-28)

Independent verification of the strategy doc (full report:
`~/workspace/feasibility/decentralflix-feasibility-2026-09-28.md`) changed
the following claims in this codebase:

- **Download wording:** "own it forever" / "ownership" language replaced with
  **"permanent DRM-free download — yours to keep"**, marked *pending counsel
  review*. The AB 2426 exemption reading (a permanent offline download the
  seller cannot revoke) is materially correct, but it is NOT copyright
  ownership — no copy in this repo may imply a transfer of copyright.
- **Deleted (fabricated):** the "$1.68B Songtradr/Bandcamp acquisition"
  figure. Real: Epic bought Bandcamp for **$273M** (Mar 2022), sold to
  Songtradr (Sep 2023) for an undisclosed sum.
- **Paramount/WBD:** "absorbing" → "agreed to acquire (~$111B EV), pending
  regulatory clearance" (12-state antitrust suits; trial March 2027).
- **Netflix memberships:** any membership count is an *estimate* — Netflix
  stopped reporting paid memberships in 2025. Use reported revenue or label
  estimates as estimates.
- **CDN cost:** "2–5¢ per film" is a *modeled example*, not a fact — it holds
  only for ~1–2 GB files, NA/EU delivery, high cache-hit rates, and raw-CDN
  (not Stream-product) pricing. Never hardcode a universal per-film cost;
  meter actual usage per title.
- **Unit economics must carry a 10–15% Apple external-purchase fee scenario.**
  iOS link-out is currently possible in the US, but Apple's commission is
  unresolved (reportedly proposed up to 15% in Aug 2026). Do not model a
  permanent 0%.

## Vimeo migration: the export is not a purchase ledger

Vimeo's own seller FAQ (verified 2026-09-28): the audience export contains
**only viewers who explicitly opted in to receive updates** — "for privacy
reasons we are not able to provide full buyer lists" — and the opt-in button
appears on VOD pages *as well as* after checkout. The export is therefore
opt-in **contacts**, not a purchase ledger: pre-granting paid access to every
exported address would include non-buyers and omit real buyers.

This codebase treats it accordingly:

- `POST /api/buyers/import` records **migration contacts** (for migration
  notices, subject to the export's permissions). It **never creates
  entitlements** — an export row alone grants nothing. A test asserts this.
- Access comes only from the claim flow: `POST /api/claims`
  (`{film_id, email, vimeo_receipt_ref}`) → filmmaker reviews →
  `POST /api/claims/:id/approve` → entitlement + signed receipt. The claim
  evidence (title, buyer email control, transaction reference, purchase type,
  date) is checked and deduplicated; uncertain receipts get manual review.
- Keep transactional access notices and promotional consent distinct.

## Unit economics (verified 2026-09-28)

Baseline scenario: the creator receives **75%** of the pre-tax sale price —
the tested basis for this project. Decentralflix bears US domestic card
processing, delivery, and a variable-operations allowance.

| Per order | $4 / 75% | $4 / 90% | $8 / 75% | $12 / 75% |
|---|---|---|---|---|
| Creator payout | $3.000 | $3.600 | $6.000 | $9.000 |
| Card cost (2.9% + $0.30) | $0.416 | $0.416 | $0.532 | $0.648 |
| Delivery allowance | $0.100 | $0.100 | $0.100 | $0.150 |
| Variable ops allowance | $0.200 | $0.200 | $0.200 | $0.200 |
| **Platform contribution** | **$0.284** | **-$0.316** | **$1.168** | **$2.002** |

Calculated before storage, ingest/transcoding, Connect/account/payout fees,
taxes, FX, legal review, customer acquisition, and fixed overhead. The $0.20
ops allowance is a placeholder, not measured expected losses.

- **90% creator share at $4 is loss-making (~-$0.32/order). Never advertise it.**
  75% is thin but testable; the variable that kills it is support cost.
- **Delivery:** Bunny posted rates — $0.01/GB for Europe/North America on the
  standard network, $0.005/GB on the volume network; storage ~$0.01/GB per
  region. A 100-minute film at 5 Mbps is ≈3.75 GB: one full NA/EU transfer ≈
  $0.05, not the lifetime cost of selling the film.
- **Bundles beat wallets for fee savings:** five separate $4 domestic-card
  purchases cost ~$2.08 in processing; one $20 bundle costs ~$0.88. The
  same-seller bundle checkout (`POST /api/purchases/bundle/test`) captures
  this without stored balances. Multi-seller bundles stay out of scope (they
  need cross-filmmaker allocation and a supported payment flow).

## Collector Pass: economics warning

The pass does **not** pencil on autopilot. A $10/mo pass with two $8 credits
costs **$12 in creator payouts alone** at a 75% creator share — before card
processing and delivery. The model only works with a different price,
allocation basis, included catalog, or usage design; do **not** quietly rely
on subscribers forgetting to redeem.

Before any real-money launch, all of the following must be defined: creator
allocations, credit expiration/rollover, refunds, cancellation terms, and
whether redeemed access survives membership end. The API emits
`economics_warning` on every Collector Pass response; the UI states it up
front. This sits alongside the existing `REQUIRES LEGAL REVIEW BEFORE LAUNCH
(money-transmission risk)` notice — a money-transmission opinion is still
required before activation.

### Deferred by policy (do not build)

- **Stablecoin checkout** — confirmed real (Stripe, 1.5%, no chargeback path,
  $10k/txn cap) but the wrong buyer profile for launch.
- **Community-funded originals / any crowdfunding UI** — Regulation
  Crowdfunding ($5M/12-mo cap) requires a registered broker-dealer or funding
  portal, Form C, and ongoing reporting. Building the UI first would be an
  unregistered offering.
- **Any token/NFT mechanics** — deferred pending a **transaction-specific
  legal assessment**, not a blanket ban. SEC Release 33-11412 (effective
  Mar 23, 2026) recognizes "practical digital tools" (tickets named) as
  not-securities while retaining investment-contract analysis; the Aug 2026
  safe-harbor proposal is **not** operative (comment deadline Oct 20, 2026).
  Apple's App Review Guidelines still prohibit NFT ownership unlocking app
  functionality. No token/NFT-gated access ships without counsel's
  transaction-specific read and an Apple-compatible design.

### Confirmed-real context relied on

- **Vimeo On Demand shutdown is real:** purchases stopped Sep 21, full
  shutdown Nov 20, 2026 — roughly 7 weeks of seller-acquisition wedge. Treat
  as seed supply, not mass market; competitors (Hiway, MediaZilla, Flicknexs)
  are chasing the same sellers.
- **Stripe Connect direct charges** fit this marketplace shape (filmmakers as
  connected accounts, application fee to the platform).
- **Sundance 2025:** 151 films screened of 15,775 submissions (Indiewire) —
  the supply-side thesis is factually grounded.

## M2 status — what works vs what is stubbed (91/91 tests green, 2026-09-28)

**Works:**
- Search (`?q=`) and genre (`?genre=`) catalog filters; genre input on the
  import page.
- Collector Pass test-mode: subscribe → 1 credit, immutable ledger stamped
  `transferable: false` + `cash_value_usd_cents: 0` on every entry,
  redemption with ownership checked *before* debit (duplicate redemption
  spends nothing), insufficient-credit (409) and email-mismatch (403)
  rejections.
- Buyer library / purchase history with signed receipts.
- Filmmaker accounts, PATCH (raw bank details rejected with 400), Stripe
  Connect stub (503 without keys), onboarding checklist, public profiles
  linked from film cards and the film detail page.
- Offline receipt verification: dependency-free Ed25519 (lib + browser
  build, machine-checked against node:crypto on random vectors) via
  `tools/verify-receipt.js` (`--pubkey` or `--server`) and
  `public/verify.html`.
- Stripe webhook signature verification (unit-tested); event shapes for
  checkout fulfillment and pass subscription creation / renewal /
  cancellation.

**Stubbed by design (no keys, no spend):**
- Real Stripe checkout / subscription billing / Connect onboarding links —
  parameter shapes exist in `lib/stripe.js`; every live call throws
  "not configured" (503) until keys exist.
- Buyer auth: library lookup is by email (pre-launch hardening item).
- The webhook subscription lifecycle is code-shaped but only reachable with
  `STRIPE_WEBHOOK_SECRET` set (signatures are verified when it is set).

**Legal warnings (emitted by the API, not just docs):**
- `REQUIRES LEGAL REVIEW BEFORE LAUNCH (money-transmission risk)` on every
  Collector Pass response.
- License wording ("permanent DRM-free download — yours to keep") is pending
  counsel review; it is not copyright ownership.

**Required future inputs (Dino decisions, not engineering):**
1. Domain choice for the storefront.
2. Bunny ($1/mo) + Stripe keys approval — spending approval.
3. Legal review: DMCA agent (needs legal entity name/address/agent),
   trademark knockout search + filing (~$250–350/class),
   money-transmission opinion letter ($15k–$50k, 4–8 weeks) before Collector
   Pass credits go live.
4. GitHub push target for this repo.
5. Whether Nov 20 is a full launch or a marketing beat + seller waitlist.

### Fix pass — research update 5 (2026-09-28)

Verified against primary sources (SEC releases, Stripe docs, Bunny pricing,
Vimeo seller FAQ). All inside `apps/lifeboat/`:

- **Vimeo export ≠ purchase ledger.** `/api/buyers/import` no longer grants
  entitlements — it records migration contacts for notices only. Access
  requires claim + filmmaker approval. Test asserts no entitlement is created
  from an export row alone.
- **Collector Pass economics warning** on every pass response (`economics_warning`)
  and in the UI: $10/mo with two $8 credits costs $12 at 75% before
  processing/delivery; the model needs a different price, allocation basis,
  catalog, or usage design.
- **NFT/token stance softened** from blanket-defer to "requires
  transaction-specific legal assessment" (SEC 33-11412, Aug 2026 proposal not
  operative, Apple restrictions stand). Feature stays deferred.
- **Same-seller bundle checkout** (`POST /api/purchases/bundle/test`):
  one checkout for N films from one filmmaker, explicit per-film allocation
  in the sales ledger (`orders`), one signed receipt per film. Multi-seller
  bundles rejected — out of scope.
- **Unit economics documented:** 75% creator share is the tested basis; 90%
  at $4 is loss-making (~-$0.32/order) and must never be advertised; verified
  Bunny rates ($0.01/GB NA/EU, $0.005/GB volume, ~$0.01/GB-region storage).
