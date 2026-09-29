# S6 — Final checks (through the recorder)

All four recorded receipts exit 0, none timed out, source digests equal before/after every run (no edits during the checkup):

- checks/baseline/check-doc-diff.json — exit 0: the uncommitted diff is exactly the 3-hunk correction (note + S-1 + S-2).
- checks/final/check-doc-diff.json — exit 0: diff unchanged from baseline; no scope creep into other files.
- checks/final/check-spec-match.json — exit 0: `diff` of the steward's fixed copy vs the working-tree doc produced zero bytes — byte-identical, so the applied correction matches stale-doc-sweep.md exactly.
- checks/final/check-onchain-truth.json — exit 0: "stale hits:" section empty (zero `platformFeeBps` in packages/contracts/contracts/*.sol); `uint256 public constant PLATFORM_FEE_BPS = 2500;` confirmed at RevenueSplitter.sol:33.

Source stable across every run (source_digest 09fffd4387912d20 unchanged).
