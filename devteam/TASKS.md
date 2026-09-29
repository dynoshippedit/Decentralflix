# Decentralflix — Executable Task Queue

**Rebuilt:** 2026-09-29 (df-cycle-01) · **Branch:** `devteam/review-2026-09-29`
**Sources:** `devteam/findings/{arc,bug,bld,bld-tail,dat,doc,map,mus,sec,str,tst,ver,w3b}.md`
plus `devteam/repro/ver-pass-endpoints.sh` and the verifier's live reproductions.

## Reconciliation note

- The Phase 4 merged `devteam/ISSUES.md` was lost (written to `/tmp` on an ephemeral
  VM). Its reported triage — 9 S1 / 44 S2 / 50 S3 / 7 S4 = 110 — is **unrecoverable
  and superseded** by this rebuild.
- Machine census of the lane files (2026-09-29): **126 unique finding IDs**
  (127 raw lines; BLD-009 appears in both `bld.md` and `bld-tail.md`).
  As-filed severities: **S1 16 / S2 50 / S3 53 / S4 7 = 126** — every band matches
  the independent verifier's counts (all 16 S1, "20 of 50 S2", 7 S4).
- Verifier downgrades applied (ver.md): BLD-006 S1→S2, STR-002 S1→S2, TST-002 S1→S2,
  TST-008 S1→S2, BUG-007 S2→S3. Zero findings rejected outright.
- Duplicate folds (9 → absorbed into the primary): BUG-001→STR-001, BUG-002→SEC-002,
  DAT-001→SEC-002, SEC-012→W3B-001, MUS-006→W3B-001, W3B-002→MUS-003,
  W3B-017→MUS-007, BUG-009→W3B-008, BUG-010→W3B-008.
- Resolved by DF-001 (SEC-001 fix, 2026-09-29): SEC-001 itself, plus SEC-011
  (pass-grant entitlements now carry `test_mode: true`; row removed, not folded).
- **Post-verifier queue: 116 unique items — 9 S1 / 50 S2 / 50 S3 / 7 S4**
  (126 − 9 folds − 1 resolved).
- Related-but-distinct pairs kept separate and cross-linked: BUG-011↔SEC-001
  (read-only GET leak vs mint), BUG-012↔DAT-009 (webhook idempotency family),
  W3B-004↔MUS-001 (contract vs docs angle).
- Contracts are **UNAUDITED**. No mainnet/testnet broadcasts. Local commits only.

## Priority order

S1 in fix order, then S2/S3/S4. Within a band, order is dependency/effort, not ID.

---

## S1 — fix first (9)

| # | ID | Status | Title / fix direction |
|---|----|--------|----------------------|
| 1 | SEC-001 | **VERIFIED** (df-cycle-01; controller re-ran full lifeboat suite 129/129 PASS on fresh port, inspected fix diff + regression assertions) | Unauthenticated `POST /api/passes/test` and `POST /api/passes/:id/redeem` minted unlimited credits and permanent signed entitlements. **Fix:** `requireAuth` on both routes; pass bound to `account.email` (body email never trusted); 403 on foreign pass; `testMode:true` on pass grants. Regression: `apps/lifeboat/test.sh` 129/129. Related: BUG-011 (GET leak, still open), BUG-004 (no period guard, still open). |
| 2 | SEC-002 | **VERIFIED** (df-cycle-02; controller: logout probe 401-after-logout, per-token revocation, suite 133/133 fresh port) | Logout is a no-op — session token stays valid after logout (live-reproduced). **Fix:** delete/invalidate the session row on logout (lib/store.js + server.js logout handler). Effort: XS. Same auth surface as SEC-001. Absorbs BUG-002, DAT-001. |
| 3 | W3B-001 | QUEUED | Attestor signature replay: one 1000-credit claim signature mints 2000 credits — no nonce/expiry (reproduced: `npx hardhat test w3b-signature-replay.test.ts`). **Fix:** consume-once nonces + expiry in the claim contract + regression test. Effort: M. Absorbs SEC-012, MUS-006. |
| 4 | BLD-001 | QUEUED | next@16.2.6 in critical range incl. 2 unauthenticated RCEs (npm audit). **Fix:** upgrade to 16.3.6, rebuild, re-run frontend suite. Effort: XS. |
| 5 | DOC-001 | QUEUED | Legal page false claims (contracts "audited"/"deployed on Arbitrum"). **Fix:** correct/remove the false statements; legal-review gate stays. Effort: XS. |
| 6 | DAT-013 | QUEUED | `claim.html` broken — creator monetization path dead. **Fix:** repair the claim flow end-to-end. Effort: S. |
| 7 | MUS-001 | QUEUED · **needs Dino decision** | SubscriptionManager sends 100% to `owner()` while marketing promises 75% creator share. **Fix:** owner decision first (change contract vs change copy) → `devteam/QUESTIONS.md`. Effort: M after decision. |
| 8 | STR-001 | QUEUED | Lifeboat UI never sends auth (zero Bearer/localStorage hits in public/app.js) — every authed endpoint is unusable from the UI. **Fix:** wire login/logout + Authorization headers through the UI. Effort: M. Absorbs BUG-001. |
| 9 | TST-001 | QUEUED | Storage module (1 MiB fragments, AES-256-GCM, manifests) unwired vs whitepaper claims. **Fix:** triage — wire it (L) or correct the whitepaper/docs (XS). |

## S2 — fix after S1 (50)

**Architecture**
- ARC-001 QUEUED — Two frontends, zero runtime integration: Next.js :3000 never calls lifeboat :8080 (two catalogs, two purchase flows). Owner decision: wire or formally split. Effort: L.
- ARC-002 QUEUED — `apps/lifeboat/server.js` is a 1,319-line god module (routing + business logic + static serving). Effort: L.
- ARC-003 QUEUED — Money paths and content paths share one module with no boundary. Effort: M.
- ARC-004 QUEUED — Lifeboat has no package.json — not a real workspace member, cannot depend on `@decentralflix/storage`. Effort: S.
- ARC-010 QUEUED — Deferred features lack architectural quarantine — policy-deferred, code-live. Effort: M.

**Auth / sessions**
- SEC-003 QUEUED — Sessions never expire (no TTL enforcement). Fix: expiry + rotation.
- SEC-004 QUEUED — AuthN without authZ: any authenticated account hits filmmaker-only routes. Fix: role checks.
- SEC-005 QUEUED — Test purchase has no filmmaker/ownership gate. Fix: gate to rights holder or test accounts.
- SEC-006 QUEUED — Upload has no content validation and no quota — arbitrary blob storage + disk-fill DoS. Fix: validation + quota.
- SEC-013 QUEUED — Webhook endpoints unauthenticated (rely on secret only). Fix: signature verification (ties to BUG-012/DAT-009).

**Money / entitlements (lifeboat)**
- BUG-003 QUEUED — Duplicate testPurchase mints duplicate entitlement rows (no already-owned guard; live-reproduced). Fix: idempotency guard like the sibling routes.
- BUG-004 QUEUED — Unlimited recurring test grants: one POST per call, no billing-period guard (live: 3 calls → balance 3). Fix: period cap. (Deliberately NOT folded into SEC-001.)
- BUG-005 QUEUED — Purchase failure atomicity: debit-before-grant can strand credits. Fix: grant-before-debit or rollback.
- BUG-006 QUEUED — Bundle "15% off / 3+ films" advertised vs full-price / ≥2 charged. Fix: align copy or pricing.
- BUG-008 QUEUED — On-chain buyAccess grants no lifeboat streaming (two disjoint rails). Fix: architecture decision.
- BUG-011 QUEUED — `GET /api/passes/:id` unauthenticated: leaks holder email + ledger. Fix: requireAuth + holder check. (Read-only; the mint side was SEC-001.)
- BUG-012 QUEUED — Pass-renewal webhook lacks the duplicate guard the sibling webhook has. Fix: idempotency (see DAT-009).

**Build / deps**
- BLD-002 QUEUED — (per bld.md) dependency hygiene item. Re-read entry before fixing.
- BLD-004 QUEUED — (per bld.md) build item. Re-read entry before fixing.
- BLD-005 QUEUED — (per bld.md) build item. Re-read entry before fixing.
- BLD-006 QUEUED — Downgraded S1→S2 (fail-closed env defaults; config hygiene).

**Data / store**
- DAT-002 QUEUED — Grant sequences span multiple non-atomic file writes — crash leaves divergent state. (Tied to SEC-002 logout; may close with it.)
- DAT-003 QUEUED — (per dat.md). Re-read entry before fixing.
- DAT-004 QUEUED — (per dat.md). Re-read entry before fixing.
- DAT-005 QUEUED — (per dat.md). Re-read entry before fixing.
- DAT-006 QUEUED — (per dat.md). Re-read entry before fixing.
- DAT-007 QUEUED — (per dat.md). Re-read entry before fixing.
- DAT-008 QUEUED — (per dat.md). Re-read entry before fixing.
- DAT-009 QUEUED — Webhook idempotency gap (family with BUG-012). Fix together.
- DAT-011 QUEUED — (per dat.md). Re-read entry before fixing.

**Docs / legal**
- DOC-003 QUEUED — Dashboard `handleQuickLaunch` submits a REAL launchCampaign transaction gated only by env var (stronger than filed). Fix: hard gate + confirm.

**Map / repo hygiene**
- MAP-011 QUEUED — (per map.md). Re-read entry before fixing.
- MAP-012 QUEUED — (per map.md). Re-read entry before fixing.
- MAP-013 QUEUED — (per map.md). Re-read entry before fixing.
- MAP-014 QUEUED — (per map.md). Re-read entry before fixing.

**Music-scene accounting (lifeboat)**
- MUS-003 QUEUED — MovieTicket overpayments silently captured, no accounting (absorbs W3B-002). Fix: single correct overpay path.
- MUS-004 QUEUED — (per mus.md). Re-read entry before fixing.
- MUS-005 QUEUED — (per mus.md). Re-read entry before fixing.

**Streaming / CDN**
- STR-002 QUEUED — Downgraded S1→S2 (Bunny pull-zone URLs unsigned, but backend not activatable as configured).
- STR-003 QUEUED — (per str.md). Re-read entry before fixing.
- STR-004 QUEUED — (per str.md). Re-read entry before fixing.
- STR-009 QUEUED — (per str.md). Re-read entry before fixing.
- STR-010 QUEUED — (per str.md). Re-read entry before fixing.

**Tests**
- TST-002 QUEUED — Downgraded S1→S2 (coverage gap on money contracts; guards present, contracts undeployed).
- TST-003 QUEUED — (per tst.md). Re-read entry before fixing.
- TST-004 QUEUED — (per tst.md). Re-read entry before fixing.
- TST-005 QUEUED — (per tst.md). Re-read entry before fixing.
- TST-006 QUEUED — (per tst.md). Re-read entry before fixing.
- TST-008 QUEUED — Downgraded S1→S2 (no off-chain takedown path; pre-launch readiness).
- TST-009 QUEUED — (per tst.md). Re-read entry before fixing.

**Web3 / contracts (UNAUDITED)**
- W3B-003 QUEUED — (per w3b.md). Re-read entry before fixing.
- W3B-004 QUEUED — Contract/docs mismatch family with MUS-001. Fix with the MUS-001 owner decision.
- W3B-005 QUEUED — (per w3b.md). Re-read entry before fixing.
- W3B-006 QUEUED — (per w3b.md). Re-read entry before fixing.
- W3B-013 QUEUED — Crown jewel 1: on-chain entitlements and lifeboat entitlements are completely disjoint (whitepaper key-release architecture doesn't exist). Fix: architecture decision (L).

## S3 — fix after S2 (50)

- SEC-007, SEC-008, SEC-009, SEC-010 — (per sec.md; SEC-011 resolved by DF-001)
- BUG-007 (downgraded S2→S3: pass copy matches code; deferred draft), BUG-013, BUG-014, BUG-015, BUG-016, BUG-017, BUG-018
- BLD-003, BLD-007, BLD-008, BLD-009, BLD-010, BLD-011
- DAT-010, DAT-012
- DOC-002, DOC-004, DOC-005, DOC-006
- MAP-001, MAP-002, MAP-004, MAP-006, MAP-009, MAP-010
- MUS-002, MUS-007 (absorbs W3B-017: milestone validation)
- STR-005, STR-006, STR-007, STR-008
- TST-007, TST-010, TST-011
- W3B-007, W3B-008 (absorbs BUG-009, BUG-010: wrapper docstrings), W3B-009, W3B-010, W3B-011, W3B-012, W3B-014
- ARC-005, ARC-006, ARC-007, ARC-008, ARC-009

## S4 — whenever (7)

- BLD-012 — no `engines` pin in root / apps/frontend / packages/contracts
- MAP-003 — root public/ duplicates apps/frontend/public/
- MAP-005 — twin static prototypes (.html and Html)
- MAP-007 — scratch files tracked (live-build-status.log, marker.md)
- MAP-008 — autonomy.md instructs agents into "silent execution mode"
- W3B-015 — `string indexed` event params (indexer-unfriendly)
- W3B-016 — contract hygiene (pragma/imports, stale comments, placeholder logo)

## Folded duplicates (do not re-file)

| Absorbed | Into | Reason |
|----------|------|--------|
| BUG-001 | STR-001 | Same root cause: UI never sends auth |
| BUG-002 | SEC-002 | Same root cause: session not invalidated |
| DAT-001 | SEC-002 | Same root cause: store.remove missing on logout |
| SEC-012 | W3B-001 | Same root cause: signature replay |
| MUS-006 | W3B-001 | Same root cause: signature replay |
| W3B-002 | MUS-003 | Same root cause: overpayment handling |
| W3B-017 | MUS-007 | Same root cause: milestone validation |
| BUG-009 | W3B-008 | Same root cause: wrapper docstring mismatch |
| BUG-010 | W3B-008 | Same root cause: wrapper docstring mismatch |

## Resolved by DF-001 (do not re-file)

| ID | How |
|----|-----|
| SEC-001 | requireAuth + account binding on pass subscribe/redeem; 403 on foreign pass |
| SEC-011 | pass-grant entitlements now carry `test_mode: true` (same edit) |

## Downgrades (verifier, still real defects)

BLD-006 S1→S2 · STR-002 S1→S2 · TST-002 S1→S2 · TST-008 S1→S2 · BUG-007 S2→S3.
Zero findings rejected outright in the audited sample (all 16 S1 + 40% of S2).

## Cycle log

- **df-cycle-01 (2026-09-29):** SEC-001 fixed + regression tests; queue rebuilt (this file).
  Result: `devteam/cycles/df-cycle-01.json`.
- **df-cycle-02 (recommended):** SEC-002 (logout no-op) — same auth surface, XS effort.
