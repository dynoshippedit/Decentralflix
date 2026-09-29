# S1 — executable baseline (checkup-df13-2026-09-29b)

All four frozen checks executed through the gate runner on the frozen source
(HEAD 277820e, tree clean). Receipts: receipts/baseline-001..004.json.

| Check | Command | Result |
|---|---|---|
| check-hardhat | npx hardhat test (packages/contracts) | exit 0 — 236 passing |
| check-frontend | npm test (apps/frontend) | exit 0 — 210 passed |
| check-tsc | npx tsc --noEmit (apps/frontend) | exit 0 — clean |
| check-drift-refusal | tamper-then-restore drift probe | exit 0 — refusal observed, file restored |

## Critical workflow observation (real execution, not mocked)
Script: scripts/mint_flow.ts run via `npx hardhat run` against the in-process
Hardhat chain. Deployed TicketNFT, registered film 1 at price 7 wei, minted
from a buyer account:
- platform (owner) balance delta: 1 wei (expected 1)
- filmmaker balance delta: 6 wei (expected 6)
- contract balance after: 0 wei (nothing retained)
- hasValidTicket(buyer, 1): true
- gas used: 161159
Result: S1 WORKFLOW OK. The 75/25 split with the rounding remainder to the
filmmaker behaves exactly as specified, atomically inside the mint transaction.

## Named limits
- Contracts UNAUDITED; no mainnet deployment exists (hardhat-local only).
- The frontend hooks target arbitrumSepolia; no live deployment was exercised
  (none exists); the drift guard compares against compiled artifacts, which is
  the authoritative on-chain interface definition available.
- No environment faults: toolchains present, suites green on first run.
