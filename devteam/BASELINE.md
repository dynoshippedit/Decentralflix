# BASELINE
Captured: 2026-09-29 · commit b8b519e (branch devteam/review-2026-09-29; HEAD at session start) · by BLD

## Environment
| Tool | Version |
|---|---|
| node | v22.23.2 |
| npm | 10.9.8 |
| pnpm | 11.1.2 |
| npx | 10.9.8 |
| hardhat | 2.28.6 (`npx hardhat --version` in packages/contracts) |
| solc | 0.8.28 (per `packages/contracts/hardhat.config.ts` `solidity.version`; evmVersion `cancun`) |
| python3 | 3.14.7 |
| slither | not installed (`which slither` → not found) — static analysis for Solidity not run; recorded as limitation |
| OS | Nobara Linux (Threadripper), 32 cores / 62 GB RAM |

Install note: no installs were run — `node_modules` already existed at root
(pnpm store), `apps/frontend` (npm), `packages/contracts` (npm). Verified
present instead, per task instruction. `packages/storage` (zero deps) and
`apps/lifeboat` (no package.json, stdlib only) need no install.

## Before any change
| Step | Command | Exit | Result summary | Duration |
|---|---|---|---|---|
| install | (skipped — node_modules verified present) | n/a | root/apps-frontend/contracts have node_modules; storage/lifeboat need none | n/a |
| typecheck | `npx tsc --noEmit` in apps/frontend | 0 | clean, no output | 15.5 s |
| lint | `npx eslint` in apps/frontend | **1** | **172 problems (105 errors, 67 warnings)** across 40 files; top rules: no-explicit-any 58, no-unused-vars 52, no-unescaped-entities 25, exhaustive-deps 13, set-state-in-effect 12. (Note: an earlier piped `… \| tail` masked the exit code via `$?` on tail; re-ran unpiped for the true exit 1.) | 18.1 s |
| build (frontend) | `npx next build` in apps/frontend | 0 | 20 routes built (18 static, 2 dynamic: /admin/review/[id], /film/[hash], /watch/[hash]); Turbopack | 34.0 s |
| contracts compile | `npx hardhat compile --force` in packages/contracts | 0 | "Compiled 36 Solidity files successfully (evm target: cancun)"; 104 typings generated | 6.8 s |
| test: hardhat | `npx hardhat test` in packages/contracts | 0 | **217 passing** (3 s) — matches reported 217 | ~6 s |
| test: storage | `npm test` in packages/storage (`node --test 'test/*.test.js'`) | 0 | **93 passing**, 0 fail (17 suites) — matches reported 93 | 3.5 s |
| test: frontend | `npx vitest run` in apps/frontend | 0 | **203 passing** (14 test files) — matches reported 203 | ~3.4 s |
| test: lifeboat | `bash test.sh` in apps/lifeboat | 0 | **RESULT: PASS=128 FAIL=0** — matches reported 128 | ~5.8 s |
| run / smoke | `./scripts/run.sh` | not run | **SKIPPED by rule**: :3000 and :8080 already occupied by processes BLD did not start (node pid 504775 `apps/lifeboat/server.js`, next-server pid 504798, uptime 2h43m). Did not kill; did not start own instances. Verified the running services instead: `GET :8080/api/health` → 200, `GET :3000/` → 200, `GET :3000/pricing` → 200, `GET :8080/api/auth/me` (no token) → **401** `{"error":"authentication required"}` | n/a |
| dependency audit | `npm audit` in apps/frontend | 0 (report) | 1 critical + 1 moderate: `next@16.2.6` — GHSA-p293-qw3h-jv36 (RCE, Windows-hosted; n/a on Linux) and GHSA-2xp9-vwfh-vxw4 (RCE via Image Optimization AVIF); fix suggested 16.3.6 | ~3 s |
| dependency audit | `pnpm audit` at root | 0 (report) | **117 total: 2 critical, 53 high, 55 moderate, 7 low**; the 2 criticals are the same `next@16.2.6` advisories | ~4.5 s |
| secret scan | B6 patterns over tracked files + `git log --all -S` history search | 0 | **Clean**: no key formats (sk-/AKIA/ghp_/xox/BEGIN PRIVATE KEY); one test-only constant `apps/lifeboat/test.sh:711` `const secret = "whsec_test_unit"` (obviously fake); history hits all benign (vendored @types/node docstring, hardhat's own mnemonic code, env-var *names* in deploy script, `.env.example` placeholders); no committed `.env` files | n/a |
| slither | `which slither` | n/a | not installed — not run (limitation, no heavy install per instructions) | n/a |

## Notes / deviations
- Contracts are UNAUDITED (no Slither/Aderyn run recorded; slither unavailable on this machine).
- No mainnet/testnet broadcasts, no funded keys, no real payments in this run (owner constraint). Deploy scripts read-only.
- `npx hardhat compile --force` modified 40 tracked files under `packages/contracts/artifacts/` (`.dbg.json`) and created 1 untracked `build-info/*.json`; all restored via `git checkout -- packages/contracts/artifacts packages/contracts/cache packages/contracts/typechain-types` + removal of the untracked file. Tree verified clean afterward (`git status` clean apart from other agents' devteam/ edits).
- ESLint exit-code gotcha documented above (pipe masked exit; true exit is 1).
- Another agent is concurrently editing `devteam/IDEAS.md` and `devteam/JOURNAL.md`; BLD appends only.
- pnpm-lock.yaml drift (ethers ^6.4.0 vs package.json ^6.17.0), foreign root package-lock.json ("next-base"), and mixed npm/pnpm installs are recorded as BLD-003/004/005 — the "install" row above reflects the as-found state, not a clean-clone install.

## After (Phase 6) — same commands, compared with "Before"
| Step | Before | After | Change |
|---|---|---|---|
| (to be filled in Phase 6) | | | |
