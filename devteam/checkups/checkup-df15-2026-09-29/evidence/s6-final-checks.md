# S6 — Checks green (checkup-df15-2026-09-29)

Final checks against the post-change source (recorder-run, source
unchanged by every check):

- `check-hardhat`: exit 0 — **239 passing, 0 failing** (237 standing +
  2 net new: owner-only registration test, zero-filmmaker revert test;
  the front-runner test also asserts revenue still splits to the real
  filmmaker).
- `check-frontend`: exit 0 — **143/143 passing** (10 files), including
  the 6 `mintPageWiring` assertions against the NEW page and the
  `payPerView` wrapper filmmaker-param test.
- `check-tsc`: exit 0 — clean, no output.

No pre-existing test was lost: every baseline-green test still passes;
the only baseline failures were the 5 fail-against-old wiring assertions,
which now pass against the repaired page.
