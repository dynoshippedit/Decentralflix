# S8 — Gate decision (checkup-df15-2026-09-29)

**Decision: PASS.** Zero outstanding findings.

- F-1 (HIGH): FIXED — `/mint` no longer calls the `onlyOwner`
  `MovieTicket.mintPermanentPass`; buyer purchases go through the
  user-payable `TicketNFT.mintTicket` with the exact on-chain price.
  Verified by `check-frontend` (wiring tests) and `check-tsc`.
- F-2 (MEDIUM): FIXED — no creator parameter, no silent buyer default;
  the 75% share goes to the filmmaker recorded on-chain at registration,
  and the page blocks the sale when that filmmaker is zero/empty or
  equals the buyer. Verified by `check-frontend` and `check-tsc`.
- F-3 (MEDIUM): FIXED — `PayPerView.registerFilm` is `onlyOwner` with an
  explicit nonzero `filmmaker`; front-running registration reverts and
  captures nothing. Verified by `check-hardhat` and `check-frontend`.

All frozen checks green at final: Hardhat 239/239, frontend 143/143,
`tsc --noEmit` clean. No pre-existing test lost. Work left uncommitted
on `devteam/review-2026-09-29`; no push/merge; contracts UNAUDITED.

Handback: parent agent receives the repair report at
`~/workspace/role-briefs/full-review-2026-09-29/repair-blockchain-F1F2F3-report.md`.
Follow-ups for the parent (not this repair): Cloudflare Worker/indexer
must honor TicketNFT for production playback; consider an end-to-end
local purchase test against a funded Hardhat node driving the real
`/mint` page.
