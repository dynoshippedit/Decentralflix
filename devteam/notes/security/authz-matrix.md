# Authorization Matrix — lifeboat `handleApi` (`apps/lifeboat/server.js:1098-1299`)

Owner: SEC · Phase 2 · 2026-09-29
Enforcement primitives: `requireAuth` (`server.js:216-220`), `requireFilmmaker`
(`server.js:223-228`, role claim only), `ownsFilm` (`server.js:231-234`, email-keyed),
`hasEntitlement` (`server.js:237-246`, DB-backed, honors revoked/refunded statuses —
though no endpoint ever sets those). Roles are SELF-ASSERTED at signup
(`server.js:243`: `role` from request body) — every `requireFilmmaker` row below is
really "anyone with an account who typed filmmaker". 34 registered branches; no
duplicate registrations found (B6 sweep).

Legend: ✅ enforced server-side · ⚠️ weak/self-asserted · ❌ missing · — n/a

## Auth routes

| Route | Auth | Role/owner | Input validation | Notes |
|---|---|---|---|---|
| `POST /api/auth/signup` (`:1101`) | — (public) | ⚠️ role self-selected (`:243`) | ✅ email regex, pw ≥ 8, role enum | 409 leaks account existence (SEC-009) |
| `POST /api/auth/login` (`:1104`) | — (public) | — | ✅ generic 401 (no enumeration here) | No rate limit (SEC-009) |
| `POST /api/auth/logout` (`:1107`) | — | — | — | ❌ BROKEN: `store.remove` doesn't exist (`:324`); token survives → SEC-002 |
| `GET /api/auth/me` (`:1110`) | ✅ `requireAuth` | — | — | OK |

## Films

| Route | Auth | Role/owner | Input validation | Notes |
|---|---|---|---|---|
| `GET /api/films` (`:1113`) | — (public) | — | `q`/`genre` are filter strings | Returns `publicFilm` view only ✅ |
| `POST /api/films/import` (`:1126`) | ✅ | ⚠️ `requireFilmmaker` (self-asserted) | ✅ `validateFilmMeta` (`:345`); meta JSON-parsed | ❌ NO content validation, NO quota → SEC-006; `filmmaker_email` forced to account email (`:477`) ✅ |
| `GET /api/films/:id/stream` (`:1131`) | ✅ | ✅ `ownsFilm \|\| hasEntitlement` | film must exist | ✅ Correct gate — the CJ1 control |
| `GET /api/films/:id/download` (`:1140`) | ✅ | ✅ `ownsFilm \|\| hasEntitlement` + `download_allowed` | film must exist | ✅ Correct; AB2426 message when streaming-only |
| `GET /api/films/:id/audience.csv` (`:1149`) | ✅ | ✅ `requireFilmmaker` + `ownsFilm` | film must exist | ⚠️ CSV formula injection via email → SEC-005 |
| `GET /api/films/:id` (`:1158`) | — (public) | — | — | ⚠️ Exposes `filmmaker_email` (PII) → SEC-007 |

## Buyers / claims (Vimeo migration)

| Route | Auth | Role/owner | Input validation | Notes |
|---|---|---|---|---|
| `POST /api/buyers/import` (`:1163`) | ❌ NONE | ❌ | ✅ emails validated; dups skipped | Spam contacts onto any film → SEC-008 |
| `POST /api/claims` (`:1166`) | ❌ NONE | ❌ | ✅ email, receipt ref, purchase_type enum, date format + not-future | Spam claims for any email → SEC-008; grant needs approval ✅ |
| `GET /api/claims` (`:1169`) | ✅ | ✅ `requireFilmmaker`, filtered to own films | `film_id` query optional | ✅ |
| `GET /api/claims/review-queue` (`:1181`) | ✅ | ✅ `requireFilmmaker`, own films + `needs_review` | — | ✅ |
| `POST /api/claims/:id/review` (`:1192`) | ✅ | ✅ `requireFilmmaker` + `ownsFilm` on the claim's film | reason free-text | ✅ |
| `POST /api/claims/:id/approve` (`:1202`) | ✅ | ✅ `requireFilmmaker` + `ownsFilm` | — | ✅ Grants via `grantEntitlement` with claim email (approved by owner — intended) |

## Purchases / webhooks / receipts

| Route | Auth | Role/owner | Input validation | Notes |
|---|---|---|---|---|
| `POST /api/purchases/test` (`:1212`) | ✅ `requireAuth` | — (any buyer) | film must exist | TEST-ONLY by design; ⚠️ no `alreadyEntitled` check (dupes) → SEC-011; grants to `account.email` ✅ |
| `POST /api/purchases/bundle/test` (`:1215`) | ✅ `requireAuth` | — | ✅ ≥2 ids, no dups, all exist, single seller | TEST-ONLY; ✅ `alreadyEntitled` per film; explicit allocations |
| `POST /api/webhooks/stripe` (`:1218`) | — (HMAC instead) | — | ✅ `verifyWebhookSignature` (`lib/stripe.js:105`); 503 without secret | ✅ Fail-closed; ✅ `alreadyEntitled` guard on fulfillment |
| `GET /api/receipts/pubkey` (`:1221`) | — (public by design) | — | — | ✅ Intended public |
| `GET /api/receipts/terms` (`:1228`) | — (public by design) | — | — | ✅ Intended public |
| `POST /api/receipts/verify` (`:1231`) | — (public by design) | — | shape-tolerant; fail-closed | ✅ Pure crypto, no DB consult (documented); NOT an access gate |

## Collector Pass

| Route | Auth | Role/owner | Input validation | Notes |
|---|---|---|---|---|
| `POST /api/passes/test` (`:1249`) | ❌ NONE | ❌ | ✅ email valid | ❌ Mints a credit EVERY call, any email, reactivates canceled passes → SEC-001 |
| `POST /api/passes/checkout` (`:1252`) | — | — | — | Stub: always 503 ✅ (no money path) |
| `GET /api/passes/:id` (`:1255`) | ❌ NONE | ❌ | — | ⚠️ Exposes pass email + ledger to anyone holding/guessing `pass_id` → SEC-007 |
| `POST /api/passes/:id/redeem` (`:1258`) | ❌ NONE | ⚠️ email must match pass holder — BOTH client-supplied | ✅ film exists, email valid, ✅ `alreadyEntitled` pre-check | ❌ Grants permanent entitlement with zero credentials → SEC-001 |

## Filmmakers

| Route | Auth | Role/owner | Input validation | Notes |
|---|---|---|---|---|
| `POST /api/filmmakers` (`:1262`) | ❌ NONE | ❌ | ✅ email, display_name | ❌ Impersonation: profile for ANY email → SEC-004 |
| `GET /api/filmmakers/:id` (`:1265`) | — (public) | — | — | ⚠️ Exposes email → SEC-007 |
| `PATCH /api/filmmakers/:id` (`:1268`) | ❌ NONE | ❌ | ✅ rejects bank fields; payout_method enum | ❌ Anyone rewrites anyone's profile → SEC-004 |
| `POST /api/filmmakers/:id/connect` (`:1271`) | — | — | — | Stub: always 503 ✅ |
| `GET /api/filmmakers/:id/onboarding` (`:1274`) | ❌ NONE | ❌ | — | Low: film list + step booleans (public-ish data) |
| `GET /api/filmmakers/:id/profile` (`:1277`) | — (public) | — | — | Public profile ✅ (by design) |

## Buyer library / health

| Route | Auth | Role/owner | Input validation | Notes |
|---|---|---|---|---|
| `GET /api/buyers/:email/library` (`:1281`) | ✅ | ✅ `requested === account.email` else 403 | email validated | ✅ Correct (route-level check; the stale "no buyer auth" comment at `server.js:1059` is outdated) |
| `GET /api/health` (`:1289`) | — (public) | — | — | ✅ Benign |

## Summary of missing/weak checks

- **Missing auth entirely (state-changing):** `passes/test`, `passes/:id/redeem`,
  `filmmakers` POST, `filmmakers/:id` PATCH, `buyers/import`, `claims` POST.
- **Missing auth (read, PII-adjacent):** `passes/:id` GET, `filmmakers/:id/onboarding` GET.
- **Weak (self-asserted role):** every `requireFilmmaker` route — the role is chosen at
  signup, so these are "authenticated user" gates, not privilege gates. Blast radius is
  contained by email-keyed ownership (`ownsFilm`), EXCEPT the two unauthenticated
  filmmaker-profile routes above.
- **Broken:** `auth/logout` (SEC-002).
- **Correct gates (do not regress):** stream, download, audience.csv, claims
  list/review/approve, buyers library, webhook HMAC.
