# S6 — verification against the resulting source

Source identity at final: `e7bc7f69bd593153d7e2523aee202b13afcc093f51850a032b172be2ed1d1d32`
(identical to initial snapshot and baseline receipts — no source mutation at
any point; source_before == source_after on all four receipts).

## Final checks (required, all passing)
- check-compile (receipts/final-compile-001.json): exit 0, no timeout.
- check-tests  (receipts/final-tests-001.json): exit 0, no timeout,
  250 passing / 0 failing / 0 pending (3s) — same as baseline.

## Baseline → final comparison
- Baseline: 250 passing. Final: 250 passing. Zero delta: no regressions, no
  new skips, no suite shrinkage. DF-RENOUNCE-1 suite: 5/5 passing in both.
- All four final-relevant receipts (baseline+final × compile+tests) reference
  the frozen argv/cwd and the current source digest; the gate re-verified this.

## Named limits (carried from S1)
- Behavior proven on the in-process hardhat chain only; contracts remain
  UNAUDITED (notices intact in RevenueSplitter.sol and the test header).
- The final test run exercises the whole packages/contracts suite, which also
  includes out-of-scope uncommitted changes on this branch (e.g. PayPerView
  F-3 registerFilm change) — the 250/250 result holds for the tree as-is; those
  changes are reviewed under their own checkups, not this one.
