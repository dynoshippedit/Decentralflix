# S1 (amendment) - executable baseline

New source identity: df7d41b0df6e960e0821626a1f81d1dfa528331805767f81c21128deff8ad0b1
(source_before == source_after on all receipts - no mutation during checks).

Prior-review checks refreshed under the new specification:
- check-compile (baseline-compile-001.json): exit 0. "Nothing to compile"
  (hardhat cache current with present source).
- check-tests (baseline-tests-001.json): exit 0, 250 passing / 0 failing (3s),
  incl. 5/5 DF-RENOUNCE-1 tests.

New scope-addition checks (apps/frontend):
- check-abi-drift (baseline-abidrift-001.json): exit 0 - 1 file, 14/14 tests
  passing (1 artifacts-exist + 10 per-contract exact-match + seeder-deviation +
  export-pipeline parity + no-removed-fee-setters).
- check-frontend (baseline-frontend-001.json): exit 0 - 19 files, 232/232
  tests passing.
- check-tsc (baseline-tsc-001.json): exit 0 - tsc --noEmit clean, no errors.

Environment: node v22.23.2; hardhat + vitest 4.1.7 + tsc present in the
respective node_modules; no external services. Same limits as the prior
review: contracts UNAUDITED; behavior proven on test chains only.
