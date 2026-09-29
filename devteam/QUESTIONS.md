# QUESTIONS for the owner
(To answer: write under "Answer (owner)" and set Status to ANSWERED.)

Standing owner constraints for this run (from the Tech Lead's brief — not questions, just recorded):
- No push to any remote. Local commits only on devteam/review-2026-09-29.
- No mainnet/testnet broadcasts, no funded keys, no real payments, no public deployment.
- No spending, no contacting third parties, no real credentials, no money movement.

(none yet — specialists add questions as they arise, with recommendation + default assumption)

### Q-001 · Is `@decentralflix/storage` intended to be wired into the upload/playback path, or is it a standalone reference module? (ARC)
- **Context:** 93 tests, zero importers outside its tests (MAP-010, TST-001, ARC-004/005). The running serving path uses unencrypted masters + server-side entitlement checks (refined CJ1, DECISIONS.md D-004). Wiring is not just an import — it needs a key-management design: who generates the per-film key, where it is stored, how an entitled viewer receives it, rotation/revocation story. Overlaps the TST open question #1.
- **Options:** (a) Wire into `importFilm` via a storage adapter with entitlement-gated key delivery. (b) Designate it a reference module; correct docs that imply jewel-1 coverage from it.
- **Recommendation:** (b) until a key-management design exists — an encryption module with no key-delivery story is security theater.
- **Default meanwhile:** reference module; the coverage map must not claim jewel-1 protection from it.
- **Status:** OPEN

### Q-002 · Should the Next.js frontend consume the lifeboat API (single product) or stay independent (declared split)? (ARC)
- **Context:** Today :3000 never calls :8080 (ARC-001 — verified zero `8080`/`lifeboat` references under `apps/frontend/`). Two storefronts, two auth systems (lifeboat sessions vs Privy demo), two film catalogs, two purchase flows. `scripts/run.sh` presents them as one product.
- **Options:** (a) Next.js becomes the product frontend on top of the lifeboat API (one catalog, one auth, one purchase flow). (b) Declare the split: lifeboat = reference/demo backend, Next.js = the dApp; subordinate or remove the losing storefront.
- **Recommendation:** (a) — one product is cheaper to reason about, test, and secure than two.
- **Default meanwhile:** keep independent; the as-is is documented as two disconnected apps.
- **Status:** OPEN

### Q-003 · If storage is wired (Q-001=yes): dynamic-`import()` adapter or convert the lifeboat to ESM? (ARC)
- **Context:** Lifeboat is CommonJS (`require`), `@decentralflix/storage` is ESM (`"type": "module"`) — `require()` of it throws (ARC-005).
- **Options:** (a) Small async adapter module (`lib/storageAdapter.js`) using dynamic `import()` — one new file, explicit seam, mockable in tests. (b) Convert the lifeboat to ESM — touches every `require`, larger blast radius.
- **Recommendation:** (a) — smallest change, keeps the boundary explicit.
- **Default meanwhile:** n/a (no wiring until Q-001 is answered).
- **Status:** OPEN

### Q-004 · Feature-flag registry for deferred items, or keep page-level deferral notices? (ARC)
- **Context:** Crowdfunding, Collector-Pass-as-offer, stored credits, seeder rewards, NFT-gated access are policy-deferred (AGENTS.md) but code-live: `FilmmakerCampaign.sol` compiled+tested, dashboard still invites "launch a crowdfund campaign directly" (DOC-003, ARC-010). Deferral is a paragraph in AGENTS.md, not a state the code can see.
- **Options:** (a) `lib/features.ts` boolean registry consulted by pages/routes, enforced by extending the copy-honesty test pattern. (b) Keep AGENTS.md policy + page notices.
- **Recommendation:** (a) — "deferred" should be a boolean the code can see.
- **Default meanwhile:** (b) until a deferred item is actually scheduled.
- **Status:** OPEN


## 2026-09-29 - Payout-decision scope (from df-cycle-11 worker)
Dino: the 75/25 non-custodial hardening is implemented for SubscriptionManager only (df-cycle-10).
Repo evidence is insufficient to extend it - your call:
- PayPerView: `platformFeeBps` defaults to 0 (75/25 holds only after the owner sets 2500), owner can
  change it up to the 2500 cap, fee taken at withdrawal time; platform fees accrue in-contract.
- MovieTicket: `setPlatformFee` is onlyOwner (capped 2500); `withdraw()` lets the owner sweep the full
  contract balance.
- TicketNFT: forwards 100% to the filmmaker (no fee) - already consistent.
- FilmmakerCampaign: crowdfunding escrow, not a sale split.
The whitepaper/marketing claim 75% protocol-wide, but no recorded decision extends the
immutable-split hardening (constant, no owner change, direct-to-creator, rounding to creator)
beyond SubscriptionManager. Options: (a) extend the same hardening to PayPerView + MovieTicket,
(b) keep them as-is (owner-adjustable, capped 25%), (c) something else. No payout code was
changed in df-cycle-11 - waiting on your scope call.