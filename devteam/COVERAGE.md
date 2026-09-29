# COVERAGE
Legend: [ ] not started · [~] partial (give ranges) · [x] done · n/a not required for this tier/file · NOT REVIEWED (reason)
Lenses: COR correctness · SEC security · PRF performance · TST tests · ARC architecture · UIX frontend · DAT data · DOM domain · DOC docs
When a file's tier is set, mark every lens not required for that tier as n/a; the remaining [ ] cells are the work list.
Required cells remaining: TBD   (check: grep -cE '\[ \]|\[~\]' devteam/COVERAGE.md)

Tier requirements — High: every applicable lens, every line · Medium: COR+SEC+ARC (+UIX/DAT/DOM where applicable), every line · Low: COR, every line.

| File | Lines | Tier | COR | SEC | PRF | ARC | TST | UIX | DAT | DOM | DOC | Read ranges / notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| (Cartographer to list every tracked file in Phase 1) | | | | | | | | | | | | |

## Excluded
| Path | Reason |
|---|---|
| node_modules/** | dependencies |
| .next/** | build output |
| packages/contracts/artifacts/** | build output (tracked — hygiene issue) |
| packages/contracts/cache/** | build output (tracked — hygiene issue) |
| packages/contracts/typechain-types/** | generated (tracked — hygiene issue) |
