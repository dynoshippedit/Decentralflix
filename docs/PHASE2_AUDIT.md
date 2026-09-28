# Decentralflix Phase 2 — Full Codebase Audit
Date: 2026-09-28. Scope: entire repository at /home/dino/Decentralflix, commit ccf762c.

## 1. Repository map

```
Decentralflix/
├── apps/
│   ├── frontend/                 # Next.js 16 (App Router) + React 19 + Tailwind 4 — MARKETING + PRODUCT SITE
│   │   ├── app/                  # 18 routes
│   │   │   ├── page.tsx          # homepage (pricing preview, 90-day plan banner)
│   │   │   ├── pricing/page.tsx  # subscription tiers (DRAFT), Collector Pass warning
│   │   │   ├── catalog/          # browse films
│   │   │   ├── film/[hash]/      # film detail
│   │   │   ├── watch/[hash]/     # playback (206 partial streaming)
│   │   │   ├── collection/       # buyer library
│   │   │   ├── upload/           # filmmaker upload flow
│   │   │   ├── dashboard/        # creator dashboard
│   │   │   ├── mint/             # NFT mint demo page
│   │   │   ├── crowdfund/        # filmmaker campaign UI
│   │   │   ├── reviews/          # review UI
│   │   │   ├── demo/             # demo mode
│   │   │   ├── admin/ + admin/review/[id]/  # rights-review queue
│   │   │   ├── legal/ privacy/ tos/         # legal docs
│   │   │   ├── spike1/ spike2/   # architecture spikes
│   │   ├── components/           # FilmCard, VideoPlayer, NavBar, WalletConnectButton,
│   │   │                         # LegalGate/ConsentModal/Footer, Reviews, UploadTest, states
│   │   ├── lib/
│   │   │   ├── contracts/        # index.ts, config.ts (+config.test.ts), useMovieTicket.ts,
│   │   │   │                     # useFilmmakerCampaign.ts, useReviews.ts, useSeederCredits.ts,
│   │   │   │                     # useHasFilmAccess.ts, useCreatorDashboard.ts, upload.ts,
│   │   │   │                     # abis.generated.ts (auto-exported from Hardhat artifacts)
│   │   │   ├── arweave/          # Arweave client helpers
│   │   │   ├── pricing.ts (+pricing.test.ts)  # SINGLE SOURCE OF TRUTH for draft pricing
│   │   │   ├── indexer.ts (+indexer.test.ts)  # chain-event indexer helpers
│   │   │   ├── demo-content.ts (+demo-content.test.ts)
│   │   │   ├── cloudflare-access.ts
│   │   ├── hooks/                # useVideoAccess, useVideoSources, useVideoUpload,
│   │   │                         # useArweaveUpload, useFilecoinLivepeerIngest, useThetaP2PSeeder,
│   │   │                         # useFilmMetadata
│   │   ├── providers/PrivyProvider.tsx  # Privy embedded-wallet auth (demo mode)
│   │   └── public/
│   └── lifeboat/                 # Node.js backend ("lifeboat service") — WORKING SERVICE on :8080
│       ├── server.js             # HTTP API + static serving
│       ├── lib/                  # cdn.js, ed25519.js (receipt signing), pass.js (Collector Pass),
│       │                         # receipts.js, store.js, stripe.js (stub: stripe_configured=false)
│       ├── public/               # 12 HTML pages: index, browse, film, filmmaker, onboard, import,
│       │                         # claim, library, dashboard, pass, verify + app.js, styles.css
│       ├── tools/verify-receipt.js  # offline Ed25519 receipt verification CLI
│       ├── data/                 # local JSON store (gitignored runtime state)
│       └── test.sh               # 103 tests — ALL PASS
├── packages/
│   └── contracts/                # Hardhat + Solidity 0.8.28 (evmVersion cancun) + ethers v6
│       ├── contracts/
│       │   ├── MovieTicket.sol        # ERC721A: Permanent Pass / Burnable Ticket tiers,
│       │   │                          # videoMetadata registry, platformFeeBps, pausable
│       │   ├── FilmmakerCampaign.sol  # crowdfunding campaigns
│       │   ├── Reviews.sol            # on-chain reviews
│       │   ├── SeederCredits.sol      # off-chain-reported seeding credits, owner attestor,
│       │   │                          # claim cooldown, claimsPaused emergency switch
│       │   └── mocks/MockTicketGate.sol
│       ├── test/                 # 4 test files (MovieTicket, FilmmakerCampaign, Reviews, SeederCredits)
│       ├── scripts/              # deploy.ts, export-abi.ts (→ frontend abis.generated.ts)
│       └── ignition/             # Hardhat Ignition modules
├── scripts/run.sh + stop.sh      # launch/stop both services (PIDs in .pids/, logs in logs/)
├── RUN.md                        # operator docs
├── cloudflare-worker/access-control.js  # signed-URL access gate (Cloudflare, not active locally)
├── cli/status.tsx                # status CLI
├── decentralflix-agents/         # agent personas/skills/references
├── docs/legal/                   # ToS, privacy, legal research memos
└── config: pnpm-workspace, turbo, eslint, tsconfig, postcss, .env.example
```

## 2. Every function surface (by module)

**packages/contracts (Solidity):**
- `MovieTicket` (ERC721A, Ownable, ReentrancyGuard): video registration (`registerVideo`), tiered minting (Permanent Pass / Burnable Ticket), `hasAccessToVideo`, per-token URIs, `platformFeeBps` admin, pause, burn-on-redeem for single-watch tickets, spot-minting keeping `_videoCounter` in sync.
- `FilmmakerCampaign`: campaign creation, pledging, refunds, payout on goal.
- `Reviews`: review submission gated on ticket ownership, rating aggregation.
- `SeederCredits`: `claimCredits(seeder, uptime, bytes, reportArweaveTx, attestorSig)` with 1-day cooldown, 7-day max report age, `claimsPaused` kill-switch, tier multipliers via MovieTicket.
- `mocks/MockTicketGate`: test double for gating.

**apps/lifeboat (Node, no package.json — plain node server.js):**
- `lib/store.js`: JSON file store (films, users, entitlements, claims).
- `lib/ed25519.js`: Ed25519 keypair + sign/verify for purchase receipts.
- `lib/receipts.js`: receipt issuance (one signed receipt per film per order).
- `lib/pass.js`: Collector Pass create/redeem/credit ledger (draft economics, flagged).
- `lib/cdn.js`: local-origin video serving with HTTP 206 partial content; Bunny stub fallback.
- `lib/stripe.js`: stub — `stripe_configured: false`, simulated checkout.
- `server.js`: REST routes for catalog, purchase (test-mode), entitlements, library, pass, claim/approve (Vimeo migration contacts), admin review queue.
- `tools/verify-receipt.js`: offline receipt verification CLI.

**apps/frontend lib:**
- `lib/contracts/`: wagmi/viem hooks per contract (`useMovieTicket`, `useFilmmakerCampaign`, `useReviews`, `useSeederCredits`, `useHasFilmAccess`, `useCreatorDashboard`), `config.ts` (chain + address config), `upload.ts`, `abis.generated.ts` (auto-generated — never hand-edit).
- `lib/pricing.ts`: draft pricing single source of truth; `pricing.test.ts` enforces honesty invariants (draft labels, 75% basis, warning present, no deferred-feature claims).
- `lib/indexer.ts`: event-indexing helpers; `lib/arweave/`: Arweave upload helpers; `lib/cloudflare-access.ts`: signed-URL helpers; `lib/demo-content.ts`: fixture content.

**Hooks:** video access/source/upload resolution, Arweave upload, Filecoin/Livepeer ingest (stub paths), Theta P2P seeder (opt-in stub), film metadata.

## 3. Dependencies

- contracts: hardhat 2.22, hardhat-toolbox 5, ethers 6.4, OpenZeppelin contracts 5.6.1, erc721a 4.3.0, typechain (ethers-v6 target), solidity-coverage, hardhat-gas-reporter.
- frontend: next 16.2.6, react 19.2.4, wagmi 3.6.15, viem 2.49.3, @privy-io/react-auth 3.26, arweave 1.15.7, @livepeer/react 4.3.6, tailwind 4, vitest 4.1.7. **No ethers.js currently** — step 4 adds it.
- lifeboat: zero npm deps (pure Node: crypto, fs, http).

## 4. Running services (verified 2026-09-28)

| Service | URL | Launcher | State |
|---|---|---|---|
| Marketing + product site (Next `start`) | http://100.85.119.8:3000 | scripts/run.sh | 200 OK |
| Lifeboat API + storefront | http://100.85.119.8:8080 | scripts/run.sh | 200 OK |

## 5. Text architecture diagram

```
                    ┌──────────────────────────────────────────────┐
                    │            VIEWER / FILMMAKER (browser)       │
                    └──────┬───────────────────────────┬───────────┘
                           │                           │
              ┌────────────▼─────────┐      ┌──────────▼──────────┐
              │  apps/frontend :3000 │      │ apps/lifeboat :8080 │
              │  Next.js 16 App Rtr  │      │ Node server.js      │
              │  ┌────────────────┐  │      │ ┌───────────────┐   │
              │  │ wagmi/viem     │  │      │ │ REST API      │   │
              │  │ hooks (use*)   │──┼──┐   │ │ store.js      │   │
              │  │ abis.generated │  │  │   │ │ receipts.js   │   │
              │  │ pricing.ts     │  │  │   │ │ ed25519.js    │   │
              │  │ (DRAFT $)      │  │  │   │ │ pass.js       │   │
              │  └────────────────┘  │  │   │ │ cdn.js (206)  │   │
              └─────────────────────┘  │   │ │ stripe stub   │   │
                                       │   │ └───────────────┘   │
                                       │   └─────────┬───────────┘
                                       │             │ 206 video bytes
                                       │             │ (local origin;
                                       │             │  Bunny = stub)
                    ┌──────────────────▼─────────────▼───────────────┐
                    │  CHAIN (Arbitrum Sepolia target; local HH net) │
                    │  MovieTicket (ERC721A) · FilmmakerCampaign     │
                    │  Reviews · SeederCredits (attestor model)      │
                    └──────────────────┬────────────────────────────┘
                                       │
                    ┌──────────────────▼────────────────────────────┐
                    │  STORAGE                                      │
                    │  Arweave: metadata + proofs (wired helpers)    │
                    │  IPFS/Filecoin: mirror (helpers, not wired)   │
                    │  Livepeer: transcoding (hook stub)            │
                    │  Cloudflare R2+CDN: primary per ARCH_REVIEW   │
                    │  Theta P2P: opt-in seeder (hook stub)         │
                    └───────────────────────────────────────────────┘

  OFF-CHAIN TRUST POINTS (must stay labeled):
  - Privy auth (demo) · Stripe (not configured) · Bunny (local fallback)
  - SeederCredits attestor (single EOA, bootstrap) · indexer.ts (no Goldsky yet)
```

## 6. Gaps Phase 2 fills (mapped to steps)

| Gap | Step |
|---|---|
| No standalone ticket/subscription/PPV/ERC20 suite with full coverage | 2 |
| No reusable encrypted-fragment IPFS/Arweave module | 3 |
| No ethers v6 direct wallet layer (only wagmi/viem + Privy demo) | 4 |
| No on-chain fragment-hash tamper-evidence | 5 |
| SeederCredits exists but no measured uptime/bytes/proof scoring | 6 |
| No protocol whitepaper | 7 |
| No Sepolia deploy script with gas estimates | 9 |

## 7. Invariants Phase 2 must not break

- 103/103 lifeboat tests, 41/41 frontend vitest, `next build` clean.
- Pricing honesty: 75% creator-share basis, Collector Pass warning, DRAFT labels (`pricing.test.ts` enforces).
- Vimeo migration = contacts only, never auto-entitlements.
- No mainnet, no spend, no real keys, local commits only, no push.
- Existing 4 contracts + their tests keep passing untouched.
