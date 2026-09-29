# S0 — Scope and reality freeze (checkup-df-media-2026-09-29)

## Review ID / branch / tree state
- Review ID: checkup-df-media-2026-09-29
- Project: /home/dino/Decentralflix, branch devteam/df-renounce-media-2026-09-29
- Working tree is dirty: 114 changed paths (git status, verified 2026-09-29 ~18:49 EDT).
  The bulk is pre-existing and UNRELATED to Repair 2 (contract artifacts,
  frontend wiring for Repair 1, other checkup records under
  devteam/checkups/checkup-df-*/). Those are OUT OF SCOPE.

## Scope: change checkup for Repair 2 (DF-MEDIA-3) ONLY
Decision record: Dino's chief pick 2026-09-29 — signed short-lived playback
URLs (presigned-URL pattern): works with native video elements and CDNs, no
cookie/CORS hacks.

In-scope files (7; see initial.json file hashes):
1. apps/lifeboat/lib/playback.js (NEW, 82 lines) — HMAC-SHA256 mint/verify.
2. apps/lifeboat/server.js (MODIFIED) — Repair 2 scope is the two new route
   handlers passPlaybackUrl (~lines 990-1014) and mediaPlay (~lines 1016-1030),
   their route registrations (~lines 1400-1407), the require("./lib/playback")
   import, and the startup secret warning. UNRELATED pre-existing hunks in this
   same file (F-DFLIX-5 buyer-import owner gating, F-DFLIX-6 webhook credit
   idempotency) are OUT OF SCOPE.
3. apps/lifeboat/test.sh (MODIFIED) — Repair 2 scope is the 11 new DF-MEDIA-3
   tests (~lines 727-791) and the DECENTRALFLIX_MEDIA_SECRET server-start line.
   UNRELATED hunks (F-DFLIX-5/F-DFLIX-6 regression tests) are OUT OF SCOPE.
4. apps/lifeboat/public/film.html (MODIFIED) — Repair 2 hunk only: fetch the
   signed playback URL when dfl.pass_id is in localStorage, set as video src.
5. apps/lifeboat/public/pass.html (MODIFIED) — Repair 2 hunk only: persist
   dfl.pass_id to localStorage after test subscription.
6. apps/frontend/lib/playback-url.ts (NEW, 98 lines) — typed client.
7. apps/frontend/lib/playback-url.test.ts (NEW, 83 lines) — 7 vitest tests.

Explicitly excluded from this scope: apps/frontend/lib/contracts/abis.generated.ts
(belongs to the sibling Repair 1 checkup); all other dirty files.

## Requirements / invariants under review
- R1: video elements cannot send Authorization: Bearer — the header-authed
  /api/films/:id/stream was unreachable from the browser player.
- R2: An entitled pass holder mints a short-lived (15 min) HMAC-signed URL via
  authed JSON GET /api/passes/:id/playback-url?film=<id>; holder check = the
  pass owner's Bearer <redacted> (reused from passDetail; no existence leak to strangers).
- R3: Film entitlement check at mint matches the stream route:
  ownsFilm(account, film) || hasEntitlement(account, film.film_id); a bare pass
  alone never grants a film.
- R4: GET /api/media/play verifies sig+expiry itself, 403 fail-closed on
  missing/tampered/expired; Range requests honored via CDN.streamFile.
- R5: Secret from DECENTRALFLIX_MEDIA_SECRET; dev-only default with startup warning.
- R6: Typed frontend client mirrors the snake_case API; the video element never
  sees the Bearer <redacted>

## Omitted lenses (applicability decisions)
- BLD: not selected — build/dependency evidence for this change is the checks
  themselves (bash/node + vitest/tsc run from installed toolchains); no build
  step, Dockerfile, or lock change is part of Repair 2.
- PRF: not selected — one HMAC per mint/verify is microseconds; no
  growth/allocation path in scope. Streaming throughput is the pre-existing
  CDN.streamFile path, unchanged.
- REL: not selected — stateless signature verification; no jobs, leases, retries,
  or recovery state introduced (mint is a pure signing op after authZ).
- DAT: not selected — no schema/storage changes; passes/films/entitlements are
  pre-existing stores, read-only in this change.
- UIX: selected only for U4 (player pages). For U1/U2/U3/U5 the lens is omitted
  by design because those units expose no user-facing surface (server lib,
  routes, shell tests, typed fetch client).

## Source identity
Initial snapshot: devteam/checkups/checkup-df-media-2026-09-29/initial.json
(spec_digest e25073b9ab21906c, source_digest 713c1aba09164799, 7 files hashed).
Source paths were reconciled against the filesystem inventory: all 7 exist;
the 3 NEW files are untracked (git status ??), the 4 MODIFIED files are
worktree-modified. Sibling checkup dirs (checkup-df-renounce-*, checkup-df14b-*,
checkup-df15-*, checkup-dfbatch2-*, checkup-docs1-*) are recorder output of
other reviews — out of scope, noted as such.
