# Findings — Media Streaming Engineer (STR)
Scope: upload → transcode (absence) → delivery → player · ID range: STR-001…STR-010
## Coverage completed
- `apps/lifeboat/server.js` (1,319 lines) — full read: upload route `importFilm` (432–494), router media routes (1125–1143), auth helpers (195–257), multipart parser (142–172), `validateFilmMeta` (338–356), `publicFilm`/`fullFilm` (366–382), `downloadFilm` (843–857)
- `apps/lifeboat/lib/cdn.js` (128 lines) — full read: `LocalOrigin.streamFile` range/206/416 (36–90), `Bunny` backend (93–121), `createCdn` (123–126)
- `apps/lifeboat/public/film.html` (1–109 read), `import.html` (submit handler), `app.js` (getJSON/postJSON helpers, 1–110)
- `apps/frontend/components/VideoPlayer.tsx` (288 lines, full), `app/watch/[hash]/page.tsx` (1–120), `hooks/useVideoUpload.ts` (1–60)
- `packages/storage/src/encrypt.js` (123), `fragment.js` (70), `store.js` (262), `ipfs.js` (1–60 + timeout grep), `index.js` (exports)
- `STORAGE_STREAMING_ARCHITECTURE_DECISION.md` (1–100 read); greps: ffmpeg/hls/dash in apps/lifeboat, Access-Control in server.js/cdn.js, signed-url in lifeboat, Bearer/auth in public/
## Findings

### STR-001 · Storefront UI cannot purchase or play: media gate is correct, but the UI has no way through it
**S1 · Confirmed · NEW · Effort M · Lens STR · Found by STR in Phase 2 on 2026-09-29**

**Location:** `apps/lifeboat/public/film.html:97-98`, `apps/lifeboat/public/app.js` (getJSON/postJSON), vs `apps/lifeboat/server.js:226-231` (requireAuth) and `:1125-1133` (`/stream` route)

**Evidence:**
```html
<!-- film.html:97-98 — the watch page sets a plain <video> src -->
var streamUrl = film.playback_url || D.api("/api/films/" + encodeURIComponent(filmId) + "/stream");
document.getElementById("player").src = streamUrl;
```
```js
// server.js:195-224 — the ONLY credential the server accepts:
const header = req.headers.authorization || '';   // Bearer <redacted>, never cookies
// app.js getJSON/postJSON attach NO Authorization header anywhere; grep for
// 'auth/login|auth/signup|Bearer' across public/*.html + app.js → zero hits.
```

**What's wrong:** `/api/films/:id/stream` requires `requireAuth` (Bearer session token) + `ownsFilm || hasEntitlement` (server.js:1125-1133), and `POST /api/purchases/test` requires `requireAuth` (server.js:641-643). But a native `<video>` element cannot send an `Authorization` header, and the storefront's fetch helpers never attach one — no login UI exists at all. Result: in the browser UI, buying a film 401s (`film.html:122` posts film_id+email with no token) and loading the player 401s on the media request. The gate is provably correct server-side (test.sh: 401 without token, 403 without purchase, 200/206 byte-exact with both), but the working product's own UI cannot complete the crown-jewel flow.

**Impact:** Critical flow 2 ("viewer browse → purchase → stream 206 playback") is broken end-to-end in the lifeboat storefront UI. The :8080 service was verified *reachable* (HTTP 200s) on 2026-09-28, but browser-based watch-after-purchase was never exercised — any buyer using the UI sees an empty/dead player with no error message (`film.html:23` `<video>` has no `onerror` handler).
**Reproduce / reasoning:** Static: follow `film.html:97-98` → `requireAuth` → 401. Reproducible live by opening film.html in a browser against a running lifeboat.
**Other instances (sibling search):** Same pattern in `downloadFilm` link (`film.html:103-104` — `<a href>` to `/download` also can't send the header; browser navigation gets 401). No other media consumers in the lifeboat.
**Suggested fix:** Server-side-signed, short-lived playback URLs (e.g. `?sig=…&exp=…` HMAC'd over film_id + email + expiry, validated on the media path) — keeps entitlement checks server-side, works with native `<video>`. Alternative: cookie-session auth for the media path. Both need owner decision on the auth model for media.
**Related:** notes/flows/upload-playback.md (§4 Player); STR-008; SEC authz matrix (server side is fine — this is a client-capability gap, not a missing check)

### STR-002 · Bunny backend bypasses the entitlement gate when activated (public unsigned pull-zone URLs)
**S1 · Confirmed (conditional: only when CDN_BACKEND=bunny) · NEW · Effort S · Lens STR · Found by STR in Phase 2 on 2026-09-29**

**Location:** `apps/lifeboat/lib/cdn.js:110-121`

**Evidence:**
```js
// cdn.js:110-113 — playback URL is a bare, unsigned public URL:
return `https://${this.pullzoneHostname}/masters/${film.film_id}.mp4`;
// cdn.js:115-121 — and the "gated" stream route just redirects to it:
streamFile(req, res, film) {
  this._assertConfigured();
  res.writeHead(302, { Location: this.getPlaybackUrl(film) });
  res.end();
}
```

**What's wrong:** The server-side entitlement check on `GET /api/films/:id/stream` (server.js:1128-1133) becomes a speed bump: once `CDN_BACKEND=bunny` is set, the player is 302'd to an unsigned, unexpiring public URL that anyone can fetch directly — including anyone who learns the `film_id`, which is served to *anonymous* visitors via `fullFilm.playback_url` on the public `GET /api/films/:id` route (server.js:377-382). No token, no expiry, no IP binding. This is the exact failure mode crown jewel 1 guards against.

**Impact:** If Bunny is ever activated as written, paid content is public. Currently inert (Bunny throws "not configured" — cdn.js:100-106), so severity is conditional, not live.
**Reproduce / reasoning:** Static: trace `/stream` → `CDN.streamFile` → 302 Location. No signature parameter exists anywhere in the class.
**Other instances (sibling search):** `downloadFilm` also funnels through `CDN.streamFile` (server.js:856) — same bypass.
**Suggested fix:** Sign Bunny URLs (Bunny token authentication / signed URLs with expiry) OR route all playback through the lifeboat with the token check kept. Note the Cloudflare worker (`cloudflare-worker/access-control.js`) already sketches the right pattern (NFT-gated signed R2 URLs, 4h IP-bound) — the Bunny path never got it.
**Related:** notes/flows/upload-playback.md (§3 Delivery); W3B L4 / CJ1; MAP §7 Bunny row

### STR-003 · Upload validates metadata but not media bytes: no magic-byte/container/codec check, fixed .mp4 name
**S2 · Confirmed · NEW · Effort S · Lens STR · Found by STR in Phase 2 on 2026-09-29**

**Location:** `apps/lifeboat/server.js:432-494` (`importFilm`); served as `video/mp4` at `apps/lifeboat/lib/cdn.js:46`

**Evidence:**
```js
// importFilm stores whatever bytes arrived, with a fixed .mp4 name — no content sniffing:
const finalPath = path.join(MASTERS_DIR, filmId + '.mp4');
fs.writeFileSync(tmpPath, masterData);
fs.renameSync(tmpPath, finalPath); // atomic publish of the master
// The only client-side check is a picker hint:
<input type="file" id="f-master" name="master" accept="video/*" required>  // import.html:66
```

**What's wrong:** Any bytes ≤1 GiB (zip, text, H.265-in-.mkv, whatever) are accepted as a "master", saved as `.mp4`, and served with `Content-Type: video/mp4`. The player therefore *requires* the filmmaker to supply a browser-playable MP4. There is no faststart (moov-at-front) normalization either — a non-faststart MP4 plays only after the browser downloads enough to find the moov atom, i.e. long black startup on large files. Meta validation (`validateFilmMeta`, server.js:338-356) covers title/price/territories/music-attestation, not the media.
**Impact:** Broken playback for honest-but-sloppy uploads (most common: non-faststart exports, H.265, .mkv renamed). Wrong-type bytes waste storage and confuse the catalog.
**Reproduce / reasoning:** Static: the only byte-touching code in importFilm is the length check (`masterData.length === 0`).
**Other instances (sibling search):** None — one upload path.
**Suggested fix:** Server-side container sniffing (first bytes: `ftyp` box) and reject/warn on non-MP4; document "MP4/H.264/AAC, faststart recommended" in the import UI. Real transcoding/normalization is a product decision (see STR-009 / Q in flow note).
**Related:** notes/flows/upload-playback.md (§1 Upload, §2 Transcoding); STR-009

### STR-004 · Multipart upload buffers the entire body (up to 1 GiB) in RAM before writing to disk
**S2 · Confirmed · NEW · Effort M · Lens STR · Found by STR in Phase 2 on 2026-09-29**

**Location:** `apps/lifeboat/server.js:105-119` (`readBody`), called at `server.js:439` with `MAX_UPLOAD_BYTES` (server.js:27, 1 GiB)

**Evidence:**
```js
function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    req.on('data', (c) => { bytes += c.length; /* …413 over limit… */ chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));  // full body in RAM, copied again
  });
}
// …then parseMultipart over the whole buffer, then fs.writeFileSync(tmpPath, masterData)
```

**What's wrong:** A 1 GiB upload transiently holds ~2 GiB (chunks + concat copy; `parseMultipart` subarrays avoid a third copy) before a single `writeFileSync`. Two concurrent max-size uploads on the 7 GB-class box risk OOM; there is also no per-filmmaker quota and no disk-space check before writing to `data/masters/`. Uploaders are filmmaker-role authenticated (server.js:1126-1128), so this is not an anonymous DoS — but one honest 1 GiB upload still pins gigabytes.
**Impact:** Reliability: OOM kills the single-process server mid-upload; disk fill breaks all films.
**Reproduce / reasoning:** Static: code path read end-to-end; memory math from the concat.
**Other instances (sibling search):** `readJson` uses the same helper but capped at 1 MiB (fine).
**Suggested fix:** Stream the multipart body to a temp file as it arrives (write chunks to disk in the `data` handler), enforce a filmmaker quota + free-disk check.
**Related:** notes/flows/upload-playback.md (§1); PRF lane (hot-path memory)

### STR-005 · Range handling deviates from RFC 9110: no clamping, no multipart handling
**S3 · Confirmed · NEW · Effort XS · Lens STR · Found by STR in Phase 2 on 2026-09-29**

**Location:** `apps/lifeboat/lib/cdn.js:55-82`

**Evidence:**
```js
const m = /^bytes=(\d*)-(\d*)$/.exec(String(range).trim());  // multipart "bytes=0-1,4-5" never matches
// …
const bad = m === null || start === null || /* … */ start > end || start >= total || end >= total;
if (bad) { res.writeHead(416, { 'Content-Range': `bytes */${total}` }); res.end(); return; }
```

**What's wrong:** (a) `end >= total` returns 416, but RFC 9110 §14.1.2 says a last-byte-pos beyond the representation length is *clamped*, not rejected (`bytes=0-999999` on a 100-byte file should be `206 bytes 0-99/100`). (b) Multipart ranges fall through to 416, but §14.4 says a server that won't do multipart SHOULD return 200 with the full representation, not 416. In-practice impact is low — Chrome/Safari `<video>` send only single ranges — but a picky player or download manager can spin on 416s.
**Impact:** Edge-case protocol incorrectness; potential rebuffering loops with strict clients.
**Reproduce / reasoning:** Static; confirmable with `curl -H 'Range: bytes=0-99999999'` against any film (expect 416, RFC says 206-clamped).
**Other instances (sibling search):** Only one range implementation (`downloadFilm` funnels through the same `streamFile`).
**Suggested fix:** Clamp `end` to `total - 1`; return 200 full-content for multipart ranges.
**Related:** notes/flows/upload-playback.md (§3); TST-0xx: test.sh covers only satisfiable single ranges + one out-of-range 416

### STR-006 · No conditional-request support on media: no ETag/Last-Modified, no Cache-Control
**S3 · Confirmed · NEW · Effort XS · Lens STR · Found by STR in Phase 2 on 2026-09-29**

**Location:** `apps/lifeboat/lib/cdn.js:36-90` (media response headers)

**Evidence:** Media responses set only `Accept-Ranges`, `Content-Type: video/mp4`, `Content-Length` / `Content-Range`. No `ETag`, no `Last-Modified`, no `Cache-Control`. `If-Range` (cdn.js:48) is read only as `range` — the `If-Range` header is never consulted.

**What's wrong:** No conditional GETs (a rewatch always re-downloads; interrupted downloads can't validate-resume via `If-Range`). Masters are content-stable per `film_id` (never overwritten in place — importFilm always mints a new `film_<hex>` id), so a long-lived immutable cache policy would be safe and cheap; currently none exists.
**Impact:** Wasted egress on repeat views of up-to-1 GiB masters; no resume-validation.
**Reproduce / reasoning:** Static; `curl -I` on any stream shows the header set.
**Other instances (sibling search):** Static files (`serveStatic`, server.js:80-103) set `Cache-Control: no-cache` only — same gap, separate path.
**Suggested fix:** `ETag: "<sha256-of-master>"` (or size+mtime) + `Cache-Control: public, max-age=31536000, immutable` on 200/206 media responses; honor `If-Range`.
**Related:** notes/flows/upload-playback.md (§3)

### STR-007 · No CORS anywhere: cross-origin players and caption tracks break
**S3 · Confirmed · NEW · Effort XS · Lens STR · Found by STR in Phase 2 on 2026-09-29**

**Location:** `apps/lifeboat/server.js`, `apps/lifeboat/lib/cdn.js` — `grep -n 'Access-Control'` → zero hits in both

**Evidence:** No `Access-Control-Allow-Origin` header is ever set, on API or media responses.

**What's wrong:** The same-origin lifeboat storefront (`:8080` pages → `:8080` API) works without CORS, and plain `<video src>` cross-origin playback also works without CORS. But anything that needs CORS *does* break: `<track>` elements for WebVTT captions (required cross-origin), fetch()-based players, and the Next.js frontend on `:3000` if it ever points at lifeboat media URLs directly. This constrains future player work (e.g. STR-008 captions) to same-origin only.
**Impact:** Latent; becomes a blocker the moment media is consumed cross-origin with credentials or tracks.
**Reproduce / reasoning:** Static: grep for Access-Control across the lifeboat → empty.
**Other instances (sibling search):** API responses equally CORS-less (SEC's lane for the API side).
**Suggested fix:** Decide the media origin policy: if media stays same-origin, document it; if the :3000 frontend will consume :8080 media, add scoped `Access-Control-Allow-Origin` on media routes (no credentials needed for plain playback; `crossorigin` + CORS needed for tracks).
**Related:** notes/flows/upload-playback.md (§3); STR-008

### STR-008 · Lifeboat player has no captions, no error handling, no retry — recovery exists only in the unused marketing player
**S3 · Confirmed · NEW · Effort S · Lens STR · Found by STR in Phase 2 on 2026-09-29**

**Location:** `apps/lifeboat/public/film.html:23,97-98` vs `apps/frontend/components/VideoPlayer.tsx:60-73`

**Evidence:**
```html
<video id="player" class="player" controls preload="metadata" playsinline></video>  <!-- film.html:23: no <track>, no onerror -->
```
vs the marketing player, which auto-falls-back across sources (`handleSourceError`, `retryPrimarySource` — VideoPlayer.tsx:60-73) but only plays hybrid/demo sources (R2/Theta/Livepeer/Filecoin/Arweave), never lifeboat masters.

**What's wrong:** The player that actually plays purchased films is a bare native `<video>`: native controls give keyboard operability for free, but there are no WebVTT caption tracks, no `onerror` handling (a 401/404/416 on the media request renders as a dead player with no message — the exact symptom of STR-001), no retry, no source fallback. The component with real error recovery (VideoPlayer.tsx) is wired to a different, demo-only pipeline and never sees a lifeboat stream URL.
**Impact:** Accessibility gap (no captions); silent failure mode compounds STR-001; no resilience story for the real playback path.
**Reproduce / reasoning:** Static: read film.html in full (no track/error handlers).
**Other instances (sibling search):** `library.html`/`dashboard.html` contain no player code.
**Suggested fix:** Add `<track>` + WebVTT pipeline (needs STR-007 CORS decision if cross-origin), `onerror` → user-facing message + retry button; keep native controls. Do NOT point the marketing VideoPlayer at lifeboat URLs until its sources are real.
**Related:** notes/flows/upload-playback.md (§4); STR-001, STR-007; UIX lane (captions/a11y)

### STR-009 · No transcoding anywhere in the serving path: direct-file progressive MP4 is the de-facto architecture, ABR impossible
**S2 · Confirmed · NEW · Effort L · Lens STR · Found by STR in Phase 2 on 2026-09-29**

**Location:** architecture-level; evidence: `grep -rin 'ffmpeg|transcode|hls|dash' apps/lifeboat/` → only `dashboard.html` (substring of "dashboard"); `apps/lifeboat/lib/cdn.js` (byte-range over the uploaded file); `STORAGE_STREAMING_ARCHITECTURE_DECISION.md` (vision doc, not the working path)

**What's wrong:** Confirmed TST's Phase 1 surprise: there is no transcoding step between upload and playback. The lifeboat serves the filmmaker-uploaded file byte-for-byte with HTTP ranges (progressive download, not HLS/DASH). Consequences: (a) no adaptive-bitrate ladder — one bitrate for all networks, rebuffering on slow links with no graceful degradation; (b) codec is whatever the filmmaker uploaded — H.265/AV1/VP9-in-MP4 will not play in all browsers; (c) no thumbnails, no audio normalization, no faststart enforcement (see STR-003); (d) seek granularity is byte-range only — fine for MP4 with a good moov, painful without. ADR-001 (2026-05-29) describes a Livepeer-transcode hybrid future, but the working M2 lifeboat is direct-file; nothing in RUN.md or the whitepaper was found (by STR) that states "no transcode by design" for the lifeboat — DOC to reconcile the docs claims.
**Impact:** Product/QoE: single-bitrate progressive playback; uploader discipline is the only quality gate. Also a cost note: no transcode spend, but full-bitrate egress always.
**Reproduce / reasoning:** Static: the serving code path (`server.js:1128-1133` → `cdn.js:36-90`) never shells to ffmpeg (no child_process in the lifeboat at all) and emits no manifests.
**Other instances (sibling search):** Frontend `useVideoUpload.ts` has a *simulated* Livepeer transcode step (client-side, simulation mode without `NEXT_PUBLIC_LIVEPEER_API_KEY`) — stub, not a pipeline.
**Suggested fix (owner decision):** Either bless direct-file as the M2 architecture (document constraints: "MP4/H.264+AAC, faststart, ≤1 GiB" as the contract, enforce at upload per STR-003) or scope a transcode job queue (sandboxed ffmpeg — attacker-controlled input — with retries/idempotency per the STR checklist). See flow note §2 and QUESTIONS.md candidate.
**Related:** notes/flows/upload-playback.md (§2); DOC claims audit (ADR-001 vs working code); TST (no transcode tests exist because there is no transcode)

### STR-010 · Encrypted-fragment module: sound crypto, but no key delivery and no streaming — cannot serve CJ1 as-is
**S2 · Confirmed · NEW · Effort L · Lens STR · Found by STR in Phase 2 on 2026-09-29**

**Location:** `packages/storage/src/store.js:67-104` (storeFilm), `packages/storage/src/store.js:208-261` (retrieveFilm), `packages/storage/src/encrypt.js:1-8`

**Evidence:**
```js
// store.js:72-73 — the key-management story, in full:
* @param {Buffer} [opts.key] - 32-byte encryption key; generated if omitted
*   (the caller MUST persist it — the key is returned, never stored)
```
```js
// retrieveFilm: fetch ALL fragments → verify → decrypt → join → return whole Buffer
return joinFragments(decrypted);  // store.js:261 — no range/partial API
```

**What's wrong:** The crypto design itself is sound (fresh 12-byte IV per fragment — encrypt.js:52; AES-256-GCM auth tags; manifest sha256 verified *before* decrypt — store.js:252-258; fail-closed contiguous reassembly — fragment.js:53-70; 30s timeouts on IPFS/Arweave clients). But: (a) there is **no key delivery**: `storeFilm` returns the raw 32-byte key to the caller and documents "caller MUST persist it" — no key server, license server, or entitlement-bound key-release exists anywhere in the module or repo. The module header is honest that this is "at-rest confidentiality, NOT DRM" (encrypt.js:5-7), but anyone wiring it in for CJ1 must still design key distribution. (b) **No streaming**: `retrieveFilm` materializes the *entire* film in memory before returning — no fragment-range reads, no progressive playback, no seeking without full download+decrypt. For a 1 GiB film that is a non-starter for the player. So the module is a correct *archival* primitive, not a *streaming* primitive; wiring it into playback needs a fragment-range/decrypt-on-the-fly serving layer plus key release.
**Impact:** If the team wires `packages/storage` in believing CJ1 ("paid content actually protected") is thereby solved, two gaps remain: who gives the entitled viewer the key, and how the player streams without downloading everything first.
**Reproduce / reasoning:** Static: read store.js end-to-end; grep repo-wide for key-server/license endpoints → none.
**Other instances (sibling search):** `packages/storage` has zero importers (TST-001) — the gap is currently theoretical.
**Suggested fix (owner decision):** Keep the module as the archival/cold path; for CJ1 decide: (i) envelope encryption with per-entitlement key wrapping + a key-release endpoint that checks the same entitlement predicate as `/stream`, and (ii) a range-capable encrypted-fragment server (decrypt window on the fly), or accept lifeboat server-side gating as the CJ1 answer for M2 and mark the module accordingly.
**Related:** notes/flows/upload-playback.md (§5); TST-001 (unwired module); W3B L4; CJ1
