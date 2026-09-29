<!-- C12 flow note — STR (Media Streaming Engineer) · 2026-09-29 -->
# Flow: filmmaker upload → (no) transcode → buyer playback

Owner: STR · Last updated: 2026-09-29 · Status: traced end to end, hop by hop

**One-line summary:** A filmmaker multipart-uploads a master file to the lifeboat (`POST /api/films/import`), which is stored byte-for-byte under `data/masters/` and later served to entitled buyers as progressive-download MP4 with HTTP range support (`GET /api/films/:id/stream`). There is **no transcoding step** anywhere in the path; the marketing frontend's hybrid player (R2/Theta/Livepeer/…) is a separate, demo-only pipeline that never touches lifeboat masters.

## How it works (hop by hop, with path:line)

### 1. Upload — filmmaker → lifeboat
1. **UI:** `apps/lifeboat/public/import.html` — form collects title/description/price/territories/genres/download-flag/music-attestation + the master file (`<input type="file" id="f-master" name="master" accept="video/*">`, import.html:66). Client-side checks only: title/email/file present, price parses (import.html:120-140). The file picker hint `accept="video/*"` is advisory — the browser may still let any file through.
2. **Submit:** form builds `FormData` with fields `meta` (JSON string) and `master` (file bytes) and POSTs to `/api/films/import`. (Same contract the Next.js `UploadTest.tsx` component uses; the canonical UI path is the lifeboat page.)
3. **Route gate:** `apps/lifeboat/server.js:1125-1128` — `requireFilmmaker(req, res)` (server.js:233-239): must present a valid Bearer session for an account with `role === 'filmmaker'`. Anonymous → 401, non-filmmaker → 403.
4. **Body intake:** `importFilm` (server.js:432-494) requires `Content-Type: multipart/form-data` (else 400), then `readBody(req, MAX_UPLOAD_BYTES)` (server.js:105-119) — accumulates **the entire body in RAM, up to 1 GiB** (`MAX_UPLOAD_BYTES = 1 << 30`, server.js:27), rejecting with 413 past the cap. Then `parseMultipart(body, ct)` (server.js:142-172) splits parts; extracts `meta` (JSON) and `master` (raw bytes).
5. **Metadata validation:** `validateFilmMeta` (server.js:338-356) enforces: title non-empty, `price_usd_cents` positive integer, `territories` non-empty string array, optional genres array, `cleared_music_attested === true` (music-rights gate), `filmmaker_email` valid email. **No validation of the media bytes** — no magic bytes, no container/codec sniffing.
6. **Publish:** server mints `filmId = 'film_' + crypto.randomBytes(6).toString('hex')` (server.js:466), writes bytes to `data/masters/<filmId>.mp4.tmp` then atomic `renameSync` → `<filmId>.mp4` (server.js:467-470). The on-disk name is always `<filmId>.mp4` regardless of what was uploaded; the original filename is stored only as `original_filename: path.basename(masterFilename)` in the record (no traversal risk — `path.basename`, and the disk name never uses it).
7. **Record:** film row inserted into the `films` JSON collection (server.js:472-488) with `master_bytes`, `download_allowed`, `cleared_music_attested: true`, `filmmaker_email` (from the authenticated account). Response 201: `{ film_id, playback_url: CDN.getPlaybackUrl(film) }` plus `download_url` when `download_allowed`.
8. **Where bytes land:** `apps/lifeboat/data/masters/*.mp4` — gitignored runtime state (MAP §6), NOT tracked. No per-filmmaker quota, no disk-space check, no resumable upload (single POST; a dropped connection restarts from zero).

### 2. Transcoding — there is none
- Verified by grep: `ffmpeg|transcode|hls|dash` across `apps/lifeboat/` returns only the substring "dash" in `dashboard.html`. No `child_process` in the lifeboat at all.
- What the player therefore **requires of the source file**: a browser-playable MP4 (in practice H.264 video + AAC audio; H.265/AV1/VP9 uploads will fail on some browsers), ideally with the moov atom at the front (faststart) — nothing enforces or normalizes this (STR-003).
- **ABR implications (honest):** there is no adaptive-bitrate ladder — one bitrate for every network. Playback is progressive download over HTTP ranges; slow links rebuffer with no graceful step-down. No thumbnails, no audio normalization.
- **Documented decision?** `STORAGE_STREAMING_ARCHITECTURE_DECISION.md` (ADR-001, 2026-05-29) describes a *future* hybrid (Livepeer transcode, Filecoin/Theta delivery) — it is the vision, not the working M2 lifeboat. No doc found by STR states "the lifeboat intentionally does no transcoding"; RUN.md claims "stream 206 playback" which is true of the byte-range serving. DOC's claims audit should reconcile ADR-001/RUN.md/whitepaper against the direct-file reality (STR-009).

### 3. Delivery — purchase → entitlement → byte-range streaming
1. **Purchase:** `POST /api/purchases/test` → `testPurchase` (server.js:641-659): `requireAuth` (Bearer session), then `grantEntitlement` (server.js:384+) writes an `entitlements` row keyed by `(film_id, buyer email)` and returns an Ed25519-signed receipt (`test_mode: true`, no money moved). Bundle variant: `POST /api/purchases/bundle/test` (server.js:663+).
2. **Entitlement predicate:** `hasEntitlement(account, filmId)` (server.js:248-257) — entitlement row exists for the account's email with `status` not `revoked`/`refunded`; OR `ownsFilm(account, film)` (server.js:241-246) — `film.filmmaker_email` matches the account email (filmmakers always stream their own).
3. **Stream route:** `GET /api/films/:id/stream` (server.js:1129-1137):
   ```js
   const account = requireAuth(req, res); if (!account) return;          // 401
   const film = store.get('films', seg[1]); if (!film) return 404;
   if (!ownsFilm(account, film) && !hasEntitlement(account, film.film_id))
     return sendError(res, 403, 'purchase required to stream this film');
   return CDN.streamFile(req, res, film);
   ```
   The entitlement check happens **before** any byte is served, on every request including range follow-ups (browsers re-request ranges; each carries the check — but see STR-001: a browser `<video>` can't carry the Bearer token at all).
4. **Byte serving:** `LocalOrigin.streamFile` (apps/lifeboat/lib/cdn.js:36-90):
   - `masterPath` (cdn.js:31-34): `path.join(mastersDir, film.film_id + '.mp4')` — `film_id` is server-minted `[a-z0-9_]`; no traversal.
   - Missing file → 404 JSON (`cdn.js:38-43`).
   - Always sets `Accept-Ranges: bytes`, `Content-Type: video/mp4`.
   - No `Range` → 200 + full body via `createReadStream` (cdn.js:49-53).
   - `Range: bytes=<start>-<end>` → parsed by `/^bytes=(\d*)-(\d*)$/` (cdn.js:55): supports open-ended (`bytes=512-`) and suffix (`bytes=-500`) ranges; responds 206 with correct `Content-Range: bytes <s>-<e>/<total>` and byte-exact `Content-Length: end-start+1` (verified by test.sh `cmp` — first 1024 bytes of a range match the full stream).
   - Unsatisfiable → 416 with `Content-Range: bytes */<total>` (cdn.js:78-82). Deviations: `end >= total` → 416 instead of RFC 9110 clamping; multipart ranges → 416 instead of 200-full (STR-005).
   - **Not handled:** `If-Range` (ignored), `ETag`/`Last-Modified` (never sent), `Cache-Control` (never sent on media) — STR-006. **CORS:** no `Access-Control-Allow-Origin` anywhere in the lifeboat — STR-007.
5. **Download route:** `GET /api/films/:id/download` (server.js:1139-1147) → same auth+entitlement gate → `downloadFilm` (server.js:843-857): refuses with 403 `STREAMING_ONLY_AB2426` when `!film.download_allowed`, else sets `Content-Disposition: attachment; filename="<film_id>.mp4"` and funnels through `CDN.streamFile` (so ranges work on downloads too).
6. **CDN backends** (`cdn.js:123-126`): default `LocalOrigin` (this box). `Bunny` backend activates on `CDN_BACKEND=bunny` + 3 env vars; its `streamFile` **302-redirects to an unsigned public pull-zone URL** (cdn.js:110-121) — entitlement bypass when activated (STR-002). The Cloudflare worker (`cloudflare-worker/access-control.js`) sketches the *right* pattern (signed, IP-bound R2 URLs) but is standalone/simulation-mode, not wired in.
7. **Signed URLs/tokens for media:** **none exist** in the lifeboat. The only credential is the Bearer session token on the API route; the media URL itself (`/api/films/:id/stream`) is predictable and is even published to anonymous visitors via `fullFilm.playback_url` on the public `GET /api/films/:id` route (server.js:377-382) — harmless while the endpoint gate holds, fatal in Bunny-redirect mode.

### 4. Player(s)
- **Real playback path — lifeboat storefront:** `apps/lifeboat/public/film.html` sets `<video id="player" controls preload="metadata" playsinline>.src = <stream URL>` (film.html:23, 97-98). That is the entire player: native browser controls (keyboard operable, seeking via range requests), **no** `<track>`/WebVTT captions, **no** `onerror` handler, **no** retry, **no** source fallback. A failed media request (401/404/416) renders as a dead player with no message. And per STR-001, the browser *cannot* satisfy the route's Bearer-token requirement on a `<video>` request — so the watch page 401s on the media fetch for every user.
- **Marketing frontend player:** `apps/frontend/components/VideoPlayer.tsx` (+ `app/watch/[hash]/page.tsx`) is a polished hybrid player — source-priority list, auto-fallback across sources on error (`handleSourceError`), manual retry (`retryPrimarySource`), P2P seeding panel. But its sources (`useVideoSources`: R2 signed URL → Theta → Livepeer HLS → Filecoin → Arweave) are the ADR-001 vision/demo pipeline; it never receives a lifeboat stream URL and cannot play a purchased lifeboat master.
- **Upload-side frontend hooks** (`useVideoUpload`, `useArweaveUpload`): client-side only; Livepeer "transcode" step is simulation-mode without `NEXT_PUBLIC_LIVEPEER_API_KEY`. Not the working upload path (the working path is the lifeboat multipart POST).

### 5. The storage module (`packages/storage/src/`) — design review for *if* it gets wired in
- **What it is:** dependency-free Node ESM: `fragment.js` (1 MiB fragments, fail-closed contiguous reassembly), `encrypt.js` (AES-256-GCM, fresh random 12-byte IV per fragment, auth tags, honest "at-rest confidentiality, NOT DRM" header), `hash.js`/`merkle.js` (sha256 manifest + Merkle proofs), `ipfs.js`/`arweave.js` (Kubo + Arweave clients, 30 s timeouts, fail-fast on 404), `store.js` (`storeFilm`/`retrieveFilm` with IPFS→Arweave fallback, tamper-evidence before decrypt). 93 tests, all passing; **zero importers** outside tests (TST-001).
- **Sound for archival:** yes — IV discipline, GCM auth, hash-before-decrypt, timeouts, retry-with-backoff are all correct.
- **Key management:** **no implementation**. `storeFilm(buffer, {key})` returns the raw 32-byte key to the caller with the doc line "the caller MUST persist it — the key is returned, never stored" (store.js:72-73). No key server, license server, or entitlement-bound key-release exists anywhere. Confirmed: key delivery is an unsolved open design (STR-010).
- **Streaming fitness:** poor as-is — `retrieveFilm` must fetch, verify, decrypt and join **all** fragments before returning a single Buffer (store.js:208-261). No fragment-range reads, no progressive playback, no seeking without full download. Wiring this into the player needs a range-capable decrypt-on-the-fly serving layer (plus the key-release design above).
- **Cost note:** manifests on Arweave are permanent per film; fragment mirroring to Arweave is OFF by default (costs AR per byte) — the intended hot path is IPFS/Filecoin pinning (see PINNING.md, L7).

## Observations
- **CJ1 verdict (gating):** On the *working* lifeboat path, media bytes are gated **server-side on every request** at `server.js:1129-1137` (`/stream`) and `server.js:1139-1147` (`/download`) by `requireAuth` + (`ownsFilm` OR `hasEntitlement`). The gate is real and tested (test.sh: 401/403/200/206/416). BUT: (a) the storefront UI cannot pass it (STR-001 — client-capability gap, S1); (b) activating the Bunny backend as written voids it (STR-002 — unsigned public redirect, S1-conditional); (c) masters are **unencrypted at rest and in transit** — the gate is access control, not content protection (matches MAP §5's CJ1 refinement; W3B's L4 owns the product hole).
- The architecture has **two players and two pipelines that don't meet**: the lifeboat (real purchases, real masters, broken UI playback) and the marketing frontend (polished player, demo/simulated sources, no real purchases). A buyer demoing the "verified live" :8080 service in a browser cannot watch what they bought.
- Direct-file serving is simple and correct for what it does (byte-exact ranges, proper 416 shape), but the "upload anything, play anywhere" contract is enforced nowhere — filmmaker discipline is the only quality gate (STR-003, STR-009).
- `GET /api/films/:id` is public and leaks `playback_url` + `master_bytes` + `original_filename` to anonymous visitors (server.js:377-382 via `fullFilm`). The URL alone grants nothing while the endpoint gate holds; still, it's the exact URL an attacker would probe in Bunny mode.

## Open questions (recommended defaults)
1. **Transcoding in scope?** — The STR checklist assumes a transcode pipeline; none exists and none is stubbed server-side. *Default:* bless direct-file as the M2 architecture and make the upload contract explicit ("MP4/H.264+AAC, faststart, ≤1 GiB", enforced per STR-003). A transcode job queue (sandboxed ffmpeg) is a Phase-3+ product decision, not a review fix.
2. **Storage-module wire-in?** — *Default:* keep `packages/storage` as the cold/archival path; do NOT wire it into playback until (a) entitlement-bound key release and (b) range-capable encrypted serving are designed (STR-010). Mark the module's README accordingly so the 93-test suite can't be misread as CJ1 coverage.
3. **Media auth model?** — *Default:* short-lived HMAC-signed playback URLs (sig over film_id + email + expiry) validated on the media path — works with native `<video>`, keeps checks server-side. Cookie sessions are the alternative; both change the auth model → NEEDS-OWNER per B1.
4. **Bunny activation?** — *Default:* do not set `CDN_BACKEND=bunny` until STR-002 is fixed (signed/token-authenticated pull-zone URLs). Note in RUN.md.

## Related issues
STR-001 … STR-010 (`devteam/findings/str.md`) · TST-001 (unwired storage module) · MAP §5 (CJ1 refinement) · B3 L4 (paid-content protection) · cloudflare-worker/access-control.js (reference signed-URL pattern, simulation mode)
