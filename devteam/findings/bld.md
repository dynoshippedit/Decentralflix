# Findings — Build & Release Engineer (BLD)
Scope: install/build/run/test/lint/typecheck, dependencies, env config, repo hygiene, secret scan, smoke run · ID range: BLD-001…BLD-012
Owner: BLD · Last updated: 2026-09-29

## Coverage completed
- `RUN.md`, `scripts/run.sh`, `scripts/stop.sh` — read fully
- `package.json` (root), `apps/frontend/package.json`, `packages/contracts/package.json`, `packages/storage/package.json` — read fully
- `packages/contracts/hardhat.config.ts` — read (solidity 0.8.28, evm cancun)
- `.env.example` — read fully; env sweep over all tracked sources
- Baseline commands executed with real outputs (see devteam/BASELINE.md):
  `npx hardhat test`, `npm test` (storage), `npx vitest run`, `bash test.sh`,
  `npx tsc --noEmit`, `npx eslint`, `npx hardhat compile --force`,
  `npx next build`, `npm audit`, `pnpm audit`, B6 secret scans incl. `git log -p -S`
- Smoke: ports :3000/:8080 occupied by other processes (not started by BLD) — did not start/stop; verified the running services respond

## Findings

### BLD-001 · next@16.2.6 pinned with two CRITICAL RCE advisories, fix available
**S1 · Confirmed · NEW · Effort XS · Lens BLD · Found by BLD in Phase 1 on 2026-09-29**

**Location:** `apps/frontend/package.json:16` (`"next": "16.2.6"` — exact pin)

**Evidence:**
```
"next": "16.2.6",
```
`npm audit` in apps/frontend: `{'info': 0, 'low': 0, 'moderate': 1, 'high': 0, 'critical': 1, 'total': 2}`.
`pnpm audit` at root: 117 total — 7 low | 55 moderate | 53 high | **2 critical**.
Both criticals are this package:
- GHSA-p293-qw3h-jv36 — "Next.js: Unauthenticated Remote Code Execution on windows-hosted servers", range >=16.0.0 <16.3.3, patched >=16.3.3
- GHSA-2xp9-vwfh-vxw4 — "Next.js: Unauthenticated Remote Code Execution in Image Optimization API when AVIF files are used", same range

**What's wrong:** The frontend pins a Next.js version with known unauthenticated-RCE
advisories; the patch line (>=16.3.3, npm suggests 16.3.6) exists. The exact pin
prevents even patch uptake.
**Impact:** The Windows vector does not apply to the Threadripper (Nobara Linux),
and there is no production deploy in this run, so exploitability today is low —
hence S1 not S0. But this is the public-facing marketing/service frontend; if it
is ever exposed beyond localhost, the AVIF image-optimization RCE is the live
vector. 9 further high/moderate `next` advisories (<16.2.11 range) also apply.
**Reproduce / reasoning:** `cd apps/frontend && npm audit --json` (2026-09-29, exit 0,
network to registry available). Finding `version: "16.2.6"`, paths `apps__frontend>next`.
**Other instances (sibling search):** none — `next` is a single direct dep; transitive
highs (e.g. `undici <6.27.0` via hardhat, GHSA-35p6-xmwp-9g52; `hono` via wagmi/privy)
are recorded in notes/dependencies.md for transitive triage.
**Suggested fix:** Bump `next` to `16.3.6` (npm's suggested fix; minor, not major)
in `apps/frontend/package.json`, regenerate `apps/frontend/package-lock.json`,
re-run vitest + `next build`. Pre-approved (pinning dependency versions, no major upgrade).
**Related:** notes/dependencies.md
**Verification (Phase 4):** —
**Resolution (Phase 5):** —
**Fix review:** —

### BLD-002 · `npx eslint` (the repo's `lint` script) fails: 105 errors, 67 warnings, exit 1
**S2 · Confirmed · NEW · Effort M · Lens BLD · Found by BLD in Phase 1 on 2026-09-29**

**Location:** `apps/frontend/` (40 files with problems; worst: `lib/contracts/useSeederCredits.ts`)

**Evidence:**
```
✖ 172 problems (105 errors, 67 warnings)
  2 errors and 1 warning potentially fixable with the `--fix` option.
ESLINT_REAL_EXIT=1
```
Rule counts: `@typescript-eslint/no-explicit-any` 58 · `@typescript-eslint/no-unused-vars` 52 ·
`react/no-unescaped-entities` 25 · `react-hooks/exhaustive-deps` 13 ·
`react-hooks/set-state-in-effect` 12 · `@next/next` 6 · `react-hooks/purity` 2 · `react-hooks/static-components` 1.
Example error instance:
```
apps/frontend/lib/contracts/useSeederCredits.ts
    225:34  error    Unexpected any. Specify a different type    @typescript-eslint/no-explicit-any
    296:5   error    Error: Calling setState synchronously within an effect can trigger cascading renders
                                                                    react-hooks/set-state-in-effect
```

**What's wrong:** The lint gate the repo's own scripts define (`npm run lint` →
`cd apps/frontend && npx eslint`) is red: 105 errors including 12
`set-state-in-effect` (real cascading-render bug class) and 58 `no-explicit-any`.
**Impact:** Noisy signal — real issues hide in the noise; CI (if added) cannot
gate on lint; the `any` errors weaken the typecheck story (tsc passes, but 58
escape hatches exist). Not a build blocker (S2, not S1).
**Reproduce / reasoning:** `cd apps/frontend && npx eslint` (2026-09-29);
full output saved at `/tmp/eslint-full.txt` on the agent VM during the run.
Note: an earlier piped invocation (`| tail -30`) masked the exit code via
`$?` on `tail`; re-ran unpiped to get the true exit 1.
**Other instances (sibling search):** 40 files listed in notes; per-file list
extractable from the saved output. No eslint config issues — flat config resolves.
**Suggested fix:** Triage in Phase 5: fix `set-state-in-effect` (12) and
`no-explicit-any` (58) as S2 batch; downgrade or fix the rest. Do not mass-
`eslint-disable` to get green.
**Related:** —
**Verification (Phase 4):** —
**Resolution (Phase 5):** —
**Fix review:** —

### BLD-003 · Root `package-lock.json` belongs to a different project ("next-base")
**S3 · Confirmed · NEW · Effort XS · Lens BLD · Found by BLD in Phase 1 on 2026-09-29**

**Location:** `package-lock.json:1-8` (repo root)

**Evidence:**
```json
{
 "name": "next-base",
 "version": "0.1.0",
 "dependencies": {
  "next": "16.2.6",
```
Root `package.json` is `"name": "decentralflix"` with **no dependencies** — this
lockfile describes a different tree (the pre-rename Next.js boilerplate).

**What's wrong:** A stale, foreign lockfile sits at the repo root. Anyone running
`npm ci`/`npm install` at root gets the wrong dependency tree silently.
**Impact:** Confusion and wrong installs; also masks the fact that the root has
no npm-managed tree at all (root node_modules is a pnpm store). Low blast radius
today (nothing at root imports it) — S3 hygiene.
**Reproduce / reasoning:** `python3 -c` reading `package-lock.json` `packages[""]`
(2026-09-29). Name/version mismatch vs root `package.json` is unambiguous.
**Other instances (sibling search):** `apps/frontend/package-lock.json` is fine
(in sync); this is the only foreign lockfile.
**Suggested fix:** Delete `package-lock.json` at root (NEEDS APPROVAL — file
deletion). Alternative: regenerate if root ever gains npm-managed deps.
**Related:** BLD-005
**Verification (Phase 4):** —
**Resolution (Phase 5):** —
**Fix review:** —

### BLD-004 · `pnpm-lock.yaml` is stale: ethers specifier drifted
**S2 · Confirmed · NEW · Effort XS · Lens BLD · Found by BLD in Phase 1 on 2026-09-29**

**Location:** `pnpm-lock.yaml:111-113` vs `apps/frontend/package.json`

**Evidence:**
```yaml
      ethers:
        specifier: ^6.4.0
        version: 6.16.0(bufferutil@4.1.0)(utf-8-validate@5.0.10)
```
but `apps/frontend/package.json` declares `"ethers": "^6.17.0"`. The actually
installed frontend tree (`apps/frontend/node_modules/ethers`) is 6.17.0 — the
lockfile does not describe the installed tree.

**What's wrong:** `package.json` was bumped without regenerating `pnpm-lock.yaml`;
`pnpm install --frozen-lockfile` would fail, and the lockfile promises 6.16.0
while 6.17.0 is installed.
**Impact:** Non-reproducible pnpm installs at root; anyone trusting the pnpm
lockfile gets a different ethers than the working tree. S2 (install
reproducibility is a BLD core guarantee).
**Reproduce / reasoning:** specifier-by-specifier comparison script over all
frontend + contracts deps vs `pnpm-lock.yaml` (2026-09-29); only ethers mismatched.
**Other instances (sibling search):** no other specifier drift found in the
frontend or contracts importers.
**Suggested fix:** `pnpm install --lockfile-only` at root to regenerate (Phase 5,
after deciding the canonical manager — see BLD-005). Pre-approved (lockfile sync).
**Related:** BLD-005, notes/dependencies.md
**Verification (Phase 4):** —
**Resolution (Phase 5):** —
**Fix review:** —

### BLD-005 · Mixed package managers: pnpm workspace at root, npm trees in packages
**S2 · Confirmed · NEW · Effort S · Lens BLD · Found by BLD in Phase 1 on 2026-09-29**

**Location:** repo root + `apps/frontend/` + `packages/contracts/` (install layout)

**Evidence:**
- Root `node_modules/.pnpm/` exists (pnpm virtual store) — pnpm was run at root.
- `apps/frontend/node_modules/` is a plain npm layout (39 entries, ethers 6.17.0).
- `packages/contracts/node_modules/` is a plain npm layout (52 entries, no `.pnpm`).
- `pnpm-workspace.yaml` claims `apps/*` + `packages/*`; RUN.md says
  "(unverified) pnpm install at root + apps/frontend + packages/contracts".
- Three lockfiles cover overlapping trees: root `package-lock.json` (foreign,
  BLD-003), `apps/frontend/package-lock.json` (npm), `pnpm-lock.yaml` (pnpm).

**What's wrong:** There is no single canonical install path. Following RUN.md
with pnpm does not reproduce the npm-built trees that the test runs used.
**Impact:** "Works on my machine" risk; lockfile drift (BLD-004) is a symptom.
A fresh contributor cannot know which manager to trust. S2 — installs work today
(all suites ran against the existing trees), but reproducibility is compromised.
**Reproduce / reasoning:** directory layout inspection + `ls node_modules/.pnpm`
(2026-09-29).
**Other instances (sibling search):** `packages/storage` (zero deps) and
`apps/lifeboat` (no package.json, stdlib only) are unaffected.
**Suggested fix:** Owner decision: pick ONE manager. Recommended default: npm
throughout (both real trees are npm-built; pnpm workspace adds nothing here),
delete `pnpm-lock.yaml` + `pnpm-workspace.yaml` + foreign root `package-lock.json`
(NEEDS APPROVAL — file deletions), keep the in-sync `apps/frontend/package-lock.json`,
add `packages/contracts/package-lock.json`. → Q for owner.
**Related:** BLD-003, BLD-004, notes/dependencies.md
**Verification (Phase 4):** —
**Resolution (Phase 5):** —
**Fix review:** —

### BLD-006 · Security-relevant env vars are read but undocumented
**S1 · Confirmed · NEW · Effort XS · Lens BLD · Found by BLD in Phase 1 on 2026-09-29**

**Location:** `.env.example` (missing entries) vs reads listed below

**Evidence:**
```js
// apps/lifeboat/lib/stripe.js:18
return Boolean(process.env.STRIPE_SECRET_KEY);
// apps/lifeboat/server.js:753
const secret = process.env.STRIPE_WEBHOOK_SECRET;
// apps/lifeboat/lib/cdn.js:96
this.apiKey = process.env.BUNNY_API_KEY;
// packages/contracts/scripts/deploy-testnet.js:40
if (isLive && !process.env.DEPLOYER_PRIVATE_KEY) {
// packages/contracts/hardhat.config.ts:30
arbitrumSepolia: process.env.ARBISCAN_API_KEY || "",
```
None of `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `BUNNY_API_KEY`,
`DEPLOYER_PRIVATE_KEY`, `ARBISCAN_API_KEY` appears in `.env.example`.

**What's wrong:** Per Playbook B4 Pass 6, a security-relevant variable that is
read but undocumented is high severity. An operator has no template telling
them these exist, their format, or that they must never be committed.
**Impact:** Misconfiguration (stripe/bunny silently stay in stub/local mode —
fail-closed, so low exploitability) and secret-hygiene risk (no documented
home for the values invites ad-hoc handling). S1 per the Playbook rule, tempered
by fail-closed defaults.
**Reproduce / reasoning:** env sweep over tracked sources vs `.env.example`
(2026-09-29); full table in notes/env-inventory.md.
**Other instances (sibling search):** all five listed above; additionally
`PRIVATE_KEY` vs `DEPLOYER_PRIVATE_KEY` naming split — `.env.example` documents
`PRIVATE_KEY` (used only at hardhat.config.ts:14) while the live deploy script
requires `DEPLOYER_PRIVATE_KEY`. An operator following the template sets the
wrong variable and the script refuses to broadcast (fail-closed but confusing).
**Suggested fix:** Document all five in `.env.example` with format hints and
"never commit" markers; unify the deploy key variable name (recommend
`DEPLOYER_PRIVATE_KEY` everywhere, update hardhat.config.ts:14). Pre-approved
(docs/config documentation).
**Related:** notes/env-inventory.md
**Verification (Phase 4):** —
**Resolution (Phase 5):** —
**Fix review:** —

### BLD-007 · `R2_BUCKET_NAME` / `R2_ACCOUNT_ID` documented but never read
**S3 · Confirmed · NEW · Effort XS · Lens BLD · Found by BLD in Phase 1 on 2026-09-29**

**Location:** `.env.example` ("Livepeer + R2 (T04 upload pipeline)" section)

**Evidence:** `grep -rn 'R2_BUCKET_NAME\|R2_ACCOUNT_ID'` over tracked sources
(excluding node_modules/build output) returns zero reads.

**What's wrong:** The template documents variables the code never reads —
stale config surface from an unfinished/planned R2 integration.
**Impact:** Operator confusion; suggests an R2 integration that does not exist
(mild docs-mislead). S3.
**Reproduce / reasoning:** grep sweep 2026-09-29.
**Other instances (sibling search):** none other; all other documented vars are read.
**Suggested fix:** Remove the two lines from `.env.example` or mark them
`# Planned — not read by any code yet`. Pre-approved (docs fix).
**Related:** notes/env-inventory.md
**Verification (Phase 4):** —
**Resolution (Phase 5):** —
**Fix review:** —

### BLD-008 · `wagmi` declared in apps/frontend but imported by zero files
**S3 · Confirmed · NEW · Effort XS · Lens BLD · Found by BLD in Phase 1 on 2026-09-29**

**Location:** `apps/frontend/package.json` (`"wagmi": "^3.6.15"`)

**Evidence:** Import sweep over tracked `apps/frontend` sources:
`viem` 13 files · `@privy-io/react-auth` 12 · `arweave` 2 · `@livepeer/react` 1 ·
`wagmi` **0 files**.

**What's wrong:** Declared-but-unused dependency: install bloat, audit surface,
and a second wagmi tree alongside the one `@privy-io/react-auth` pulls
transitively.
**Impact:** Larger installs, extra audit noise (the `hono` advisory chain runs
through wagmi). Possible it is an intended peer for future use — verify before
removing. S3.
**Reproduce / reasoning:** grep import sweep 2026-09-29.
**Other instances (sibling search):** none other unused among direct deps.
**Suggested fix:** If no planned use, `npm uninstall wagmi` in apps/frontend
(pre-approved? removal of a dependency — treat as NEEDS APPROVAL per "major
dependency changes"; log question). Default: keep until owner confirms.
**Related:** notes/dependencies.md
**Verification (Phase 4):** —
**Resolution (Phase 5):** —
**Fix review:** —

### BLD-009 · `hardhat-gas-reporter` / `solidity-coverage` declared but never configured
**S3 · Confirmed · NEW · Effort XS · Lens BLD · Found by BLD in Phase 1 on 2026-09-29**

**Location:** `packages/contracts/package.json` (devDependencies) vs
`packages/contracts/hardhat.config.ts`

**Evidence:** `grep -n 'gasReporter\|coverage' packages/contracts/hardhat.config.ts`
returns nothing. The gas reporter only activates with a `gasReporter` config
section; `solidity-coverage` only runs via explicit invocation.

**What's wrong:** Two dev dependencies are installed but do nothing — dead weight
in install time and audit surface, and their absence from config suggests the
gas/coverage reporting they were added for never happened.
**Impact:** Minor bloat; missed observability (no gas reports on the payout
contracts, which MUS cares about). S3.
**Reproduce / reasoning:** config grep 2026-
...[truncated 2087 chars]
