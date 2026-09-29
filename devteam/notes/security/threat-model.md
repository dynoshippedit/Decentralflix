# Threat Model — Decentralflix (lifeboat + on-chain)

Owner: SEC (Security Auditor) · Phase 2 · 2026-09-29
Scope: the running system as built — `apps/lifeboat` (:8080), `packages/contracts`
(deployed nowhere; demo addresses), `packages/storage` (unwired), Next.js frontend
(:3000), `cloudflare-worker` (simulation mode). Source is read-only in this phase.

## 1. Assets (what we're protecting)

| # | Asset | Where it lives | Why it matters |
|---|---|---|---|
| A1 | Paid film masters (UNENCRYPTED mp4) | `apps/lifeboat/data/masters/*.mp4` (gitignored runtime state) | Crown jewel CJ1. Protection = server-side entitlement checks only; AES module (`packages/storage`) is NOT wired into the serving path (D-004). Anyone past the entitlement gate gets raw bytes. |
| A2 | Entitlement + receipt records | `apps/lifeboat/data/{entitlements,receipts}.json` | The license ledger. Forged/granted-in-error rows = free content. |
| A3 | Receipt signing key (Ed25519) | `apps/lifeboat/data/receipt-key.pem` (0600, generated on first run) | Signs portable entitlements. Compromise = forgeable receipts; loss = all receipts unverifiable. Single-node key, no rotation (documented later milestone). |
| A4 | Account credentials + sessions | `apps/lifeboat/data/{accounts,sessions}.json` | scrypt password hashes (good) + 30-day bearer tokens. Token theft = account takeover until expiry (revocation is broken — SEC-002). |
| A5 | Revenue accounting | `data/orders.json`, `data/credit_ledger.json`; on-chain `_filmRevenue` / `_accruedPlatformFees` | 75/25 split math, fee caps. Test-mode only off-chain; on-chain never deployed. |
| A6 | Buyer/filmmaker PII | emails in entitlements/claims/migration_contacts/filmmakers; exposed on some public routes (SEC-007) | Privacy; CSV-export handling (SEC-005). |
| A7 | Platform trust surface | filmmaker display names, film metadata, claims queue | Impersonation/defacement via unauthenticated profile endpoints (SEC-004). |

Explicitly NOT assets in this run: real money (Stripe stubbed, no keys — `lib/stripe.js` throws),
mainnet/testnet funds (no broadcasts, all frontend addresses `0x0`), Bunny CDN (stubbed).

## 2. Trust boundaries

```
 [internet / tailnet] ──1──> [lifeboat :8080] ──2──> [data/*.json, masters/, receipt-key.pem]
        │                         │ 3 (stubbed: Stripe/Bunny — inert)
        │                         └──4──> [static frontend ./public (no auth; esc()-escaped rendering)]
 [browser: Next.js :3000] ──5──> [chain: Sepolia/Arb Sepolia — all addrs 0x0, UNDEPLOYED guard]
 [uploader] ──6──> [multipart import ≤1 GiB, no content validation]
 [anyone] ──7──> [GET /api/receipts/* — public by design (pure-crypto verify)]
```

1. **Network → lifeboat.** `HOST` defaults to `0.0.0.0` (`server.js:20`) — on the
   Threadripper this is tailnet-reachable (`100.85.119.8:8080`), NOT localhost-only.
   Auth = bearer sessions (`lib/auth.js`); roles are self-asserted at signup
   (`server.js:243`). Several state-changing routes have NO auth at all (see authz matrix).
2. **Lifeboat → runtime state.** Single process, file-backed JSON, atomic tmp+rename
   writes (`lib/store.js:50-57`). No encryption at rest besides the receipt key's 0600 mode.
   Anyone with host filesystem access owns everything (accepted for dev).
3. **Lifeboat → Stripe/Bunny.** Stubbed; `isConfigured()` false without env keys. The
   webhook route 503s without `STRIPE_WEBHOOK_SECRET` (`server.js:734-737`) — fail-closed. Good.
4. **Browser → static storefront.** Served by `serveStatic` (`server.js:76-99`) with a
   traversal guard (`server.js:90-93`). All `innerHTML` sinks escape via `D.esc`
   (`public/app.js:21-25`) — verified per page (see `notes/sweeps.md`).
5. **Frontend → chain.** No live connection possible (addresses `0x0`); threat is
   future-deployment only.
6. **Uploader → lifeboat.** 1 GiB/request cap, no type/magic-byte check, no quota —
   arbitrary blob storage (SEC-006).
7. **Receipt verify is intentionally public** — pure cryptography, consults no DB
   (`lib/receipts.js:77-93`). Not an access gate; the stream gate is `hasEntitlement`
   against the DB (`server.js:236-246`).

## 3. Attacker profiles

| Profile | Capabilities | Can't do |
|---|---|---|
| P1 Anonymous network attacker | Reach :8080 over tailnet; call every unauthenticated route; sign up freely (any role) | Pass `requireAuth` without a token; read `data/` off-host |
| P2 Registered user (self-service) | P1 + bearer session; `requireAuth` routes; self-selected `filmmaker` role | Act as another account (email-keyed ownership) |
| P3 Malicious filmmaker (self-registered) | P2 + upload ≤1 GiB blobs per request, unlimited requests; approve claims on own films | Touch other filmmakers' films/audience (email-keyed `ownsFilm`) |
| P4 Malicious buyer | P2 + farm test entitlements via `purchases/test`; unlimited pass credits via `passes/test` (no auth needed at all) | Convert credits to cash (no path exists — by design) |
| P5 Receipt holder / offline verifier | Verify receipts against the public key; share receipts | Forge receipts (no private key); receipts don't open the stream gate |
| P6 Compromised dependency | 6,172 tracked `node_modules` files (MAP-001); `next@16.2.6` has 2 critical RCE advisories (BLD-001) | — (supply-chain; BLD owns) |

## 4. Top attack paths (attacker-hat)

**Path 1 — Free permanent content, zero credentials (CJ1 bypass).**
`POST /api/passes/test` (`server.js:1249`) needs no auth, takes any email, and mints a
credit on EVERY call (`passTestSubscribe`, `server.js:875-900`). `POST /api/passes/:id/redeem`
(`server.js:1258`) also needs no auth; its "non-transferability" check compares two
attacker-supplied values (`lib/pass.js:126-132`). Result: permanent entitlement + signed
receipt via `grantEntitlement` (`server.js:411-448`) — the same path as a purchase.
To *watch* it, sign up with the same email (public) and hit the stream gate, which then
passes legitimately. → SEC-001 (S1; S0 at real-money launch).

**Path 2 — Stolen session lives 30 days; logout is theater.**
`store.remove` is called at `server.js:210` (expired-session sweep) and `server.js:324`
(logout) but doesn't exist in `lib/store.js:94` — TypeError swallowed by `try{}`.
Sessions can never be deleted; logout returns 200 and does nothing. → SEC-002 (S1).

**Path 3 — Disk-fill / arbitrary blob hosting.**
Self-register as filmmaker (P2→P3, role is self-asserted — SEC-003), then `POST
/api/films/import` (`server.js:1126`) with up to 1 GiB of arbitrary bytes per request;
`importFilm` writes bytes verbatim to `data/masters/<filmId>.mp4` (`server.js:470-473`)
with no magic-byte check, no transcoding, no quota. → SEC-006 (S2).

**Path 4 — Filmmaker impersonation / defacement.**
`POST /api/filmmakers` (`server.js:1262`) and `PATCH /api/filmmakers/:id`
(`server.js:1268`) have no auth and no ownership check; filmmaker IDs are public.
Create a profile under someone else's email, or rewrite anyone's display_name. → SEC-004 (S2).

**Path 5 — CSV formula injection → filmmaker workstation.**
`GET /api/films/:id/audience.csv` (`server.js:1149`, filmmaker-only) writes entitlement
emails with `csvEscape` that only quotes `,"` and newlines (`server.js:788-791`).
`isEmail` (`server.js:182-184`) accepts leading `=+-@`, so an attacker with an entitlement
plants a live spreadsheet formula the filmmaker executes on open. → SEC-005 (S2).

**Path 6 — Queue/notice spam (nuisance).**
`POST /api/buyers/import` (`server.js:1163`) and `POST /api/claims` (`server.js:1166`)
are unauthenticated: spam migration contacts or claims against any film/email.
Downstream gates hold (contacts never grant access; claims need approval). → SEC-008 (S3).

**Path 7 — Seeder-credit replay (on-chain, future).**
`SeederCredits.submitSeedingReport` (`contracts/SeederCredits.sol:69-101`) verifies a
platform ECDSA signature over `(msg.sender, arweaveTxId, claimedAmount, chainid)` —
no nonce, no per-txId consumption. After `MIN_CLAIM_COOLDOWN`, the same signed report
re-mints credits for one Arweave TX. → SEC-012 (S2; W3B owns the deep fix).

**Path 8 — Receipt-key loss/corruption → verification outage (ops).**
`getKeys` (`lib/receipts.js:53-63`) generates on absence (safe, 0600) but a corrupted
`receipt-key.pem` makes `createPrivateKey` throw uncaught in `sign()`/`getPublicKeyBase64()`
→ 500s on purchase/pubkey paths. No rotation story. → SEC-010 (S3).

## 5. What's actually well-defended (don't "fix" these)

- **Stream/download gate**: `requireAuth` + `ownsFilm || hasEntitlement` on both
  `GET /api/films/:id/stream` (`server.js:1131-1139`) and `/download` (`server.js:1140-1148`).
  Correct, server-side, no client-trust.
- **Password storage**: scrypt + random salt + `timingSafeEqual` (`lib/auth.js:18-36`).
- **Receipt crypto**: Ed25519 over canonical JSON (`lib/receipts.js:38-51`); verify is
  pure crypto and fail-closed; key file 0600. Receipts bind one buyer-hash + one film.
- **Stripe webhook**: 503 without secret; HMAC-SHA256 with `timingSafeEqual` and 300s
  timestamp tolerance (`lib/stripe.js:105-137`); signature checked before timestamp.
- **Static file serving**: traversal guard (`server.js:90-93`); masters NOT under the
  static root.
- **Range streaming**: strict `bytes=` parsing, 416 on bad ranges (`lib/cdn.js:55-92`).
- **Contract withdrawals** (spot-check): `nonReentrant` + checks-effects-interactions
  (`PayPerView.sol:117-134`, `SubscriptionManager.sol:151-158`, `MovieTicket.sol:192-197`);
  platform fee hard-capped 2500 bps (`PayPerView.sol:152-157`); all privileged fns
  owner/role-gated (32 sites enumerated — no missing gate found).
- **Multipart**: stored filename is server-generated (`filmId + '.mp4'`); `original_filename`
  goes through `path.basename` (`server.js:480`).

## 6. Residual risks accepted by design (not findings)

- Test-mode purchase/pass endpoints grant free entitlements BY DESIGN (labeled TEST-ONLY);
  the finding is only where they're *weaker* than their siblings (SEC-001) or unlabeled (SEC-011).
- No rate limiting, no email verification, no 2FA — declared dev-only (`lib/auth.js:11-15`,
  signup response note `server.js:269`). Tracked as hardening debt (SEC-009), not surprises.
- Single-node receipt key, no rotation — documented (`lib/receipts.js:17-20`).
- `packages/storage` AES module unwired — D-004; the entitlement gate is the real CJ1 control.
