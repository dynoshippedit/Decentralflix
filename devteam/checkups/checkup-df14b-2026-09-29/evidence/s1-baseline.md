# S1 — baseline (checkup-df14b-2026-09-29)

Baseline command run through the gate recorder on the frozen tree
(HEAD `15b6f5e`, source digest `b1e426bf4c42fa761ccd5f7c905d1b7a76b1afdfb66ca7453927c86708c6420c`):

- `check-hardhat` (baseline): `npx hardhat test` in `packages/contracts` —
  **237 passing, 0 failing**, exit 0, source stable across the run.
  Receipt: `checks/baseline/check-hardhat.json`.

No environment faults: local hardhat network, no external services, no
credentials involved. Toolchain ran from the repo's own node_modules.

Note on post-hoc baseline: the tree already contains the DF-4 fix. The
defect's "before" state is established two independent ways: (1) the parent
commit `3823f4e` lacks `totalMinted()` entirely (the new hardhat test calls a
function that does not exist there — it cannot pass pre-fix); (2) the new
vitest enumeration test injects a fake chain whose `totalSupply` view throws,
so the old `totalSupply`-bounded loop cannot pass it either.
