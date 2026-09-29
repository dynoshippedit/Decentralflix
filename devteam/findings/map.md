# Findings — Cartographer (MAP)
Scope: whole repo (Pass 1 orientation + Pass 2 risk ranking; structure/hygiene only — no code-quality judgments) · ID range: MAP-001…MAP-010
## Coverage completed
- `git ls-files` enumerated: 6,645 tracked files; 6,371 excluded as dependency/build output (see MAP.md §11); 262 source files tiered in COVERAGE.md (H=70, M=102, L=90; 1,001 required lens cells).
- Entry points verified by reading: `scripts/run.sh`, `scripts/stop.sh`, `apps/lifeboat/server.js` (route dispatch `handleApi` at line 1098), `apps/frontend/package.json`, `packages/contracts/hardhat.config.ts`, `RUN.md`.
- Module map built from import/require grep + file reads; data stores from `apps/lifeboat/lib/store.js:1-60`; external services from mention sweep + env grep.

### MAP-001 · Tracked node_modules: 6,172 dependency files committed under packages/contracts/node_modules/
**S3 · Confirmed · NEW · Effort M · Lens ARC · Found by MAP in Phase 1 on 2026-09-29**

**Location:** `packages/contracts/node_modules/` (6,172 tracked files)

**Evidence:**
```
$ git ls-files -s | grep node_modules | head -3
100644 c83ac070798fc3b8418e88dc3f8d5394837f61d6 0  packages/contracts/node_modules/.bin/esbuild
100755 ea7ef17c1c04c6c61dea6c07eb9aaa598eefd1f9 0  packages/contracts/node_modules/.bin/hardhat
```
(Real blob entries — not submodules.)

**What's wrong:** Dependency trees are committed to git. Intended behavior: `node_modules/` is install output, gitignored like the root `.gitignore` already does for `/node_modules`.
**Impact:** Repo is ~25× larger than its source (6,645 tracked vs 274 source files); every clone/fetch pays for it; dependency diffs pollute code review; stale committed deps can silently diverge from the lockfile.
**Reproduce / reasoning:** `git ls-files | grep -c node_modules` → 6172 on a clean checkout of `devteam/review-2026-09-29`.
**Other instances (sibling search):** `apps/frontend/node_modules` is NOT tracked (properly ignored); only `packages/contracts/node_modules` is affected.
**Suggested fix:** `git rm -r --cached packages/contracts/node_modules`, add to `.gitignore`, commit. NEEDS-OWNER only if the owner relies on the committed tree (unlikely).
**Related:** MAP-002, MAP-006

### MAP-002 · Hardhat build output tracked in git (artifacts/ + cache/ + typechain-types/, 199 files)
**S3 · Confirmed · NEW · Effort S · Lens ARC · Found by MAP in Phase 1 on 2026-09-29**

**Location:** `packages/contracts/artifacts/` (90), `packages/contracts/cache/` (1), `packages/contracts/typechain-types/` (108)

**Evidence:**
```
$ git ls-files | grep -E "contracts/(artifacts|cache|typechain-types)/" | wc -l
199
```
Matches Playbook B3 lead L5.

**What's wrong:** Compiler output is committed. Intended: generated on `npx hardhat compile`.
**Impact:** Merge conflicts on generated files; stale artifacts can mask compile failures; repo bloat.
**Reproduce / reasoning:** command above on clean checkout.
**Other instances:** `.next/` is properly ignored; `apps/frontend/tsconfig.tsbuildinfo` exists on disk but is not tracked.
**Suggested fix:** `git rm -r --cached` the three dirs, add to `.gitignore`. (Note: `abis.generated.ts` in the frontend is also generated but IS load-bearing for the frontend build — keep, but document regeneration.)
**Related:** MAP-001

### MAP-003 · Root public/ duplicates apps/frontend/public/ (identical svg set)
**S4 · Confirmed · NEW · Effort XS · Lens ARC · Found by MAP in Phase 1 on 2026-09-29**

**Location:** `public/` (root) vs `apps/frontend/public/`

**Evidence:** both dirs list exactly `file.svg, globe.svg, next.svg, vercel.svg, window.svg`; root copy is a stale leftover (Next.js serves from `apps/frontend/public`).

**What's wrong:** Two copies of the same static assets; edits to one won't reach the served site.
**Impact:** negligible today (default Next.js placeholder svgs); confusion for future asset work.
**Suggested fix:** delete root `public/` (NEEDS-OWNER: file deletion).

### MAP-004 · ed25519.js vendored twice, byte-identical (lib/ and public/)
**S3 · Confirmed · NEW · Effort S · Lens ARC · Found by MAP in Phase 1 on 2026-09-29**

**Location:** `apps/lifeboat/lib/ed25519.js` and `apps/lifeboat/public/ed25519.js`

**Evidence:**
```
lib/ed25519.js bytes: 8011 | public/ed25519.js bytes: 8011 | identical: True
```
Header: "Pure-JavaScript Ed25519 signature verification (RFC 8032). … Runs in Node AND in the browser (UMD…)".

**What's wrong:** The browser copy is a manual duplicate of the Node lib file with no shared source; a fix to one won't reach the other.
**Impact:** signature-verification drift between server and browser receipt verification (correctness risk in crown-jewel receipt flow).
**Suggested fix:** single source + build/copy step, or a comment in both files pointing at the canonical one. Receipt verification correctness is SEC/W3B's lane; this entry is the structural duplicate.

### MAP-005 · Twin static prototypes at root: .html and Html
**S4 · Confirmed · NEW · Effort XS · Lens ARC · Found by MAP in Phase 1 on 2026-09-29**

**Location:** `.html` (3,313 bytes), `Html` (4,321 bytes) at repo root

**Evidence:** both are standalone "Decentralflix | Web3 Streaming" landing-page prototypes; the Next.js frontend supersedes them.

**What's wrong:** dead prototypes in the repo root confuse "where is the frontend?".
**Impact:** none functional; onboarding confusion.
**Suggested fix:** delete (NEEDS-OWNER: file deletion) or move to an archive note.

### MAP-006 · Two package managers' lockfiles committed (pnpm-lock.yaml + package-lock.json ×2)
**S3 · Confirmed · NEW · Effort S · Lens BLD · Found by MAP in Phase 1 on 2026-09-29**

**Location:** `pnpm-lock.yaml` (15,390 lines), `package-lock.json` (6,641 lines), `apps/frontend/package-lock.json` (1,313 lines)

**What's wrong:** The repo declares pnpm workspaces (`pnpm-workspace.yaml`) yet carries npm lockfiles at root and in the frontend — two sources of truth for dependency versions.
**Impact:** `npm ci` and `pnpm install` can resolve different trees; "works on my machine" install divergence.
**Reproduce / reasoning:** files present on clean checkout; `apps/frontend/package.json` has no `packageManager` pin observed.
**Suggested fix:** BLD to diff the resolved trees; then keep one manager's lockfile and ignore the other (NEEDS-OWNER: which manager).

### MAP-007 · Scratch files tracked: live-build-status.log (66 KB), marker.md (24 KB)
**S4 · Confirmed · NEW · Effort XS · Lens ARC · Found by MAP in Phase 1 on 2026-09-29**

**Location:** `live-build-status.log`, `marker.md` (repo root)

**Evidence:** `live-build-status.log` opens with "=== DECENTRALFLIX AUTONOMOUS BUILD - LIVE STATUS ===" (2026-05-29); `marker.md` opens with "# marker.md — My Personal Scratchpad & Issue Tracker".

**What's wrong:** build logs and a personal scratchpad are committed; they grow unboundedly and pollute history.
**Impact:** repo noise only.
**Suggested fix:** gitignore `*.log` at root (root `.gitignore` doesn't cover it; `apps/lifeboat/.gitignore` does) and decide whether `marker.md` belongs in the repo.

### MAP-008 · autonomy.md instructs AI agents into "silent execution mode"
**S4 · Confirmed · NEW · Effort XS · Lens ARC · Found by MAP in Phase 1 on 2026-09-29**

**Location:** `autonomy.md` (repo root, 1,719 bytes)

**Evidence:** "RESUME DIRECTIVE (user, explicit, repeated): When you see the word 'resume' … Immediately enter pure silent execution mode. Do not output any chat messages, questions, status reports, or requests to the user."

**What's wrong:** A standing instruction file that tells any AI reader to suppress communication. In a public repo this also reads as an instruction to third-party agents.
**Impact:** process/confusion risk, not a code defect. Flagging so the Lead decides whether it stays, gets scoped, or moves out of the repo.
**Suggested fix:** Lead decision (DOC/owner).

### MAP-009 · Crowdfunding code is live while crowdfunding is a deferred business item
**S3 · Likely · NEW · Effort S · Lens DOC · Found by MAP in Phase 1 on 2026-09-29**

**Location:** `packages/contracts/contracts/FilmmakerCampaign.sol` (377 lines), `apps/frontend/app/crowdfund/page.tsx` (37 lines)

**What's wrong:** Per owner decisions (Update-20, GROK.md 2026-09-28) crowdfunding is deferred, yet the campaign contract and a `/crowdfund` page exist in the tree.
**Impact:** if any UI/docs present crowdfunding as available, that's a honesty gap (B3 L2 — DOC claims audit owns the verdict).
**Reproduce / reasoning:** files exist on clean checkout; assumption needing DOC verification: whether user-facing copy implies it's live.
**Suggested fix:** DOC to rule in the claims audit; likely outcome is labeling/removal, not a code fix here.

### MAP-010 · packages/storage is tested but unwired (no importers outside its tests)
**S3 · Confirmed · NEW · Effort M · Lens ARC · Found by MAP in Phase 1 on 2026-09-29**

**Location:** `packages/storage/` (20 files)

**Evidence:** grep for `encrypt.js` / storage imports across all source (excluding node_modules, devteam, build output) returns hits only in `packages/storage/src/index.js`, `packages/storage/src/store.js`, and `packages/storage/test/*`. The lifeboat serves masters via `lib/cdn.js`; the frontend upload path uses `useArweaveUpload`/`useFilecoinLivepeerIngest` hooks, not the storage package.

**What's wrong:** A 93-test, security-relevant module (AES-256-GCM fragment encryption — crown jewel 1's encryption half) has no callers; the running system protects paid content only via server-side entitlement checks.
**Impact:** architectural drift — two content-protection stories (encrypted fragments vs entitlement-gated raw masters); future work may build on the wrong one.
**Suggested fix:** ARC to decide: wire it, or explicitly mark it as a future/standalone module in ARCHITECTURE.md. See MAP.md §1 refinement to B3 CJ1.
