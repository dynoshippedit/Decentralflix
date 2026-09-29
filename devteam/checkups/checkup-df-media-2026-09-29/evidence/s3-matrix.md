# S3 — Engineering matrix (checkup-df-media-2026-09-29)

Symbols reference: playback.js:1-82; server.js Repair 2 hunks
(passPlaybackUrl ~990-1014, mediaPlay ~1016-1030, routes ~1400-1407, import line 20,
startup warning ~1479); test.sh DF-MEDIA-3 section ~727-791 + server-start line ~47;
film.html hunk ~97-117; pass.html hunk ~102-104;
playback-url.ts:1-98; playback-url.test.ts:1-83.

## U1-playback-lib (apps/lifeboat/lib/playback.js)
- COR: mint/verify round-trip is exact — verify recomputes
  signPlayback(pass, film, expNum) with the identical template string
  `${passId}.${filmId}.${exp}` (number interpolates same as string). Boundary:
  exp == now -> expired (<=); exp < 0 -> expired; exp "abc" -> NaN ->
  'bad expiry'. No reachable throw: length guard precedes timingSafeEqual.
- ARC: pure module, sole dep node:crypto; minimal exports; secret read at call
  time (env changes picked up per mint/verify).
- TST: no dedicated unit tests; covered indirectly by the 11 e2e tests.
  GAP: 'bad expiry' branch (non-integer exp) and the sig length-mismatch guard
  are untested anywhere -> F1 (SUPPORTED_IMPROVEMENT).
- DOC: header comment (problem/fix/TTL/secret) matches implementation; JSDoc on
  mint ("caller must already have authenticated... see passPlaybackUrl")
  matches server.js; TTL 900 == test assertion expires_in=900.
- SEC: HMAC-SHA256; constant-time compare with length guard; secret from env,
  dev-only default + startup warning (R5). Sig binds (passId, filmId, exp).
- DOM: 15-min presigned URL is the standard headerless-video pattern; matches
  Dino's chief decision and R1/R2.

## U2-server-playback-routes (server.js Repair 2 hunks)
- COR: passPlaybackUrl order — requireAuth (401) -> pass 404 -> holder 403 ->
  film param 400 -> film 404 -> entitlement 403 -> mint. Auth first: no
  existence/entitlement leak to strangers. mediaPlay: verify -> 403
  fail-closed; film lookup -> 404; CDN.streamFile (CDN instance, line 41)
  honors Range (e2e: 206 + exactly 100 bytes).
- ARC: reuses requireAuth/ownsFilm/hasEntitlement — same predicates as the
  stream route, no duplicated policy. Clean boundary: server does authZ, lib
  does crypto. Routes registered in handleApi alongside existing routes.
- TST: 11 e2e tests cover both routes: success, authZ matrix (401/403/403),
  TTL, URL shape, headerless 200, Range 206, tamper/retarget/expiry/missing.
  Assertions are meaningful (codes + non-empty body + byte counts + TTL value).
- DOC: handler comments describe fail-closed 403, Range via streamFile, holder
  check reuse — all accurate vs code. Startup warning text matches
  secretIsDefault().
- SEC: identity+authZ enforced at the mint boundary (authoritative). Play
  boundary enforces signature only — entitlement evaluated at mint time
  (revocation/refund propagation <= 15 min; inherent to the presigned pattern,
  Dino's pick — documented, not a defect). No new injection surface: IDs go
  through store lookups; params via URLSearchParams; sig compared constant-time.
- API: mint 200 JSON {url, expires_at, expires_in, pass_id, film_id,
  legal_notice} matches the frontend client's snake_case expectation exactly.
  401/403/404/400 used consistently with the rest of the API. mediaPlay: 403
  fail-closed, 404 film deleted.
- DOM: presigned-URL pattern resolves R1; mint authZ == stream-route authZ (R3).

## U3-lifeboat-e2e-tests (test.sh DF-MEDIA-3 section)
- COR: expired-URL fixture crafts HMAC with the same test secret and
  `[passId, filmId, exp].join(".")` — identical to signPlayback's template.
  Tampered sig uses 64 zeros (same length as real sig) so it exercises
  timingSafeEqual's false path. Fixture ordering correct: section sits after
  the pass-buyer setup, so PASSID/PB_TOKEN/FILM1/FILM2/OTHER_TOKEN exist and
  the buyer is entitled to FILM1 only.
- ARC: 11 tests grouped in one section with a why-comment; server started with
  the fixed test secret on the start line (~47).
- TST: 11 meaningful assertions, each fail branch prints http code/url.
  GAP: no non-integer-exp case, no short-sig length-mismatch case -> F1.
- DOC: section header explains the why (video cannot send Authorization) and
  the fixture rationale (redeemed FILM1, not FILM2) — accurate.
- SEC: the tests assert the negative security matrix (401/403 x5). The expired
  fixture hardcodes the test secret, matching the server start line; drift
  fails loudly. No real secrets in the file.

## U4-legacy-player-pages (film.html, pass.html)
- COR: film.html reads dfl.pass_id in try/catch (private-mode safe);
  encodeURIComponent on both IDs; D.getJSON attaches the Bearer <redacted>
  (app.js:96); success sets player.src = D.api(r.url); failure shows a status
  banner. pass.html persists r.pass.pass_id after successful test subscribe
  (matches API shape). Legacy fallback (film.playback_url || stream URL)
  preserved when no pass_id.
- ARC: two small hunks; shared localStorage key dfl.pass_id consistent across
  pages; no new dependencies.
- TST: STR-001 covers the auth helper (login stores token, helpers send
  Bearer); the HTML glue itself has no automated test (no browser harness in
  this repo — consistent with existing strategy). Server path is e2e-covered.
- DOC: inline comments state the why and the legacy fallback — accurate.
- UIX: error state visible (status banner on mint failure); no loading
  indicator while minting (minor, noted). Player stays empty on mint failure —
  a visible failure, acceptable.
- DOM: native video + presigned URL is the required pattern (R1/R6); legacy
  path preserved for pass-less browsers.

## U5-frontend-playback-client (playback-url.ts + playback-url.test.ts)
- COR: snake_case -> camelCase mapping matches the server response exactly
  (url/expires_at/expires_in/pass_id/film_id). Fallbacks (""/0/param echo)
  only when url is present but fields missing. resolvePlaybackSrc: absolute
  passthrough, relative join — correct.
- ARC: module is self-contained (fetch only) but has NO importers in
  apps/frontend — unwired scaffolding for the Next.js watch page (D1).
  Complete and tested; wiring is a product-loop call, not a defect.
- TST: 7 vitest tests mock fetch at the right boundary; assert endpoint URL,
  Authorization header on the mint call, typed 401/403, no-network on missing
  token, malformed body, resolvePlaybackSrc both branches. Would catch: wrong
  endpoint, missing Bearer, bad mapping. GAP: the documented 404 path is
  untested -> F5 (SUPPORTED_IMPROVEMENT, one test).
- DOC: header + JSDoc describe the flow, 15-min expiry, and 401/403/404/
  transport errors — accurate vs implementation.
- SEC: Bearer <redacted> sent only on the mint call, never attached to video src
  (asserted in test); missing token fails before any network.
- API: typed errors map to the server's status codes; 5xx/429 -> generic
  PlaybackUrlError with status — reasonable.

## Candidate findings (see s4-findings.md)
- F1 (SUPPORTED_IMPROVEMENT): untested verify branches ('bad expiry',
  sig length guard) -> add 2 e2e assertions to test.sh.
- F5 (SUPPORTED_IMPROVEMENT): untested 404 path in playback-url.test.ts ->
  add 1 vitest test.
- R1/R2/R3 (REJECTED_LEAD): dot-join serialization, loading indicator,
  404-vs-403 film oracle — considered, not defects (counter-evidence recorded).
