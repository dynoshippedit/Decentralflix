# S5 — fix record for FIND-01 (checkup-df13-2026-09-29b)

## Change
File: apps/frontend/lib/contracts/abi-drift.test.ts
Added one test: "export pipeline and drift guard cover the same contract list".
It reads packages/contracts/scripts/export-abi.ts, parses the CONTRACTS
string array, and asserts it deeply equals the drift guard CONTRACTS names.
No production code touched; test-only change.

## Pre-change evidence
- Both CONTRACTS lists read and confirmed identical (10 contracts) before the
  change — the defect was latent, not active.

## Fault injection (proves the new test is behavior-bearing)
1. Guard side: inserted ["BogusContract", ...] into the guard CONTRACTS ->
   new test FAILED with "drift guard CONTRACTS != export-abi.ts CONTRACTS"
   (1 failed, 14 skipped); file restored via git checkout.
2. Script side: inserted "BogusContract" into export-abi.ts CONTRACTS ->
   new test FAILED with the same message (1 failed, 13 skipped);
   export-abi.ts restored via git checkout.
3. After restores: guard suite 14/14 green; full frontend suite 211/211 green.

## Final verification
- npx hardhat test: 236 passing
- frontend npm test: 211 passing (was 210; +1 new list-pinning test)
- npx tsc --noEmit: clean
- check-drift-refusal: exit 0 (tamper -> guard fails -> file restored)
All run through the recorder with real wall-clock durations; receipts in
devteam/checkups/checkup-df13-2026-09-29b/checks/final/.
