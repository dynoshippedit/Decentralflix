# S0 — scope and reality freeze (checkup-df-renounce-2026-09-29)

## Resolved root
`/home/dino/Decentralflix`, branch `devteam/df-renounce-media-2026-09-29`
(latest commit 15b6f5e, "DF-4: fix useOwnedFilms burn-enumeration bound...").

## Declared scope: CHANGE CHECKUP — Repair 1 (DF-RENOUNCE-1)
The renounce-redirect repair only:
1. `packages/contracts/contracts/RevenueSplitter.sol` — adds `platformRenounced`
   flag; overrides `renounceOwnership()` (sets flag, then super → owner = address(0));
   `_splitRevenue` early-returns post-renounce: creator receives 100% of msg.value,
   platformFee = 0, no fee leg, no burn. NatSpec updated.
2. `packages/contracts/test/RenounceRedirect.test.ts` — NEW, 5 tests across
   TicketNFT / PayPerView / SubscriptionManager / MovieTicket.

## Requirement source
Decision record: DF-RENOUNCE-1 option (b), Dino's chief pick 2026-09-29
(work independently): on renounceOwnership the 25% platform fee is redirected
to the creator on future sales — not burned to address(0) (burning destroys
value) and no revert-guard (a revert-guard could brick a legitimate exit).
Contracts stay UNAUDITED — the review must not present them as audited.
The "NOTE: this contract is unaudited" notice was verified intact in
RevenueSplitter.sol and in the test file header.

## Inventory of the selected set (2 files)
- `packages/contracts/contracts/RevenueSplitter.sol` (abstract contract,
  Ownable; shared 75/25 splitter; called by all four money-taking contracts)
- `packages/contracts/test/RenounceRedirect.test.ts` (hardhat/ethers/chai,
  loadFixture-based, exact-balance assertions)

## Review units and lenses
- unit-revenuesplitter → COR ARC TST DOC SEC DAT DOM
- unit-renouncetest   → COR ARC TST DOC
Omitted-lens applicability decisions:
- SEC on unit-renouncetest: NOT APPLICABLE — the test file defines no
  authorization boundary; access control is exercised by assertions (negative
  test "only the owner can renounce") and reviewed under COR/TST of the
  contract unit. The runner executes the tests, not untrusted input.
- DAT on unit-renouncetest: NOT APPLICABLE — no persistent state beyond the
  in-test chain fixture; balance assertions are reviewed under COR.
- DOM on unit-renouncetest: exercised via the contract unit; test-side
  economics assertions are covered by COR/TST cells.
- API/REL/PRF/UIX on both: NOT APPLICABLE — on-chain push-payment splitter;
  no pagination/webhooks, no retry/lease machinery, no UI, no hot path
  (two low-value ETH transfers per paid sale; gas cost not a gate criterion).
- BLD: NOT APPLICABLE as a separate lens cell — build reproducibility is
  exercised directly by check-compile and check-tests receipts.

## Commands (frozen in spec)
- check-compile: npx hardhat compile, cwd packages/contracts, baseline+final
- check-tests:  npx hardhat test,     cwd packages/contracts, baseline+final
  (expected: 250 passing, including the 5 new renounce tests)

## Out-of-scope pre-existing uncommitted changes (noted, not reviewed)
The working tree carries unrelated uncommitted changes from earlier runs —
frontend pages, lifeboat, cloudflare-worker, docs, package-lock, artifacts —
and, inside the same contracts package, other repair work on this branch
(e.g. PayPerView registerFilm→owner-only + PayPerView.test.ts updates,
MovieTicket NatSpec refresh, and the F-DFLIX-1 transferOwnership receive-probe
+ creator-first ordering inside RevenueSplitter.sol itself). Those are outside
Repair 1; they were inspected only where they interact with the renounce path
(fee-leg ordering, probe vs renounce bypass) and otherwise left to their own
reviews. The inheritors TicketNFT/MovieTicket/PayPerView/SubscriptionManager
are unchanged by Repair 1: none overrides renounceOwnership or _splitRevenue.

## Initial task
Run the gate snapshot, execute baseline checks, complete S0–S8 coverage of the
renounce behavior, challenge and disposition every finding, verify with final
checks, and hand back with the gate verdict.
