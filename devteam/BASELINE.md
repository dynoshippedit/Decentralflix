# BASELINE
Captured: (pending — BLD in Phase 1) · commit (pending) · by BLD

## Environment
| Tool | Version |
|---|---|
| node | (pending) |
| pnpm / npm | (pending) |
| solc / hardhat | (pending) |
| python | n/a |

## Before any change
| Step | Command | Exit | Result summary | Duration |
|---|---|---|---|---|
| install | | | | |
| build (frontend) | `pnpm exec tsc --noEmit` + `pnpm build` in apps/frontend | | reported 2026-09-28: clean (to reproduce) | |
| contracts compile | `npx hardhat compile` in packages/contracts | | | |
| test: hardhat | `npx hardhat test` in packages/contracts | | reported: 217 passing (to reproduce) | |
| test: storage | (pending — see packages/storage/package.json) | | reported: 93 passing (to reproduce) | |
| test: frontend | vitest in apps/frontend | | reported: 203 passing (to reproduce) | |
| test: lifeboat | `bash test.sh` in apps/lifeboat | | reported: 128 passing (to reproduce) | |
| lint | eslint apps/frontend | | | |
| typecheck | (see build row) | | | |
| run / smoke | ./scripts/run.sh → :3000 + :8080 | | reported: 200s (to reproduce) | |
| dependency audit | npm audit / pnpm audit | | | |
| secret scan | gitleaks or B6 patterns incl. git log -p | | | |

## Notes / deviations
- Contracts are UNAUDITED (no Slither/Aderyn run recorded yet) — BLD to attempt slither if available, else note.
- No mainnet/testnet broadcasts, no funded keys, no real payments in this run (owner constraint).

## After (Phase 6) — same commands, compared with "Before"
| Step | Before | After | Change |
|---|---|---|---|
