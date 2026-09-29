# S1 — executable baseline (checkup-df-renounce-2026-09-29)

Source identity at baseline: `e7bc7f69bd593153d7e2523aee202b13afcc093f51850a032b172be2ed1d1d32`
(source_before == source_after on both receipts — no mutation during checks).

## check-compile (receipt: receipts/baseline-compile-001.json)
- exit_code 0, timed_out false. `npx hardhat compile` in packages/contracts.
- Log tail: "Nothing to compile" — hardhat cache was already current with the
  present source (the repair worker had compiled before handing off). A clean
  no-op compile against the current source identity is still a pass; the cache
  is keyed on the current source (see final-run note in s6).

## check-tests (receipt: receipts/baseline-tests-001.json)
- exit_code 0, timed_out false, 250 passing / 0 failing / 0 pending (3s).
- DF-RENOUNCE-1 suite (test/RenounceRedirect.test.ts): 5/5 passing —
  TicketNFT (2), PayPerView (1), SubscriptionManager (1), MovieTicket (1).
  Exact-balance assertions hold: post-renounce sale of 0.05 ETH moves exactly
  0.05 ETH to creator, 0 to former owner, 0 left in contract;
  RevenueSplit(creator, PRICE, 0) emitted; non-owner renounce reverts with
  OwnableUnauthorizedAccount; MovieTicket post-renounce mint reverts
  (onlyOwner, owner is now address(0)).

## Critical workflow exercised (real, not mocked)
Real in-process hardhat network, real ETH transfers between signers:
register film/plan → buy/mint/subscribe (pre-renounce 75/25) →
renounceOwnership → buy/mint/subscribe (post-renounce 100% to creator).

## Environment
- node v22.23.2, npx, node_modules with hardhat present at
  packages/contracts/node_modules/.bin/hardhat. No environment faults
  (correct cwd, toolchain present, no external services or credentials needed).
- No database, no external providers: hardhat in-process chain only.

## Limits
- Contracts are UNAUDITED (notice intact in source and test header); this
  baseline proves behavior on the test chain only, not mainnet readiness.
