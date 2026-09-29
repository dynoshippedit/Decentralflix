# S0 — scope: change checkup on DF-1 / DF-2 / DF-3

Review ID: checkup-df14-2026-09-29. Scope: change checkup — three confirmed
copy/deploy defects from the Principal Reviewer pass, plus affected callers,
contracts, and downstream workflows. No contract source changed; no ABI
impact; no migration. 3 review units, 16 coverage cells (4 core lenses per
unit), 3 behavior-bearing final checks.

Changed files (3):
- apps/frontend/app/dashboard/page.tsx (DF-1: fee footnote copy)
- apps/frontend/app/demo/page.tsx (DF-2: economics card copy)
- packages/contracts/scripts/deploy.ts (DF-3: verify-step constructorArguments)

Requirements / invariants (from the verified contracts):
- Immutable 75/25 split everywhere (PLATFORM_FEE_BPS = 2500, no setter).
- Creator receives the rounding remainder; MissingCreator reverts.
- Owner cannot redirect funds, change the split, or withdraw.
- Contracts UNAUDITED; no mainnet or real-funds deployment without Dino's
  explicit authorization.

DEVIATION (documented, not hidden): the three one-line fixes were applied
before the initial snapshot was taken, so the snapshot is post-change. The
pre-change state was commit 1c7c82a plus the uncommitted DEPLOYMENT_CHECKLIST.md
rewrite, both verified by checkup-df13-2026-09-29b (hardhat 236/236, frontend
211/211, tsc clean). The exact pre/post diff of the three files is preserved
in evidence/s5-fix.md.
