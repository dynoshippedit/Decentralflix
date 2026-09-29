# S0 — scope (checkup-df14b-2026-09-29)

**Review type:** change checkup.
**Target:** Decentralflix commit `15b6f5e0af99674b85aa3b6a6950a181bcff2095`
("DF-4: fix useOwnedFilms burn-enumeration bound via on-chain totalMinted()"),
branch `devteam/review-2026-09-29`, `/home/dino/Decentralflix`.

**Change under review:** `useOwnedFilms` (and the identical scan in
`useCreatorDashboard`) enumerated token IDs with `for (i = 0; i < totalSupply; i++)`.
MovieTicket token IDs are dense from 0 but ERC721A `totalSupply()` shrinks on
burn, so after any burn every owned token with ID >= totalSupply was never read
and vanished from the UI. The fix adds an on-chain burn-invariant
`totalMinted()` view (returns `_videoCounter`, the ever-minted count) and bounds
both scans by it; the enumeration core was extracted as a pure exported
`enumerateOwnedFilms` for unit testing; the ABI was regenerated.

**Selected source (6 files, all from the commit's hand-written source):**

- `packages/contracts/contracts/MovieTicket.sol` — new `totalMinted()` view
- `packages/contracts/test/MovieTicket.test.ts` — new burn-invariance test
- `apps/frontend/lib/contracts/useMovieTicket.ts` — hook fix + pure enumerator
- `apps/frontend/lib/contracts/useCreatorDashboard.ts` — identical scan fix
- `apps/frontend/lib/contracts/abis.generated.ts` — regenerated ABI (+totalMinted)
- `apps/frontend/lib/contracts/useOwnedFilms.enumeration.test.ts` — 3-case vitest

Generated build outputs touched by the commit (`artifacts/`, `typechain-types/`)
are excluded from the source set: they are compiler outputs, and ABI
consistency is covered behaviorally by the abi-drift guard inside the frontend
suite. Working-tree modifications outside the commit (regenerated artifacts for
FilmmakerCampaign/Reviews/SeederCredits from a later compile) are likewise
outside scope — regenerable build outputs, not application source.

**Review units:** 6 (`contract-totalminted`, `contract-test`, `hook-owned-films`,
`hook-creator-dashboard`, `abi-regen`, `frontend-enum-test`), 29 coverage cells.

**Behavior-bearing checks:** `check-hardhat` (baseline + final),
`check-frontend` (final), `check-tsc` (final).

**Deviation documented:** the fix was committed before this snapshot (post-hoc
review checkup, same pattern as checkup-df14). Pre-change state is the parent
commit `3823f4e`; the "before" behavior is additionally pinned by the new
regression tests, which fail against the pre-fix implementation. Source
identity frozen by `initial.json` (spec_digest
`7de7ba5ceccfb366784b30fc95a788b89a44dce9498a24186034fba648a1394f`).
