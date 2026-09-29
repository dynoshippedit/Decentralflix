# Env inventory — Decentralflix
Owner: BLD · Last updated: 2026-09-29

Method: `git ls-files` (tracked source only) swept for `process.env.X` in
`apps/frontend`, `apps/lifeboat`, `packages/contracts`, `packages/storage`,
`cli` (excluded: node_modules, .next, artifacts, cache, typechain-types,
devteam). Compared against root `.env.example` (the only env template in the
repo — no `apps/frontend/.env*` or `packages/contracts/.env*` template files exist).

## Table

| Variable | Read at | Default when unset | Documented in .env.example? | Secret? | Required? |
|---|---|---|---|---|---|
| `NEXT_PUBLIC_PRIVY_APP_ID` | apps/frontend/providers/PrivyProvider.tsx:27 | none (appId undefined) | YES | no (public) | yes, for auth |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | apps/frontend/providers/PrivyProvider.tsx:56 | undefined (optional) | NO | no | optional |
| `NEXT_PUBLIC_LIVEPEER_API_KEY` | apps/frontend/hooks/useFilecoinLivepeerIngest.ts:117, apps/frontend/hooks/useVideoUpload.ts:40 | null → simulation mode | YES (commented "Future") | **bearer token — treat as secret** | optional (degrades to simulation) |
| `NEXT_PUBLIC_INDEXER_URL` | apps/frontend/lib/indexer.ts:9, apps/frontend/lib/demo-content.ts:147 | `''` → demo content fallback | NO | no | optional |
| `NEXT_PUBLIC_DEMO_MODE` | apps/frontend/lib/cloudflare-access.ts:44 | not `'true'` → real-worker path | NO | no | optional |
| `NEXT_PUBLIC_CF_WORKER_URL` | apps/frontend/lib/cloudflare-access.ts:43 | undefined | YES | no | optional (worker not deployed) |
| `NEXT_PUBLIC_ADMIN_WALLET` | apps/frontend/app/admin/page.tsx:59 | `0x0000…0000` (zero address) | YES | no | optional |
| `NEXT_PUBLIC_MOVIE_TICKET_ADDRESS` | apps/frontend/lib/contracts/config.ts:14, cli/status.tsx:102 | `0x0000…0000` | YES | no | yes after deploy |
| `NEXT_PUBLIC_REVIEWS_ADDRESS` | apps/frontend/lib/contracts/config.ts:15, cli/status.tsx:103 | `0x0000…0000` | YES | no | yes after deploy |
| `NEXT_PUBLIC_SEEDER_CREDITS_ADDRESS` | apps/frontend/lib/contracts/config.ts:16 | `0x0000…0000` | NO | no | yes after deploy |
| `NEXT_PUBLIC_FILMMAKER_CAMPAIGN_ADDRESS` | apps/frontend/lib/contracts/config.ts:17 | `0x0000…0000` | NO | no | yes after deploy |
| `NEXT_PUBLIC_TICKET_NFT_ADDRESS` | apps/frontend/lib/contracts/config.ts:24 | `0x0000…0000` | NO | no | yes after deploy |
| `NEXT_PUBLIC_SUBSCRIPTION_MANAGER_ADDRESS` | apps/frontend/lib/contracts/config.ts:25 | `0x0000…0000` | NO | no | yes after deploy |
| `NEXT_PUBLIC_PAY_PER_VIEW_ADDRESS` | apps/frontend/lib/contracts/config.ts:26 | `0x0000…0000` | NO | no | yes after deploy |
| `NEXT_PUBLIC_DFLIX_ADDRESS` | apps/frontend/lib/contracts/config.ts:27 | `0x0000…0000` | NO | no | yes after deploy |
| `ARWEAVE_WALLET_JSON` | apps/frontend/lib/arweave/upload.ts:45 | none | YES | **YES (full JWK private wallet)** | yes, for uploads |
| `BUNNY_STORAGE_ZONE` | apps/lifeboat/lib/cdn.js:95 | undefined | NO | no (name) | yes, for bunny backend |
| `BUNNY_API_KEY` | apps/lifeboat/lib/cdn.js:96 | undefined | NO | **YES** | yes, for bunny backend |
| `BUNNY_PULLZONE_HOSTNAME` | apps/lifeboat/lib/cdn.js:97 | undefined | NO | no | yes, for bunny backend |
| `CDN_BACKEND` | apps/lifeboat/lib/cdn.js:124 | `''` → local fallback | NO | no | optional |
| `STRIPE_SECRET_KEY` | apps/lifeboat/lib/stripe.js:18 | `false` → test mode | NO | **YES** | optional (test mode) |
| `STRIPE_WEBHOOK_SECRET` | apps/lifeboat/server.js:753 | none (webhook verify) | NO | **YES** | yes, when stripe live |
| `ARBITRUM_SEPOLIA_RPC` | packages/contracts/hardhat.config.ts:13 | public URL `https://sepolia-rollup.arbitrum.io/rpc` | YES | no | optional |
| `PRIVATE_KEY` | packages/contracts/hardhat.config.ts:14 | `[]` (no accounts) | YES | **YES** | yes, for deploy |
| `SEPOLIA_RPC` | packages/contracts/hardhat.config.ts:19 | public URL `https://rpc.sepolia.org` | NO | no | optional |
| `DEPLOYER_PRIVATE_KEY` | packages/contracts/hardhat.config.ts:20,25; scripts/deploy-testnet.js:40 | `[]`; script refuses live broadcast without it | NO | **YES** | yes, for live broadcast |
| `AMOY_RPC` | packages/contracts/hardhat.config.ts:24 | public URL `https://rpc-amoy.polygon.technology` | NO | no | optional |
| `ARBISCAN_API_KEY` | packages/contracts/hardhat.config.ts:30; scripts/deploy.ts:86 | `''` | NO | **API key — treat as secret** | optional (contract verification) |
| `PORT` | apps/lifeboat/server.js:21 | `'8080'` | NO | no | optional |

## Observations

1. **Security-relevant vars read but undocumented (→ BLD-006, S1):**
   `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `BUNNY_API_KEY`,
   `DEPLOYER_PRIVATE_KEY`, `ARBISCAN_API_KEY`. None appear in `.env.example`.
2. **Two different private-key var names for the same concept:**
   `PRIVATE_KEY` (hardhat.config.ts:14, documented) vs `DEPLOYER_PRIVATE_KEY`
   (hardhat.config.ts:20,25; deploy-testnet.js:40, undocumented). The live
   deploy script requires `DEPLOYER_PRIVATE_KEY`; `.env.example` only
   documents `PRIVATE_KEY`. An operator following the template would set the
   wrong variable and get a refusal at broadcast time (fail-closed, but confusing).
3. **Documented but never read (→ BLD-007, S3):** `R2_BUCKET_NAME`,
   `R2_ACCOUNT_ID` appear in `.env.example` but zero reads in tracked source.
4. **Contract addresses:** 8 `NEXT_PUBLIC_*_ADDRESS` vars are read with a
   zero-address fallback; only `MOVIE_TICKET` and `REVIEWS` are documented.
   The other 6 (seeder credits, filmmaker campaign, ticket NFT, subscription
   manager, pay-per-view, DFLIX) are undocumented — low risk (not secrets) but
   an operator deploying contracts has no template telling them to set these.
5. `NEXT_PUBLIC_LIVEPEER_API_KEY` is a bearer token embedded in a
   `NEXT_PUBLIC_` var: it ships to the browser by design (documented as future),
   acceptable only while Livepeer stays in demo/simulation use.
6. `NEXT_PUBLIC_ADMIN_WALLET` defaults to the zero address; admin gate compares
   against it — with no env set, admin page compares against `0x0…0`
   (fail-closed for real wallets, but the "admin" is effectively nobody).
7. No `.env*` files are committed (`git ls-files` shows none); `.env.example`
   holds only placeholders. Secret scan found no real secrets (see BASELINE).

## Open questions

- Should `PRIVATE_KEY` and `DEPLOYER_PRIVATE_KEY` be unified to one variable?
  (Recommend: one name, documented; deploy script reads it.) → Q for owner.
- Is `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` intentionally optional? (Privy
  passes it through; unwired in docs.)

## Related issues

BLD-006 (undocumented security vars, S1) · BLD-007 (doc-but-unused R2 vars, S3)
