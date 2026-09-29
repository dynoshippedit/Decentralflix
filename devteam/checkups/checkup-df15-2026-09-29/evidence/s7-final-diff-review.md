# S7 — Final diff reviewed (checkup-df15-2026-09-29)

Post-change review of the full uncommitted diff (source paths only):

- `PayPerView.registerFilm`: `external onlyOwner`, `(filmId, priceWei,
  filmmaker)`; reverts `InvalidFilmId` / `FilmAlreadyRegistered` /
  `ZeroAddress`; stores the NAMED filmmaker (not `msg.sender`); emits
  `FilmRegistered(filmId, filmmaker, priceWei)`. No path lets a non-owner
  register; no path records a zero filmmaker. `setFilmPrice` still
  filmmaker-only; revenue split math untouched.
- `/mint` page: no occurrence of `mintPermanentPass`, `MOVIE_TICKET_ABI`,
  `creator ||`, or `setCreator(`. Buy flow: `getFilm(filmId)` →
  `mintTicket(filmId)` with `value = film.priceWei` (exact). Disabled
  reasons cover: loading, missing (never registered), error, inactive,
  zero/empty filmmaker, filmmaker == buyer. `handleMint` re-checks the
  same guards before signing. Demo zero-address path preserved.
- `ticketFilmIdForVideoHash`: `uint256(keccak256(toUtf8Bytes(videoHash)))`;
  known vector pinned; no BigInt literals (ES target safe).
- Wrapper `registerFilm` passes `(filmId, priceWei, filmmaker)` against
  the regenerated ABI; `useHasFilmAccess` queries `hasValidTicket` with
  the derived filmId behind the existing zero-address guard.
- `MovieTicket.sol` change is NatSpec-only (no bytecode logic change
  beyond metadata hash).
- `abis.generated.ts` diff is exactly the PayPerView delta; `abi-drift`
  test green.

Residual risks (documented, not blockers for this gate):
- The external Cloudflare Worker / indexer that gates playback must also
  recognize TicketNFT tickets; that code is outside this repo.
- Contracts remain UNAUDITED; no testnet/mainnet validation performed.
- A pre-existing local-shell quoting quirk in this worker's exec harness
  caused one edit script to drop 5 of 16 replacements (last-write-wins);
  caught by the compile failure and re-applied with a corrected script —
  final state verified by green checks, not by assumption.
