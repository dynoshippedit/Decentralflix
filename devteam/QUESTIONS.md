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

### Q-df12-001 · TicketNFT forwards 100% to the filmmaker — who decided that exception, and does the 75/25 rule override it? (df-cycle-12)
- **Context:** TicketNFT.sol forwards the entire mint payment to `film.filmmaker` (100%, no platform fee). df-cycle-12 deliberately did NOT change it per Dino's order to research the decision source first. Research findings (2026-09-29): the behavior originated in commit 8d43132 (2026-09-28, "Phase 2 step 2: Solidity suite (TicketNFT, SubscriptionManager, PayPerView, DFLIX)") — i.e. it was there from the first contract draft, not a later exception grant. It is recorded in devteam/notes/payout-math.md ("Path 4 — TicketNFT"), devteam/notes/flows/payout-withdrawal.md, and devteam/notes/contracts.md. devteam/QUESTIONS.md:47 described it as "already consistent" with the hardcoded 22.28%-era docs, but no explicit Dino/owner decision authorizing a TicketNFT exception to the protocol-wide 75/25 claim was surfaced anywhere. The whitepaper claims 75/25 protocol-wide (docs/WHITEPAPER.md:104, :199), which is now the uniform rule in SubscriptionManager, PayPerView, and MovieTicket via the shared RevenueSplitter (df-cycle-12).
- **Options:** (a) Extend the shared 75/25 split to TicketNFT (removes the exception; one rule everywhere). (b) Keep 100%-to-filmmaker as an explicit owner exception, and correct the whitepaper copy to state the exception. (c) Something else.
- **Recommendation:** Your call — this one is a business decision, not a technical one. If the exception stands, the whitepaper's protocol-wide claim needs the carve-out in writing.
- **Dino's decision 2026-09-29 ~03:25:** extend 75/25. No exceptions, no whitepaper carve-out.
- **Implemented df-cycle-13:** TicketNFT inherits the shared RevenueSplitter like SubscriptionManager, PayPerView, MovieTicket — mint splits 75/25 at purchase (remainder to filmmaker, MissingCreator revert, owner cannot redirect or alter). Exact-split tests added. Old 100% notes marked SUPERSEDED (history preserved).
- **Status:** RESOLVED.

## 2026-09-29 - Payout-decision scope — ANSWERED by owner 2026-09-29 ~03:10
Dino's decision: "75/25 covers every contract that takes money from a viewer. One rule, everywhere, so the copy is true." Implemented in df-cycle-12: one shared RevenueSplitter (immutable PLATFORM_FEE_BPS = 2500, no setter; floor division; creator gets msg.value − fee incl. rounding remainder; MissingCreator revert; owner cannot redirect or alter), used by SubscriptionManager, PayPerView (owner-settable fee removed), and MovieTicket (owner withdraw sweep removed, split at purchase). TicketNFT deliberately unchanged pending Q-df12-001 above.
