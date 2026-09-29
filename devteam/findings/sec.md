# SEC findings — Security Auditor, Phase 2 (2026-09-29)

Scope: `apps/lifeboat` (server.js 1,319 lines + lib/* fully read), contract access-control
spot-check (`packages/contracts/contracts/*.sol`), B6 pattern sweeps, upload surface,
receipt/entitlement path. Source read-only; no fixes in this phase.

## Index

| ID | Sev | Conf | Status | Title | Location | Effort |
|---|---|---|---|---|---|---|
| SEC-001 | S1 | Confirmed | NEW | Unauthenticated pass test endpoints mint unlimited credits and grant permanent entitlements | apps/lifeboat/server.js:1249,1258,875-948 | S |
| SEC-002 | S1 | Confirmed | NEW | Session revocation is a silent no-op — store.remove does not exist; logout does nothing | apps/lifeboat/server.js:210,324; lib/store.js:94 | XS |
| SEC-003 | S2 | Confirmed | NEW | Filmmaker role is self-asserted at signup; all filmmaker gates collapse to "has an account" | apps/lifeboat/server.js:243,223-228 | S |
| SEC-004 | S2 | Confirmed | NEW | Filmmaker profile create/update require no auth and no ownership check | apps/lifeboat/server.js:1262,1268 | XS |
| SEC-005 | S2 | Confirmed | NEW | CSV formula injection in filmmaker audience export via crafted email | apps/lifeboat/server.js:788-797 | XS |
| SEC-006 | S2 | Confirmed | NEW | Upload has no content validation and no quota — arbitrary blob storage + disk-fill DoS | apps/lifeboat/server.js:432-484 | S |
| SEC-007 | S3 | Confirmed | NEW | PII (emails) exposed on public endpoints | apps/lifeboat/server.js:1158,1255,1265 | XS |
| SEC-008 | S3 | Confirmed | NEW | Unauthenticated claim/contact filing enables queue and notice spam | apps/lifeboat/server.js:1163,1166 | XS |
| SEC-009 | S3 | Confirmed | NEW | Auth hardening debt: no rate limits, signup enumeration, no security headers, 0.0.0.0 bind | apps/lifeboat/server.js, lib/auth.js | M |
| SEC-010 | S3 | Confirmed | NEW | Corrupted receipt-key.pem causes uncaught throw → 500s on purchase/pubkey paths | apps/lifeboat/lib/receipts.js:53-63 | XS |
| SEC-011 | S3 | Likely | NEW | testPurchase skips alreadyEntitled; pass redemptions omit test_mode flag | apps/lifeboat/server.js:641,948 | XS |
| SEC-012 | S2 | Confirmed | NEW | SeederCredits.submitSeedingReport signatures replayable across cooldown windows | packages/contracts/contracts/SeederCredits.sol:69-101 | S |

## Entries

### SEC-001 · Unauthenticated pass test endpoints mint unlimited credits and grant permanent entitlements
**S1 · Confirmed · NEW · Effort S · Lens SEC · Found by SEC in Phase 2 on 2026-09-29**

**Location:** `apps/lifeboat/server.js:1249` (route), `apps/lifeboat/server.js:1258` (route), `apps/lifeboat/server.js:875-900` (`passTestSubscribe`), `apps/lifeboat/server.js:911-948` (`passRedeem`)

**Evidence:**
```js
// server.js:1249 — no auth of any kind
if (seg[0] === 'passes' && seg[1] === 'test' && seg.length === 2 && method === 'POST') {
  return passTestSubscribe(req, res);
}
// server.js:875-900 — a credit is issued on EVERY call, for any email
async function passTestSubscribe(req, res) {
  const body = await readJson(req, res);
  ...
  const email = body.email.trim().toLowerCase();
  let p = passLib.getPassByEmail(email);
  if (!p) { p = passLib.createPass({ email, testMode: true }); }
  else if (p.status !== 'active') { store.update('passes', p.pass_id, { status: 'active' }); ... }
  const grant = passLib.issueCredits({ pass_id: p.pass_id, credits: passLib.CREDITS_PER_BILLING_PERIOD, reason: 'test_grant' });
```
```js
// server.js:1258 — redeem is equally unauthenticated; the "non-transferability"
// check compares two attacker-supplied values (lib/pass.js:126-132)
if (seg[0] === 'passes' && seg[2] === 'redeem' && seg.length === 3 && method === 'POST') {
  return passRedeem(req, res, seg[1]);
}
```

**What's wrong:** The intended money path (`passes/checkout`) is stubbed, so these TEST-ONLY
endpoints are the *only* pass flow — and unlike their sibling `POST /api/purchases/test`
(which requires a bearer session), they require zero credentials. Anyone on the network can
mint unlimited credits for any email and redeem each for a permanent entitlement + signed
receipt via the same `grantEntitlement` path as a purchase.

**Impact:** Today: S1 — everything is test-labeled and no money moves, so the practical harm
is free access to test content (CJ1 weakened but not monetized). At real-money launch this is
an S0 revenue bypass unless the endpoints are removed or auth-gated: the grants are
permanent and indistinguishable from paid ones downstream of `grantEntitlement`.
Likelihood of exploitation today: trivial (curl, no account needed).

**Reproduce / reasoning:** `POST /api/passes/test {"email":"a@x.com"}` → `pass_id`;
repeat N times → balance N. `POST /api/passes/<id>/redeem {"film_id":"<any>","email":"a@x.com"}`
→ 201 with permanent entitlement + receipt + signature. Static chain verified by reading
`passTestSubscribe` → `issueCredits` (no cap, no auth) and `passRedeem` → `redeemCredit`
(email-vs-pass check at `lib/pass.js:126` compares client-supplied email to the pass the
attacker just created) → `grantEntitlement` (`server.js:940`).

**Other instances (sibling search):** `purchases/test` and `purchases/bundle/test` correctly
require auth (`server.js:1212,1215`); the webhook path is HMAC-gated. The pass pair are the
only unauthenticated *grant* paths.

**Suggested fix:** Require auth on both routes and bind grants to `account.email` (never a
body email); cap test grants per pass; gate the whole test surface behind an explicit
`TEST_MODE` env flag that is OFF in any real-money deployment; remove before launch.

**Related:** D-004 (CJ1 refinement), SEC-003 (self-asserted roles), SEC-011 (missing test_mode flag on pass grants)

---

### SEC-002 · Session revocation is a silent no-op — store.remove does not exist; logout does nothing
**S1 · Confirmed · NEW · Effort XS · Lens SEC · Found by SEC in Phase 2 on 2026-09-29**

**Location:** `apps/lifeboat/server.js:210`, `apps/lifeboat/server.js:324`; `apps/lifeboat/lib/store.js:94`

**Evidence:**
```js
// server.js:210 — expired-session cleanup in getAuthAccount
if (!session) { ... }
if (!authLib.sessionValid(session)) {
  if (session) { try { store.remove('sessions', token); } catch {} }
  return null;
}
// server.js:322-325 — logout
async function logout(req, res) {
  const header = req.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(header);
  if (m) { try { store.remove('sessions', m[1].trim()); } catch {} }
  return sendJson(res, 200, { logged_out: true });
}
// lib/store.js:94 — remove is not exported
module.exports = { all, get, insert, update, DATA_DIR };
```

**What's wrong:** Both call sites invoke `store.remove(...)`, which is `undefined` — a
TypeError is thrown and silently swallowed by the empty `catch {}`. Logout returns
`{logged_out: true}` while the token stays valid for the full 30-day TTL
(`lib/auth.js:16`). Expired sessions are never swept, so `sessions.json` grows
unboundedly (one row per login, forever).

**Impact:** A stolen bearer token cannot be revoked by the victim — not via logout, not via
expiry cleanup. The UI/API actively misleads the user into believing logout worked.
Likelihood: any token theft (XSS on the storefront, log leak, shoulder-surf of the
test-mode UI) becomes a 30-day account takeover with no remediation.

**Reproduce / reasoning:** Static proof is complete: `module.exports` at `lib/store.js:94`
has no `remove`; both callers guard with `try{}catch{}` so the failure is invisible.
`grep -rn 'store\.remove' apps/lifeboat` shows exactly the two dead call sites.

**Other instances (sibling search):** Searched all `store.*` calls in `apps/lifeboat` —
only these two reference `remove`. No other missing-export calls found.

**Suggested fix:** Add `remove(name, id)` to `lib/store.js` (read-modify-write with the same
atomic tmp+rename), keep the try/catch. Consider session rotation on login and a
`logged_out` invalidation list as hardening.

**Related:** SEC-009 (session hygiene)

---

### SEC-003 · Filmmaker role is self-asserted at signup; all filmmaker gates collapse to "has an account"
**S2 · Confirmed · NEW · Effort S · Lens SEC · Found by SEC in Phase 2 on 2026-09-29**

**Location:** `apps/lifeboat/server.js:243` (role from body), `apps/lifeboat/server.js:223-228` (`requireFilmmaker`)

**Evidence:**
```js
// server.js:241-244 — signup
const role = typeof body.role === 'string' ? body.role.trim().toLowerCase() : 'buyer';
...
if (role !== 'buyer' && role !== 'filmmaker')
  return sendError(res, 400, 'role must be "buyer" or "filmmaker"');
// server.js:223-228
function requireFilmmaker(req, res) {
  const account = requireAuth(req, res);
  if (!account) return null;
  if (account.role !== 'filmmaker') { sendError(res, 403, 'filmmaker role required'); return null; }
  return account;
}
```

**What's wrong:** There is no verification step between "filmmaker" as a self-declared
string and the `requireFilmmaker` gate. Every filmmaker-only route (film import,
audience.csv, claims list/review/approve) is reachable by anyone who signs up and picks
the role. The code comments declare this dev-only (`lib/auth.js:11-15`), but the
*consequence* (open upload → SEC-006) is not contained by the comment.

**Impact:** Contained but real. Cross-user impact is limited because ownership is
email-keyed (`ownsFilm`, `server.js:231-234`): a self-registered filmmaker can only
import films under their own email and approve claims on their own films. The material
exposures are: (a) unlimited upload quota abuse → disk-fill (SEC-006); (b) any
authenticated user can approve/reject claims on films they uploaded — intended for the
demo, but there is no verified-filmmaker concept at all.

**Reproduce / reasoning:** `POST /api/auth/signup {"email":"x@y.z","password":"12345678","role":"filmmaker"}`
→ 201 with `role: filmmaker`; the token then passes `requireFilmmaker` on
`POST /api/films/import`. Read-verified; no server-side role assignment exists anywhere.

**Other instances (sibling search):** All 7 `requireFilmmaker` call sites share the root
cause (`server.js:1127,1150,1170,1182,1193,1203`).

**Suggested fix:** Before any real-money launch: make `filmmaker` a granted flag (admin
action or Stripe-Connect-verified onboarding), never a signup field; keep email-keyed
ownership as defense in depth. For the demo, keep but document in RUN.md.

**Related:** SEC-001, SEC-004, SEC-006

---

### SEC-004 · Filmmaker profile create/update require no auth and no ownership check
**S2 · Confirmed · NEW · Effort XS · Lens SEC · Found by SEC in Phase 2 on 2026-09-29**

**Location:** `apps/lifeboat/server.js:1262` (`POST /api/filmmakers`), `apps/lifeboat/server.js:1268` (`PATCH /api/filmmakers/:id`)

**Evidence:**
```js
if (seg[0] === 'filmmakers' && seg.length === 1 && method === 'POST') {
  return createFilmmaker(req, res);   // no requireAuth, no ownership
}
...
if (seg[0] === 'filmmakers' && seg.length === 2 && method === 'PATCH') {
  return updateFilmmaker(req, res, seg[1]);   // no requireAuth, no ownsFilmmaker check
}
```
`updateFilmmaker` (`server.js:987-1011`) patches `display_name`/`payout_method` for any
`filmmakerId` — and filmmaker IDs are public (`GET /api/filmmakers/:id`, film pages via
`filmmakerRef`).

**What's wrong:** Unlike every other filmmaker-scoped mutation (which at least requires the
role and email-keyed ownership), these two routes check nothing. `createFilmmaker`
accepts any email, so an attacker can register a profile under a victim's email with
their own display name; it then renders on the victim's public film pages via
`filmmakerRef` (`server.js:390-394`). `updateFilmmaker` lets anyone rewrite anyone's
`display_name`.

**Impact:** Impersonation (a profile under someone else's email appears on their films)
and defacement (display names rewritten at will; IDs are enumerable/public). No money
moves, but this is the platform's public trust surface (A7).

**Reproduce / reasoning:** `PATCH /api/filmmakers/fmk_<id> {"display_name":"pwned"}` with no
`Authorization` header → 200 with the patched record. Read-verified: no auth call on
either dispatch branch, and `updateFilmmaker` performs no ownership comparison.

**Other instances (sibling search):** `GET /api/filmmakers/:id/onboarding` (`:1274`) is also
unauthenticated (read-only, public-ish data — noted in matrix, not a separate finding).

**Suggested fix:** Require auth on both; require the caller's account email to match the
filmmaker record's email (same email-keyed pattern as `ownsFilm`).

**Related:** SEC-003, SEC-007

---

### SEC-005 · CSV formula injection in filmmaker audience export via crafted email
**S2 · Confirmed · NEW · Effort XS · Lens SEC · Found by SEC in Phase 2 on 2026-09-29**

**Location:** `apps/lifeboat/server.js:788-797` (`audienceCsv`), `apps/lifeboat/server.js:182-184` (`isEmail`)

**Evidence:**
```js
// server.js:788-791 — quoting only handles , " and newline; no formula guard
function csvEscape(v) {
  const s = String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
// server.js:182-184 — allows leading = + - @
function isEmail(s) {
  return typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}
```

**What's wrong:** The CSV contains entitlement emails. `isEmail` accepts addresses like
`=2+2@x.com` (no whitespace, one @), so an attacker who holds an entitlement on a
filmmaker's film (trivial via test purchase) can plant a live spreadsheet formula that
executes when the filmmaker opens `audience-<id>.csv` in Excel/Sheets. `csvEscape` does
not neutralize leading `=`, `+`, `-`, `@` (nor TAB/CR tricks).

**Impact:** Code execution / data exfiltration on the filmmaker's workstation when the CSV
is opened — the classic CSV-injection chain. Needs: attacker account + entitlement on the
victim's film (both self-service) + victim opens the export in a spreadsheet app.

**Reproduce / reasoning:** Sign up as `=HYPERLINK("http://evil")@x.com` (passes `isEmail`),
`POST /api/purchases/test` on the victim's film, then the victim's
`GET /api/films/:id/audience.csv` contains the raw formula cell. Static chain verified.

**Other instances (sibling search):** This is the only CSV export in the repo
(`rg 'text/csv'` → one hit). No other spreadsheet sinks found.

**Suggested fix:** Prefix-sanitize every CSV cell: if the first character is `=`, `+`, `-`,
`@`, `\t`, `\r`, prepend a single quote (or drop the cell). Apply in `csvEscape`.

**Related:** none

---

### SEC-006 · Upload has no content validation and no quota — arbitrary blob storage + disk-fill DoS
**S2 · Confirmed · NEW · Effort S · Lens SEC · Found by SEC in Phase 2 on 2026-09-29**

**Location:** `apps/lifeboat/server.js:432-484` (`importFilm`), `apps/lifeboat/server.js:27` (1 GiB cap)

**Evidence:**
```js
// server.js:470-473 — bytes written verbatim, no inspection
const filmId = 'film_' + crypto.randomBytes(6).toString('hex');
const tmpPath = path.join(MASTERS_DIR, filmId + '.mp4.tmp');
const finalPath = path.join(MASTERS_DIR, filmId + '.mp4');
fs.writeFileSync(tmpPath, masterData);
fs.renameSync(tmpPath, finalPath); // atomic publish of the master
```
No magic-byte / content-type / transcode step exists anywhere: `rg 'ffmpeg|ffprobe|transcode'`
in `apps/lifeboat` shows only test.sh's requirement (TST-010 already notes no transcode
code). Stored name is server-generated (`filmId + '.mp4'`) and `original_filename` goes
through `path.basename` (`server.js:480`) — no traversal (verified, not the issue).

**What's wrong:** Whatever bytes arrive are stored as the "master" and later served as
`video/mp4` (`lib/cdn.js:47`). There is no per-account quota or upload count limit — the
1 GiB cap is per-request only. Combined with self-asserted filmmaker roles (SEC-003),
anyone with a throwaway account can fill the disk or host arbitrary blobs.

**Impact:** Disk exhaustion DoS against the single-node service (one process, one disk);
arbitrary content hosted under the platform's origin (reputational/abuse-report risk —
the file is served with the platform's Content-Type). No RCE: the bytes are never
executed, and the forced `.mp4` extension + `video/mp4` content type + no static serving
of `data/` keeps stored-XSS out of modern browsers.

**Reproduce / reasoning:** `POST /api/films/import` (filmmaker session) with a 1 GiB
`/dev/urandom` part repeated → `data/masters/` grows without bound; each stored file is
returned byte-identical by the stream endpoint. Read-verified; no quota counter exists.

**Other instances (sibling search):** Single upload path in the repo (the frontend
`useVideoUpload` hook targets Arweave/Filecoin prototypes, not this endpoint).

**Suggested fix:** Validate magic bytes (ftyp/mp4) and reject non-video; enforce a
per-account storage quota + max film count; add an async transcode/validation job
(STR's lane) before publish; consider `X-Content-Type-Options: nosniff` on media responses.

**Related:** SEC-003, TST-010

---

### SEC-007 · PII (emails) exposed on public endpoints
**S3 · Confirmed · NEW · Effort XS · Lens SEC · Found by SEC in Phase 2 on 2026-09-29**

**Location:** `apps/lifeboat/server.js:1158` (`GET /api/films/:id` → `fullFilm`), `apps/lifeboat/server.js:1265` (`GET /api/filmmakers/:id`), `apps/lifeboat/server.js:1255` (`GET /api/passes/:id`)

**Evidence:**
```js
// server.js:405-410
function fullFilm(film) {
  return Object.assign({}, film, {           // spreads filmmaker_email, territories, ...
    playback_url: CDN.getPlaybackUrl(film),
    filmmaker: filmmakerRef(film.filmmaker_email),
  });
}
// server.js:1255-1258 — pass detail returns the holder's email + full ledger, no auth
if (seg[0] === 'passes' && seg.length === 2 && method === 'GET') {
  return passDetail(req, res, seg[1]);
}
```

**What's wrong:** `fullFilm` spreads the whole film record including `filmmaker_email` to
unauthenticated callers (the public `GET /api/films` correctly uses the `publicFilm`
view — the single-film route does not). `GET /api/filmmakers/:id` returns the email.
`GET /api/passes/:id` returns pass email + ledger with no auth (`pass_id` is 48-bit
random — unguessable in practice, but the endpoint is still an oracle).

**Impact:** Email harvesting for phishing/spam; filmmaker emails are otherwise only
needed for the claim flow. Low sensitivity, no credentials — S3.

**Suggested fix:** Return the `publicFilm` view (+ playback URL only when entitled) on
`GET /api/films/:id`; drop `email` from public filmmaker/pass payloads (keep IDs).

**Related:** SEC-004

---

### SEC-008 · Unauthenticated claim/contact filing enables queue and notice spam
**S3 · Confirmed · NEW · Effort XS · Lens SEC · Found by SEC in Phase 2 on 2026-09-29**

**Location:** `apps/lifeboat/server.js:1163` (`POST /api/buyers/import`), `apps/lifeboat/server.js:1166` (`POST /api/claims`)

**What's wrong:** Both routes skip auth entirely. Anyone can append migration contacts
(`importBuyers`, `server.js:496-541`) or file claims (`fileClaim`, `server.js:546-596`)
against any film for any email. Validation is good (email format, purchase_type enum,
date sanity, one-open-claim-per-film+email dedup at `server.js:573-580`), but there is
no identity binding at all.

**Impact:** Nuisance-grade. Downstream gates hold: contacts are notices-only by design
(never entitlements — enforced in code comments and data model), and claims require
filmmaker approval before `grantEntitlement`. Realistic harm: review-queue flooding
(moderation DoS) and unwanted migration notices to third-party emails.

**Suggested fix:** Require auth on both; bind `fileClaim` email to the caller's account
email (claiming *for* someone else is the current design — if that's intended, add a
proof-of-receipt artifact instead of a free-text ref).

**Related:** none

---

### SEC-009 · Auth hardening debt: no rate limits, signup enumeration, no security headers, 0.0.0.0 bind
**S3 · Confirmed · NEW · Effort M · Lens SEC · Found by SEC in Phase 2 on 2026-09-29**

**Location:** `apps/lifeboat/server.js:20` (HOST), `apps/lifeboat/server.js:238-270` (signup), `apps/lifeboat/lib/auth.js:11-15`, `apps/lifeboat/server.js:33-48` (sendJson — no headers)

**What's wrong (grouped, each verified):**
1. No rate limiting anywhere — login (`server.js:276`) is brute-forceable; the code
   declares dev-only (`lib/auth.js:13`: "no rate limiting, no email verification, no 2FA").
2. Signup returns 409 `an account with this email already exists` (`server.js:251`) —
   an account-enumeration oracle (login itself is correctly generic).
3. Zero security headers: `sendJson`/`serveStatic`/stream responses set no
   `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, or
   `Referrer-Policy`. No CORS headers either (fail-closed by default — fine).
4. `HOST` defaults to `0.0.0.0` (`server.js:20`): on the Threadripper the service is
   tailnet-reachable, not loopback-only — the threat model is "anyone on the tailnet",
   not "local dev".

**Impact:** Each item alone is S3 in the current dev deployment; together they are the
pre-launch hardening checklist. None is a surprise — the code labels itself dev-only —
but the 0.0.0.0 default + unauthenticated grant paths (SEC-001) widen the practical
exposure beyond "localhost".

**Suggested fix:** Per-IP rate limits (stricter on auth), generic signup responses or
email-verification flow, a small security-headers middleware, bind `127.0.0.1` by
default until a reverse proxy exists.

**Related:** SEC-001, SEC-002

---

### SEC-010 · Corrupted receipt-key.pem causes uncaught throw → 500s on purchase/pubkey paths
**S3 · Confirmed · NEW · Effort XS · Lens SEC · Found by SEC in Phase 2 on 2026-09-29**

**Location:** `apps/lifeboat/lib/receipts.js:53-63` (`getKeys`)

**Evidence:**
```js
function getKeys() {
  if (cached) return cached;
  if (fs.existsSync(KEY_PATH)) {
    const privateKey = crypto.createPrivateKey(fs.readFileSync(KEY_PATH, 'utf8')); // throws if corrupt
    ...
```
`sign()` (`receipts.js:70-76`) and `getPublicKeyBase64()` (`receipts.js:97-100`) call
`getKeys()` with no try/catch → the throw propagates to `handleApi`'s catch → 500
`internal error` on `purchases/test`, `purchases/bundle/test`, `receipts/pubkey`,
`claims/:id/approve`, `passes/:id/redeem`. `verify()` is wrapped (fail-closed `false`).

**What's wrong:** Absence is handled safely (generate + write 0600 — verified good), but
corruption (truncated write, disk error, manual edit) is not. Two processes racing the
first run can also generate divergent keys (last-writer-wins; the loser's receipts become
unverifiable). No rotation story (documented as a later milestone — accepted).

**Impact:** Availability: one bad file bricks all entitlement issuance and the public-key
endpoint until an operator intervenes. No key compromise vector — this is robustness.

**Suggested fix:** Validate the key on load (derive + test-sign once); on failure, log and
fall back to a clearly-marked recovery mode instead of 500ing every request; document the
backup requirement in RUN.md (the code comment already warns — promote it to the runbook).

**Related:** none

---

### SEC-011 · testPurchase skips alreadyEntitled; pass redemptions omit the test_mode flag
**S3 · Likely · NEW · Effort XS · Lens SEC · Found by SEC in Phase 2 on 2026-09-29**

**Location:** `apps/lifeboat/server.js:641-658` (`testPurchase`), `apps/lifeboat/server.js:940` (`passRedeem` → `grantEntitlement`)

**What's wrong:** Every grant path *except* `testPurchase` checks `alreadyEntitled`
(bundle: `server.js:708`; pass redeem: `server.js:927`; webhook: `server.js:755`).
Repeat `POST /api/purchases/test` mints duplicate entitlement rows + duplicate signed
receipts for the same film+email. Separately, `passRedeem` calls `grantEntitlement`
without `testMode: true`, so pass-sourced (test) grants are not labeled
`entitlement.test_mode` (`server.js:444-446`) — test and real grants become
indistinguishable in the ledger, which defeats the flag's purpose at audit time.

**Impact:** Data hygiene / auditability. No extra content value (duplicates don't widen
access). Confidence is Likely rather than Confirmed only because no live run was needed —
the code paths are unambiguous.

**Suggested fix:** Add the `alreadyEntitled` guard to `testPurchase` (same shape as the
bundle path); pass `testMode: true` in `passRedeem`'s `grantEntitlement` call.

**Related:** SEC-001

---

### SEC-012 · SeederCredits.submitSeedingReport signatures replayable across cooldown windows
**S2 · Confirmed · NEW · Effort S · Lens SEC · Found by SEC in Phase 2 on 2026-09-29**

**Location:** `packages/contracts/contracts/SeederCredits.sol:69-101` (`submitSeedingReport`), `packages/contracts/contracts/SeederCredits.sol:129-142` (`recoverSigner`)

**Evidence:**
```solidity
function submitSeedingReport(
    string calldata arweaveTxId,
    uint256 claimedAmount,
    bytes calldata platformSignature
) external nonReentrant {
    ...
    bytes32 messageHash = keccak256(
        abi.encodePacked(msg.sender, arweaveTxId, claimedAmount, block.chainid)
    );
    ...
    address signer = recoverSigner(ethSignedMessageHash, platformSignature);
    require(signer == platformAttestor, "Invalid platform signature");
    ...
    credits[msg.sender] += finalAmount;
    lastClaimTimestamp[msg.sender] = block.timestamp;
```

**What's wrong:** The signed message binds sender + txId + amount + chainid, but there is
no nonce and nothing marks an `arweaveTxId` as consumed. After `MIN_CLAIM_COOLDOWN`
passes, the *same* platform signature can be resubmitted to mint credits again for the
same Arweave TX — indefinite credit inflation from one report. (`recoverSigner` itself
is fine for this use: 65-byte + v∈{27,28} checks, and the equality check against the
non-zero `platformAttestor` makes the ecrecover zero-address case harmless; malleability
doesn't change the recovered address. Logged as a false positive in `notes/sweeps.md`.)

**Impact:** Credit inflation for seeder perks (Phase 0/1: credits gate off-chain perks —
"frontend applies the perk", `SeederCredits.sol:113-114`). No money at stake today;
becomes material if credits ever convert to fee discounts or tickets on-chain. W3B owns
the deep contract fix; this entry is the threat framing.

**Suggested fix:** Add a per-(sender, arweaveTxId) consumed mapping or a platform-issued
nonce included in the signed message; prefer EIP-712 with domain + deadline.

**Related:** TST-002 (no adversarial tests for money contracts)
