# Flow: Vimeo import → claim → approve
<!-- C12 · DAT lane · 2026-09-29 · Auditor: DAT (Data & Integrations Specialist) -->
**Method:** hop-by-hop trace from the filmmaker's paste-box through contact storage, buyer claim, filmmaker review/approval, to the granted entitlement. Every hop cites `path:line`; failure modes per hop. Related findings: DAT-002, DAT-003, DAT-006. Data-model reference: `../data-model.md` §2 (`migration_contacts`, `claims`, `entitlements`).

**Design invariant (load-bearing):** Vimeo's audience export is opt-in *contacts*, not a purchase ledger. Importing it must NEVER grant access (`server.js:504-513`, `store.js:20-23`). Access comes only from the claim flow + filmmaker approval. The trace below verifies this holds — and where the surrounding machinery is weak.

## Hop 0 — Filmmaker pastes the export (`apps/lifeboat/public/dashboard.html:158-195`)
- The dashboard's "buyers-form" takes one email per line, does a trivial client-side `@` filter (`dashboard.html:165-167`), and `POST`s `{film_id, emails}` to `/api/buyers/import` (`dashboard.html:175`).
- Failure modes: the page has **no auth gate** and the POST carries **no token** — the server doesn't check either (hop 1). Client-side filtering is cosmetic.

## Hop 1 — Route → `importBuyers`, no auth (`server.js:1163-1165` → `server.js:496-544`)
- `handleApi` dispatches `POST /api/buyers/import` straight to `importBuyers` with no `requireAuth`/`requireFilmmaker` — unlike the sibling `POST /api/films/import` (`server.js:1123-1127`).
- The handler: 404 if the film doesn't exist (`server.js:499`); 400 if `emails` isn't a non-empty array (`server.js:501-502`); body capped at 1 MiB by `readJson` (`server.js:26,123-141`).
- Failure modes: **anyone on the network can append contacts to any film** (DAT-006 — store pollution, unbounded `migration_contacts.json` growth, third-party emails injected into a filmmaker's audience list). Oversized bodies 413 cleanly.

## Hop 2 — Per-row validate, dedupe, insert (`server.js:515-534`)
- Each row: `isEmail` check (`server.js:184-186`) → invalid rows collected into `invalid[]` and *reported back*, not silently dropped; dup check per film+email (`server.js:522-525`) → `skipped`; else `store.insert('migration_contacts', {contact_id, film_id, email, source:'vimeo_export', imported_at})` (`server.js:528-534`).
- Response 201: `{film_id, contacts_recorded, skipped_duplicates, invalid_emails, note}` with the explicit note "Migration contacts recorded for notices ONLY — no access granted" (`server.js:536-544`).
- Failure modes: dedupe is check-then-insert (TOCTOU across processes — DAT-004); nothing validates that the emails actually came from Vimeo (it's a paste-box — by design, but worth stating); **no entitlement, receipt, or order is written here** — invariant holds.

## Hop 3 — Buyer files a claim (`apps/lifeboat/public/claim.html` → `POST /api/claims` → `fileClaim`, `server.js:546-597`)
- Route `server.js:1166-1168` (unauthenticated by design — the claimant may have no account). `fileClaim` requires: film exists (`server.js:548`), valid email (`server.js:549`), non-empty `vimeo_receipt_ref` (`server.js:550-551`), `purchase_type` ∈ `buy|rent` (`server.js:557-560`), `purchase_date` valid ISO `YYYY-MM-DD` and not in the future (`server.js:561-566`).
- Dedupe: one *open* claim per buyer per film (`status` ∈ `pending|needs_review`, `server.js:571-579`) → 409 otherwise. Inserts the claim with `status:'pending'` (`server.js:580-594`) → 201 with the full claim object.
- Failure modes: **all evidence is self-asserted** — `vimeo_receipt_ref` is a free-text string, never verified against any Vimeo API (there is none); the trust anchor is the filmmaker's eyeballs at hop 5. Date validation is string comparison (`server.js:564`) — correct for `YYYY-MM-DD`. `claim.html:94` posts only `{film_id, email, vimeo_receipt_ref}` — `purchase_type`/`purchase_date` are then *required* by the server but the page doesn't send them, so claims filed from that page get a 400 unless the caller adds the fields (UI/API contract gap — the page predates the research-update hardening of `fileClaim`).

## Hop 4 — Filmmaker triages (`GET /api/claims`, `GET /api/claims/review-queue`)
- `server.js:1169-1179`: `requireFilmmaker` + filter to films the caller owns (`ownsFilm`, `server.js:241-245`). Review queue `server.js:1181-1190`: `needs_review` only, own films.
- Failure modes: ownership is by **email-string match** (`film.filmmaker_email` vs `account.email`) — no FK; fine today (no email-change endpoint) but implicit (`notes/data-model.md` §2).

## Hop 5a — Filmmaker sends to manual review (`POST /api/claims/:id/review` → `reviewClaim`, `server.js:599-615`)
- Route `server.js:1192-1200`: filmmaker + owns-film checks, then `reviewClaim`: 404/409 guards (`server.js:600-602`), `store.update('claims', claimId, {status:'needs_review', review_reason, decided_at})` (`server.js:605-609`) → 200 with the updated claim.
- Failure modes: single atomic file write — safe. A claim can sit in `needs_review` forever (no SLA, no escalation, no `rejected` state — the buyer can't re-file while it's open, `server.js:571-579`).

## Hop 5b — Filmmaker approves (`POST /api/claims/:id/approve` → `approveClaim`, `server.js:617-635`)
- Route `server.js:1202-1210`: filmmaker + owns-film checks. `approveClaim`: 404/409 guards (`server.js:618-620`); `grantEntitlement({film, email: claim.email, source:'claim'})` (`server.js:622-626`) — writes a signed receipt (`server.js:401`) + entitlement (`server.js:419`); then `store.update('claims', claimId, {status:'approved', decided_at})` (`server.js:630`) → 200.
- Failure modes: **three non-atomic writes** — crash between grant and status-update leaves a granted-but-re-approvable claim (DAT-002); **no `alreadyEntitled` check** — a second claim filed after approval double-grants a second entitlement + signed receipt (DAT-003); the receipt is `test_mode`-less (real signed artifact) even though the underlying "purchase" was an eyeball-verified Vimeo reference.

## Hop 6 — Entitlement is usable
- `hasEntitlement` (`server.js:248-259`) gates `GET /api/films/:id/stream` (`server.js:1128-1137`) and `/download` (`server.js:1139-1148`); `buyerLibrary` (`server.js:1068-1093`) shows it; `audienceCsv` (`server.js:827-842`) exports the buyer's email.
- Note: `hasEntitlement` excludes `revoked`/`refunded` statuses, but **no code path ever sets those statuses** — revocation is a data shape with no writer.

## Invariants verified
- ✅ Contacts never become entitlements: no path from `migration_contacts` to `entitlements` exists (grep-confirmed; only reads are dedupe + onboarding check).
- ✅ Claim grants nothing without filmmaker approval: `fileClaim` writes `status:'pending'` only.
- ⚠️ The approval itself is the weakest link: human-eyeball verification of a self-asserted receipt string, then a non-idempotent, non-atomic grant (DAT-002, DAT-003).
- ⚠️ The import endpoint's missing auth (DAT-006) lets anyone pollute the contact list that hop 4 triages from.
