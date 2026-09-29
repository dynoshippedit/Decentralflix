# Test inventory and quality assessment
Owner: Test Engineer (TST) · Last updated: 2026-09-29

## How it works (with path:line references)

Four independent suites, four frameworks, no shared harness, no CI (no `.github/` exists —
verified `ls -a` at repo root, 2026-09-29). Each suite is invoked separately:

| Suite | Path | Framework | Runner command | Files | Tests | Verdict |
|---|---|---|---|---|---|---|
| Contracts | `packages/contracts/test/*.test.ts` | Hardhat + mocha/chai (+ hardhat-chai-matchers) | `npm test` → `hardhat test` (`packages/contracts/package.json:9`) | 10 | 217 | Real assertions, in-process EVM, no RPC/keys |
| Storage | `packages/storage/test/*.test.js` | `node:test` + `node:assert/strict` | `npm test` → `node --test 'test/*.test.js'` (`packages/storage/package.json:14`) | 8 | 93 | Real assertions; in-process HTTP mock servers only |
| Frontend | `apps/frontend/**/*.test.ts` | vitest (node env default; `vitest.config.ts`) | `npm test` → `vitest run` (`apps/frontend/package.json`) | 14 | 203 | Real assertions; no network in tests |
| Lifeboat | `apps/lifeboat/test.sh` | bash + curl | `./test.sh` (starts `server.js`, curls `http://127.0.0.1:8080`) | 1 | 128 | PASS/FAIL counters; `set -u`; asserts every step |

**Total: 33 test files, 641 tests.** Counts verified 2026-09-29: contracts 217 and
frontend 203 by static `it(`/`test(` count (match the 2026-09-28 reported figures exactly);
storage **93 confirmed by actually running** `node --test` on the Threadripper-sourced tree
(93 pass / 0 fail on this VM); lifeboat 128 = 128 `fail "` call sites (one per case).
Static grep undercounts storage by 7 because `merkle.test.js:63` generates tests in a loop
(`it(\`round-trips every leaf of a ${n}-leaf tree\`, …)`) — the runtime count is authoritative.

Per-file counts (contracts): DFLIX 30 · FilmmakerCampaign 25 · MovieTicket 34 · PayPerView 20 ·
ProofRegistry 13 · Reviews 10 · SeederCredits 16 · SeederReputation 14 · SubscriptionManager 24 ·
TicketNFT 31.
Per-file counts (storage): arweave 12 · encrypt 11 · fragment 13 · hash 8 · index 2 · ipfs 10 ·
merkle 21 (runtime; 14 static + 7 loop-generated) · store 16.
Per-file counts (frontend): wrappers/ticketNft 32 · wrappers/subscriptionManager 16 ·
wrappers/payPerView 18 · wrappers/dflix 42 · useWeb3Wallet 2 · web3/detect 16 ·
web3/contracts 5 · web3/connect 16 · pricing 14 · licensing 5 · indexer 11 · demo-content 15 ·
copy-honesty 3 · contracts/config 8.
(`apps/frontend/components/UploadTest.tsx` matches `grep -i test` but is a React component,
not a test — excluded.)

### The copy-honesty suite
`apps/frontend/lib/copy-honesty.test.ts` (3 tests) scans every non-test `.ts`/`.tsx` under
`apps/frontend/` for 13 banned perpetuity-promise regexes (`/permanent access/i`,
`/own (it )?forever/i`, …), against an explicit allowlist (storage facts, the one sanctioned
license-table term, internal identifiers). It also pins `PRICING_STATUS === "draft"`-adjacent
guards via `pricing.test.ts` (14 tests: 75%-share basis, deferred-feature honesty, no "forever"/
"permanent"/"unlimited free" in offers). **It runs under `vitest run`, but nothing runs it
automatically** — no CI, no pre-push hook found. Note: the brief said this suite is "mentioned
in `apps/frontend/AGENTS.md`" — that file is only the Next.js agent-rules block
(`<!-- BEGIN:nextjs-agent-rules -->`); it says nothing about copy-honesty. The premise is stale.

## Observations

**Deterministic.** No `Math.random`, `Date.now()`, or `setTimeout` in any unit test
(grepped all suites). Storage fixtures use `node:crypto randomBytes` for content only, never
for asserted values (except key-uniqueness, which is safe). `test.sh` uses `$RANDOM`/
`date +%s` solely to mint a unique pass-buyer email (`lifeboat/test.sh:413`) — hermetic.

**Hermetic.** Contracts: in-process Hardhat EVM ("no RPC, keys, or external services" —
`MovieTicket.test.ts:15`). Storage: all Kubo/Arweave traffic goes to in-process mock servers
(`packages/storage/test/helpers/mock-servers.js:1-8`: "Used ONLY by the test suite… No external
network is used in tests"). Frontend: zero `fetch`/HTTP in any test. Lifeboat: all curl targets
are `http://127.0.0.1:${PORT}` (only external-looking string is none — verified). The
"hermetic per 636edbc" claim checks out: commit `636edbc` ("make lifeboat test.sh hermetic")
stashes `data/` aside per run and pins fixed test emails; the script backs up/restores `data/`
(`test.sh:15-22`) with an EXIT trap.

**No skipped or disabled tests anywhere.** Grepped all suites for `.skip`, `xit(`, `xdescribe`,
`test.only`, `describe.only`, `skip: true`, and commented-out `it(`/`test(`/`describe(` blocks —
zero hits. (The `.skip` hits in `test.sh` are JS `.test()` regex calls inside embedded node
one-liners, not skips.)

**Fixture honesty is good.** Wrappers are labeled "(mocked factory module)"
(`wrappers/payPerView.test.ts:2`); indexer tests are explicitly "(demo mode)" with no
`NEXT_PUBLIC_INDEXER_URL` (`indexer.test.ts:12`); lifeboat purchases assert `test_mode=true`
(`test.sh:200`); `contracts.ts` tests assert the UNDEPLOYED guard throws instead of a dead
contract (`web3/contracts.test.ts:5-9`).

**Assertion density is real everywhere sampled.** Contracts average ~2.5 `expect(` per test
(535 expects / 217 tests), including negative paths (reverts, caps, double-withdraw).
The four web3 wrapper suites are thin by design — one assertion per test via the `expectCall`
helper (`wrappers/payPerView.test.ts:46-52`) — they pin call routing/signatures, not behavior.
No assertion-free test file was found.

**Environment prerequisites (BLD to own):** `test.sh` hard-exits if `ffmpeg` is missing and
`/tmp/testfilm.mp4` is absent (`test.sh:113-119`); it also reuses the fixed global path
`/tmp/testfilm.mp4` rather than a per-run tmpdir (content-deterministic, low risk).

### Crown-jewel coverage map

**Jewel 1 — paid/token-gated content protection.**
Proven: crypto primitives — AES-256-GCM round-trip, IV uniqueness, wrong-key/tamper rejection
(`storage/test/encrypt.test.js`, 11 tests); sha256 manifest + Merkle proofs incl. on-chain
`verifyFragment` against a real split+hashed film (`contracts/test/ProofRegistry.test.ts`,
"verifyFragment — end to end with @decentralflix/storage"); pinning on mock Kubo + Arweave
fallback (`storage/test/store.test.js`, 16 tests); lifeboat server-side gating — stream/download
401 without token, 403 without purchase, path traversal blocked (`test.sh:163-181,399`);
on-chain delisting flips access off/on (`MovieTicket.test.ts:279-300`).
NOT proven (→ TST-001, TST-008): `@decentralflix/storage` is **imported by nothing** — the only
repo-wide reference outside `packages/storage/` itself is the coincidental identifier
`restoreFilm` in `abis.generated.ts:1010`; the real upload path (`UploadTest.tsx`) posts raw
bytes to Arweave with no encryption; there is no key-distribution/key-delivery code or test;
no test asserts the lifeboat honors on-chain delisting.

**Jewel 2 — creator payout math.**
Proven: 75/25 split exactness + fee caps — PayPerView 2500 bps cap enforced and revert-tested,
net-payout `changeEtherBalance`-asserted (`PayPerView.test.ts`, 20); MovieTicket 75/25 exact,
50%-at-construction cap (`MovieTicket.test.ts`, 34); SubscriptionManager withdraw-to-owner
(24); TicketNFT full-payment forwarding (31); FilmmakerCampaign escrow/tranche/refund (25);
DFLIX staking rewards incl. partial-unstake checkpointing (30); SeederCredits attestor-signed
reports, cooldowns, no-replay (16); lifeboat pass double-redemption spends no credit,
ledger entries non-transferable/non-cashable (`test.sh:625-632,587`).
NOT proven (→ TST-002, TST-009): no reentrancy/adversarial test for any ETH-moving function
(all 7 money contracts import `ReentrancyGuard`, zero tests attack it); no cross-layer test pins
the frontend's 75%-share copy to the contracts' fee-cap enforcement.

**Jewel 3 — upload → transcode → playback.**
Proven: upload validation — music-rights attestation, price, territories rejected with 400
(`test.sh:139-151`); playback — 200 full, `Content-Type: video/mp4`, `Accept-Ranges`, 206 with
correct `Content-Range`, 1024-byte body, byte-exactness vs full stream, 416 out-of-range
(`test.sh:205-217`).
NOT proven: **transcoding does not exist** — no ffmpeg/transcode/HLS/DASH/ABR code in
`apps/lifeboat/` (grepped; the only ffmpeg use is generating the *test fixture* in `test.sh`);
the pipeline is upload → store → direct-file stream. No frontend player/component test exists
at all (→ TST-004).

**Jewel 4 — wallet + auth flow.**
Proven: lifeboat auth matrix — signup/login/duplicate-409/wrong-password-401/`auth/me`/
no-token-401, role-gated import (buyer→403), filmmaker-only audience.csv (`test.sh:68-192`);
Ed25519 receipts — sign/verify, tamper rejection, pubkey endpoint, pure-JS vs `node:crypto`
vector agreement, CLI offline verify + wrong-key/malformed rejection
(`test.sh:320-349,705-751`); frontend `connectWallet()` against a mock EIP-1193 provider
through the *real* ethers v6 `BrowserProvider`, switchChain payloads asserted verbatim
(`web3/connect.test.ts`); EIP-6963 discovery + SSR safety (`web3/detect.test.ts`, 16);
UNDEPLOYED guard (`web3/contracts.test.ts`, 5).
NOT proven (→ TST-005, TST-007): indexer real GraphQL path (demo mode only, 11 tests);
`useWeb3Wallet` connect/disconnect happy paths (only SSR graceful-degradation, 2 tests);
no Privy-flow test (Privy is demo/stubbed per B3).

**Jewel 5 — pinning / persistence.**
Proven (all against in-process mocks): every fragment pinned on local Kubo
(`store.test.js`: "pins every fragment on the local Kubo node"); manifest + fragments mirrored
to Arweave; IPFS→Arweave fallback on fragment loss; `FRAGMENT_UNAVAILABLE` when both miss;
`withRetry` backoff semantics.
NOT proven (→ TST-001, TST-006): nothing in the apps calls this module, so no production
pinning path is tested; no test against a real Kubo daemon or Arweave (even local/testnet);
pin-lapse/repin policy has no code and no test (B3 L7).

**Jewel 6 — moderation / takedown.**
Proven: `delistFilm` — owner-only, records reason + timestamp, `hasAccessToVideo` returns
false for holders of delisted films, restores on re-list (`MovieTicket.test.ts:279-300`);
Reviews rejects/hides reviews on delisted films (`Reviews.test.ts`).
NOT proven (→ TST-008): no lifeboat endpoint consults on-chain delisting — a delisted film
keeps streaming; no DMCA/takedown workflow, endpoint, or test exists anywhere off-chain.

## Open questions
1. Is `@decentralflix/storage` intended to be wired into the upload/playback path, or is it a
   standalone reference module? **Recommended default:** treat as unwired until W3B/STR confirm
   intent; the coverage map must not claim jewel-1 protection from it. (Overlaps B3 L4.)
2. Is there a CI plan? **Recommended default:** add a minimal GitHub Actions workflow running
   all four suites on push/PR — the copy-honesty tests are a legal control and currently
   advisory-only. (BLD owns CI per B9.2, but the test gap is recorded here as TST-003.)
3. Is server-side transcoding in scope, or is direct-file streaming the intended architecture?
   **Recommended default:** document direct-stream as the architecture; STR to confirm. (No code
   exists, so there is nothing to test either way.)

## Related issues
TST-001 · TST-002 · TST-003 · TST-004 · TST-005 · TST-006 · TST-007 · TST-008 · TST-009 ·
TST-010 · TST-011 — see `devteam/findings/tst.md`.
