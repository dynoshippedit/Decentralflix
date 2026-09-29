# S2 — Reproduction / fail-against-old (checkup-dfbatch2-2026-09-29)

Method: targeted `git stash push <this-batch files>` → run new regression
tests against the old code → confirm failure → `git stash pop`. Pre-change
state for these files == HEAD versions (df-cycle-12..15 tree).

## Contracts (DF-SEC-3): stashed packages/contracts/contracts/RevenueSplitter.sol
Ran: npx hardhat test test/PayPerView.test.ts → **20 passing, 5 failing** on old code.

Root falsification (tests 1-2):
- "transferOwnership to a non-receiving contract reverts NewOwnerCannotReceive"
- "a failed bricking rotation leaves payments working (no outage)"
Both fail on old code with: `Error: The given contract doesn't have a custom
error named 'NewOwnerCannotReceive'` — the guard is absent; the old code lets
the bricking rotation succeed.

Harness artifact (tests 3-5 in the full-file run): they fail on old code with
`OwnableUnauthorizedAccount(owner)` — NOT because old code breaks them, but
because of a test-timing interaction: revertedWithCustomError validates the
error name SYNCHRONOUSLY (validateInput, before the tx promise is awaited —
confirmed in hardhat-chai-matchers source). On old code the transferOwnership
tx was already submitted, so it mines AFTER the next test's fixture revert and
pollutes it. Proven: with tests 1-2 skipped, tests 3-6 PASS on old code
(4 passing, 2 pending); minimal probes confirmed loadFixture reverts work and
the pollution requires the un-awaited successful tx. On new code the transfers
revert, so no pollution: 25/25 deterministic.

Tests 3-6 are no-regression guards (EOA rotation, zero-address, non-owner,
receiving-contract fee flow) — they pass on both old and new code by design.

## Lifeboat (DF-SEC-1 + DF-SEC-2): stashed apps/lifeboat/server.js + lib/pass.js
Ran: ./test.sh → **149 pass, 5 fail** on old code. The 5 failures:
- F-DFLIX-5 unauth 401 [detail: http=201] — old code imported with no auth at all
- F-DFLIX-5 buyer 403 [detail: http=201] — any authenticated role could import
- F-DFLIX-5 non-owner 403 [detail: http=201] — any filmmaker could poison any film's contacts
- F-DFLIX-6 retry double-credit — old code credited the same invoice twice (balance 2 != 1)
- F-DFLIX-6 second invoice — cascading from the double-credit (balance 3 != 2)
Both defects were reachable on old code and are closed by the repair.

## Media (DF-MEDIA-1/2): source-read reproduction (no execution needed)
- F-1: watch page passed a full URL as livepeerPlaybackId; useVideoSources
  builds `https://livepeercdn.studio/hls/<id>/index.m3u8` → mangled nested URL.
- F-2: old demo URL https://test-streams.github.io/streams/xbox.m3u8 fetched → 404
  (test-streams.mux.dev/x36xhzz/x36xhzz.m3u8 verified live 2026-09-29).
- F-3: film page fabricated 'demo-'+hash IDs → Livepeer "#EXT-X-ERROR: Stream open failed".
- DF-MEDIA-3: getAuthAccount reads ONLY the Authorization header; no query-param
  token support exists → conditional disposition: no change (see S5).
