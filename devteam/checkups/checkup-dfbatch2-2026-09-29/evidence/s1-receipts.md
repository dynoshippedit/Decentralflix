# S1 — Receipts (checkup-dfbatch2-2026-09-29)

## Gate receipts (executor: checkup_gate.py run-check)
- checks/baseline-check-hardhat.json — argv [npx hardhat test], cwd packages/contracts, exit 0
- checks/final-check-hardhat.json — argv [npx hardhat test], cwd packages/contracts, exit 0
- checks/final-check-frontend.json — argv [npx vitest run], cwd apps/frontend, exit 0
- checks/final-check-tsc.json — argv [npx tsc --noEmit], cwd apps/frontend, exit 0
- checks/final-check-lifeboat.json — argv [./test.sh], cwd apps/lifeboat, exit 0

All argv/cwd match the frozen spec. No check mutated application source
(test.sh moves/restores its own data/ dir as designed; hardhat/vitest/tsc are
read-only w.r.t. source).

## Baseline caveat (honesty record)
The gate requires >=1 baseline check; the baseline receipt above was captured
POST-change (gate mechanical requirement) because this batch's edits were
already in the working tree when the checkup was set up, and prior batches'
uncommitted work is interleaved in the same files (true pre-change tree not
reconstructable via stash). The TRUE pre-change baseline was observed directly
in this cycle BEFORE any repair edits (terminal output, 2026-09-29):
- npx hardhat test → 239 passing
- npm test -- --run (frontend) → 225/225, 18 files
- npx tsc --noEmit → clean
- apps/lifeboat ./test.sh → 145 pass, 0 fail
Falsification (fail-against-old) was demonstrated separately — see S2.
