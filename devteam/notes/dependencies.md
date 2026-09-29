# Dependencies — Decentralflix
Owner: BLD · Last updated: 2026-09-29

## Manifests and lockfiles (what exists)

| File | Tracked? | State |
|---|---|---|
| `package.json` (root, orchestrator only, no deps) | yes | ok |
| `apps/frontend/package.json` | yes | ok |
| `apps/frontend/package-lock.json` (npm) | yes | **in sync** with package.json (all specifiers match) |
| `packages/contracts/package.json` | yes | ok (no contracts lockfile) |
| `packages/contracts/node_modules/.package-lock.json` | **yes — should not be** | npm internal artifact committed (→ BLD-011) |
| `packages/storage/package.json` | yes | zero deps, `engines: node >=18` |
| `pnpm-lock.yaml` (workspace) | yes | **STALE**: `ethers` specifier `^6.4.0` vs `apps/frontend/package.json` `^6.17.0` (→ BLD-004) |
| `pnpm-workspace.yaml` | yes | `apps/*`, `packages/*`; allowBuilds prompts for native pkgs |
| `package-lock.json` (root) | yes | **STALE/FOREIGN**: root entry is `"name": "next-base", "version": "0.1.0"` — belongs to a different project, not `decentralflix` (→ BLD-003) |

**Mixed package managers in practice (→ BLD-005):**
- Root `node_modules/` is a pnpm virtual store (`.pnpm/` present) — `pnpm install` was run at root.
- `apps/frontend/node_modules/` (39 entries, plain npm layout, ethers 6.17.0) — `npm install` was run in the frontend.
- `packages/contracts/node_modules/` (52 entries, plain npm layout, no `.pnpm`) — `npm install` was run in contracts.
- `packages/storage/` has no node_modules (zero deps; tests run on stdlib).
- `apps/lifeboat/` has no package.json at all (stdlib only; nothing to install).
- RUN.md says "pnpm install at root + apps/frontend + packages/contracts" — the
  pnpm half is unverified and the npm half is what actually produced the working
  trees. Two competing lockfiles (`package-lock.json` ×2 + `pnpm-lock.yaml`)
  describe overlapping trees.

## Install (baseline)

No installs were run in this phase: `node_modules` already existed at root,
`apps/frontend`, and `packages/contracts` (verified present; task instruction).
`packages/storage` and `apps/lifeboat` need no install (zero dependencies).

## Audit results

- `npm audit` in `apps/frontend` (lockfile in sync): **1 critical, 1 moderate,
  0 high, 0 low**. Critical = `next@16.2.6` (pinned exact):
  - GHSA-p293-qw3h-jv36 — unauthenticated RCE on **Windows-hosted** servers
    (range >=16.0.0 <16.3.3; our server is Nobara Linux, so this vector does
    not apply here, but the pin is still behind the patch).
  - GHSA-2xp9-vwfh-vxw4 — unauthenticated RCE in the Image Optimization API
    when AVIF files are used (same range).
  - Fix suggested by npm: `next@16.3.6` (patched >=16.3.3). Also 9 more
    high/moderate `next` advisories in the <16.2.11 range. → BLD-001 (S1)
- `pnpm audit` at root (workspace, reads pnpm-lock.yaml): **117 total —
  2 critical, 53 high, 55 moderate, 7 low**. The 2 criticals are the same
  `next@16.2.6` advisories above (via `apps__frontend>next`). Spot-checked
  highs: transitive devDeps (e.g. `undici <6.27.0` via hardhat,
  GHSA-35p6-xmwp-9g52; `hono` via wagmi/privy chain, GHSA-79qm-7rj5-m7r9).
  Full transitive triage is Verifier/other-lane work; BLD records the counts.

## Unused / missing / duplicated

- **Unused (declared, never imported) → BLD-008 (S3):** `wagmi@^3.6.15` in
  `apps/frontend/package.json` — 0 files import it (grep over tracked
  `apps/frontend` sources). (`viem` 13 files, `@privy-io/react-auth` 12,
  `arweave` 2, `@livepeer/react` 1 — all used.)
- **Dormant (declared, never configured) → BLD-009 (S3):**
  `hardhat-gas-reporter` and `solidity-coverage` in
  `packages/contracts/package.json`, but `hardhat.config.ts` has no
  `gasReporter` section and coverage is never invoked — they do nothing.
- **Missing:** none found — every import resolves (tsc --noEmit clean,
  all suites green).
- **Duplicate-purpose:** none obvious. Note `@privy-io/react-auth` pulls its
  own wagmi chain; the direct `wagmi` dep adds a second copy of the wagmi
  dependency tree without being imported (ties to BLD-008).
- **Outdated majors:** `next` 16.2.6 is pinned exact and is 2 minor versions
  behind the patched 16.3.x line (see audit). `ethers` ^6.17.0 is current-ish.
  No major-version audit beyond the advisories was run (no upgrades in Phase 1).

## Native build prerequisites

`gcc` and `make` present on the Threadripper; `python3` 3.14.7 present.
Native/transitive build deps (`keccak`, `secp256k1`, `bufferutil`,
`utf-8-validate`, `sharp`, `esbuild`, `@reown/appkit`, `unrs-resolver`) are
listed in pnpm `allowBuilds` (interactive prompt left unanswered = default).
All currently-installed native modules load (suites green), so no build
prerequisite is blocking today. On a fresh machine: Node 22 + pnpm 11 (or npm
10) + gcc/make/python3 for node-gyp fallback.

## `engines` fields

Only `packages/storage` declares `engines` (`node >=18`). Root,
`apps/frontend`, `packages/contracts` declare none → BLD-012 (S4).
Runtime verified: node v22.23.2, npm 10.9.8, pnpm 11.1.2.

## Related issues

BLD-001 (next critical advisories, S1) · BLD-003 (stale root package-lock, S3) ·
BLD-004 (pnpm-lock drift, S2) · BLD-005 (mixed package managers, S2) ·
BLD-008 (unused wagmi, S3) · BLD-009 (dormant gas/coverage deps, S3) ·
BLD-011 (tracked npm internal lockfile, S3) · BLD-012 (missing engines, S4)
