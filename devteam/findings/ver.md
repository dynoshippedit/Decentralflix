# Phase 4 · Step 3 — Independent false-positive audit (VER)
<!-- VER · 2026-09-29 · auditor: verifier subagent · branch devteam/review-2026-09-29 @ e72ef55 -->
<!-- Method: every in-scope finding re-derived from source (no trust in finding text).
     Live repros on scratch lifeboat (127.0.0.1:18099, throwaway data dir): devteam/repro/ver-pass-endpoints.sh.
     Contract repro re-run: devteam/repro/w3b-signature-replay.test.ts (npx hardhat test).
     Dependency advisory check: npm audit on the Threadripper (independent of the finding). -->
<!-- Scope: all 16 S1 findings (no S0 exists in any findings file — S0 appears only as
     counterfactual: "hence S1 not S0", "classic S0 for payout contracts") + 20 of 50 S2
     findings (40% sample, spread across bug/sec/dat/doc/mus/str/arc/w3b/tst lanes,
     biased to money/auth/entitlements/payouts). S3/S4 not re-reviewed. -->
<!-- Severity rubric used: S0 = currently exploitable path to harm with money/user-data live NOW;
     S1 = concrete high-impact defect (auth bypass, money loss, false economic claims on
     marketing surfaces, broken critical flow); S2 = real defect with narrower blast radius
     or preconditions; S3/S4 minor. -->

## Verdict summary

| Verdict | Count | IDs |
|---|---|---|
| CONFIRMED (severity stands) | 25 | DOC-001, BLD-001, BUG-001, BUG-002, BUG-003, BUG-004, BUG-005, BUG-006, BUG-008, BUG-011, BUG-012, DAT-001, DAT-003, DAT-006, DAT-009, DAT-013, DOC-003, MUS-001, MUS-003, MUS-004, SEC-001, SEC-002, SEC-003, SEC-004, STR-001, STR-010, ARC-010, TST-001, TST-009, W3B-001, W3B-006 |
| CONFIRMED, DOWNGRADED | 5 | BLD-006 (S1→S2), BUG-007 (S2→S3), STR-002 (S1→S2), TST-002 (S1→S2), TST-008 (S1→S2) |
| REJECTED (false positive) | 0 | — |
| UPGRADED | 0 | — |

No finding was rejected outright — every in-scope claim re-derived to a real defect.
Five severities were corrected downward; in each case the defect is real but the
blast radius / preconditions do not meet the higher bar (details per finding).
BUG-001/BUG-002 are confirmed DUPLICATE pointers (of STR-001 and SEC-002/DAT-001).

---

## S1 findings

### DOC-001 — Legal page claims contracts are audited and deployed on Arbitrum
**Verdict: CONFIRMED · S1 stands.**
Evidence: `apps/frontend/app/legal/page.tsx:25` — "All value movement is direct
wallet-to-wallet via audited smart contracts on Arbitrum." Re-derived: (1) "audited"
is false — the same page's own pre-launch checklist (:41) lists "Full smart contract
audit + D&O / cyber insurance (recommended)" as not-done; (2) "on Arbitrum" is false —
`packages/contracts/deployments/` contains only `dry-run-local.json`; (3)
"wallet-to-wallet" is false for PPV — `PayPerView.sol:100-107` escrows into
`_filmRevenue`, exit only via `withdrawRevenue` (:117-131). Investor-facing page
("transparency with investors and partners", :41). S1 correct: false trust claim on
a money-handling surface.

### BLD-001 — next@16.2.6 pinned with two CRITICAL RCE advisories, fix available
**Verdict: CONFIRMED · S1 stands (independently re-verified).**
Evidence: `apps/frontend/package.json:18` pins `"next": "16.2.6"`. Independent
`npm audit` on the Threadripper (not the finding's method) reports the pinned range
falls in `16.0.0 - 16.3.2` / critical, including **GHSA-p293-qw3h-jr36**
("Unauthenticated Remote Code Execution on windows-hosted servers") and
**GHSA-2xp9-vwfh-vxw4** ("Unauthenticated Remote Code Execution in Image
Optimization API when AVIF files are used"), plus middleware bypass (GHSA-6gpp-xcg3-4w24),
SSRF, and DoS entries; fix `next@16.3.6` available (outside pinned range, needs --force).
The finding's "two CRITICAL RCE advisories, fix available" is exactly right.

### BLD-006 — Security-relevant env vars are read but undocumented
**Verdict: CONFIRMED defect · DOWNGRADED S1 → S2.**
Evidence: `.env.example` lacks `STRIPE_SECRET_KEY` (read at `lib/stripe.js:18`),
`STRIPE_WEBHOOK_SECRET` (read at `server.js:753`), `BUNNY_API_KEY` /
`BUNNY_STORAGE_ZONE` / `BUNNY_PULLZONE_HOSTNAME` (`lib/cdn.js:95-97`),
`DEPLOYER_PRIVATE_KEY` (`scripts/deploy-testnet.js:40`), `ARBISCAN_API_KEY`
(`hardhat.config.ts:30`); the `PRIVATE_KEY` vs `DEPLOYER_PRIVATE_KEY` naming split is
real (`hardhat.config.ts:14` uses `PRIVATE_KEY`, the deploy script requires
`DEPLOYER_PRIVATE_KEY`). Why downgraded: every consumer fails closed (stub/local
mode) when the vars are absent, so misconfiguration degrades rather than opens a
hole — config hygiene and secret-handling risk, not a concrete high-impact defect.
S2 is the honest grade.

### BUG-001 — Lifeboat static UI never sends auth — DUPLICATE of STR-001
**Verdict: CONFIRMED · S1 stands · duplicate pointer kept.**
Evidence: `apps/lifeboat/public/app.js` (173 lines) — `grep Authorization|Bearer|token|localStorage`
→ zero hits; fetch calls at :63/:74/:89 send only `Accept: application/json`.
`/api/purchases/test` requires `requireAuth` (server.js:1212), so the browser
purchase journey always 401s. Broken critical flow → S1.

### BUG-002 — `store.remove` missing — DUPLICATE of SEC-002/DAT-001
**Verdict: CONFIRMED · S1 stands · duplicate pointer kept.** Same evidence as
DAT-001/SEC-002 below.

### DAT-001 / SEC-002 — Logout and session revocation are dead code
**Verdict: CONFIRMED · S1 stands (reproduced live).**
Evidence: `apps/lifeboat/lib/store.js:94` exports `{ all, get, insert, update,
DATA_DIR }` — no `remove`. `server.js:210` and `:324` call `store.remove(...)`
inside `try/catch{}`, so both the expired-session prune and `POST /api/auth/logout`
silently no-op while returning `{logged_out: true}`. Live repro
(`devteam/repro/ver-pass-endpoints.sh`, scratch server :18099): signup → logout
(200) → `GET /api/auth/me` with the same token → **200** (token still valid).
`SESSION_TTL_MS` = 30 days (`lib/auth.js:21`). Stolen/"logged-out" tokens stay valid
a full month; operators cannot force-logout. Concrete auth defect → S1.

### DAT-013 — `claim.html` cannot file a claim
**Verdict: CONFIRMED · S1 stands.**
Evidence: `apps/lifeboat/public/claim.html:94` posts `{ film_id, email,
vimeo_receipt_ref }`; `fileClaim` (`server.js:542-595`) requires `purchase_type`
∈ {"buy","rent"} (400 otherwise) and `purchase_date` as valid ISO date (400
otherwise). The page's only form has no such fields, so every submission 400s and
the UI always shows "Claim failed". The Vimeo-migration claim path — the core
filmmaker-migration flow — is completely broken from the UI. Broken critical
flow → S1.

### MUS-001 — SubscriptionManager pays creators 0%
**Verdict: CONFIRMED · S1 stands.**
Evidence: `SubscriptionManager.sol` — full read (186 lines); the only money exit is
`withdraw()` sending 100% of balance to `owner()`; `grep -i 'fee|filmmaker|creator'`
→ zero hits, no split, no per-filmmaker ledger. Meanwhile marketing copy promises
"75% creator share on every sale" on four surfaces (`app/pricing/page.tsx:40`,
`app/dashboard/page.tsx:523`, `app/crowdfund/page.tsx:26`,
`lib/pricing.ts:62,78,95`). The contract's own NatSpec is honest ("All payments
accumulate in the contract; only the owner can withdraw") — the *copy* is the false
economic claim. False economic claim on marketing surfaces → S1.

### SEC-001 — Unauthenticated pass test endpoints mint unlimited credits and grant permanent entitlements
**Verdict: CONFIRMED · S1 stands (reproduced live, end to end).**
Evidence: routes `server.js:1249` (`POST /api/passes/test`) and `:1258`
(`POST /api/passes/:id/redeem`) call `passTestSubscribe`/`passRedeem` with no
`requireAuth`. Live repro (`devteam/repro/ver-pass-endpoints.sh`): two
unauthenticated `POST /api/passes/test` → balance **2** (no billing-period guard);
unauthenticated `POST /api/passes/<id>/redeem` → 201, credit burned, permanent
entitlement + signed receipt granted. The finding's "non-transferability compares
two attacker-supplied values" nuance is accurate: `redeemCredit`
(`lib/pass.js:~126`) checks body.email == pass.email, both attacker-controlled when
the attacker creates the pass for their own email. Bonus: the granted entitlement
carries `test_mode: undefined` — `passRedeem` omits the flag (cf. SEC-011), so test
grants are indistinguishable from paid ones downstream. Trivially exploitable free
access today; S0 revenue bypass at real-money launch. S1 correct.

### STR-001 — Storefront UI cannot purchase or play
**Verdict: CONFIRMED · S1 stands.** Same evidence as BUG-001 (primary entry).

### STR-002 — Bunny backend bypasses the entitlement gate when activated
**Verdict: CONFIRMED defect · DOWNGRADED S1 → S2 (conditional/latent).**
Evidence: `Bunny.getPlaybackUrl` (`lib/cdn.js:106-109`) returns
`https://{pullzoneHostname}/masters/{film.film_id}.mp4` — unsigned, permanent;
`streamFile` (:111-116) 302-redirects the player there. The redirect itself is
gated (stream route checks entitlement first), but the resulting URL is bearer
access: anyone who learns it (shareable link, logs, referer) streams forever with
no further entitlement check. Why downgraded: the backend **cannot be activated
today** — `createCdn` only selects Bunny when `CDN_BACKEND=bunny`, and
`_assertConfigured()` throws unless all three of `BUNNY_STORAGE_ZONE`,
`BUNNY_API_KEY`, `BUNNY_PULLZONE_HOSTNAME` are set (all undocumented per BLD-006;
no keys exist anywhere). With 48-bit-entropy film_ids, the URL is also not
guessable. Real design defect, but unreachable in the current deployment → S2
today; becomes S1 the moment Bunny is wired as-is (unsigned pull-zone URLs must
become signed/tokenized).

### TST-001 — Encrypted-storage module has 93 tests but zero integration
**Verdict: CONFIRMED · S1 stands (strengthened).**
Evidence: independent repo-wide grep for `@decentralflix/storage` importers outside
`packages/storage/` → none (only self-references inside the package). The real
upload path posts raw bytes (`apps/frontend/components/UploadTest.tsx:26-30`, no
encryption step). What keeps it S1 rather than a wiring backlog: the whitepaper
presents the encrypted fragment architecture as the protocol's storage story —
"a content-addressed encrypted storage layer" (`docs/WHITEPAPER.md:9`), per-fragment
AES-256-GCM described in present tense (:52-58), and Phase 2 claimed as including
"encrypted fragment storage (IPFS/Arweave)" (:153) — while no serving path uses it
and (per STR-010, verified) key delivery is unwired. A reader — or counsel
assessing the security posture — would reasonably conclude at-rest encryption
exists in the product. False/absent security property in an investor-facing doc.

### TST-002 — No reentrancy or adversarial tests for any ETH-moving contract function
**Verdict: CONFIRMED defect · DOWNGRADED S1 → S2.**
Evidence: `grep -rni 'reentr|ReentrancyGuard|fuzz|invariant packages/contracts/test/`
→ only a doc comment in `MovieTicket.test.ts:8`. Verified the other half too: all
seven money contracts do carry the guard (`nonReentrant`/`ReentrancyGuard` present
in DFLIX, FilmmakerCampaign, MovieTicket, PayPerView, SeederCredits,
SubscriptionManager, TicketNFT). Why downgraded: the mitigation is present in
code; the gap is *test coverage proving it engages*, on contracts that are
undeployed with no real funds. Real gap (a future refactor could drop the guard
silently) but narrower blast radius than a missing guard → S2. (The program's own
brief grades untested S0-adjacent properties S1; under the S0-S4 rubric used here
— concrete defect vs. coverage gap — S2 is the honest grade.)

### TST-008 — Takedown has no off-chain enforcement or test
**Verdict: CONFIRMED defect · DOWNGRADED S1 → S2.**
Evidence: `grep -rni 'delist|takedown' apps/lifeboat/server.js apps/lifeboat/lib`
→ zero hits; only `apps/lifeboat/public/dashboard.html:46` ("DMCA takedowns"
section) which shows a "[DMCA contact TBD]" placeholder. `MovieTicket.delistFilm`
exists on-chain but nothing off-chain reads it; a delisted film keeps streaming
from lifeboat. The legal page claims "We delist access links expeditiously"
(`app/legal/page.tsx:25`). Why downgraded: nothing is deployed and no public
content exists; today a takedown is an operator deleting local master files — the
gap is the absence of an administrative/automated path, i.e. a pre-launch
readiness defect, not a currently-broken critical flow → S2.

### W3B-001 — SeederCredits: attestor signatures replayable across cooldowns
**Verdict: CONFIRMED · S1 stands (repro re-run independently — reproduces).**
Evidence: signed payload is `keccak256(abi.encodePacked(msg.sender, arweaveTxId,
claimedAmount, block.chainid))` (`SeederCredits.sol:99-102`) — no nonce, no
timestamp, no expiry; `MAX_REPORT_AGE` (declared :59) is never referenced in
`submitSeedingReport`; the only throttle is the 1-day per-seeder cooldown (:95-98).
Re-ran the lane's repro (`npx hardhat test ../../devteam/repro/w3b-signature-replay.test.ts`,
packages/contracts): **1 passing** — "credits after replaying ONE signature twice:
2000 (claimed amount: 1000)". One legitimate attestor signature → unbounded
credit minting every 24h; credits redeem for fee discounts/free tickets (real
economic value per the contract's perk model). Concrete money-path defect → S1.
(SEC-012 and MUS-006 are the same defect via other lenses.)

---

## S2 findings (sample: 20 of 50, all lanes)

### BUG-003 — `testPurchase` grants duplicate entitlements on repeat purchase
**Verdict: CONFIRMED · S2 stands (reproduced live).** `grantEntitlement`
(`server.js:387-423`) unconditionally inserts a new entitlement row — no
`alreadyEntitled` check inside, and `testPurchase` (:642-663) doesn't check either
(unlike `bundleTestPurchase` and `stripeWebhook`, which do). Live repro: two
`POST /api/purchases/test` → **2 entitlement rows** for the same buyer+film.

### BUG-004 — `POST /api/passes/test` mints a credit on every call
**Verdict: CONFIRMED · S2 stands (reproduced live).** `passTestSubscribe`
(:875-900) calls `issueCredits` unconditionally on every POST — no billing-period
guard, no cap. Live repro: two unauthenticated calls → balance **2**. (The missing
*auth* on the same endpoint is SEC-001; this entry is the missing *period guard*.)

### BUG-005 — `passRedeem`: credit debited before entitlement granted, no rollback
**Verdict: CONFIRMED · S2 stands (mechanism refined).** Current code does check
`alreadyEntitled` before debiting (the "CRITICAL" comment at :918-920 — the
duplicate-burn case is handled), but ordering is still debit-then-grant:
`redeemCredit` inserts the -1 ledger entry, then `grantEntitlement` runs
*outside* the try/catch (:940). If the grant throws (e.g. `receipts.sign` on a
corrupted key — cf. SEC-010's uncaught-throw finding), the credit is gone with no
rollback. Failure-atomicity gap, real but narrower than the title suggests.

### BUG-006 — Bundle math mismatch: "15% off / 3+ films" advertised, full price / ≥2 films charged
**Verdict: CONFIRMED · S2 stands.** Copy: `apps/frontend/lib/pricing.ts:137-153`
("15% off", "Draft mechanic — 3+ films, one filmmaker", "15% bundle discount
(draft)"). Code: `bundleTestPurchase` requires `film_ids.length >= 2` (:676) and
charges `total = sum(full list prices)` (:724-728) — no discount applied. The
"draft" label narrows it; the math as built contradicts the advertised mechanic.

### BUG-007 — Pass copy says 2 credits at $10/mo; code issues 1 credit at $9.99/mo
**Verdict: factual observation CONFIRMED · DOWNGRADED S2 → S3.**
The mismatch is real (`PASS_PRICE_USD_CENTS=999`, `CREDITS_PER_BILLING_PERIOD=1`
in `lib/pass.js:29-30` vs the $10/mo-two-$8-credits draft model), but the
user-facing pass page (`apps/lifeboat/public/pass.html:15`) says **"$9.99/month
for one credit a month"** — matching the code exactly — and the "2 credits at
$10" copy on marketing pages is explicitly framed as a *deferred draft model*
with the economics warning attached ("deferred until the math works", "It's
deferred, not launching"). No live surface misrepresents what a buyer gets.
Copy/code drift to reconcile before launch, not a concrete defect → S3.

### BUG-008 — On-chain `buyAccess` grants no lifeboat streaming entitlement
**Verdict: CONFIRMED · S2 stands.** `PayPerView.buyAccess` emits
`AccessPurchased` (PayPerView.sol:107); repo-wide grep finds no event listener,
indexer, or webhook consuming it outside tests and generated ABIs. An on-chain
buyer gets zero lifeboat streaming access — two unreconciled rails. Latent
(contracts undeployed) but a real design gap that would strand paying users.

### BUG-011 — Pass endpoints have no auth
**Verdict: CONFIRMED · S2 stands, with mechanism correction (reproduced live).**
The routes are indeed unauthenticated (verified live: `GET /api/passes/:id` →
200, `POST …/redeem` → 201 with no credentials). Correction to the title's
mechanism: `redeemCredit` (`lib/pass.js`) refuses unless body.email equals the
pass holder's email, so an attacker cannot divert value to themselves — the
realistic harms are (a) self-service free films (covered by SEC-001 S1) and
(b) griefing: anyone who obtains a `pass_id` (48-bit entropy, not guessable, but
leaked by the unauthenticated detail endpoint to whoever holds it) can burn the
holder's credits by redeeming *for the holder's email*. Real auth defect with
preconditions → S2 stands.

### BUG-012 — Stripe pass webhooks not idempotent / out-of-order-unsafe
**Verdict: CONFIRMED · S2 stands · confidence upgraded Likely → Confirmed.**
Both gaps verified in `stripeWebhook`: (1) `invoice.payment_succeeded` requires an
*existing active* pass or the paid renewal is silently dropped — out-of-order
delivery (Stripe retries are normal) loses a paid credit with no retry/dead-letter;
(2) `customer.subscription.deleted` only flips status to `canceled`; issued
credits persist with no expiry anywhere in `lib/pass.js`. Precision note the
finding missed: the *film-purchase* webhook path (`checkout.session.completed`)
**does** check `alreadyEntitled` before granting — only the pass-renewal path is
unguarded. Assumption stands: Stripe keys don't exist yet, so this is latent
logic, correctly S2.

### SEC-003 — Filmmaker role is self-asserted at signup
**Verdict: CONFIRMED · S2 stands.** `signup` (`server.js:264-296`) takes `role`
from the request body and accepts `"filmmaker"` with no verification; every
filmmaker gate (`requireFilmmaker`) then collapses to "has an account". Real authz
defect; S2 (pre-launch, test/dev auth labeled as such in the signup response).

### SEC-004 — Filmmaker profile create/update require no auth and no ownership check
**Verdict: CONFIRMED · S2 stands.** Routes `server.js:1262/1265/1268` call
`createFilmmaker` / `getFilmmaker` / `updateFilmmaker` with no `requireAuth`;
`updateFilmmaker` patches `display_name` and `payout_method` for any
`filmmaker_id` (48-bit entropy) with no ownership check. (Creation being public
is arguably signup-by-design; the record is never linked to an authenticated
account, which is the defect.)

### DAT-003 — `approveClaim` never checks `alreadyEntitled`
**Verdict: CONFIRMED · S2 stands.** `approveClaim` (:617-638) calls
`grantEntitlement` directly; the 409 guard only blocks re-approving the *same*
claim id. Two distinct claims for the same buyer+film can both be approved →
double grant (verified: `grantEntitlement` inserts unconditionally). The
per-claim status machine is correct; the cross-claim dedupe is missing.

### DAT-006 — `POST /api/buyers/import` has no server-side auth
**Verdict: CONFIRMED · S2 stands.** Route `server.js:1163` → `importBuyers`
with no `requireAuth`/`requireFilmmaker`. Unauthenticated appends to
`migration_contacts.json` (contacts-only by design, but the write path is
unauthenticated — spam/poisoning vector).

### DAT-009 — Stripe webhook credit grants are not idempotent
**Verdict: CONFIRMED · S2 stands.** `issueCredits` (`lib/pass.js:113-117`) appends
a ledger entry unconditionally; `stripe_invoice_id` is *recorded* on the entry
but never deduped on. A redelivered `invoice.payment_succeeded` double-issues
credits. (Same defect family as BUG-012; this entry is the redelivery half.)

### DOC-003 — Dashboard offers crowdfund campaign launch while crowdfunding is DEFERRED
**Verdict: CONFIRMED · S2 stands — and the mechanism is stronger than the finding described.**
Not just copy: `handleQuickLaunch` (`apps/frontend/app/dashboard/page.tsx:103-160`)
calls `walletClient.writeContract({ functionName: 'launchCampaign', ... })` — a
**real on-chain campaign transaction**, gated only by
`NEXT_PUBLIC_FILMMAKER_CAMPAIGN_ADDRESS` being set. The `/crowdfund` route itself
is properly deferred (banner), but the dashboard's "UPLOAD TO ARWEAVE + LAUNCH
CAMPAIGN" button is live code that launches the exact instrument AGENTS.md:33-35
defers ("Do not re-add crowdfunding UI, links, or flows") for securities-law
reasons. Blocked today only by the zero-address default; one config flip away
from a live unregistered-offering flow. S2 (precondition), flagged as
near-S1 if contracts get deployed without removing it.

### MUS-003 — MovieTicket accepts overpayment and silently captures the surplus
**Verdict: CONFIRMED · S2 stands (blast radius narrowed).** `mintPermanentPass`
/ `mintBurnableTicket` require `msg.value >= price` (MovieTicket.sol:224,284);
the surplus stays in contract balance and `withdraw()` (:192-195) sends the
*entire* balance to the owner — overpayments commingle with platform fees, no
refund, no accounting. Narrowing the finding: both mint functions are
`onlyOwner`, so the realistic "victim" of an overpayment is the owner
themselves — the defect is accounting hygiene (no surplus refund), not theft.

### MUS-004 — Mint page shows hardcoded 30% platform fee whenever the on-chain fee read fails
**Verdict: CONFIRMED · S2 stands.** `apps/frontend/app/mint/page.tsx:68`:
`const feePct = platformFeeBps ? (Number(platformFeeBps) / 100).toFixed(0) : '30'`,
rendered as `{(100 - parseInt(feePct))}% to the creator` — i.e. "70% to the
creator" on any read failure, contradicting the 25%-cap model (deploy uses 2500
bps). Only triggers when the on-chain read fails → S2.

### STR-010 — Encrypted-fragment module: sound crypto, no key delivery, no streaming
**Verdict: CONFIRMED · S2 stands.** Module has `encrypt.js` but no
key-distribution/delivery component (grep for distribute/deliver-key/key-exchange
→ zero hits); the whitepaper itself defers key delivery to a future
"access-control layer" ("distributed out-of-band … after on-chain entitlement is
verified", WHITEPAPER.md:58); and per TST-001 (verified) no serving path imports
the module. Correctly S2: the crypto is tested, the system around it doesn't exist.

### ARC-010 — Deferred features lack architectural quarantine
**Verdict: CONFIRMED · S2 stands.** Crowdfunding is policy-deferred (AGENTS.md,
`/crowdfund` DEFERRED banner) but code-live: the `FilmmakerCampaign` contract is
deployed-test-covered, `useFilmmakerCampaign` hook ships, and the dashboard's
`handleQuickLaunch` submits real `launchCampaign` transactions (see DOC-003).
No quarantine between "deferred" and "one env var away from live".

### W3B-006 — TicketNFT: no way to update a film's filmmaker address
**Verdict: CONFIRMED · S2 stands.** `TicketNFT.sol` exposes `setFilmActive`
(:114) and `setFilmPrice` (:121) but no filmmaker-address setter; `mintTicket`
forwards 100% of `msg.value` to `film.filmmaker` (:151). A wrong address at
`registerFilm` (typo, lost key) permanently misdirects all mint revenue with no
recovery path — even `onlyOwner` cannot fix it. Real money-flow defect, S2
(pre-launch; no films registered on a live network).

### TST-009 — No cross-layer test pins frontend 75%-share claims to contract fee-cap enforcement
**Verdict: CONFIRMED · S2 stands.** Contract tests assert the 2500 bps cap in
isolation (`PayPerView.test.ts:175-180`, `MovieTicket.test.ts:24`); the frontend
wrapper test only checks the `platformFeeBps` call shape
(`payPerView.test.ts:69`); no test anywhere asserts that the advertised 75%
(`pricing.ts:20`, four marketing surfaces) is enforced by the on-chain cap. The
copy↔contract consistency MUS-001 flags as broken has no automated guard.

---

## Repro inventory (all under `devteam/repro/`, repo untouched)
- `ver-pass-endpoints.sh` — scratch lifeboat on 127.0.0.1:18099 with throwaway
  data dir (copies `apps/lifeboat` to /tmp, deletes the copied `data/` so fixtures
  can't pollute results — lesson learned mid-audit). Covers BUG-003, BUG-004,
  BUG-011, DAT-001/SEC-002, SEC-001, SEC-011. **All claims reproduced.**
- `w3b-signature-replay.test.ts` — pre-existing lane repro, re-run independently:
  `cd packages/contracts && npx hardhat test ../../devteam/repro/w3b-signature-replay.test.ts`
  → 1 passing ("credits after replaying ONE signature twice: 2000"). W3B-001 reproduced.
- `npm audit` in `apps/frontend` (independent of the finding's method) — BLD-001
  confirmed: next@16.2.6 in critical range incl. 2 unauthenticated RCEs, fix 16.3.6.

## Notes / caveats for the fixer
- Findings cite line numbers from the Phase 2 tree; the audited tree is
  `devteam/review-2026-09-29 @ e72ef55` — spot-checked citations still land, but
  re-verify line numbers before fixing.
- BUG-001/STR-001, BUG-002/SEC-002/DAT-001, W3B-001/SEC-012/MUS-006,
  BUG-012/DAT-009 are duplicate/overlap clusters — fix once, close together.
- Downgrade rationale is documented per finding above; if the program's severity
  rubric differs from the S0–S4 rubric in the task brief, TST-002 is the one
  entry where the two rubrics disagree (program brief: S1; this audit: S2).
- Scratch servers used ports 18098/18099 on 127.0.0.1 only; all killed after the runs.
