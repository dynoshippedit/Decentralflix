# Findings tail — BLD-009…BLD-012 (reconstructed)

**Provenance (do not edit — Lead owns the merge):** `devteam/findings/bld.md` was
truncated mid-entry at BLD-009 ("Reproduce / reasoning: config grep 2026-");
BLD-010, BLD-011, BLD-012 were missing entirely. These four entries were
re-derived 2026-09-28 by BLD (recovery) from the intact working notes
(`devteam/notes/dependencies.md`, `devteam/notes/env-inventory.md`,
`devteam/BASELINE.md`, journal `## 2026-09-29 02:15 · BLD`) and re-verified
against the repo (read-only) before writing. Severity budget matches the Phase 1
journal: S1×2, S2×3, S3×6, S4×1. The Lead owns the splice into `bld.md`.

---

### BLD-009 · `hardhat-gas-reporter` / `solidity-coverage` declared but never configured
**S3 · Confirmed · NEW · Effort XS · Lens BLD · Found by BLD in Phase 1 on 2026-09-29**

**Location:** `packages/contracts/package.json` (devDependencies) vs
`packages/contracts/hardhat.config.ts`

**Evidence:**
```
packages/contracts/package.json:28:    "hardhat-gas-reporter": "^1.0.8",
packages/contracts/package.json:29:    "solidity-coverage": "^0.8.0",
```
`grep -n 'gasReporter\|coverage' packages/contracts/hardhat.config.ts` returns
nothing. The gas reporter only activates with a `gasReporter` config section;
`solidity-coverage` only runs via explicit invocation. The contracts
`package.json` scripts are `test` / `compile` / `export:abi` — no coverage
invocation.

**What's wrong:** Two dev dependencies are installed but do nothing — dead weight
in install time and audit surface, and their absence from config suggests the
gas/coverage reporting they were added for never happened.
**Impact:** Minor bloat; missed observability (no gas reports on the payout
contracts, which MUS cares about). S3.
**Reproduce / reasoning:** config grep 2026-09-29: `grep -n
"hardhat-gas-reporter\|solidity-coverage" packages/contracts/package.json` →
lines 28–29 (devDependencies); `grep -n "gasReporter\|coverage"
packages/contracts/hardhat.config.ts` → no matches; scripts inspected — no
coverage invocation. Dormancy conclusion recorded in notes/dependencies.md
("declared, never configured — they do nothing").
**Other instances (sibling search):** none other among contracts devDeps — the
remaining devDeps are exercised by hardhat.config.ts or the test/compile scripts.
**Suggested fix:** Either (a) make them real: add a `gasReporter` section to
`hardhat.config.ts` and a `coverage` script (config-only change, pre-approved);
or (b) `npm uninstall hardhat-gas-reporter solidity-coverage` — NEEDS APPROVAL
(dependency removal). Default: (a).
**Related:** notes/dependencies.md
**Verification (Phase 4):** —
**Resolution (Phase 5):** —
**Fix review:** —

### BLD-010 · Six `NEXT_PUBLIC_*_ADDRESS` contract-address vars read but undocumented
**S3 · Confirmed · NEW · Effort XS · Lens BLD · Found by BLD in Phase 1 on 2026-09-29**

**Location:** `apps/frontend/lib/contracts/config.ts:16-17,24-27` vs
`.env.example:26-27`

**Evidence:** Eight contract-address env vars are read with a zero-address
fallback:
```
config.ts:14  NEXT_PUBLIC_MOVIE_TICKET_ADDRESS          ← documented (.env.example:26)
config.ts:15  NEXT_PUBLIC_REVIEWS_ADDRESS               ← documented (.env.example:27)
config.ts:16  NEXT_PUBLIC_SEEDER_CREDITS_ADDRESS        ← NOT documented
config.ts:17  NEXT_PUBLIC_FILMMAKER_CAMPAIGN_ADDRESS    ← NOT documented
config.ts:24  NEXT_PUBLIC_TICKET_NFT_ADDRESS            ← NOT documented
config.ts:25  NEXT_PUBLIC_SUBSCRIPTION_MANAGER_ADDRESS  ← NOT documented
config.ts:26  NEXT_PUBLIC_PAY_PER_VIEW_ADDRESS          ← NOT documented
config.ts:27  NEXT_PUBLIC_DFLIX_ADDRESS                 ← NOT documented
```

**What's wrong:** Six of the eight contract-address env vars the frontend reads
have no entry in `.env.example`. An operator deploying contracts has no template
telling them these must be set.
**Impact:** Low risk (not secrets; the zero-address fallback is fail-closed —
the frontend just points at `0x0…0`), but the post-deploy wiring step is
undiscoverable from the repo's own template. S3.
**Reproduce / reasoning:** env sweep over tracked sources vs `.env.example`
(2026-09-29); full table in notes/env-inventory.md (observation 4 — the only
env-inventory observation that carried no BLD number).
**Other instances (sibling search):** the six above are the complete set of
undocumented address vars. `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`
(PrivyProvider.tsx:56) is also read-but-undocumented — an optional var of lower
consequence, not elevated to its own finding.
**Suggested fix:** Add the six vars to `.env.example` with `0x…` placeholders
and "set after deploy" comments. Pre-approved (docs fix).
**Related:** notes/env-inventory.md, BLD-006
**Verification (Phase 4):** —
**Resolution (Phase 5):** —
**Fix review:** —

### BLD-011 · `packages/contracts/node_modules/.package-lock.json` is tracked in git
**S3 · Confirmed · NEW · Effort XS · Lens BLD · Found by BLD in Phase 1 on 2026-09-29**

**Location:** `packages/contracts/node_modules/.package-lock.json` (tracked)

**Evidence:** `git ls-files | grep package-lock` →
```
apps/frontend/package-lock.json
package-lock.json
packages/contracts/node_modules/.package-lock.json
```
`.gitignore:4` contains `/node_modules` — the file is tracked anyway
(force-added, or committed before the rule).

**What's wrong:** npm's internal install metadata — a node_modules
implementation detail, rewritten on every `npm install` — is committed to the
repo. It is not a real lockfile: it describes installed artifacts, not the
declared tree.
**Impact:** Spurious diff churn on every contracts install; confusion about
which file is the canonical contracts lock (there isn't one — see BLD-005).
No functional impact. S3 hygiene.
**Reproduce / reasoning:** `git ls-files | grep -E "package-lock"` (2026-09-29)
vs `.gitignore`.
**Other instances (sibling search):** no other node_modules paths are tracked —
this is the only one.
**Suggested fix:** `git rm --cached packages/contracts/node_modules/.package-lock.json`
(NEEDS APPROVAL — tracked-file removal). Confirm `.gitignore` keeps it ignored
afterward.
**Related:** BLD-003, BLD-005, notes/dependencies.md
**Verification (Phase 4):** —
**Resolution (Phase 5):** —
**Fix review:** —

### BLD-012 · No `engines` pin in root / apps/frontend / packages/contracts
**S4 · Confirmed · NEW · Effort XS · Lens BLD · Found by BLD in Phase 1 on 2026-09-29**

**Location:** `package.json`, `apps/frontend/package.json`,
`packages/contracts/package.json` (no `engines` field)

**Evidence:** `grep -n '"engines"'` over the four package.jsons — only
`packages/storage/package.json:10` declares it:
```json
"engines": {
  "node": ">=18"
}
```
Runtime verified 2026-09-29: node v22.23.2, npm 10.9.8, pnpm 11.1.2. No `.nvmrc`
is tracked.

**What's wrong:** Three of four manifests declare no minimum Node version (and
there is no `.nvmrc`), so a contributor on an old Node gets cryptic
native-module/build failures instead of a clean "wrong Node" error at install.
**Impact:** Developer-experience papercut only; no functional impact on the
verified tree. S4.
**Reproduce / reasoning:** manifest grep 2026-09-29; `node -v` = v22.23.2.
**Other instances (sibling search):** packages/storage already declares
`engines: node >=18` — the repo has the convention, just not applied everywhere.
**Suggested fix:** Add `"engines": { "node": ">=22" }` (matching the verified
runtime) to the three manifests; optionally add `.nvmrc` with `22`. Pre-approved
(metadata-only).
**Related:** notes/dependencies.md
**Verification (Phase 4):** —
**Resolution (Phase 5):** —
**Fix review:** —
