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
| POST | `/api/buyers/import` | `{film_id, emails[]}` — pre-granted entitlements (Vimeo opted-in email lists) |
| POST | `/api/claims` | `{film_id, email, vimeo_receipt_ref}` — creates a PENDING claim |
| GET | `/api/claims?film_id=` | Filmmaker view of pending claims |
| POST | `/api/claims/:id/approve` | Approves → entitlement + signed receipt |
| POST | `/api/purchases/test` | **TEST-ONLY** simulated completed purchase `{film_id, email}` → entitlement + signed receipt, response carries `"test_mode": true` |
| POST | `/api/webhooks/stripe` | Real webhook shape; verifies `Stripe-Signature` against `STRIPE_WEBHOOK_SECRET`; **503 "not configured" when the secret is unset** |
| GET | `/api/films/:id/audience.csv` | CSV `email,granted_at,source,price_usd_cents` — the filmmaker owns their audience data |
| GET | `/api/receipts/pubkey` | Ed25519 public key (base64) |
| POST | `/api/receipts/verify` | `{receipt, signature}` **or** unwrapped `{...fields, signature}` → `{valid: bool}` |
| GET | `/api/health` | Service info (service, milestone, cdn backend, stripe_configured) |
| GET | `/` (and any non-`/api` path) | Static frontend from `./public/` (`index.html`, `app.js`, …) |

## What is real vs stubbed

- **Real:** film import + validation, JSON-file persistence (atomic tmp+rename
  writes), HTTP Range streaming (206), buyer imports, Vimeo claims flow,
  Ed25519 signed receipts (keypair generated on first run into
  `./data/receipt-key.pem`), receipt verification, audience CSV export, Stripe
  webhook **signature verification** (HMAC, real when the secret is set).
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
