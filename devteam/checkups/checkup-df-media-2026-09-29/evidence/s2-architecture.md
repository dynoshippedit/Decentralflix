# S2 — As-is design reconstruction (checkup-df-media-2026-09-29)

## Components and entrypoints
- `apps/lifeboat/lib/playback.js` (U1): pure HMAC-SHA256 mint/verify module.
  `mediaSecret()` reads `DECENTRALFLIX_MEDIA_SECRET` at call time (env changes
  are picked up; test.sh sets it per-run). `secretIsDefault()` drives the
  startup warning. `signPlayback(passId, filmId, exp)` =
  HMAC-SHA256(`${passId}.${filmId}.${exp}`) hex. `mintPlaybackUrl` signs and
  returns `{url, expires_at (ISO), expires_in: 900}`. `verifyPlaybackUrl` is
  pure: missing params -> non-integer exp -> expired (exp <= now) -> signature
  (length check + `crypto.timingSafeEqual`) -> `{ok, passId, filmId, exp}`.
- `apps/lifeboat/server.js` (U2): `passPlaybackUrl(req,res,url,passId)` —
  `requireAuth` FIRST (401 before any existence check, so strangers learn
  nothing), then pass lookup (404), holder check `p.email === account.email`
  (403), `film` query param required (400), film lookup (404), entitlement
  `ownsFilm(account, film) || hasEntitlement(account, film.film_id)` (403),
  then mint. `mediaPlay(req,res,url)` — verify query params; 403 fail-closed on
  any verification failure; 404 if the film was deleted; else
  `CDN.streamFile(req, res, film)` (Range-capable, pre-existing). Routes:
  `GET /api/passes/:id/playback-url` and `GET /api/media/play`.
- `apps/lifeboat/test.sh` (U3): starts the DEV server with
  `DECENTRALFLIX_TEST_MINTS=1 DECENTRALFLIX_MEDIA_SECRET=test-media-secret-xyz`,
  then curl-asserts the 11 DF-MEDIA-3 cases (see s1-baseline.md).
- `apps/lifeboat/public/film.html` + `pass.html` (U4): pass.html persists
  `dfl.pass_id` in localStorage after the test subscription; film.html reads it
  and mints via `D.getJSON` (which attaches the Bearer <redacted> — app.js line 96),
  then sets `player.src = D.api(r.url)`. Error -> status banner. No pass_id ->
  legacy `film.playback_url || /api/films/:id/stream` path (unchanged).
- `apps/frontend/lib/playback-url.ts` (U5): typed `fetchPlaybackUrl`
  (Bearer <redacted> on the MINT call only; typed 401/403/404/transport/malformed-body
  errors; snake_case -> camelCase mapping) + `resolvePlaybackSrc` for video src.

## Traced primary path (mint -> play)
1. Browser (film.html) has `dfl.pass_id` (written by pass.html after test subscribe).
2. `D.getJSON("/api/passes/<pid>/playback-url?film=<fid>")` with
   `Authorization: Bearer <stored token>`.
3. Server: auth -> pass -> holder -> film -> entitlement -> `mintPlaybackUrl`
   -> 200 `{url: "/api/media/play?pass=..&film=..&exp=..&sig=..", expires_at,
   expires_in: 900, pass_id, film_id, legal_notice}`.
4. `player.src` = signed URL. Native video GETs it with NO header.
5. Server: `verifyPlaybackUrl` -> 403 on missing/non-integer/expired/bad-sig;
   else `CDN.streamFile` streams bytes, honoring `Range` (206).

## Most consequential failure path
Attacker with a stolen-but-expired or tampered URL: verify rejects with 403
before any film lookup or byte is served. Attacker minting for another account's
pass: holder check 403. Attacker minting for an unentitled film: entitlement
check 403. The signature cannot be retargeted (film swap -> 403, proven by test).

## Authoritative invariants
- I1: the HMAC signature binds (passId, filmId, expiry); TTL 900s.
- I2: entitlement is evaluated at MINT time only; play trusts the signature
  (presigned-URL design, Dino's pick). Revocation/refund propagation window <= 15 min.
- I3: mint-side authZ equals stream-route authZ: ownsFilm || hasEntitlement;
  a bare pass never grants a film.
- I4: play is fail-closed: any verification failure -> 403; no bytes served.
- I5: the Bearer <redacted> never touches the video element (mint call only).

## Discrepancies / notes
- D1: `playback-url.ts` has NO importers in apps/frontend (only its own test).
  It is complete, typed, and tested, but currently unwired — scaffolding for the
  Next.js watch page, not dead weight. Not a defect; wiring is a product-loop call.
- D2: serialization `${passId}.${filmId}.${exp}` is dot-joined, not
  length-prefixed. Mint and verify use the identical serialization, and IDs are
  server-generated, so cross-triple collisions are not reachable; the needed
  security property (no forgery without the secret) does not depend on the join.
  Considered and not a defect.
- D3: film.html shows no loading state while the mint call is in flight; on mint
  failure the player stays empty with an error banner (acceptable, visible).
- D4: an authenticated pass holder can distinguish film existence (404) from
  non-entitlement (403) at the mint endpoint — same as the stream route; minor,
  authenticated-only oracle, not a finding.
