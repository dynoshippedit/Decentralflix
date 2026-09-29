# Findings — Architect (ARC)
Scope: as-is design, structural assessment, target structure, migration plan · ID range: ARC-001…ARC-010
Owner: ARC · Last updated: 2026-09-29

## Coverage completed
- Read in full: `devteam/PLAYBOOK.md` (735 lines), role card B9.3, `devteam/MAP.md`,
  `devteam/notes/testing.md`, `devteam/notes/claims-audit.md`, root `ARCHITECTURE.md`,
  `ARCHITECTURE_REVIEW_v2.md`, `STORAGE_STREAMING_ARCHITECTURE_DECISION.md` (ADR-001).
- Read (source): `apps/lifeboat/server.js` (1,319 lines — route dispatch + helpers;
  full read of lines 1–78, 1098–1319, plus grantEntitlement 387–431 and handler
  outlines via function grep), all of `apps/lifeboat/lib/*.js` (auth, store, cdn,
  stripe, pass, receipts, ed25519), `packages/storage/src/index.js` + `store.js`
  (lines 1–120) + `package.json`, `apps/frontend/lib/pricing.ts` (1–40),
  `apps/frontend/lib/contracts/config.ts` (1–60), `apps/frontend/lib/cloudflare-access.ts`
  (1–60), `apps/frontend/lib/indexer.ts` (1–50),
  `apps/frontend/lib/contracts/useHasFilmAccess.ts` (1–70),
  `apps/frontend/app/crowdfund/page.tsx`, `apps/frontend/app/dashboard/page.tsx`
  (555–575), `cloudflare-worker/access-control.js` (1–80), `cli/status.tsx` (1–40),
  `pnpm-workspace.yaml`, root `package.json`, `scripts/run.sh`.
- Verified by grep: no `8080`/`lifeboat` references anywhere under `apps/frontend/`;
  no `@decentralflix/storage` importers outside `packages/storage/`;
  no `openapi*` spec anywhere; no pagination on lifeboat list routes;
  `pnpm status` script absent from all package.jsons.
- Source tree untouched (writes only to devteam/). REFACTOR_MODE=propose: no
  structural changes executed; target + migration are design only.

## Findings

### ARC-001 · Two frontends, zero runtime integration — Next.js :3000 never calls lifeboat :8080
**S2 · Confirmed · NEW · Effort L · Lens ARC · Found by ARC in Phase 2 on 2026-09-29**

**Location:** `apps/frontend/` (Next.js, :3000) vs `apps/lifeboat/` (Node, :8080) — `scripts/run.sh:28-29` starts them as independent processes.

**Evidence:**
```
$ grep -rn '8080\|lifeboat\|localhost:8' apps/frontend/app apps/frontend/lib apps/frontend/components --include='*.ts' --include='*.tsx' -l
(no matches)
```
The lifeboat serves its own storefront (`apps/lifeboat/public/*.html`, 14 pages +
`app.js`) with its own email/password session auth (`lib/auth.js`); the Next.js app
has its own catalog/film/watch/upload/dashboard pages with Privy (demo) + ethers v6
wallets. Two film catalogs (lifeboat `data/films.json` vs on-chain/demo-content), two
purchase flows (lifeboat test-purchase + Ed25519 receipts vs contract wrappers with
all addresses `0x0`), two upload paths.

**What's wrong:** The repo presents one product ("Decentralflix is running: Marketing
site :3000 / Working service :8080" — `scripts/run.sh:40-42`) but ships two
disconnected applications sharing only a name. Every feature must be built twice or
rots on one side; a viewer who buys on :8080 has no access on :3000 and vice versa.

**Impact:** Structural duplication of the entire storefront surface; no single
"product" to reason about for auth, catalog, or entitlements. Any future
integration (the obvious direction) has no API contract to code against (see
ARC-008).

**Suggested fix:** Owner decision first (see Q-002 in QUESTIONS.md): either wire the
Next.js frontend to the lifeboat API (single product) or formally split the repo's
story into "lifeboat = reference/demo backend" vs "Next.js = the dApp". Then delete
or clearly subordinate the losing storefront.

**Related:** MAP.md §5 (module map shows the disconnect); TST crown-jewel notes
(two separate proven paths, never one end-to-end product path).

---

### ARC-002 · `apps/lifeboat/server.js` is a 1,319-line god module (routing + business logic + static serving)
**S2 · Confirmed · NEW · Effort L · Lens ARC · Found by ARC in Phase 2 on 2026-09-29**

**Location:** `apps/lifeboat/server.js:1-1319` — 35 handler/helper functions, 32 API
routes dispatched by a 220-line `handleApi` (`server.js:1098-1319`).

**Evidence:**
```
$ grep -nE '^(function|async function)' apps/lifeboat/server.js | wc -l
35
```
One file contains: HTTP plumbing (`sendJson`, `readBody`, `parseMultipart`),
static-file serving (`serveStatic`), auth guards (`requireAuth`,
`requireFilmmaker`), money handlers (`testPurchase:641`, `bundleTestPurchase:670`,
`passCheckout:864`, `passTestSubscribe:875`, `passRedeem:915`,
`stripeWebhook:752`), content handlers (`importFilm:432`, `importBuyers:496`,
`fileClaim:546`, `approveClaim:617`, `downloadFilm:843`, `audienceCsv:827`),
filmmaker onboarding (968–1066), and buyer library (1068–1096). The `lib/`
helpers are small and clean (auth 63 lines, store 94, cdn 128, stripe 133, pass
169, receipts 103) — the decomposition instinct exists; it just stops at the
server boundary.

**What's wrong:** Every change to any domain (streaming, payouts, auth, imports)
touches the same file and the same 220-line dispatch function. The file is the
sole owner of the money/content/authz boundaries, so those boundaries are
conventional, not structural — nothing stops a streaming change from editing
payout code.

**Impact:** Review cost and regression risk concentrate in the highest-risk file:
it owns the crown-jewel-2 money paths and the crown-jewel-1 entitlement gate.
Smell evidence the size already hides rot: `server.js:210` and `server.js:324`
call `store.remove('sessions', token)` inside `try/catch`, but `lib/store.js`
exports no `remove` — logout's session invalidation is dead code, invisible in a
1,319-line file. (Flagged for BUG to confirm as a finding; cited here only as
god-module evidence.)

**Suggested fix:** Split along the money/content seam (see ARCHITECTURE.md §3–4):
`lib/money.js` (purchases, passes, receipts, stripe webhook) vs `lib/content.js`
(films, claims, imports, audience) with `server.js` reduced to a thin router.
Characterization tests first — `test.sh` (128 assertions) already pins behavior.

**Related:** ARC-003 (the money/content boundary this split would create).

---

### ARC-003 · Money paths and content paths share one module with no boundary
**S2 · Confirmed · NEW · Effort M · Lens ARC · Found by ARC in Phase 2 on 2026-09-29**

**Location:** `apps/lifeboat/server.js` — `grantEntitlement` (`server.js:387-421`)
called from `testPurchase` (money), `bundleTestPurchase` (money),
`passRedeem`→`grantEntitlement` (money), and `approveClaim` (content/migration)
— all in the same file, no module seam.

**Evidence:** `grantEntitlement({ film, email, source, testMode })` at
`server.js:387` signs an Ed25519 receipt AND inserts an entitlement AND inserts a
receipt record — issuance, signing, and persistence in one function, called from
four unrelated flows. The `credit_ledger` (money) and `entitlements` (content
access) collections are written by interleaved handlers in the same dispatch
function.

**What's wrong:** Crown-jewel-2 (creator payout math / credit ledger integrity)
and crown-jewel-1 (entitlement gating) have no structural separation. The money
invariant "credits are non-transferable, non-cashable" (`lib/pass.js` comments)
is enforced by convention across handlers in one file, not by a module whose
public API makes violation impossible.

**Impact:** A future change to any content flow (e.g. claims approval granting
access — which it does via `approveClaim` → `grantEntitlement`) can alter money
semantics without crossing a visible boundary. Auditors must read all 1,319 lines
to verify money invariants.

**Suggested fix:** Extract a `Money` module (purchases, passes, ledger, receipts)
whose only entitlement-granting entry point is one audited function; content flows
call it, never reimplement it. See ARCHITECTURE.md §3.

**Related:** ARC-002; MUS lane (money math); `lib/pass.js` header comment
(non-transferability "by design, in code" — true of `redeemCredit`, but the
issuance paths are scattered).

---

### ARC-004 · Lifeboat has no package.json — not a real workspace member, cannot depend on `@decentralflix/storage`
**S2 · Confirmed · NEW · Effort S · Lens ARC · Found by ARC in Phase 2 on 2026-09-29**

**Location:** `apps/lifeboat/` (no `package.json` — verified `ls`); `pnpm-workspace.yaml`
globs `apps/*`.

**Evidence:**
```
$ ls apps/lifeboat/package.json
ls: cannot access 'apps/lifeboat/package.json': No such file or directory
$ grep -n '"name"' packages/storage/package.json apps/lifeboat/package.json apps/frontend/package.json package.json
packages/storage/package.json:2:  "name": "@decentralflix/storage",
apps/frontend/package.json:2:  "name": "frontend",
package.json:2:  "name": "decentralflix",
```
The lifeboat is zero-dependency by design (`server.js:1-9` — node:http/crypto/fs
only), which is a genuine strength for a "lifeboat". But it also means there is
no manifest in which to declare a workspace dependency, no version pinning, no
test script registration — and no path to `import '@decentralflix/storage'`
except a relative-path require into `packages/storage/src/`, which bypasses the
package boundary entirely.

**What's wrong:** Any wiring of the storage module into the lifeboat (the CJ1
decision in Q-001) has no dependency seam to cross. The "zero-dependency"
property and the "workspace member" property are in undeclared tension.

**Impact:** Blocks the clean version of the storage-wiring decision; the expedient
version (relative require) would entangle the lifeboat with the storage module's
internals and its ESM format (see ARC-005).

**Suggested fix:** Add a minimal `apps/lifeboat/package.json`
(`name: "@decentralflix/lifeboat"`, `private: true`, zero `dependencies`,
scripts for `start`/`test`) — preserves zero-dependency while making it a real
workspace member able to declare `@decentralflix/storage` as a dependency when
the owner decides. NEEDS-OWNER per Playbook (new manifest).

**Related:** ARC-005; MAP-010 (unwired storage); TST-001.

---

### ARC-005 · CJS/ESM module-system boundary between lifeboat and storage module
**S3 · Confirmed · NEW · Effort S · Lens ARC · Found by ARC in Phase 2 on 2026-09-29**

**Location:** `apps/lifeboat/server.js:13-18` (`require(...)` — CommonJS) vs
`packages/storage/package.json:8` (`"type": "module"` — ESM; `src/index.js` uses
`export`).

**Evidence:** Lifeboat: `const store = require('./lib/store');` — CJS.
Storage: `"type": "module"`, `export { storeFilm, retrieveFilm, withRetry } from
'./store.js'` — ESM. `require()` of an ESM package from CJS throws
`ERR_REQUIRE_ESM`.

**What's wrong:** Even with ARC-004 fixed, the lifeboat cannot `require()`
`@decentralflix/storage` directly. The seam needs an explicit design choice.

**Impact:** Small but must be decided before any wiring work: either a tiny
async adapter (`await import('@decentralflix/storage')` inside an async
function — works from CJS) or converting the lifeboat to ESM (larger, touches
every `require`).

**Suggested fix:** Dynamic `import()` in a single adapter module
(`lib/storageAdapter.js`) — smallest change, keeps the boundary explicit and
mockable in tests. Recommended default in Q-003.

**Related:** ARC-004.

---

### ARC-006 · Simulation policy duplicated: demo-film hashes + demo playback URL in two places
**S3 · Confirmed · NEW · Effort XS · Lens ARC · Found by ARC in Phase 2 on 2026-09-29**

**Location:** `cloudflare-worker/access-control.js:22-38` and
`apps/frontend/lib/cloudflare-access.ts:22-36`.

**Evidence:** Both files define an identical `DEMO_FILM_HASHES` list
(`raging-midlife`, `savage-midlife`, `signal-lost`, `the-unmuted`,
`ghost-frame`) and an identical `getDemoPlaybackUrl` returning
`https://test-streams.github.io/streams/xbox.m3u8?demo=<hash>`. MAP §5 confirms
the worker is standalone ("not referenced" by the frontend) — so these are two
independent implementations of the same simulation policy, not one shared
constant.

**What's wrong:** The "which films play the demo stream" policy lives in two
files in two languages with no shared source. Adding or renaming a demo film in
one place silently desyncs the other.

**Impact:** Low today (both are simulation-only), but it's the exact drift
pattern that turns into a real bug the day the worker deploys: a film gated in
the worker but demo-playable in the client, or vice versa.

**Suggested fix:** Single source of truth: keep the canonical list in
`apps/frontend/lib/demo-content.ts` (already the demo-film registry per the
worker's own comment: "Add any other demo hashes used in lib/demo-content.ts")
and have the worker import it at build/deploy time — or, simpler, delete the
client-side simulation once `NEXT_PUBLIC_CF_WORKER_URL` is the real path and
let the worker own the policy.

**Related:** DOC lane (simulation labeling); MAP §5.

---

### ARC-007 · `cli/status.tsx` is an orphan dev tool with stale embedded state
**S3 · Confirmed · NEW · Effort XS · Lens ARC · Found by ARC in Phase 2 on 2026-09-29**

**Location:** `cli/status.tsx` (557 lines).

**Evidence:**
```
$ grep -rn '"status"' package.json apps/frontend/package.json
(no matches — `pnpm status` is not a defined script anywhere)
$ sed -n '3,8p' cli/status.tsx
 * Decentralflix — Live Programming Status (Single Source of Truth)
 * This is the ONLY interactive status viewer for current programming state.
 * No separate .md tracking files. Run with: pnpm status
$ sed -n '36,38p' cli/status.tsx
    phase: 'Phase 0 — Foundation + Reviews as CORE',
```
A 557-line blessed TUI that claims to be the "Single Source of Truth" and the
"ONLY" status viewer, with a hardcoded `STATE` object still saying "Phase 0",
not referenced by any npm script, and directly contradicted by the devteam's
`STATUS.md` (the actual source of truth for this run).

**What's wrong:** Dead tooling that asserts authority it no longer has. A new
developer running it gets a "Phase 0" worldview that contradicts the whitepaper
("Phase 2 draft"), the lifeboat health endpoint (`milestone:'M2'`), and every
current doc.

**Suggested fix:** Delete `cli/` (NEEDS-OWNER: deleting files) or update its
STATE + wire `pnpm status` — deletion is the honest fix; the devteam STATUS.md
already serves the purpose.

**Related:** DOC-004 (stale Phase-0 docs).

---

### ARC-008 · No API contract for the lifeboat: unversioned routes, no schema, no pagination
**S3 · Confirmed · NEW · Effort M · Lens ARC · Found by ARC in Phase 2 on 2026-09-29**

**Location:** `apps/lifeboat/server.js` — 32 routes under `/api/*`; the "API
contract the UI relies on" is documented in code comments (`server.js:78-96`).

**Evidence:**
```
$ find . -name 'openapi*' -not -path '*/node_modules/*'
(no matches)
$ grep -n 'limit\|offset\|page' apps/lifeboat/server.js | grep -vi 'delim\|cursor ='
(no pagination — GET /api/films returns films.map(publicFilm) over the full array, server.js:1114-1125)
```
Routes are unversioned (`/api/films`, not `/api/v1/films`); request/response
shapes are defined only by the handler code and the static storefront's `app.js`
(which reads them ad hoc); error shape is consistent (`{error}` via `sendError`,
server.js:46-48 — a genuine strength) but undocumented.

**What's wrong:** ARC-001's eventual resolution (wiring the Next.js frontend to
the lifeboat) has no contract to code against — today the only client is the
co-located static HTML. Any second client (the Next.js app, a mobile app, a
third-party integration) must reverse-engineer `server.js`.

**Impact:** Integration cost is paid later with interest; also, the copy-honesty
and claims posture ("what the API promises") has no machine-readable source.

**Suggested fix:** Add a lightweight contract: a `docs/api.md` (or OpenAPI YAML
if the owner wants codegen) generated from a single route table; version the
prefix (`/api/v1`) when the first breaking change lands — not before. Add
pagination (`?limit`/`?cursor`) to `GET /api/films` and `GET /api/claims`
before the catalog grows past demo size.

**Related:** ARC-001.

---

### ARC-009 · Implicit data schema: JSON stores have no version, no migration story, unenforced references
**S3 · Confirmed · NEW · Effort M · Lens ARC · Found by ARC in Phase 2 on 2026-09-29**

**Location:** `apps/lifeboat/lib/store.js:1-94` — 12 collections
(`films.json`, `entitlements.json`, `claims.json`, `receipts.json`,
`passes.json`, `credit_ledger.json`, `filmmakers.json`,
`migration_contacts.json`, `orders.json`, `accounts.json`, `sessions.json`).

**Evidence:** `store.js` exports `all/get/insert/update` — no schema
declaration, no schema version field, no migration runner, no `remove`
(`server.js:210,324` call a nonexistent `store.remove`, caught and ignored).
Cross-collection references are conventional: `entitlements[].film_id` →
`films[].film_id`, `receipts[].receipt_id` ← `entitlements[].receipt_id`,
`credit_ledger[].pass_id` → `passes[].pass_id` — nothing enforces them, and
there is no delete path at all (so "orphan" is currently impossible only
because deletion is impossible).

**What's wrong:** The data model is "whatever the code wrote last". Adding a
field (e.g. `film.price_usd_cents` already exists; adding `currency` or a new
entitlement state) has no migration path — old `data/*.json` files just gain
`undefined` fields at read time. For a file-backed store this is acceptable at
demo scale, but the day `data/` holds real filmmakers' catalogs, an unversioned
implicit schema becomes a migration liability.

**Impact:** Low today (gitignored runtime state, single node). Grows with the
business: the Vimeo-migration flow is explicitly about importing real audience
data into these files.

**Suggested fix:** Add a `schema_version` to each collection file (or one
`data/_meta.json`) + a tiny `migrate()` in `store.js` that upgrades on load.
One page of code; do it before the first production-adjacent deployment, not
now.

**Related:** DAT lane (data model); `notes/data-model.md` when DAT writes it.

---

### ARC-010 · Deferred features lack architectural quarantine — policy-deferred, code-live
**S2 · Confirmed · NEW · Effort M · Lens ARC · Found by ARC in Phase 2 on 2026-09-29**

**Location:** `packages/contracts/contracts/FilmmakerCampaign.sol` (376 lines,
compiled + 25 tests), `apps/frontend/app/dashboard/page.tsx:563-566`
("Upload to Arweave + Launch Campaign" — live section), `apps/lifeboat`
pass routes (`POST /api/passes/*` — live, test-mode), vs `AGENTS.md:33-37`
(Crowdfunding/Collector Pass-as-offer/stored credits/seeder rewards/NFT-gated
access/P2P savings/stablecoin checkout — all DEFERRED) and
`apps/frontend/app/crowdfund/page.tsx` (deferral notice).

**Evidence:** The deferred list is enforced three different ways: (1) a page
that shows a notice (`/crowdfund`), (2) a contract that is compiled, tested,
and ABI-exported but "NOT deployed" (comment in `crowdfund/page.tsx:9`),
(3) nothing at all — the dashboard still invites "launch a crowdfund campaign
directly — backers become verified owners" (`dashboard/page.tsx:566`), which
DOC-003 already flagged as contradicting the deferral. There is no feature-flag
mechanism, no build exclusion, no lint rule — deferral is a policy in
`AGENTS.md` plus page-level notices.

**What's wrong:** "Deferred" is not a state the code can see. A future agent (or
a tired human) following the dashboard's live copy ships a crowdfund flow that
the business has legally deferred — the exact failure mode the deferral exists
to prevent (unregistered-securities risk per the `/crowdfund` notice).

**Impact:** The most legally sensitive items on the deferred list (crowdfunding,
stored credits, NFT-gated access) are one UI section away from being
re-enabled. DOC-003 is the symptom; the missing quarantine is the cause.

**Suggested fix:** Quarantine by construction: (a) short term — remove or
deferral-gate the dashboard campaign section (DOC-003's fix); (b) structural —
a single `lib/features.ts` feature-flag registry (`CROWDFUND_ENABLED=false`,
etc.) consulted by pages/routes/contracts-export, so "deferred" is a boolean
in code, not a paragraph in AGENTS.md. The copy-honesty test
(`copy-honesty.test.ts`) is the right enforcement precedent — extend the
pattern from copy to features.

**Suggested fix status:** (a) is PRE-APPROVED-adjacent (user-visible behavior
change — NEEDS-OWNER); (b) is a NEEDS-OWNER design decision (see Q-004).

**Related:** MAP-009; DOC-003; `apps/frontend/lib/copy-honesty.test.ts`
(enforcement precedent).
