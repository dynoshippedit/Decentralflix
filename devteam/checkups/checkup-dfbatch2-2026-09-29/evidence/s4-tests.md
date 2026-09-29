# S4 — Test baseline and results (checkup-dfbatch2-2026-09-29)

## True pre-change baseline (observed in-terminal BEFORE any repair edit, 2026-09-29)
- npx hardhat test (packages/contracts): 239 passing
- npm test -- --run (apps/frontend): 225/225, 18 files
- npx tsc --noEmit (apps/frontend): clean
- ./test.sh (apps/lifeboat): 145 pass, 0 fail

## Final (post-repair), gate receipts all exit 0
- check-hardhat: 245 passing (239 + 6 new F-DFLIX-1). Full suite incl.
  MovieTicket/TicketNFT/SubscriptionManager inheritors — no 75/25 regressions.
- check-frontend: 225/225 (abi-drift guard green after regen).
- check-tsc: clean.
- check-lifeboat: 154 pass, 0 fail (145 + 3 F-DFLIX-5 + 6 F-DFLIX-6 assertions).

## Fail-against-old (see S2)
- Contracts: 5 of 6 new tests fail on old splitter (2 root falsifications +
  3 harness-timing artifacts explained); 1 no-overblock guard passes both.
- Lifeboat: 5 new assertions fail on old server/pass (auth bypass + double credit).

## Assertion quality (TST lens)
- New tests assert behavior, not existence: HTTP status codes on the wire,
  ether balance deltas, ledger entry counts, custom-error reverts with args,
  ownership unchanged after blocked rotation.
- No mocks in the falsification path except the two receiver contracts, which
  ARE the threat model (non-receiving owner).
- The abi-drift guard caught the real regen miss (4 failures) before it shipped.
