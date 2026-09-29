# S7 — Final checks (checkup-dfbatch2-2026-09-29)

Gate receipts (all exit 0, argv/cwd match frozen spec):
- final-check-hardhat: npx hardhat test → 245 passing
- final-check-frontend: npx vitest run → 225 passed
- final-check-tsc: npx tsc --noEmit → clean
- final-check-lifeboat: ./test.sh → RESULT: PASS=154 FAIL=0

Source identity at final: branch devteam/review-2026-09-29 @ 15b6f5e (plus
uncommitted work as in S0). No source changes between final receipts and this
record (receipts ran back-to-back; no edits after).

Evaluation of check meaningfulness (per EVIDENCE_RULES — no empty suites):
- hardhat 245: includes the 6 new falsification tests; full inheritor coverage.
- vitest 225: includes the abi-drift guard (proven to fail pre-regen).
- tsc: type-level proof the page prop changes compile.
- test.sh 154: wire-level assertions incl. HMAC-signed synthetic webhooks.
