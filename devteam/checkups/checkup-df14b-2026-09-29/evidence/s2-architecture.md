# S2 — as-is architecture (checkup-df14b-2026-09-29)

**Contract layer** (`packages/contracts/contracts/MovieTicket.sol`):
ERC721A + RevenueSplitter + ReentrancyGuard. Two mint paths
(`mintTicket`, `mintBurnableTicket`) assign `tokenId = _videoCounter++`
(lines 236, 295) — IDs dense from 0, counter monotonically increasing.
`burnTicket` (342–349) calls ERC721A `_burn`: `totalSupply()` shrinks, but
`_videoCounter` is untouched. New `totalMinted()` view (369) returns
`_videoCounter` — the ever-minted count, burn-invariant by construction.
On-chain access gating (`hasAccessToVideo`, 392–395) reads the
`_filmAccessCount` reverse index (maintained on mint at 263/320 and on
transfers at 146–168) — O(1), never a scan, never affected by the bug.

**Frontend layer:**
- `useOwnedFilms` (`useMovieTicket.ts`): React hook now delegates to the
  pure exported `enumerateOwnedFilms(readView, owner)`. The core reads
  `totalMinted()` once, loops `i < minted`, calls `ownerOf(i)` per ID inside
  try/catch (burned IDs throw in ERC721A and are skipped), reads
  `videoMetadata(i)[0]` for matches, case-insensitive owner compare.
- `useCreatorDashboard.ts`: created-films scan — same linear pattern, same
  bound fix (`totalMinted` instead of `totalSupply`).
- `useHasFilmAccess.ts`: event-driven (viem `getLogs`), explicitly performs
  no `totalSupply` enumeration — out of scope of the defect.
- `useFilmmakerCampaign.ts`: loops to `nextCampaignId` (a mint counter, not
  a supply); that contract has no burn path — no sibling defect.
- ABI: `export:abi` regenerates `abis.generated.ts` from compiled artifacts;
  the abi-drift guard test pins frontend ABI against compiled artifacts and
  fails closed on one-sided drift.

**Invariants:** (1) token IDs dense from 0 ⟺ `_videoCounter` is maxTokenId+1;
(2) `totalMinted()` never decreases; (3) enumeration bound must be a
burn-invariant counter, never `totalSupply()`; (4) frontend ABI ==
compiled-artifact ABI (guard-enforced).

**Discrepancy found and fixed by the change itself:** the old comment claimed
the hook "mirrors the contract's hasAccessToVideo pattern" — false; the
contract never scans. The new comment documents the O(1) reverse index.
