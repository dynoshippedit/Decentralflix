# S3 — review matrix (checkup-df14b-2026-09-29)

29/29 cells reviewed. Concrete observations per unit/lens:

## contract-totalminted (MovieTicket.sol)
- COR: `totalMinted()` returns `_videoCounter`; counter incremented on both
  mint paths (236, 295), never decremented — burn at 342–349 calls `_burn`
  only. Burn-invariance holds by construction, not by convention.
- ARC: new public view placed with the other frontend/off-chain helpers;
  no state writes, no coupling to RevenueSplitter, no auth needed.
- TST: new hardhat test — mint 3 → totalMinted 3; burn 1 → supply 2,
  totalMinted still 3; re-mint → 4 with ownerOf(3) correct. 237/237 green.
- DOC: NatSpec states the enumeration contract (dense IDs, totalMinted vs
  totalSupply) and that on-chain access is mapping-based — verified true
  (`_filmAccessCount`, hasAccessToVideo at 392–395).
- SEC: view-only, exposes a single counter, no new attack surface, no
  reentrancy (no state change, no external call).
- DAT: uint256 counter on-chain; frontend `Number()` conversion bounded by
  real mint volume — 2^53 unreachable (see rejected lead RL-3).

## contract-test (MovieTicket.test.ts)
- COR: asserts exact bigints (3n/2n/4n) across the mint→burn→re-mint
  sequence; exercises the dense-ID + burn interaction the bug depended on.
- ARC: sits in the burnable-ticket describe block with the other burn tests.
- TST: behavior-bearing — calls `totalMinted()`, which does not exist
  pre-fix; cannot pass against the old contract.
- DOC: test name states the invariant plainly.

## hook-owned-films (useMovieTicket.ts)
- COR: loop bound `i < minted` from `totalMinted()`; per-ID try/catch skips
  burned IDs; `videoMetadata(i)[0]` as hash; case-insensitive compare.
  `FilmReadView` union includes `'totalMinted'` — present in regen ABI.
- ARC: pure exported core + thin React binding via a readView adapter;
  testable without chain or DOM.
- TST: 3-case vitest; fake chain *throws* on `totalSupply`, so any
  regression to the old bound fails loudly.
- DOC: misleading "mirrors hasAccessToVideo" comment replaced with the
  true O(1) reverse-index account.
- API: adapter maps the three view names to `publicClient.readContract`
  with `MOVIE_TICKET_ABI`; `args as never` cast is the only looseness,
  tsc clean.
- UIX: fixes the user-visible symptom — post-burn high-ID films no longer
  vanish from "my films".

## hook-creator-dashboard (useCreatorDashboard.ts)
- COR: bound swap `totalSupply` → `totalMinted`; loop body untouched.
- ARC: same linear-scan shape as useOwnedFilms; comment now documents why.
- TST: no dedicated scan test, but the bound is the same on-chain view
  proven by the contract test; file's suite green (214/214).
- DOC: comment states the burn rationale explicitly.
- API: `functionName: 'totalMinted'` against the regenerated ABI — typechecks.

## abi-regen (abis.generated.ts)
- COR: diff adds exactly one entry — `totalMinted`, no inputs, uint256
  output, view — matching the contract signature.
- ARC: produced by the single `export:abi` pipeline from compiled
  artifacts; no hand edits.
- TST: abi-drift guard 14/14 pins frontend ABI to compiled artifacts,
  fails closed on one-sided drift (proven by fault injection in df13b).
- DOC: generated file; contract NatSpec is the source of truth — acceptable.

## frontend-enum-test (useOwnedFilms.enumeration.test.ts)
- COR: case 1 finds tokenId 4 with totalSupply-at-4 post-burn (the exact
  old failure); case 2 no-burn anchor; case 3 ownership filter + silent
  burn skip.
- ARC: pure-core injection, no React/DOM/chain; header documents why
  renderHook was not used (@testing-library absent by chief decision).
- TST: assertions specific (`toContainEqual`, call-trap on totalSupply).
- DOC: header records the G7 origin and the old loop's failure mechanics.
