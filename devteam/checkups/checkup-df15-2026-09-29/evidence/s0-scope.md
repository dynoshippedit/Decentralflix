# S0 — Scope (checkup-df15-2026-09-29)

## Review type
**Change checkup** on the F-1/F-2/F-3 repair batch (blockchain findings from the
2026-09-29 full review). Scope: the changed contracts, their tests, the
rewired /mint page, the new filmId helper + wiring regression test, the
PayPerView wrapper, the regenerated ABI, and the TicketNFT access-source
addition — plus affected callers and the suites that guard them.

## Source identity
- Repo: /home/dino/Decentralflix, branch devteam/review-2026-09-29
- HEAD at freeze: 15b6f5e0af99674b85aa3b6a6950a181bcff2095
- Initial snapshot: devteam/checkups/checkup-df15-2026-09-29/initial.json
  (11 files, source_digest 6feb1c01d08d5d4c)
- Pre-existing uncommitted work (df14b artifacts, docs1, package.json/lockfile
  touches) is OUT of scope and untouched; this checkup snapshots only its 11
  selected paths.

## Findings under repair (from blockchain-engineer-findings.md)
- **F-1 (HIGH):** /mint called MovieTicket.mintPermanentPass (onlyOwner) from
  the buyer wallet → every real purchase reverted; needsMint dead-loop.
  Repair: /mint becomes the user-payable TicketNFT.mintTicket flow.
- **F-2 (MEDIUM):** `creator` silently defaulted to the buyer in the mint
  flow → owner-mint path would subsidize the buyer with the 75% creator
  share. Repair: no silent default; the new flow carries no creator
  parameter at all (75% goes to the on-chain registered filmmaker).
- **F-3 (MEDIUM, latent):** PayPerView.registerFilm permissionless →
  front-runner could claim any filmId and capture its revenue. Repair:
  onlyOwner + explicit filmmaker parameter (mirrors TicketNFT.registerFilm).

## Review units (9) / coverage cells (43)
contract-payperview (COR,ARC,TST,DOC,SEC,DAT), contract-movieticket
(COR,ARC,TST,DOC), contract-test-payperview (COR,ARC,TST,DOC), page-mint
(COR,ARC,TST,DOC,SEC,API,UIX), helper-film-id (COR,ARC,TST,DOC),
page-wiring-test (COR,ARC,TST,DOC), wrapper-payperview (COR,ARC,TST,DOC,API),
abi-regen (COR,ARC,TST,DOC), hook-access (COR,ARC,TST,DOC,API).

## Checks
- check-hardhat: npx hardhat test (packages/contracts) — baseline + final
- check-frontend: npx vitest run lib/contracts lib/web3/wrappers
  lib/web3/contracts.test.ts (apps/frontend) — baseline + final. The new
  mintPageWiring tests are EXPECTED TO FAIL at baseline (they fail against
  the old page); that failure is the fail-against-old evidence.
- check-tsc: npx tsc --noEmit (apps/frontend) — final only

## Exclusions
.git, node_modules (nested too), __pycache__, devteam/checkups — generated or
version-control internals, not application source.
