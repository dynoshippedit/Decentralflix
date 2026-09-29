# S2 — Reproduction (checkup-df15-2026-09-29)

Each finding was reproduced against the pre-change source before repair:

- **F-1:** The old `/mint` page called `MovieTicket.mintPermanentPass`
  (verified by source read: `MOVIE_TICKET_ABI`, `functionName:
  'mintPermanentPass'`). `MovieTicket.sol` marks both mint functions
  `onlyOwner`, so any buyer-signed transaction reverts — the purchase flow
  could never succeed on-chain. The wiring test
  `mintPageWiring.test.ts` asserted the page must NOT reference
  `mintPermanentPass`/`MOVIE_TICKET_ABI` and must use `mintTicket`; all 5
  wiring assertions failed against the old page (baseline frontend log).
- **F-2:** The old page computed `creator || connectedAddress` and called
  `setCreator(connectedAddress)` on wallet connect — silently defaulting the
  75% creator share recipient to the buyer. Asserted absent by the wiring
  test (failed pre-fix).
- **F-3:** `PayPerView.registerFilm` was `external` with no access control
  and recorded `msg.sender` as filmmaker. Any address could claim any
  filmId and irreversibly capture its 75% share. Reproduced by reading
  `PayPerView.sol` (no `onlyOwner`, `filmmaker: msg.sender`).

Reproduction artifacts: `checks/baseline/check-frontend.json.log`
(5 wiring failures quoting the old page source).
