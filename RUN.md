# RUN.md — Running Decentralflix locally

One command, from the repo root:

```bash
./scripts/run.sh
```

This starts two services in the background:

| Service | URL | What it is |
|---|---|---|
| Marketing site (Next.js) | http://100.85.119.8:3000 | Designed public site: hero, filmmaker/viewer pricing, honest economics, roadmap, FAQ |
| Working service (Lifeboat) | http://100.85.119.8:8080 | Real backend + storefront: film import, test-mode checkout, Collector Pass, buyer library, claims, signed receipts |

Stop everything:

```bash
./scripts/stop.sh
```

PIDs live in `.pids/`, logs in `logs/`. `stop.sh` kills by exact PID only.

## What works right now (test mode — no real money)

- Filmmaker onboarding: `POST /api/filmmakers` → film import at `POST /api/films/import`
  (requires territories + `cleared_music_attested: true` — rights gate enforced)
- Storefront: browse films, film pages, search
- Checkout: `POST /api/purchases/test` and same-seller `POST /api/purchases/bundle/test`
  — issues entitlements + Ed25519-signed receipts, verifiable offline
- Collector Pass: `POST /api/passes/test` → redeem at `/api/passes/:id/redeem`
  — every pass surface carries the unit-economics warning
- Vimeo migration: `POST /api/buyers/import` creates **contacts only**, never entitlements;
  buyers claim at `POST /api/claims`, filmmakers approve each claim
- Streaming/download of imported masters; buyer library per email

## What is NOT real yet

Stripe (no keys — `stripe_configured: false`), Bunny CDN (LocalOrigin fallback),
on-chain contracts (test addresses in demo mode), Privy auth (demo mode),
stored credit balances, seeder rewards, NFT access, P2P savings, stablecoins.

## Pricing

Draft only — see `apps/frontend/lib/pricing.ts` (single source of truth) and
`/pricing` on the marketing site. 75% creator-share basis; never 90%.
The Collector Pass economics warning is asserted by `lib/pricing.test.ts`.
