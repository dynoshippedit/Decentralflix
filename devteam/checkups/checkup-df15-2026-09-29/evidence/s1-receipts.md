# S1 — Receipts parsed (checkup-df15-2026-09-29)

Baseline receipts (pre-change source, digest `6feb1c01d08d5d4c`):
- `checks/baseline/check-hardhat.json` — exit 0, 237 passing, source unchanged.
- `checks/baseline/check-frontend.json` — exit 1 (EXPECTED): 137 passed,
  5 failed — the new `mintPageWiring.test.ts` assertions fail against the
  OLD `/mint` page. This is the fail-against-old evidence for F-1/F-2.

Final receipts (post-change source):
- `checks/final/check-hardhat.json` — exit 0, 239 passing, source unchanged.
- `checks/final/check-frontend.json` — exit 0, 143/143 passing.
- `checks/final/check-tsc.json` — exit 0, no output (clean).

All receipts were produced by `tools/checkup_gate.py run-check` (recorder),
which snapshots the frozen 11-path source set before and after each command
and refuses to run when the spec digest does not match the frozen spec.
Every receipt's `argv`/`cwd` matches the frozen check definition; every
receipt's `source_before == source_after` (no check mutated source).
