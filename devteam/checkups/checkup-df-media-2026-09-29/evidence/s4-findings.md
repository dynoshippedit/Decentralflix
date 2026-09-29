# S4 — Challenged findings (checkup-df-media-2026-09-29)

## F1 — untested verifyPlaybackUrl branches (SUPPORTED_IMPROVEMENT)
- Claim: two rejection branches of `verifyPlaybackUrl` (playback.js:63-70)
  have no test coverage anywhere: 'bad expiry' (non-integer exp) and the
  signature length-mismatch guard.
- Location: apps/lifeboat/lib/playback.js verifyPlaybackUrl, lines 63-70;
  exercised via apps/lifeboat/server.js mediaPlay.
- Expected behavior source: the function's own contract (reject with 403);
  the e2e suite's purpose ("tampered/expiry/missing-params" matrix).
- Observed: the 11 e2e tests cover missing params, expired (valid HMAC),
  and same-length tampered sig — but never a non-integer exp, and the
  tampered test uses 64 zeros (same length as a real sig), so the
  `a.length !== b.length` guard never fires.
- Reachable: yes — `GET /api/media/play?pass=..&film=..&exp=abc&sig=..`.
- Impact: low (both branches fail closed to 403 today); the risk is future
  regression of branch ordering silently weakening rejection.
- Alternative explanation: "covered enough by the tamper test" — rejected:
  the tamper test cannot reach the length guard by construction.
- Counter-check: read the tampered-sig test (test.sh) — sig is "0".repeat(64);
  read verify — length guard is a separate condition. Confirmed gap.
- Action: add 2 e2e assertions to the DF-MEDIA-3 section (non-integer exp ->
  403; truncated sig -> 403).
- Verification: lifeboat-e2e final receipt (expect 167 PASS / 0 FAIL).

## F5 — untested 404 path in the frontend client (SUPPORTED_IMPROVEMENT)
- Claim: `fetchPlaybackUrl` documents and implements a typed 404 error
  (playback-url.ts:62), but playback-url.test.ts has no 404 test.
- Location: apps/frontend/lib/playback-url.test.ts (83 lines, 7 tests).
- Expected behavior source: the JSDoc ("Throws PlaybackUrlError on 401 ...
  403 ... 404 ...") and the server's 404 responses (pass/film not found).
- Observed: tests cover 200/401/403/missing-token/malformed; 404 missing.
- Reachable: yes — mint with a deleted pass id or unknown film id.
- Impact: low (the code path is a two-line status check identical to 401/403);
  risk is doc-code drift going unnoticed.
- Alternative explanation: "404 is unreachable because callers always have
  valid ids" — rejected: ids come from localStorage/URL params, both
  user-influenceable.
- Action: add one vitest test (mock 404 -> rejects with status 404).
- Verification: frontend-vitest final receipt (expect 233 passed).

## R1 — dot-joined HMAC serialization (REJECTED_LEAD)
- Claim considered: `${passId}.${filmId}.${exp}` is ambiguous — different
  (pass, film) triples could serialize identically, letting a signature for
  one triple validate as another.
- Counter-evidence: mint and verify use the identical serialization, so a
  signature is only ever checked against the exact triple it was minted for;
  the needed property (no forgery without the secret) does not depend on the
  join. Exploitation would require attacker-chosen IDs containing dots on
  BOTH sides of a collision — pass/film IDs are server-generated, and the
  attacker cannot mint for a colliding triple without the secret in the first
  place. No reachable violation. REJECTED.

## R2 — no loading indicator during mint in film.html (REJECTED_LEAD)
- Claim considered: the player shows nothing while the mint call is in flight.
- Counter-evidence: failure is visible (status banner), success populates the
  player; the mint call is a single local JSON round-trip. Cosmetic, no
  correctness/security impact, and "more UI polish" has no acceptance measure
  here. REJECTED as a finding; noted as an observation.

## R3 — 404-vs-403 film oracle at the mint endpoint (REJECTED_LEAD)
- Claim considered: an authenticated pass holder can distinguish "film does
  not exist" (404) from "not entitled" (403), leaking film existence.
- Counter-evidence: the oracle requires a valid pass-holder session, and the
  pre-existing stream route has the identical property — no new exposure is
  introduced by this change. REJECTED as a finding; noted as an observation.

## Priority
F1 and F5 are small, in-scope test-strengthening changes with clear acceptance
measures (new assertions pass; branch coverage of the rejection matrix is
complete). No confirmed defects were found in the implementation: the authZ
ordering, fail-closed verification, entitlement parity, and headerless-play
contract all held under e2e execution.
