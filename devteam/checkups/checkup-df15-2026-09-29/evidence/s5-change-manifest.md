# S5 — Change manifest (checkup-df15-2026-09-29)

Source changes (8 files under the 11 frozen paths; 245 insertions,
101 deletions):

- `packages/contracts/contracts/PayPerView.sol` — F-3: `registerFilm`
  now `external onlyOwner` with explicit `filmmaker` param; new
  `ZeroAddress` error; NatSpec rewritten. (No other logic touched:
  `buyAccess`, `setFilmPrice`, 75/25 split unchanged.)
- `packages/contracts/test/PayPerView.test.ts` — F-3 tests: owner-only
  registration, front-runner revert + no revenue capture, zero-filmmaker
  revert.
- `packages/contracts/contracts/MovieTicket.sol` — NatSpec only: mint
  functions documented as operator (`onlyOwner`) mints; buyer purchases
  go through `TicketNFT.mintTicket`.
- `apps/frontend/app/mint/page.tsx` — F-1/F-2: rewired to
  `TicketNFT.getFilm`/`mintTicket`; filmId derived from videoHash; exact
  on-chain price; purchase disabled for missing/inactive films and for
  zero/buyer-equal filmmaker; creator input and silent buyer default
  removed; demo simulation retained.
- `apps/frontend/lib/contracts/ticketFilmId.ts` (+ test) — NEW helper +
  known-vector test.
- `apps/frontend/lib/contracts/mintPageWiring.test.ts` — NEW F-1/F-2
  wiring regression tests (now 6 assertions incl. filmmaker-block).
- `apps/frontend/lib/web3/wrappers/payPerView.ts` (+ test) — F-3:
  `registerFilm` wrapper takes explicit `filmmaker`.
- `apps/frontend/lib/contracts/useHasFilmAccess.ts` — F-1: TicketNFT
  `hasValidTicket` added as an access source.
- `apps/frontend/lib/contracts/abis.generated.ts` — regenerated
  (`npm run export:abi`); diff limited to PayPerView `registerFilm`
  signature + `ZeroAddress` error.

Regenerable build artifacts refreshed as a side effect (tier-b, noted):
`packages/contracts/artifacts/**`, `typechain-types/**` (kept only
PayPerView/MovieTicket deltas; unrelated factory bytecode noise reverted),
`packages/contracts/cache/`. Pre-existing dirty files outside the frozen
paths (package.json/lockfiles, docs/PHASE2_AUDIT.md, df14b checkup dirs)
were not touched. No commit/push/merge; contracts remain UNAUDITED;
no testnet/mainnet activity.
