# S4 — Tests baselined (checkup-df15-2026-09-29)

Baseline ran against the pre-change source (digest `6feb1c01d08d5d4c`):

- `check-hardhat` (packages/contracts `npx hardhat test`): **237 passing,
  0 failing** — the standing green suite.
- `check-frontend` (`npx vitest run` in apps/frontend): **137 passed,
  5 failed** — the 5 failures are exactly the new
  `lib/contracts/mintPageWiring.test.ts` assertions evaluated against the
  OLD `/mint` page (references `mintPermanentPass`, uses
  `creator || connectedAddress`). All pre-existing frontend tests passed.
- `check-tsc` is final-only per the frozen spec (not baselined).

The 5 wiring failures are the intended fail-against-old signal: they prove
the regression tests are sensitive to the defects (F-1/F-2) before the fix.
No baseline check mutated source (receipt `source_before == source_after`).
