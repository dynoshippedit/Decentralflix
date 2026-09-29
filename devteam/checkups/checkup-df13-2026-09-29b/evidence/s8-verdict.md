# S8 — controller verdict (checkup-df13-2026-09-29b)

Target: df-cycle-13 on branch devteam/review-2026-09-29
(TicketNFT 75/25 migration + frontend ABI refresh + ABI-drift guard).

Stages completed: S0 through S8, each gated with PASS_THROUGH_S<n>
from tools/checkup_gate.py. Full gate through S8 returns PASS.

Findings: 4 candidates challenged.
- FIND-01 SUPPORTED_IMPROVEMENT (dual hardcoded contract lists) -> FIXED:
  one new test pins export-abi.ts CONTRACTS to the drift-guard CONTRACTS;
  proven by fault injection in both directions (each failed, restored, green).
- FIND-02, FIND-03, FIND-04 REJECTED_LEAD with traced counter-evidence
  (reentrancy ordering safe under nonReentrant; owner price front-run is
  fail-closed by design; per-render viem client is pre-existing and out of scope).

Fix commit: 63cab36 (local only, branch devteam/review-2026-09-29; nothing pushed).

Checks run (all through the recorder, real wall-clock durations, exit 0):
- check-hardhat: npx hardhat test -> 236 passing (4.0s)
- check-frontend: npm test -> 211 passing (1.3s; was 210, +1 new test)
- check-tsc: npx tsc --noEmit -> clean (5.6s)
- check-drift-refusal: tamper -> guard fails -> restored, exit 0 (1.2s)

Verdict: ACCEPT. The df-cycle-13 change is sound; the one latent process
weakness found (FIND-01) is repaired and proven. Contracts remain UNAUDITED
(standing flag, unchanged). In The Red writes remain excluded (playtest open).
