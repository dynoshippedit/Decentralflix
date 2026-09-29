# S7 — challenge the fix (checkup-df14b-2026-09-29)

**Did we remove the cause or suppress a symptom?** Cause removed. The defect
was the bound itself (`totalSupply`); the fix replaces it with a
burn-invariant on-chain counter at the single source of truth, in both
affected scans. No workaround, no retry, no catch-and-ignore added.

**Could the regression tests pass against the broken implementation?**
No, in both suites:
- Hardhat: the test calls `totalMinted()`, which does not exist pre-fix —
  the call reverts/does-not-compile against the old contract.
- Vitest: the fake chain *throws* on `totalSupply`. The old implementation
  reads `totalSupply` first, so it fails before any assertion.

**Ordering / retries / auth / data semantics / compatibility:** none
affected. `totalMinted()` is a new view; no existing function signature
changed; the 75/25 splitter, access index, and burn semantics untouched
(237/237 hardhat incl. all prior splitter/access tests). ABI addition is
backwards-compatible; the abi-drift guard confirms frontend/artifact
lockstep (14/14).

**Did any check or threshold change to get a pass?** No. No test was
weakened; the adapted vitest dropped `renderHook` only because
`@testing-library/react` is not installed (documented in the test header,
chief decision pending) — the same scenarios run against the pure core.

**Docs-vs-tree:** no fee, stage, deployment, or endpoint claims are touched
by this change. `DEPLOYMENT_CHECKLIST.md` (immutable 75/25, unaudited,
no-fee-args) remains accurate; no doc update required. The misleading
in-code comment was the only stale text, and it was fixed in the commit.

**Reviewer mode:** SELF_REVIEW — single reviewer pass by the checkup
subagent (session 76d1f631), no independent second reviewer dispatched.
The challenge above was performed explicitly as the S7 pass, not assumed.

**Residual notes (not defects):** the linear scan is O(minted) RPC reads —
acceptable while mint counts are small, with the events/subgraph move
already planned in-code. `Number(minted)` is fine at any realistic scale.
