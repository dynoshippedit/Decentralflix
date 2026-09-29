# S5 — fix record (checkup-df14b-2026-09-29)

This is a post-hoc review checkup: the DF-4 fix was implemented and
committed as `15b6f5e` before this snapshot (read-only task — no new source
edits by the reviewer). S5 records the change as implemented and judges
whether it is the smallest coherent root-cause fix.

**The change (from `git show 15b6f5e`, hand-written source only):**

1. `MovieTicket.sol` (+12): new `totalMinted()` public view returning
   `_videoCounter`, with NatSpec documenting the enumeration contract.
2. `useMovieTicket.ts` (+96/−47): `useOwnedFilms` now bounds by
   `totalMinted()`; enumeration core extracted as pure exported
   `enumerateOwnedFilms(readView, owner)`; misleading hasAccessToVideo
   comment corrected.
3. `useCreatorDashboard.ts` (+12/−): created-films scan bound
   `totalSupply` → `totalMinted`; comment updated.
4. `abis.generated.ts` (+13): regenerated via `export:abi`; adds the
   `totalMinted` entry and nothing else.
5. `MovieTicket.test.ts` (+28): burn-invariance test.
6. `useOwnedFilms.enumeration.test.ts` (+111, new): 3-case pure-core test
   with a `totalSupply`-throwing fake chain.

**Why this is the smallest coherent fix:** the root cause is the wrong
enumeration bound. Alternatives considered and rejected: (a) tracking burns
off-chain — fragile, new state; (b) ERC721Enumerable — heavier, changes the
token standard surface; (c) event indexing now — the codebase already plans
the subgraph move later, but the bound fix is the correct minimal repair.
The pure-core extraction is not gold-plating: it is what makes the
regression test possible without React or a chain.

**Before-state:** parent commit `3823f4e` — no `totalMinted()`, both hooks
looping to `totalSupply`.
