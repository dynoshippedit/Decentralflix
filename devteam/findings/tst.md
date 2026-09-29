# Findings — Test Engineer (TST)
Scope: test inventory + crown-jewel coverage across all four suites · ID range: TST-001…TST-011
## Coverage completed
- `packages/contracts/test/*.test.ts` (10 files) — TST — full inventory: it-counts, expect-counts, skip-scan; full read of `PayPerView.test.ts` (1–258); title-level scan of the other 9 + targeted reads (`MovieTicket.test.ts:1-40,279-300`)
- `packages/storage/test/*.test.js` + `test/helpers/mock-servers.js` (9 files) — TST — full reads of `encrypt.test.js`, `store.test.js`, `arweave.test.js`; inventory of the rest; **executed** `node --test` on the Threadripper-sourced tree: 93 pass / 0 fail
- `apps/frontend/**/*.test.ts` (14 files) + `vitest.config.ts` — TST — full reads of `copy-honesty.test.ts`, `pricing.test.ts`, `wrappers/payPerView.test.ts`, `web3/useWeb3Wallet.test.ts`; header + targeted reads of the rest; skip/network scans of all
- `apps/lifeboat/test.sh` — TST — full structural scan (all 128 pass/fail sites enumerated), section reads (auth 60–110, stream 163–217, film2/AB2426 370–390, pass/ledger 560–660, receipts/CLI 690–751), hermeticity + determinism checks
- Cross-cutting greps: `.skip`/`it.only`/`xdescribe`/commented-out tests (zero hits); `Math.random`/`Date.now`/`setTimeout` in tests (zero hits); live-network URLs in tests (zero hits); `@decentralflix/storage` importers repo-wide (none outside the package); `ffmpeg|transcode|hls|dash` in `apps/lifeboat/` (zero hits); moderation/takedown endpoints (none off-chain)
## Findings

### TST-001 · Encrypted-storage module has 93 tests but zero integration: nothing imports it
**S1 · Confirmed · NEW · Effort M · Lens TST · Found by TST in Phase 1 on 2026-09-29**

**Location:** `packages/storage/src/` (module) vs `apps/`, `cli/`, `cloudflare-worker/` (importers: none)

**Evidence:**
```bash
$ grep -rln '@decentralflix/storage' --include='package.json' . | grep -v node_modules
./packages/storage/package.json          # <-- only itself
$ grep -rln 'from .@decentralflix/storage\|require(.@decentralflix/storage' \
    --include='*.js' --include='*.ts' --include='*.tsx' --include='*.mjs' . \
    | grep -v node_modules | grep -v 'packages/storage'
(none)
```
The single hit for `encryptFragment|storeFilm` in app code is a coincidence:
`apps/frontend/lib/contracts/abis.generated.ts:1010` contains `"name": "restoreFilm"` (a Solidity
function name), not the storage module. The real upload path posts raw bytes:
`apps/frontend/components/UploadTest.tsx:26-30` reads the file into a `Uint8Array` and calls the
Arweave hook with no encryption step.

**What's wrong:** The suite's best-tested security layer (AES-256-GCM round-trips, IV uniqueness,
tamper rejection in `packages/storage/test/encrypt.test.js`; pinning + Arweave fallback in
`store.test.js`) proves a module no production path uses. Anyone reading the 93-test count as
"crown jewel 1 is covered" is misled — paid content on the actual path is gated only by lifeboat
auth checks, unencrypted at rest/in transit to Arweave.
**Impact:** False confidence in the highest-risk crown jewel. A reviewer or Dino could conclude
"encryption is tested" while uploaded films sit in plaintext on a public gateway (W3B's L4 covers
the product hole; this is the test-coverage hole).
**Reproduce / reasoning:** The two greps above; `node --test` run confirms the 93 tests pass —
they just test an island.
**Other instances (sibling search):** Same pattern nowhere else: contract tests exercise deployed
contracts; lifeboat tests exercise the running server; frontend wrapper tests exercise the
wrappers. Only `packages/storage` is island-tested.
**Suggested fix:** Either (a) wire the module into the upload path and add an integration test
(upload → encrypted fragments → retrieve → decrypt), or (b) keep it standalone and label it
explicitly as a reference/standalone module so the coverage map can't be misread. Do not delete
the tests — the crypto primitives are worth keeping either way.
**Related:** notes/testing.md (jewel 1 map); B3 L4 (W3B); TST-006; TST-008

### TST-002 · No reentrancy or adversarial tests for any ETH-moving contract function
**S1 · Confirmed · NEW · Effort M · Lens TST · Found by TST in Phase 1 on 2026-09-29**

**Location:** `packages/contracts/test/` — all 10 files (PayPerView, SubscriptionManager,
FilmmakerCampaign, MovieTicket, TicketNFT, DFLIX, SeederCredits)

**Evidence:**
```bash
$ grep -rni 'reentr\|ReentrancyGuard\|fuzz\|invariant' packages/contracts/test/*.test.ts \
    packages/storage/test/*.test.js apps/frontend/lib 2>/dev/null
packages/contracts/test/MovieTicket.test.ts:8: * Covers the financial invariants that matter…
```
— the only hit is a doc comment. Meanwhile every money contract ships the guard:
```bash
$ grep -l 'nonReentrant\|ReentrancyGuard' packages/contracts/contracts/*.sol
DFLIX.sol  FilmmakerCampaign.sol  MovieTicket.sol  PayPerView.sol
SeederCredits.sol  SubscriptionManager.sol  TicketNFT.sol
```

**What's wrong:** Seven contracts move real funds (`withdrawRevenue`, `withdraw`,
`approveMilestoneAndRelease`, `mintPermanentPass`, `claimRewards`, …) and all carry
`ReentrancyGuard`, but no test deploys a reentrant attacker (or a malicious ERC777-style
receiver) to prove the guard actually engages. The intended behavior — "a reentrant call into
any withdraw path reverts" — is asserted nowhere.
**Impact:** Reentrancy is the classic S0 for payout contracts; the guard's presence is
untested, so a future refactor that drops `nonReentrant` (or adds a new unguarded payout path)
would go green. Per the brief, untested S0-adjacent security properties are S1.
**Reproduce / reasoning:** Static: the grep above shows zero adversarial tests across 217
contract tests. (W3B owns confirming whether the guards are correctly placed; TST owns the
missing negative tests.)
**Other instances (sibling search):** Same gap in all 10 test files — no fuzz/invariant tests
(Foundry-style) exist anywhere either.
**Suggested fix:** Add one reentrant-attacker test per payout entry point (Hardhat makes this
cheap: a test contract whose `receive()` re-calls the withdraw function; assert revert / single
payout). Consider `ReentrancyGuard` removal-mutation as a meta-check.
**Related:** B3 L1 (contracts unaudited); TST-009

### TST-003 · No CI: all four suites — including the copy-honesty legal guard — run only manually
**S2 · Confirmed · NEW · Effort S · Lens TST · Found by TST in Phase 1 on 2026-09-29**

**Location:** repo root (`.github/` absent); `apps/frontend/lib/copy-honesty.test.ts`

**Evidence:**
```bash
$ ls -a | grep github; ls .github 2>/dev/null || echo 'NO .github dir'
NO .github dir
```
`copy-honesty.test.ts:1-11` documents itself as the "Update-20 copy sweep guard" banning 13
perpetuity-promise patterns (`/permanent access/i`, `/own (it )?forever/i`, …) — the control
behind the whole "no perpetual promises" product commitment. It runs only when a human runs
`vitest run`.

**What's wrong:** There is no automated enforcement that any suite passes — no GitHub Actions,
no pre-push hook found. The copy-honesty tests exist specifically to prevent legally risky
marketing copy from shipping, but a commit can reintroduce "permanent access" copy and merge
with zero signal.
**Impact:** Regressions (including the legal-copy kind this program was built to prevent) are
caught only by humans remembering to run tests. Moderate likelihood, moderate-to-high impact
given the legal sensitivity of the copy claims.
**Reproduce / reasoning:** `ls .github` → absent; root `package.json` has no `test` script
(TST-011), so there isn't even a conventional entry point for CI to call.
**Other instances (sibling search):** Same for hardhat (`packages/contracts`), `node --test`
(`packages/storage`), and `test.sh` — none wired to any automation.
**Suggested fix:** Minimal `.github/workflows/test.yml` running the four suites on push/PR.
(BLD owns CI per B9.2; this entry records the test-side gap.)
**Related:** TST-011; notes/testing.md ("The copy-honesty suite")

### TST-004 · Zero tests for frontend routes and components
**S2 · Confirmed · NEW · Effort L · Lens TST · Found by TST in Phase 1 on 2026-09-29**

**Location:** `apps/frontend/app/**`, `apps/frontend/components/**`

**Evidence:**
```bash
$ git ls-files apps/frontend | grep -i test
apps/frontend/components/UploadTest.tsx        # a component, not a test
apps/frontend/lib/contracts/config.test.ts
… (13 more lib/**.test.ts — all under lib/)
apps/frontend/vitest.config.ts
```
`vitest.config.ts` includes `**/*.test.ts(x)` — the harness would pick up component tests, but
none exist. Every one of the 203 frontend tests lives under `lib/` (pure logic, wrappers, copy
guards).

**What's wrong:** The entire user-facing surface — pages, the video player unlock flow, purchase
flows, the filmmaker dashboard — has no automated tests. The intended behavior of critical flows
(browse → purchase → stream unlock in the UI) is proven nowhere above the lib layer.
**Impact:** UI regressions in the money-adjacent flows (purchase, pass redemption display) ship
silently. The lifeboat `test.sh` covers the API; nothing covers the UI that calls it.
**Reproduce / reasoning:** The `git ls-files` listing above — zero test files outside `lib/`.
**Other instances (sibling search):** `apps/frontend/hooks/`, `app/`, `components/` — all
untested.
**Suggested fix:** Add component tests for the critical UI flows first (purchase/unlock,
pass redeem), using the existing mocked-wrapper pattern. Long-term, a Playwright smoke pass for
browse→purchase→playback.
**Related:** notes/testing.md (jewel 3 map)

### TST-005 · Indexer real (GraphQL) path is untested — demo mode only
**S2 · Confirmed · NEW · Effort S · Lens TST · Found by TST in Phase 1 on 2026-09-29**

**Location:** `apps/frontend/lib/indexer.test.ts`

**Evidence:**
```ts
// apps/frontend/lib/indexer.test.ts:12-13
// With no NEXT_PUBLIC_INDEXER_URL set, the indexer runs in deterministic demo mode with no
// network access (graphqlQuery short-circuits to null). Clear the in-memory cache before each test.
```
All 11 tests exercise `hasAccessToFilm`/`getMyFilms`/etc. against hardcoded demo films
(`raging-midlife`, `savage-midlife`); no test sets `NEXT_PUBLIC_INDEXER_URL` or mocks the
GraphQL transport.

**What's wrong:** The production code path — real GraphQL queries for access, catalog, earnings —
has zero test coverage. The intended behavior (correct field mapping, schema-drift tolerance,
error handling) is unproven; only the demo fallback is.
**Impact:** When the indexer URL is configured, the app runs code no test has ever executed.
Wrong access decisions (`hasAccessToFilm`) would be a jewel-1/jewel-4 failure.
**Reproduce / reasoning:** Read `indexer.test.ts` — every describe block is "(demo mode)".
**Other instances (sibling search):** Same demo-only pattern is *honest* in `demo-content.test.ts`
(that's its subject); the gap is specific to `indexer.ts`'s live path.
**Suggested fix:** Mock the GraphQL transport (not the network) and test field mapping +
failure modes for each exported function.
**Related:** DAT mock/fallback checklist (B9.9)

### TST-006 · Storage tests are mock-only: no test touches a real Kubo node or Arweave
**S2 · Confirmed · NEW · Effort M · Lens TST · Found by TST in Phase 1 on 2026-09-29**

**Location:** `packages/storage/test/` (all 8 files)

**Evidence:**
```js
// packages/storage/test/helpers/mock-servers.js:1-8
/**
 * TEST MOCKS — in-process HTTP doubles for the Kubo IPFS API and the
 * Arweave gateway. Used ONLY by the test suite; they speak just enough of
 * each API for the client tests and deliberately implement nothing else.
 * No external network is used in tests.
 */
```
```js
// packages/storage/test/arweave.test.js:21
const client = () => new ArweaveClient({ gateway: mock.url, signTx: testSignTx });
```
Every client test constructs its client against `mock.url`. The mocks implement "just enough
of each API".

**What's wrong:** The mocks encode the authors' assumptions about the Kubo/Arweave APIs; any
divergence (real Kubo pin response shape, Arweave gateway error codes, chunking behavior) is
invisible to the suite. Pin-lapse/repin policy has no code and no test (B3 L7).
**Impact:** Integration bugs against real infrastructure would surface only in production.
Likelihood is moderate; impact is jewel-5 (content unavailable = product broken).
**Reproduce / reasoning:** Grep shows no test constructs `IpfsClient`/`ArweaveClient` with a
non-mock endpoint; no docker/testnet harness exists.
**Other instances (sibling search):** All 8 storage test files share the pattern.
**Suggested fix:** Add an opt-in integration job (env-gated, e.g. `TEST_LIVE_IPFS=1`) against a
local Kubo daemon; keep it out of the default suite. (Also moot until TST-001 is resolved —
wiring first, then live-path tests.)
**Related:** TST-001; B3 L7

### TST-007 · `useWeb3Wallet` connect/disconnect flows are untested
**S3 · Confirmed · NEW · Effort S · Lens TST · Found by TST in Phase 1 on 2026-09-29**

**Location:** `apps/frontend/lib/web3/useWeb3Wallet.test.ts`

**Evidence:**
```ts
// apps/frontend/lib/web3/useWeb3Wallet.test.ts:1-6
/**
 * Tests for lib/web3/useWeb3Wallet.ts.
 * No DOM in this suite (node env): we verify the hook renders safely under
 * React SSR with no wallet present (the graceful-degradation requirement).
 */
describe('useWeb3Wallet', () => {
  it('renders under SSR with no wallet and reports disconnected', …);   // 4 expects
  it('connect() surfaces a friendly error (not a crash) when no wallet exists', …); // 2 expects
});
```

**What's wrong:** Only the degraded path is tested. The happy paths — connect returns address +
chainId, disconnect clears state, account/chain change events update the hook — are unproven,
even though `connect.ts` (the layer below) is well tested with a mock EIP-1193 provider.
**Impact:** Low — the underlying `connectWallet()` wiring is tested (`connect.test.ts`, 16
tests); the residual risk is hook state-management bugs.
**Reproduce / reasoning:** The file has exactly 2 tests, both no-wallet scenarios.
**Other instances (sibling search):** None — `detect.test.ts` and `connect.test.ts` cover their
modules well.
**Suggested fix:** Render the hook with a mock EIP-1193 provider (same mock as
`connect.test.ts`) and assert connect/disconnect/event flows.
**Related:** notes/testing.md (jewel 4 map)

### TST-008 · Takedown has no off-chain enforcement or test: lifeboat ignores on-chain delisting
**S1 · Confirmed · NEW · Effort M · Lens TST · Found by TST in Phase 1 on 2026-09-29**

**Location:** `apps/lifeboat/server.js` (no delist check); `apps/lifeboat/test.sh` (no takedown test)

**Evidence:**
```bash
$ grep -in 'moderate\|takedown\|dmca\|delist' apps/lifeboat/server.js
210:    if (session) { try { store.remove('sessions', token); } catch {} }   # session logout, not moderation
324:  …store.remove('sessions', …)                                          # same
1066://  Flagged in README as a pre-launch hardening item.)                 # auth, not moderation
$ grep -in 'moderate\|takedown\|dmca\|delist' apps/lifeboat/test.sh
(none)
```
On-chain, delisting is real and tested (`MovieTicket.test.ts:279-300`: "blocks access to a
delisted film and restores it"; `Reviews.test.ts`: "rejects reviews on a delisted film"). Off-chain,
nothing reads it.

**What's wrong:** The emergency legal delisting (T16) that the contracts test only flips
*on-chain* access. The lifeboat — the actual streaming server — has no endpoint, no check, and
no test for takedown: a film delisted for CSAM/DMCA keeps streaming from `:8080` with a valid
purchase. The intended behavior ("delist stops delivery everywhere we control") is asserted
nowhere off-chain.
**Impact:** Legal exposure — this is B3's L8 and crown jewel 6. A takedown that doesn't take down
is arguably worse than no takedown (creates a record of knowledge without remediation). S1 as an
untested S0-adjacent property; the underlying product gap belongs to W3B/STR.
**Reproduce / reasoning:** The greps above + `test.sh`'s 128 cases contain no delist/takedown case.
**Other instances (sibling search):** No moderation endpoint exists in the frontend either
(`grep -ri 'delist' apps/frontend/lib` → none).
**Suggested fix:** Decide the enforcement point (lifeboat consults on-chain delist status before
stream; or an admin takedown endpoint), implement, and add `test.sh` cases: delisted film →
stream 403/410; re-listed → 200 again.
**Related:** B3 L8; notes/testing.md (jewel 6 map); `MovieTicket.test.ts:279-300` (the on-chain half)

### TST-009 · No cross-layer test pins frontend 75%-share claims to contract fee-cap enforcement
**S2 · Confirmed · NEW · Effort S · Lens TST · Found by TST in Phase 1 on 2026-09-29**

**Location:** (gap) between `apps/frontend/lib/pricing.ts` and `packages/contracts/contracts/`

**Evidence:**
```ts
// apps/frontend/lib/pricing.test.ts:17-21 — asserts the COPY says 75%
it("uses the verified 75% creator-share basis everywhere", () => {
  expect(CREATOR_SHARE).toBe(0.75);
  …
});
// packages/contracts/test/PayPerView.test.ts — asserts the CONTRACT enforces ≤25% fee
await expect(ppv.connect(owner).setPlatformFeeBps(2501n))
  .to.be.revertedWithCustomError(ppv, "FeeTooHigh")…
```
No test relates the two: nothing asserts `CREATOR_SHARE == 1 - MAX_FEE_BPS/10000`, and nothing
asserts the frontend's configured contract addresses point at contracts with those caps.

**What's wrong:** The 75/25 promise is tested twice in isolation (copy says it; contracts enforce
it) but never *together*. A contract deployed with a different fee cap, or copy drift to a new
number, would pass both suites while the product contradicts itself.
**Impact:** Money-claim integrity — the exact class of inconsistency the pricing-honesty tests
were built to prevent, one layer up. Moderate likelihood (config drift), high trust impact.
**Reproduce / reasoning:** Static — no file imports both `pricing.ts` and the contract fee-cap
constants.
**Other instances (sibling search):** Same gap for `FILMMAKER_TIERS` prices vs on-chain plan
prices; for `CONTRIBUTION_TABLE` math vs `MovieTicket` fee math.
**Suggested fix:** One cross-layer test (frontend suite is fine) importing the contract fee-cap
constants (from `abis.generated.ts` or a shared constants module) and asserting equality with
the pricing basis. MUS owns the money-truth call.
**Related:** TST-002; B3 L3

### TST-010 · `test.sh` hard-requires ffmpeg and reuses a global fixture path
**S3 · Confirmed · NEW · Effort XS · Lens TST · Found by TST in Phase 1 on 2026-09-29**

**Location:** `apps/lifeboat/test.sh:110-121`

**Evidence:**
```bash
# apps/lifeboat/test.sh:110-119
if [ ! -s /tmp/testfilm.mp4 ]; then
  …
  if ! ffmpeg -y -loglevel error \
      -f lavfi -i "testsrc=duration=10:size=640x360:rate=30" \
      … -shortest /tmp/testfilm.mp4; then
    fail "ffmpeg could not generate test film"
    exit 1
  fi
fi
```

**What's wrong:** On a machine without ffmpeg (and no stale `/tmp/testfilm.mp4`), the suite exits
1 before testing anything — an environment prerequisite masquerading as a test failure. The
fixture also lives at a fixed global path instead of `$TMPD`, so concurrent runs share it
(content is deterministic, so this is low-risk, but it breaks the script's otherwise careful
per-run isolation).
**Impact:** A fresh contributor/CI runner without ffmpeg gets "FAIL" with no hint it's
environmental. XS to fix.
**Reproduce / reasoning:** Read the block; `exit 1` on ffmpeg failure is unconditional.
**Other instances (sibling search):** None — the rest of the script is self-contained.
**Suggested fix:** Check for ffmpeg up front and skip-with-message (or fail with "install
ffmpeg" guidance); generate the fixture under `$TMPD`.
**Related:** BLD baseline (environment prerequisites)

### TST-011 · No single command runs the whole test suite
**S3 · Confirmed · NEW · Effort XS · Lens TST · Found by TST in Phase 1 on 2026-09-29**

**Location:** repo-root `package.json`

**Evidence:**
```json
// package.json "scripts" (root) — has dev/build/start/lint/typecheck/contracts:compile,
// but no "test". The four suites are invoked as:
//   cd packages/contracts && npx hardhat test
//   cd packages/storage && npm test
//   cd apps/frontend && npm test        (vitest run)
//   cd apps/lifeboat && ./test.sh
```

**What's wrong:** There is no documented or scripted way to run all 641 tests at once, so "the
suite is green" is always a manual four-step claim. Combined with TST-003 (no CI), full-suite
regressions are easy to miss.
**Impact:** Process friction; low direct risk, but it compounds TST-003.
**Reproduce / reasoning:** Root `package.json` scripts section has no `test` entry.
**Other instances (sibling search):** None.
**Suggested fix:** Add root `"test"` script chaining the four suites (with clear failure
propagation), which also gives CI (TST-003) a single entry point.
**Related:** TST-003
