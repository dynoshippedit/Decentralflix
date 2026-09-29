# S4 — findings (checkup-df14b-2026-09-29)

## DF-4 — CONFIRMED_DEFECT → FIXED

**Claim:** `useOwnedFilms` (and the identical scan in `useCreatorDashboard`)
bounded token enumeration by ERC721A `totalSupply()`, which shrinks on burn
while token IDs remain dense from 0. After any burn, every owned token with
ID >= totalSupply was never read and vanished from the UI.

**Location (pre-fix):**
`apps/frontend/lib/contracts/useMovieTicket.ts` — `useOwnedFilms`,
`for (let i = 0; i < Number(supply); i++)` with `functionName: 'totalSupply'`;
`apps/frontend/lib/contracts/useCreatorDashboard.ts:97` — same pattern.

**Expected:** enumeration covers all minted IDs (dense from 0) regardless
of burns.

**Observed (fixed):** both scans bound by the new on-chain `totalMinted()`
view returning `_videoCounter`. Contract verified: counter incremented on
both mint paths (`MovieTicket.sol:236,295`), never decremented — `burnTicket`
(342–349) calls ERC721A `_burn` only.

**Counter-evidence checked:**
- Does burn really shrink totalSupply? Yes — the new hardhat test asserts
  `totalSupply() == 2n` after burning 1 of 3 minted.
- Was on-chain access affected? No — `hasAccessToVideo` (392–395) reads the
  `_filmAccessCount` reverse index (O(1)); the old comment claiming the hook
  "mirrored" it was false and has been corrected.
- Sibling scans: `useHasFilmAccess` is event-driven (no scan);
  `useFilmmakerCampaign` loops to `nextCampaignId` (mint counter; that
  contract has no burn path); `useMovieTicket()`'s remaining `totalSupply`
  read is display-only state with zero consumers in app/components;
  `dflix.ts` wrapper is a generic passthrough. None is an enumeration bound.

**Verification:** `check-hardhat` (new burn-invariance test) and
`check-frontend` (3-case enumeration test whose fake chain throws on
`totalSupply` — the old implementation cannot pass it).

## Rejected leads

- **RL-1:** `useMovieTicket()` still reads `totalSupply` into component
  state. Display-only, no consumers in `app/` or `components/` — not an
  enumeration bound. REJECTED.
- **RL-2:** `dflix.ts:277` `totalSupply` wrapper. Generic passthrough, no
  loop. REJECTED.
- **RL-3:** `Number(minted)` precision loss in `enumerateOwnedFilms`.
  Requires >2^53 mints — unreachable; the try/catch + empty-state fallback
  bounds any anomaly. REJECTED.
- **RL-4:** `useFilmmakerCampaign.ts:121` loops to `nextCampaignId`.
  Mint-counter bound on a contract with no burn function. REJECTED.
