# S3 — Diff inspected, pre-change (checkup-df15-2026-09-29)

Planned change surface (11 frozen paths; nothing else in scope):

1. `apps/frontend/app/mint/page.tsx` — full rewire: drop `mintPermanentPass`
   / `MOVIE_TICKET_ABI` / creator input + `creator || connectedAddress`
   default; use `TICKET_NFT_ABI` `getFilm` (exact price, active flag,
   filmmaker) + `mintTicket` (buyer-payable); derive filmId via
   `ticketFilmIdForVideoHash`; disable purchase for missing/inactive films
   and for zero/buyer-equal filmmaker (F-2 fail-closed); keep zero-address
   demo simulation.
2. `apps/frontend/lib/contracts/ticketFilmId.ts` (+ test) — NEW:
   `ticketFilmIdForVideoHash = uint256(keccak256(utf8(videoHash)))`;
   registration and purchase must agree (known vector pinned in test).
3. `apps/frontend/lib/contracts/mintPageWiring.test.ts` — NEW: regression
   assertions for F-1 (no `mintPermanentPass`, uses `mintTicket` +
   derived filmId) and F-2 (no silent buyer default; sale blocked on
   zero/buyer filmmaker).
4. `packages/contracts/contracts/PayPerView.sol` — `registerFilm` becomes
   `external onlyOwner` with explicit `filmmaker` param; rejects zero
   filmmaker (`ZeroAddress`); records the named filmmaker (F-3). NatSpec
   updated.
5. `packages/contracts/test/PayPerView.test.ts` — fixture registers via
   owner with explicit filmmaker; new tests: non-owner registration
   reverts (`OwnableUnauthorizedAccount`), zero filmmaker reverts,
   front-runner captures nothing and revenue still splits to the real
   filmmaker.
6. `apps/frontend/lib/web3/wrappers/payPerView.ts` (+ test) — `registerFilm`
   wrapper takes the explicit `filmmaker` address.
7. `packages/contracts/contracts/MovieTicket.sol` — NatSpec corrected:
   mint functions are operator (`onlyOwner`) mints, not direct buyer mints.
8. `apps/frontend/lib/contracts/useHasFilmAccess.ts` — access check gains
   the TicketNFT source: `hasValidTicket(holder, derivedFilmId)`.
9. `apps/frontend/lib/contracts/abis.generated.ts` — regenerated via
   `npm run export:abi` (PayPerView `registerFilm` + `ZeroAddress` only).

Out of scope / explicitly not changed: no new contracts invented;
TicketNFT.sol untouched (already correct); Cloudflare Worker/indexer
(external to this repo) must independently honor TicketNFT for production
playback — flagged in the final report.
