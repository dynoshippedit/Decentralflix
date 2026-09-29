# Architecture notes — Decentralflix (ARC lane, Phase 2)
Owner: ARC · 2026-09-29 · Read-only review; REFACTOR_MODE=propose (no structural changes executed)

## How the system is put together (for a new developer)

Decentralflix is **three runtime systems and one library module that share a
repo but almost no code paths**:

1. **Lifeboat** (`apps/lifeboat/`, :8080) — a zero-dependency Node.js service
   (`node:http`, `node:crypto`, `node:fs` only; no `package.json` at all —
   ARC-004). One file, `server.js` (1,319 lines), holds all 32 API routes behind
   a hand-rolled segment matcher (`handleApi`, `server.js:1098-1319`), all
   business logic (~35 functions), multipart upload parsing, and static-file
   serving of its own storefront (`public/`, 14 HTML pages). Persistence is
   12 JSON files under `data/` (gitignored runtime state) via `lib/store.js`
   (atomic tmp+rename writes, no schema, no migrations — ARC-009). This is the
   *working* product: onboarding → upload → test-purchase → entitlement →
   range-streamed mp4 (`lib/cdn.js` `LocalOrigin`), Ed25519-signed receipts
   (`lib/receipts.js`), Collector Pass credits (`lib/pass.js`). Money movement
   is stubbed: `lib/stripe.js` throws until keys exist; the webhook route is
   wired but inert.
2. **Marketing/dApp frontend** (`apps/frontend/`, :3000) — Next.js 16 + React 19,
   19 route pages, ethers v6 wallet layer (`lib/web3/`), contract hooks
   (`lib/contracts/`). All 8 contract addresses default to `0x0` with an
   explicit UNDEPLOYED guard (`lib/contracts/config.ts:22-30`,
   `lib/web3/contracts.ts`). It **never calls the lifeboat** (verified: zero
   `8080`/`lifeboat` references under `apps/frontend/`) — it talks to chains
   (Sepolia/Arbitrum Sepolia, demo only), Privy (demo), and simulation-mode
   clients (Cloudflare worker client, indexer) that degrade to canned/demo
   behavior when env vars are unset.
3. **Contracts** (`packages/contracts/`, Solidity 0.8.28, Hardhat) — 10
   contracts (2,402 lines): PayPerView, TicketNFT, SubscriptionManager, DFLIX,
   SeederReputation, SeederCredits, Reviews, ProofRegistry, MovieTicket,
   FilmmakerCampaign. Well-structured (Ownable, ReentrancyGuard, custom errors,
   indexed events; MovieTicket's `hasAccessToVideo` is O(1) via mapping —
   the ADR-001 linear-scan flaw was fixed). 217 tests, in-process EVM.
   Never deployed; `deployments/` holds only `dry-run-local.json`.
4. **Storage module** (`packages/storage/`, `@decentralflix/storage` v0.1.0) —
   dependency-free ESM: AES-256-GCM fragment encryption, 1 MiB fragments,
   SHA-256 manifests, Merkle proofs, Kubo/IPFS + Arweave clients, retry logic,
   typed errors. 93 tests, all passing. **Zero importers** outside its own
   tests (ARC-004/005, MAP-010, TST-001). The encryption exists; the running
   serving path (`server.js` → `lib/cdn.js` → `data/masters/*.mp4`) serves
   masters unencrypted behind server-side entitlement checks
   (`server.js:1128-1152`). Per the refined CJ1: entitlement checks — not
   encryption — are the real content gate today.

Around these sit standalone pieces: `cloudflare-worker/access-control.js`
(NFT-gated signed-URL worker, SIMULATION MODE default, not referenced by the
frontend — ARC-006), `cli/status.tsx` (orphan blessed TUI, stale Phase-0 state —
ARC-007), `scripts/run.sh`/`stop.sh` (starts both services as independent
processes), and ~20 root docs in several generations (DOC-004).

## The money/content boundary (or lack of one)

Follow a dollar and a byte through the lifeboat and they meet in the same
function. `grantEntitlement` (`server.js:387-421`) is the single choke point
where a purchase, a bundle, a pass redemption, or a claim approval becomes
"this email may stream this film": it signs the receipt, inserts the receipt
record, and inserts the entitlement. That centralization is good — but it lives
in the god module (ARC-002) next to the streaming code, and the money-side
invariants (non-transferable, non-cashable credits — `lib/pass.js` header)
are enforced by the discipline of four call sites, not by a module boundary
(ARC-003). The on-chain money story is cleaner: each contract owns its own
fee cap (2500 bps everywhere), escrow, and withdrawal, with 217 tests pinning
the math — but nothing is deployed, so the lifeboat's test-mode ledger is the
only money that "moves".

## Stub seams: where the real world plugs in (assessment)

The stub boundaries are, unusually, **well designed** — this is a strength, not
a finding:

- **Stripe** (`apps/lifeboat/lib/stripe.js`): real call structure preserved as
  *pure* param-builder functions (`buildCheckoutSessionParams`,
  `buildSubscriptionCheckoutParams` — testable, no network), live calls throw
  `"Stripe not configured"`, webhook signature verification implemented
  dependency-free (HMAC-SHA256, 300s tolerance). Activation = keys + counsel.
- **Bunny** (`apps/lifeboat/lib/cdn.js`): `Bunny` class is code-complete behind
  `_assertConfigured()`; `createCdn` selects backend by `CDN_BACKEND` env.
  Clean strategy-pattern seam; `LocalOrigin` is the honest M1 backend.
- **Contracts** (`apps/frontend/lib/contracts/config.ts` + `lib/web3/contracts.ts`):
  zero-address defaults + UNDEPLOYED guard that throws instead of sending calls
  into the void. The frontend cannot silently talk to a dead contract.
- **Cloudflare worker / indexer**: env-gated (`NEXT_PUBLIC_CF_WORKER_URL`,
  `NEXT_PUBLIC_INDEXER_URL`), simulation clearly labeled
  (`simulation: true`, `[cloudflare-access] SIMULATION MODE` console info).
  The caveat: simulation is the *effective* default everywhere, and the demo
  policy is duplicated in two places (ARC-006).

The pattern to preserve in the target architecture: **pure builders + explicit
throws + env-gated selection + labeled simulation**. The pattern to fix: the
policy constants that the seams share should live in one place.

## State ownership

| State | Owner | Notes |
|---|---|---|
| Film catalog, entitlements, accounts, sessions, passes, credit ledger | `apps/lifeboat/data/*.json` via `lib/store.js` | Single-node, file-backed, atomic writes; no schema version (ARC-009); sessions expire at 30d but are never swept (expired rows accumulate) |
| Uploaded masters | `apps/lifeboat/data/masters/*.mp4` (≤1 GiB) | Served by `LocalOrigin`; unencrypted at rest |
| Receipt signing key | `apps/lifeboat/data/receipt-key.pem` (0600, generated on first run) | Single-node key; rotation/KMS explicitly deferred (`lib/receipts.js` header) |
| On-chain state | Sepolia/Arbitrum Sepolia (demo only) | Nothing broadcast; frontend addresses all `0x0` |
| Encrypted fragments / manifests | IPFS + Arweave (module exists, unwired) | `packages/storage`; who-pins unanswered (B3 L7) |
| Frontend caches | In-memory Maps, 30s TTL, 500-entry cap with oldest-eviction | `lib/indexer.ts`, `useHasFilmAccess.ts` — bounded, fine |

No shared mutable state between the three systems — which is both the reason
nothing corrupts anything else and the reason nothing integrates with anything
else.

## What's genuinely well-built (keep)

- `lib/pricing.ts` — single source of truth for pricing/economics with
  draft-status guards and the copy-honesty test as a legal control.
- `lib/store.js` — tiny, correct, atomic JSON persistence; honest about being
  single-node.
- `lib/stripe.js` — stub done right (pure builders, explicit throws).
- `packages/storage/src/` — clean public API, DI for the wallet signer,
  typed errors, zero deps. The best-structured module in the repo.
- Contracts — Ownable/ReentrancyGuard/errors/events; O(1) access checks;
  fee caps consistent at 2500 bps across payment contracts.
- `test.sh` (128 assertions, hermetic) — the characterization-test base the
  migration plan needs.

## Structural debts (see findings/arc.md for the ledger entries)

1. Two disconnected apps (ARC-001, S2) — the topology decision.
2. `server.js` god module (ARC-002, S2) — split along money/content.
3. Money/content no-boundary (ARC-003, S2).
4. Lifeboat not a workspace member; CJS/ESM seam (ARC-004 S2, ARC-005 S3) —
   prerequisites for the storage decision.
5. Duplicated simulation policy (ARC-006, S3); orphan `cli/status.tsx`
   (ARC-007, S3); no API contract (ARC-008, S3); implicit schema (ARC-009,
   S3); deferred features unquarantined (ARC-010, S2).

## Open questions (mirrored in QUESTIONS.md)

- Q-001: Wire `@decentralflix/storage` into the upload path, or designate it a
  reference module? (Default: reference module until key-management design exists.)
- Q-002: Should the Next.js frontend consume the lifeboat API (single product)
  or stay independent (two products)? (Default: keep independent; document the split.)
- Q-003: If wiring storage: dynamic-`import()` adapter vs lifeboat ESM conversion?
  (Default: adapter — smallest change.)
- Q-004: Feature-flag registry for deferred items, or keep page-level notices?
  (Default: keep notices until a deferred item is actually scheduled.)

## Related issue IDs

ARC-001…ARC-010 (this lane) · MAP-001, MAP-002, MAP-004, MAP-006, MAP-009, MAP-010
(structural context) · TST-001, TST-003, TST-008 (test gaps on the same seams) ·
DOC-001, DOC-003, DOC-004 (claims on the same structures) · BLD-001…BLD-012
(build/hygiene context, esp. lockfiles + next RCE pin).
