# S3 — coverage matrix

16 cells across 3 review units (copy-dashboard, copy-demo, deploy-script):
each unit carries the four core lenses (COR, ARC, TST, DOC) plus one domain
lens (UIX for the copy units, BLD/REL for the deploy script). 13 cells
REVIEWED with concrete observations; 3 TST cells NOT_APPLICABLE with
justification (static copy and the deploy script have no test harness; they
are covered by the tsc/vitest/hardhat checks instead).

Per-cell observations are recorded in review_state.json coverage entries.
No new defects surfaced during the matrix pass; the three known defects are
carried as findings.
