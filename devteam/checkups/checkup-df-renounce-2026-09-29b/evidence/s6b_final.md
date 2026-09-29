# S6 (amendment) - verification against the resulting source

Source identity at final: df7d41b0df6e960e0821626a1f81d1dfa528331805767f81c21128deff8ad0b1
(identical to the amendment initial snapshot; source_before == source_after on
all ten receipts - baseline and final).

## Final checks (required, all passing, exit 0, no timeout)
- check-compile: exit 0 ("Nothing to compile", cache current).
- check-tests: 250 passing / 0 failing (3s) - identical to baseline, 0 delta.
- check-abi-drift: 14/14 passing - regenerated ABIs exactly match artifacts.
- check-frontend: 232/232 passing across 19 files - identical to baseline.
- check-tsc: tsc --noEmit clean.

## Baseline to final comparison
Zero delta on every check: no regressions, no new skips, no suite shrinkage.
The three acceptance items from the scope addition are verified:
(1) abi-drift guard 14/14 post-regen; (2) platformRenounced plus
renounceOwnership present in all four inheritor ABIs (verified in source and
by the guard); (3) frontend vitest 232/232 and tsc clean.

## Limits (carried)
Contracts UNAUDITED; behavior proven on test chains only. Out-of-scope
uncommitted changes on this branch (PayPerView F-3, F-DFLIX-1 probe/ordering,
frontend pages, lifeboat, artifacts) are not covered by this review; the
final runs exercise the tree as-is.
