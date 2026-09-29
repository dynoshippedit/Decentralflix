#!/usr/bin/env bash
# End-to-end test for the Decentralflix Lifeboat M1 backend.
# Starts the server, runs a full flow with curl, asserts every step.
# Exits 0 on full pass, non-zero on any failure.
set -u
cd "$(dirname "$0")"

PORT="${PORT:-8080}"
BASE="http://127.0.0.1:${PORT}"
TMPD="$(mktemp -d)"
PASS=0
FAIL=0

# Hermetic data dir: auth tests use fixed emails and accounts persist in
# data/accounts.json — without this, a second run gets 409s and cascades.
DATA_BACKUP=""
if [ -d "data" ]; then
  DATA_BACKUP="$TMPD/data-backup"
  mv "data" "$DATA_BACKUP"
fi

pass() { PASS=$((PASS + 1)); echo "PASS: $1"; }
fail() { FAIL=$((FAIL + 1)); echo "FAIL: $1${2:+  [detail: $2]}"; }

# JSON field extractor using node (no jq dependency).
# Usage: jget <file> <dotted.path>
jget() {
  node -e '
    const fs = require("fs");
    let o = null;
    try { o = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); } catch (e) { o = null; }
    let v = "";
    if (o !== null) {
      const r = process.argv[2].split(".").reduce((a, k) => (a == null ? a : a[k]), o);
      v = (r == null ? "" : String(r));
    }
    process.stdout.write(v);
  ' "$1" "$2"
}

# --- start server -----------------------------------------------------------
# DECIDED 2026-09-29 (Dino): this suite exercises the DEV build - the
# TEST-ONLY mint endpoints are enabled here. Production-mode refusal is
# covered by the dedicated section at the end of this file.
# DF-MEDIA-3: fixed media-signing secret for the signed-playback-URL tests below
# (the server would otherwise fall back to its dev-only default).
DECENTRALFLIX_TEST_MINTS=1 DECENTRALFLIX_MEDIA_SECRET=test-media-secret-xyz node server.js </dev/null >"$TMPD/server.log" 2>&1 &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null; rm -rf "data"; if [ -n "$DATA_BACKUP" ]; then mv "$DATA_BACKUP" "data"; fi; rm -rf "$TMPD"' EXIT

ready=0
for _ in $(seq 1 60); do
  if curl -sf --max-time 2 "$BASE/api/films" >/dev/null 2>&1; then ready=1; break; fi
  sleep 0.25
done
if [ "$ready" != 1 ]; then
  fail "server did not become ready"
  cat "$TMPD/server.log"
  exit 1
fi
pass "server ready on :$PORT"

# --- auth setup: filmmaker + buyer accounts -----------------------------------
# Helper to extract JSON field (jget defined above)
FILMMAKER_EMAIL="filmmaker@example.com"
BUYER_EMAIL="buyer@example.com"
OTHER_EMAIL="other@example.com"

curl -s -o "$TMPD/fm-signup.json" -X POST "$BASE/api/auth/signup" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$FILMMAKER_EMAIL\",\"password\":\"testpass123\",\"role\":\"filmmaker\",\"name\":\"Test Filmmaker\"}"
FM_TOKEN=$(jget "$TMPD/fm-signup.json" token)
[ -n "$FM_TOKEN" ] && pass "filmmaker signup returns token" || fail "filmmaker signup"

curl -s -o "$TMPD/buyer-signup.json" -X POST "$BASE/api/auth/signup" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$BUYER_EMAIL\",\"password\":\"testpass123\",\"role\":\"buyer\"}"
BUYER_TOKEN=$(jget "$TMPD/buyer-signup.json" token)
[ -n "$BUYER_TOKEN" ] && pass "buyer signup returns token" || fail "buyer signup"

curl -s -o "$TMPD/other-signup.json" -X POST "$BASE/api/auth/signup" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$OTHER_EMAIL\",\"password\":\"testpass123\",\"role\":\"buyer\"}"
OTHER_TOKEN=$(jget "$TMPD/other-signup.json" token)
[ -n "$OTHER_TOKEN" ] && pass "second buyer signup returns token" || fail "second buyer signup"

# Duplicate signup rejected
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/signup" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$BUYER_EMAIL\",\"password\":\"testpass123\",\"role\":\"buyer\"}")
[ "$code" = "409" ] && pass "duplicate signup rejected (409)" || fail "duplicate signup" "http=$code"

# Login works
curl -s -o "$TMPD/login.json" -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$BUYER_EMAIL\",\"password\":\"testpass123\"}"
[ -n "$(jget "$TMPD/login.json" token)" ] && pass "login returns token" || fail "login"

# Wrong password rejected
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$BUYER_EMAIL\",\"password\":\"wrongpass\"}")
[ "$code" = "401" ] && pass "wrong password rejected (401)" || fail "wrong password" "http=$code"

# Auth me works
code=$(curl -s -o "$TMPD/me.json" -w "%{http_code}" "$BASE/api/auth/me" -H "Authorization: Bearer $BUYER_TOKEN")
[ "$code" = "200" ] && [ "$(jget "$TMPD/me.json" account.email)" = "$BUYER_EMAIL" ] \
  && pass "auth/me returns account" || fail "auth/me" "http=$code"

# Auth me without token -> 401
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/auth/me")
[ "$code" = "401" ] && pass "auth/me without token -> 401" || fail "auth/me no token" "http=$code"

# --- SEC-002: logout invalidates the session token (regression) ---
# Throwaway second login for the buyer: logging out must not disturb the
# primary BUYER_TOKEN used by the rest of the suite.
curl -s -o "$TMPD/buyer-login2.json" -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$BUYER_EMAIL\",\"password\":\"testpass123\"}"
BUYER_TOKEN2=$(jget "$TMPD/buyer-login2.json" token)
[ -n "$BUYER_TOKEN2" ] && pass "SEC-002 setup: second login returns token" || fail "SEC-002 setup login" "http=$code"
code=$(curl -s -o "$TMPD/logout2.json" -w "%{http_code}" -X POST "$BASE/api/auth/logout" -H "Authorization: Bearer $BUYER_TOKEN2")
[ "$code" = "200" ] && [ "$(jget "$TMPD/logout2.json" session_revoked)" = "true" ] \
  && pass "SEC-002: logout returns 200 with session_revoked" || fail "SEC-002 logout" "http=$code"
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/auth/me" -H "Authorization: Bearer $BUYER_TOKEN2")
[ "$code" = "401" ] && pass "SEC-002: logged-out token rejected (401)" || fail "SEC-002 token valid after logout" "http=$code"
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/auth/me" -H "Authorization: Bearer $BUYER_TOKEN")
[ "$code" = "200" ] && pass "SEC-002: other session for same account still valid" || fail "SEC-002 other session killed" "http=$code"


# --- generate test film ------------------------------------------------------
if [ ! -s /tmp/testfilm.mp4 ]; then
  if ffmpeg -hide_banner -encoders 2>/dev/null | grep -q libx264; then VCODEC=libx264; else VCODEC=mpeg4; fi
  # 10-second test pattern + 440 Hz tone
  if ! ffmpeg -y -loglevel error \
      -f lavfi -i "testsrc=duration=10:size=640x360:rate=30" \
      -f lavfi -i "sine=frequency=440:duration=10" \
      -c:v "$VCODEC" -pix_fmt yuv420p -c:a aac -shortest /tmp/testfilm.mp4; then
    fail "ffmpeg could not generate test film"
    exit 1
  fi
fi
[ -s /tmp/testfilm.mp4 ] && pass "test mp4 present ($(stat -c%s /tmp/testfilm.mp4) bytes)" || { fail "test mp4 missing"; exit 1; }

# --- import film 1 (download allowed) ----------------------------------------
META1='{"title":"Lifeboat Test Film","description":"e2e fixture","price_usd_cents":499,"territories":["US","CA"],"download_allowed":true,"cleared_music_attested":true,"filmmaker_email":"filmmaker@example.com"}'
code=$(curl -s -o "$TMPD/import1.json" -w "%{http_code}" -X POST "$BASE/api/films/import" \
  -H "Authorization: Bearer $FM_TOKEN" \
  -F "master=@/tmp/testfilm.mp4;type=video/mp4" -F "meta=$META1")
[ "$code" = "201" ] && pass "import film returns 201" || fail "import film" "http=$code"
FILM1=$(jget "$TMPD/import1.json" film_id)
[ -n "$FILM1" ] && pass "film_id returned ($FILM1)" || fail "film_id missing in import response"
[ -n "$(jget "$TMPD/import1.json" download_url)" ] && pass "download_url present (download_allowed=true)" || fail "download_url missing"
[ -n "$(jget "$TMPD/import1.json" playback_url)" ] && pass "playback_url present" || fail "playback_url missing"

# --- import validation: music-rights rule ------------------------------------
METABAD='{"title":"Bad","price_usd_cents":100,"territories":["US"],"download_allowed":false,"cleared_music_attested":false,"filmmaker_email":"f@example.com"}'
code=$(curl -s -o "$TMPD/bad.json" -w "%{http_code}" -X POST "$BASE/api/films/import" \
  -H "Authorization: Bearer $FM_TOKEN" \
  -F "master=@/tmp/testfilm.mp4;type=video/mp4" -F "meta=$METABAD")
[ "$code" = "400" ] && pass "cleared_music_attested=false rejected (400)" || fail "music-rights rejection" "http=$code"

METABAD2='{"title":"Bad","price_usd_cents":0,"territories":["US"],"download_allowed":false,"cleared_music_attested":true,"filmmaker_email":"f@example.com"}'
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/films/import" \
  -H "Authorization: Bearer $FM_TOKEN" \
  -F "master=@/tmp/testfilm.mp4;type=video/mp4" -F "meta=$METABAD2")
[ "$code" = "400" ] && pass "price_usd_cents=0 rejected (400)" || fail "price validation" "http=$code"

METABAD3='{"title":"Bad","price_usd_cents":100,"territories":[],"download_allowed":false,"cleared_music_attested":true,"filmmaker_email":"f@example.com"}'
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/films/import" \
  -H "Authorization: Bearer $FM_TOKEN" \
  -F "master=@/tmp/testfilm.mp4;type=video/mp4" -F "meta=$METABAD3")
[ "$code" = "400" ] && pass "empty territories rejected (400)" || fail "territories validation" "http=$code"

# --- film reads ----------------------------------------------------------------
code=$(curl -s -o "$TMPD/films.json" -w "%{http_code}" "$BASE/api/films")
[ "$code" = "200" ] && grep -q "$FILM1" "$TMPD/films.json" && pass "GET /api/films lists film" || fail "GET /api/films" "http=$code"
code=$(curl -s -o "$TMPD/film1.json" -w "%{http_code}" "$BASE/api/films/$FILM1")
[ "$code" = "200" ] && [ "$(jget "$TMPD/film1.json" title)" = "Lifeboat Test Film" ] \
  && pass "GET /api/films/:id returns metadata + playback_url" || fail "GET /api/films/:id" "http=$code"
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/films/film_doesnotexist")
[ "$code" = "404" ] && pass "unknown film returns 404" || fail "unknown film 404" "http=$code"

# --- REFUSAL tests: auth required -----------------------------------------------
# Stream without token -> 401
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/films/$FILM1/stream")
[ "$code" = "401" ] && pass "stream without token -> 401" || fail "stream no auth" "http=$code"

# Stream with token but no purchase -> 403
code=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $BUYER_TOKEN" "$BASE/api/films/$FILM1/stream")
[ "$code" = "403" ] && pass "stream without purchase -> 403" || fail "stream no purchase" "http=$code"

# Download without token -> 401
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/films/$FILM1/download")
[ "$code" = "401" ] && pass "download without token -> 401" || fail "download no auth" "http=$code"

# audience.csv without token -> 401
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/films/$FILM1/audience.csv")
[ "$code" = "401" ] && pass "audience.csv without token -> 401" || fail "audience no auth" "http=$code"

# audience.csv with buyer token (not filmmaker) -> 403
code=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $BUYER_TOKEN" "$BASE/api/films/$FILM1/audience.csv")
[ "$code" = "403" ] && pass "audience.csv as buyer -> 403" || fail "audience buyer 403" "http=$code"

# import film without token -> 401
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/films/import" \
  -F "master=@/tmp/testfilm.mp4;type=video/mp4" -F "meta=$META1")
[ "$code" = "401" ] && pass "import without token -> 401" || fail "import no auth" "http=$code"

# import film with buyer token -> 403
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/films/import" \
  -H "Authorization: Bearer $BUYER_TOKEN" \
  -F "master=@/tmp/testfilm.mp4;type=video/mp4" -F "meta=$META1")
[ "$code" = "403" ] && pass "import as buyer -> 403" || fail "import buyer 403" "http=$code"

# --- test purchase (buyer auth, email from session) -------------------------------------
code=$(curl -s -o "$TMPD/purchase.json" -w "%{http_code}" -X POST "$BASE/api/purchases/test" \
  -H "Authorization: Bearer $BUYER_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"film_id\":\"$FILM1\"}")
[ "$code" = "201" ] && [ "$(jget "$TMPD/purchase.json" test_mode)" = "true" ] \
  && pass "test purchase returns test_mode=true" || fail "test purchase" "http=$code"


# --- streaming + Range (authenticated, post-purchase) ----------------------------------------------------------------------------------
code=$(curl -s -D "$TMPD/stream.hdr" -o "$TMPD/stream.mp4" -w "%{http_code}" -H "Authorization: Bearer $BUYER_TOKEN" "$BASE/api/films/$FILM1/stream")
[ "$code" = "200" ] && pass "stream full returns 200" || fail "stream full" "http=$code"
grep -qi "^content-type: video/mp4" "$TMPD/stream.hdr" && pass "stream content-type video/mp4" || fail "stream content-type"
grep -qi "^accept-ranges: bytes" "$TMPD/stream.hdr" && pass "stream advertises Accept-Ranges" || fail "accept-ranges header"

code=$(curl -s -D "$TMPD/range.hdr" -o "$TMPD/range.bin" -w "%{http_code}" -H "Authorization: Bearer $BUYER_TOKEN" -r 0-1023 "$BASE/api/films/$FILM1/stream")
[ "$code" = "206" ] && pass "Range request returns 206" || fail "range 206" "http=$code"
grep -qi "^content-range: bytes 0-1023/" "$TMPD/range.hdr" && pass "Content-Range header correct" || fail "content-range header"
[ "$(stat -c%s "$TMPD/range.bin")" = "1024" ] && pass "range body is 1024 bytes" || fail "range body size"
# byte-exactness: first 1024 bytes of the range must match the full stream
cmp -s <(head -c 1024 "$TMPD/stream.mp4") "$TMPD/range.bin" && pass "range bytes match stream start" || fail "range byte-exactness"

code=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $BUYER_TOKEN" -H "Range: bytes=99999999999-" "$BASE/api/films/$FILM1/stream")
[ "$code" = "416" ] && pass "out-of-range Range returns 416" || fail "range 416" "http=$code"

# --- buyers import: Vimeo export rows are contacts, NEVER entitlements -----------------
code=$(curl -s -o "$TMPD/buyers.json" -w "%{http_code}" -X POST "$BASE/api/buyers/import" \
  -H "Authorization: Bearer $FM_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"film_id\":\"$FILM1\",\"emails\":[\"buyer1@example.com\",\"buyer2@example.com\",\"not-an-email\"]}")
[ "$code" = "201" ] && [ "$(jget "$TMPD/buyers.json" contacts_recorded)" = "2" ] \
  && pass "buyers import records 2 migration contacts" || fail "buyers import" "http=$code body=$(cat "$TMPD/buyers.json")"
[ "$(jget "$TMPD/buyers.json" invalid_emails)" = "not-an-email" ] && pass "invalid email reported" || fail "invalid email reporting"
# An export row alone must NEVER create an entitlement: the Vimeo audience
# export is opt-in contacts, not a purchase ledger.
code=$(curl -s -o "$TMPD/aud-pre.csv" -w "%{http_code}" -H "Authorization: Bearer $FM_TOKEN" "$BASE/api/films/$FILM1/audience.csv")
! grep -q "^buyer1@example.com," "$TMPD/aud-pre.csv" && ! grep -q "^buyer2@example.com," "$TMPD/aud-pre.csv" \
  && pass "imported export rows grant no entitlements (no access from export alone)" || fail "no auto-grant from export"

# --- vimeo claim flow (verified claims: title, email, receipt ref, purchase type, date) --
code=$(curl -s -o "$TMPD/claim.json" -w "%{http_code}" -X POST "$BASE/api/claims" \
  -H 'Content-Type: application/json' \
  -d "{\"film_id\":\"$FILM1\",\"email\":\"claimer@example.com\",\"vimeo_receipt_ref\":\"vimeo-ord-123\",\"purchase_type\":\"buy\",\"purchase_date\":\"2026-09-01\"}")
[ "$code" = "201" ] && [ "$(jget "$TMPD/claim.json" status)" = "pending" ] \
  && [ "$(jget "$TMPD/claim.json" purchase_type)" = "buy" ] \
  && pass "claim filed as pending with verification fields" || fail "file claim" "http=$code"
CLAIM1=$(jget "$TMPD/claim.json" claim_id)

# Claim without verification fields is rejected
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/claims" \
  -H 'Content-Type: application/json' \
  -d "{\"film_id\":\"$FILM1\",\"email\":\"noref@example.com\",\"vimeo_receipt_ref\":\"vimeo-ord-999\"}")
[ "$code" = "400" ] && pass "claim without purchase_type/purchase_date rejected" || fail "claim field validation" "http=$code"
# --- DAT-013: claim.html must post the verification fields the API requires ---
# The UI page is the only claim-filing surface; if it omits purchase_type /
# purchase_date, every UI claim fails with 400. Pin the page/API contract.
grep -q 'id="c-ptype"' public/claim.html \
  && grep -q 'id="c-pdate"' public/claim.html \
  && grep -q 'purchase_type: ptype' public/claim.html \
  && grep -q 'purchase_date: pdate' public/claim.html \
  && pass "claim.html collects + posts purchase_type/purchase_date (DAT-013)" \
  || fail "claim.html missing purchase_type/purchase_date (DAT-013)"


code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/claims" \
  -H 'Content-Type: application/json' \
  -d "{\"film_id\":\"$FILM1\",\"email\":\"badtype@example.com\",\"vimeo_receipt_ref\":\"vimeo-ord-100\",\"purchase_type\":\"gift\",\"purchase_date\":\"2026-09-01\"}")
[ "$code" = "400" ] && pass "claim with invalid purchase_type rejected" || fail "purchase_type validation" "http=$code"

code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/claims" \
  -H 'Content-Type: application/json' \
  -d "{\"film_id\":\"$FILM1\",\"email\":\"futured@example.com\",\"vimeo_receipt_ref\":\"vimeo-ord-101\",\"purchase_type\":\"buy\",\"purchase_date\":\"2099-01-01\"}")
[ "$code" = "400" ] && pass "claim with future purchase_date rejected" || fail "purchase_date validation" "http=$code"

# Duplicate open claim for the same film + email is rejected
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/claims" \
  -H 'Content-Type: application/json' \
  -d "{\"film_id\":\"$FILM1\",\"email\":\"claimer@example.com\",\"vimeo_receipt_ref\":\"vimeo-ord-124\",\"purchase_type\":\"rent\",\"purchase_date\":\"2026-09-02\"}")
[ "$code" = "409" ] && pass "duplicate open claim rejected" || fail "claim dedupe" "http=$code"

code=$(curl -s -o "$TMPD/claims.json" -w "%{http_code}" -H "Authorization: Bearer $FM_TOKEN" "$BASE/api/claims?film_id=$FILM1")
[ "$code" = "200" ] && grep -q "$CLAIM1" "$TMPD/claims.json" \
  && pass "filmmaker claim list shows pending claim" || fail "claim list" "http=$code"

# Uncertain receipt -> manual review queue
code=$(curl -s -o "$TMPD/claim2.json" -w "%{http_code}" -X POST "$BASE/api/claims" \
  -H 'Content-Type: application/json' \
  -d "{\"film_id\":\"$FILM1\",\"email\":\"uncertain@example.com\",\"vimeo_receipt_ref\":\"vimeo-ord-555\",\"purchase_type\":\"rent\",\"purchase_date\":\"2026-08-15\"}")
[ "$code" = "201" ] && pass "second claim filed" || fail "file claim 2" "http=$code"
CLAIM2=$(jget "$TMPD/claim2.json" claim_id)

code=$(curl -s -o "$TMPD/review.json" -w "%{http_code}" -X POST -H "Authorization: Bearer $FM_TOKEN" "$BASE/api/claims/$CLAIM2/review" \
  -H 'Content-Type: application/json' \
  -d '{"reason":"receipt ref format unfamiliar"}')
[ "$code" = "200" ] && [ "$(jget "$TMPD/review.json" status)" = "needs_review" ] \
  && pass "uncertain claim routed to manual review" || fail "review queue routing" "http=$code"

code=$(curl -s -o "$TMPD/queue.json" -w "%{http_code}" -H "Authorization: Bearer $FM_TOKEN" "$BASE/api/claims/review-queue")
[ "$code" = "200" ] && grep -q "$CLAIM2" "$TMPD/queue.json" && ! grep -q "$CLAIM1" "$TMPD/queue.json" \
  && pass "review queue lists only needs_review claims" || fail "review queue" "http=$code"

# REFUSAL: approve without token -> 401
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  -H 'Content-Type: application/json' -d '{}' "$BASE/api/claims/$CLAIM1/approve")
[ "$code" = "401" ] && pass "approve without token -> 401" || fail "approve no auth" "http=$code"

# REFUSAL: approve as buyer (not filmmaker) -> 403
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  -H "Authorization: Bearer $BUYER_TOKEN" \
  -H 'Content-Type: application/json' -d '{}' "$BASE/api/claims/$CLAIM1/approve")
[ "$code" = "403" ] && pass "approve as buyer -> 403" || fail "approve buyer 403" "http=$code"

# Reviewed claims can still be approved after manual review
code=$(curl -s -o "$TMPD/approve2.json" -w "%{http_code}" -X POST \
  -H "Authorization: Bearer $FM_TOKEN" \
  -H 'Content-Type: application/json' -d '{}' "$BASE/api/claims/$CLAIM2/approve")
[ "$code" = "200" ] && [ -n "$(jget "$TMPD/approve2.json" signature)" ] \
  && pass "manually reviewed claim approved" || fail "approve after review" "http=$code"

code=$(curl -s -o "$TMPD/approve.json" -w "%{http_code}" -X POST \
  -H "Authorization: Bearer $FM_TOKEN" \
  -H 'Content-Type: application/json' -d '{}' "$BASE/api/claims/$CLAIM1/approve")
[ "$code" = "200" ] && [ -n "$(jget "$TMPD/approve.json" signature)" ] \
  && pass "claim approved with signed receipt (empty {} body, frontend shape)" || fail "approve claim" "http=$code"
[ "$(jget "$TMPD/approve.json" receipt.transferable)" = "false" ] \
  && pass "receipt is non-transferable" || fail "receipt transferable flag"

# --- receipt verification ----------------------------------------------------------------
node -e '
  const fs = require("fs");
  const o = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  fs.writeFileSync(process.argv[2], JSON.stringify({ receipt: o.receipt, signature: o.signature }));
' "$TMPD/purchase.json" "$TMPD/verify-body.json"
code=$(curl -s -o "$TMPD/verify.json" -w "%{http_code}" -X POST "$BASE/api/receipts/verify" \
  -H 'Content-Type: application/json' --data @"$TMPD/verify-body.json")
[ "$code" = "200" ] && [ "$(jget "$TMPD/verify.json" valid)" = "true" ] \
  && pass "valid receipt signature verifies" || fail "receipt verify" "http=$code"

# unwrapped shape: the receipt object itself with the signature inline
# (this is what the frontend posts)
node -e '
  const fs = require("fs");
  const o = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const merged = Object.assign({}, o.receipt, { signature: o.signature });
  fs.writeFileSync(process.argv[2], JSON.stringify(merged));
' "$TMPD/purchase.json" "$TMPD/unwrapped-body.json"
code=$(curl -s -o "$TMPD/unwrapped.json" -w "%{http_code}" -X POST "$BASE/api/receipts/verify" \
  -H 'Content-Type: application/json' --data @"$TMPD/unwrapped-body.json")
[ "$code" = "200" ] && [ "$(jget "$TMPD/unwrapped.json" valid)" = "true" ] \
  && pass "unwrapped receipt body verifies (frontend shape)" || fail "unwrapped verify" "http=$code"

# tampered receipt must NOT verify
node -e '
  const fs = require("fs");
  const o = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  o.receipt.price_usd_cents = 1;
  fs.writeFileSync(process.argv[2], JSON.stringify({ receipt: o.receipt, signature: o.signature }));
' "$TMPD/purchase.json" "$TMPD/tamper-body.json"
code=$(curl -s -o "$TMPD/tamper.json" -w "%{http_code}" -X POST "$BASE/api/receipts/verify" \
  -H 'Content-Type: application/json' --data @"$TMPD/tamper-body.json")
[ "$code" = "200" ] && [ "$(jget "$TMPD/tamper.json" valid)" = "false" ] \
  && pass "tampered receipt rejected" || fail "tamper rejection" "http=$code"

code=$(curl -s -o "$TMPD/pubkey.json" -w "%{http_code}" "$BASE/api/receipts/pubkey")
[ "$code" = "200" ] && [ -n "$(jget "$TMPD/pubkey.json" public_key)" ] \
  && pass "pubkey endpoint serves Ed25519 key" || fail "pubkey" "http=$code"

# --- audience CSV ---------------------------------------------------------------------------
code=$(curl -s -o "$TMPD/aud.csv" -w "%{http_code}" -H "Authorization: Bearer $FM_TOKEN" "$BASE/api/films/$FILM1/audience.csv")
[ "$code" = "200" ] && pass "audience.csv returns 200" || fail "audience.csv" "http=$code"
head -1 "$TMPD/aud.csv" | grep -q "^email,granted_at,source,price_usd_cents$" \
  && pass "CSV header correct" || fail "CSV header"
for em in claimer@example.com buyer@example.com; do
  grep -q "^$em," "$TMPD/aud.csv" && pass "CSV contains $em" || fail "CSV missing $em"
done
grep -q ",claim," "$TMPD/aud.csv" && grep -q ",purchase," "$TMPD/aud.csv" \
  && pass "CSV sources claim/purchase present" || fail "CSV sources"
! grep -q ",import," "$TMPD/aud.csv" \
  && pass "CSV has no import-granted rows (export never grants access)" || fail "CSV import source"

# --- downloads: allowed vs AB2426 ---------------------------------------------------------------
code=$(curl -s -D "$TMPD/dl.hdr" -o "$TMPD/dl.mp4" -w "%{http_code}" -H "Authorization: Bearer $BUYER_TOKEN" "$BASE/api/films/$FILM1/download")
[ "$code" = "200" ] && pass "download allowed film returns 200" || fail "download allowed" "http=$code"
grep -qi "attachment" "$TMPD/dl.hdr" && pass "download sends attachment disposition" || fail "download disposition"
cmp -s "$TMPD/stream.mp4" "$TMPD/dl.mp4" && pass "download bytes equal stream bytes" || fail "download byte-exactness"

META2='{"title":"Streaming Only Film","price_usd_cents":299,"territories":["US"],"download_allowed":false,"cleared_music_attested":true,"filmmaker_email":"filmmaker@example.com"}'
code=$(curl -s -o "$TMPD/import2.json" -w "%{http_code}" -X POST "$BASE/api/films/import" \
  -H "Authorization: Bearer $FM_TOKEN" \
  -F "master=@/tmp/testfilm.mp4;type=video/mp4" -F "meta=$META2")
FILM2=$(jget "$TMPD/import2.json" film_id)
[ "$code" = "201" ] && [ -z "$(jget "$TMPD/import2.json" download_url)" ] \
  && pass "streaming-only film has no download_url" || fail "import film 2" "http=$code"

# Purchase FILM2 first (streaming-only film)
curl -s -o /dev/null -X POST "$BASE/api/purchases/test" \
  -H "Authorization: Bearer $BUYER_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"film_id\":\"$FILM2\"}"
code=$(curl -s -o "$TMPD/dl403.json" -w "%{http_code}" -H "Authorization: Bearer $BUYER_TOKEN" "$BASE/api/films/$FILM2/download")
[ "$code" = "403" ] && grep -qi "ab 2426" "$TMPD/dl403.json" \
  && pass "streaming-only download → 403 with AB2426 message" || fail "AB2426 403" "http=$code"
code=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $BUYER_TOKEN" "$BASE/api/films/$FILM2/stream")
[ "$code" = "200" ] && pass "streaming-only film still streams" || fail "stream film2" "http=$code"

# --- static frontend -----------------------------------------------------------
code=$(curl -s -o "$TMPD/index.html" -w "%{http_code}" "$BASE/")
[ "$code" = "200" ] && grep -q "Decentralflix Lifeboat" "$TMPD/index.html" \
  && pass "GET / serves frontend index.html" || fail "static index" "http=$code"
code=$(curl -s -D "$TMPD/appjs.hdr" -o /dev/null -w "%{http_code}" "$BASE/app.js")
[ "$code" = "200" ] && grep -qi "^content-type: text/javascript" "$TMPD/appjs.hdr" \
  && pass "static app.js served with JS content-type" || fail "static app.js" "http=$code"
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/does-not-exist.html")
[ "$code" = "404" ] && pass "missing static file returns 404" || fail "static 404" "http=$code"
code=$(curl -s -o /dev/null -w "%{http_code}" --path-as-is "$BASE/%2e%2e/%2e%2e/etc/passwd")
[ "$code" = "404" ] && pass "path traversal blocked (404)" || fail "traversal" "http=$code"
code=$(curl -s -o "$TMPD/health.json" -w "%{http_code}" "$BASE/api/health")
[ "$code" = "200" ] && [ "$(jget "$TMPD/health.json" service)" = "decentralflix-lifeboat" ] \
  && pass "GET /api/health returns service info" || fail "health" "http=$code"

# --- stripe webhook: unconfigured ----------------------------------------------------------
code=$(curl -s -o "$TMPD/wh.json" -w "%{http_code}" -X POST "$BASE/api/webhooks/stripe" \
  -H 'Content-Type: application/json' -d '{"type":"checkout.session.completed"}')
[ "$code" = "503" ] && pass "stripe webhook without secret → 503 not configured" || fail "webhook 503" "http=$code"

# === M2 tests =====================================================================
PUBKEY=$(jget "$TMPD/pubkey.json" public_key)
# Unique buyer email per run: data/ persists across runs, so pass tests must not
# collide with a previous run's entitlements.
PBEMAIL="passbuyer-$(date +%s)-$RANDOM@example.com"

# --- M2: genre import + search/genre filters ------------------------------------------
META3='{"title":"Zebra Migration Documentary","description":"a film about zebra crossings of the savanna","price_usd_cents":799,"territories":["US"],"download_allowed":true,"cleared_music_attested":true,"filmmaker_email":"filmmaker@example.com","genres":["documentary","indie"]}'
code=$(curl -s -o "$TMPD/import3.json" -w "%{http_code}" -X POST "$BASE/api/films/import" \
  -H "Authorization: Bearer $FM_TOKEN" \
  -F "master=@/tmp/testfilm.mp4;type=video/mp4" -F "meta=$META3")
FILM3=$(jget "$TMPD/import3.json" film_id)
[ "$code" = "201" ] && [ -n "$FILM3" ] && pass "M2: import film with genres returns 201" || fail "M2: import film with genres" "http=$code"

code=$(curl -s -o "$TMPD/search.json" -w "%{http_code}" "$BASE/api/films?q=zebra")
[ "$code" = "200" ] && grep -q "$FILM3" "$TMPD/search.json" && pass "M2: search q=zebra finds the film" || fail "M2: search q" "http=$code"
code=$(curl -s -o "$TMPD/search2.json" -w "%{http_code}" "$BASE/api/films?q=nomatchxyz123")
[ "$code" = "200" ] && ! grep -q "$FILM3" "$TMPD/search2.json" && pass "M2: search q=nomatch returns no film" || fail "M2: search no-match" "http=$code"
code=$(curl -s -o "$TMPD/genre.json" -w "%{http_code}" "$BASE/api/films?genre=documentary")
[ "$code" = "200" ] && grep -q "$FILM3" "$TMPD/genre.json" && pass "M2: genre=documentary filter finds the film" || fail "M2: genre filter" "http=$code"
code=$(curl -s -o "$TMPD/genre2.json" -w "%{http_code}" "$BASE/api/films?genre=horror")
[ "$code" = "200" ] && ! grep -q "$FILM3" "$TMPD/genre2.json" && pass "M2: genre=horror filter excludes the film" || fail "M2: genre exclusion" "http=$code"

# --- M2: filmmaker onboarding ----------------------------------------------------------
code=$(curl -s -o "$TMPD/fmk.json" -w "%{http_code}" -X POST "$BASE/api/filmmakers" \
  -H 'Content-Type: application/json' \
  -d '{"email":"filmmaker@example.com","display_name":"Test Filmmaker"}')
FMK=$(jget "$TMPD/fmk.json" filmmaker_id)
{ [ "$code" = "201" ] || [ "$code" = "200" ]; } && [ -n "$FMK" ] && pass "M2: filmmaker account created ($FMK)" || fail "M2: create filmmaker" "http=$code"

code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/filmmakers" \
  -H 'Content-Type: application/json' -d '{"email":"not-an-email","display_name":"X"}')
[ "$code" = "400" ] && pass "M2: filmmaker account requires valid email" || fail "M2: filmmaker email validation" "http=$code"

REGNAME=$(jget "$TMPD/fmk.json" display_name)
code=$(curl -s -o "$TMPD/fmkget.json" -w "%{http_code}" "$BASE/api/filmmakers/$FMK")
[ "$code" = "200" ] && [ -n "$REGNAME" ] && [ "$(jget "$TMPD/fmkget.json" display_name)" = "$REGNAME" ] \
  && pass "M2: GET filmmaker returns profile" || fail "M2: get filmmaker" "http=$code"
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/filmmakers/fmk_nope")
[ "$code" = "404" ] && pass "M2: unknown filmmaker returns 404" || fail "M2: filmmaker 404" "http=$code"

code=$(curl -s -o "$TMPD/fmkpatch.json" -w "%{http_code}" -X PATCH "$BASE/api/filmmakers/$FMK" \
  -H 'Content-Type: application/json' -d '{"display_name":"Renamed Filmmaker"}')
[ "$code" = "200" ] && [ "$(jget "$TMPD/fmkpatch.json" display_name)" = "Renamed Filmmaker" ] \
  && pass "M2: PATCH filmmaker updates display_name" || fail "M2: patch filmmaker" "http=$code"
code=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "$BASE/api/filmmakers/$FMK" \
  -H 'Content-Type: application/json' -d '{"account_number":"123456"}')
[ "$code" = "400" ] && pass "M2: raw bank details rejected (400)" || fail "M2: bank details rejection" "http=$code"
code=$(curl -s -o "$TMPD/fmkpay.json" -w "%{http_code}" -X PATCH "$BASE/api/filmmakers/$FMK" \
  -H 'Content-Type: application/json' -d '{"payout_method":"stripe_connect"}')
[ "$code" = "200" ] && [ "$(jget "$TMPD/fmkpay.json" payout_method)" = "stripe_connect" ] \
  && pass "M2: payout_method=stripe_connect accepted" || fail "M2: payout method" "http=$code"

code=$(curl -s -o "$TMPD/fmkconn.json" -w "%{http_code}" -X POST "$BASE/api/filmmakers/$FMK/connect")
[ "$code" = "503" ] && grep -q "REQUIRES LEGAL REVIEW" "$TMPD/fmkconn.json" \
  && pass "M2: Connect without keys returns 503 + legal warning" || fail "M2: connect 503" "http=$code"

code=$(curl -s -o "$TMPD/fmkonb.json" -w "%{http_code}" "$BASE/api/filmmakers/$FMK/onboarding")
ONB=$(node -e '
  const j = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  const s = Object.fromEntries(j.steps.map((x) => [x.id, x.done]));
  console.log(j.steps.length + ":" + s.account + ":" + s.payout + ":" + s.catalog + ":" + s.audience + ":" + s.connect + ":" + j.complete);
' "$TMPD/fmkonb.json")
[ "$code" = "200" ] && [ "$ONB" = "5:true:true:true:true:false:false" ] \
  && pass "M2: onboarding checklist (connect pending keys, complete=false)" || fail "M2: onboarding checklist" "http=$code $ONB"

code=$(curl -s -o "$TMPD/fmkprof.json" -w "%{http_code}" "$BASE/api/filmmakers/$FMK/profile")
[ "$code" = "200" ] && grep -q "$FILM1" "$TMPD/fmkprof.json" && grep -q "$FILM3" "$TMPD/fmkprof.json" \
  && [ "$(jget "$TMPD/fmkprof.json" display_name)" = "Renamed Filmmaker" ] \
  && pass "M2: public profile lists filmmaker films" || fail "M2: filmmaker profile" "http=$code"
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/filmmakers/fmk_nope/profile")
[ "$code" = "404" ] && pass "M2: unknown filmmaker profile returns 404" || fail "M2: filmmaker profile 404" "http=$code"

code=$(curl -s -o "$TMPD/film1full.json" -w "%{http_code}" "$BASE/api/films/$FILM1")
[ "$code" = "200" ] && [ "$(jget "$TMPD/film1full.json" filmmaker.filmmaker_id)" = "$FMK" ] \
  && pass "M2: film detail links to filmmaker profile" || fail "M2: film filmmaker link" "http=$code"

# --- bundle checkout: same-seller multi-film, one checkout (TEST-ONLY) ------------------
# The fee-saving alternative to stored balances: five separate $4 domestic-card
# purchases cost ~$2.08 in processing; one $20 bundle costs ~$0.88.
code=$(curl -s -o "$TMPD/bundle.json" -w "%{http_code}" -X POST "$BASE/api/purchases/bundle/test" \
  -H "Authorization: Bearer $BUYER_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"film_ids\":[\"$FILM1\",\"$FILM3\"]}")
BUNDLECHECK=$(node -e '
  const j = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  const alloc = (j.allocations || []).reduce((s, a) => s + a.amount_usd_cents, 0);
  console.log(j.test_mode + ":" + j.total_usd_cents + ":" + alloc + ":" + (j.entitlements || []).length + ":" + !!(j.order_id && j.fee_note));
' "$TMPD/bundle.json")
[ "$code" = "201" ] && [ "$BUNDLECHECK" = "true:799:799:1:true" ] \
  && pass "bundle: 1 new film (FILM1 already owned), total 799c, order recorded" \
  || fail "bundle purchase" "http=$code check=$BUNDLECHECK"

# one signed receipt per film, each verifiable
node -e '
  const j = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  j.entitlements.forEach((g, i) => require("fs").writeFileSync(process.argv[2] + i + ".json", JSON.stringify({ receipt: g.receipt, signature: g.signature })));
' "$TMPD/bundle.json" "$TMPD/br"
BOK=0
for i in 0; do
  code=$(curl -s -o "$TMPD/brv$i.json" -w "%{http_code}" -X POST "$BASE/api/receipts/verify" \
    -H 'Content-Type: application/json' --data @"$TMPD/br$i.json")
  [ "$code" = "200" ] && [ "$(jget "$TMPD/brv$i.json" valid)" = "true" ] && BOK=$((BOK + 1))
done
[ "$BOK" = "1" ] && pass "bundle: signed receipt verifies" || fail "bundle receipts" "verified=$BOK"

# multi-seller bundles are out of scope -> 400
# Create a second filmmaker account so FILM4 has a different owner
curl -s -o /dev/null -X POST "$BASE/api/auth/signup" \
  -H 'Content-Type: application/json' \
  -d '{"email":"filmmaker2@example.com","password":"testpass123","role":"filmmaker"}'
FM2_TOKEN=$(curl -s -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d '{"email":"filmmaker2@example.com","password":"testpass123"}' | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))")
META4='{"title":"Other Seller Film","price_usd_cents":399,"territories":["US"],"download_allowed":false,"cleared_music_attested":true,"filmmaker_email":"other-seller@example.com"}'
code=$(curl -s -o "$TMPD/import4.json" -w "%{http_code}" -X POST "$BASE/api/films/import" \
  -H "Authorization: Bearer $FM2_TOKEN" \
  -F "master=@/tmp/testfilm.mp4;type=video/mp4" -F "meta=$META4")
FILM4=$(jget "$TMPD/import4.json" film_id)
[ "$code" = "201" ] && [ -n "$FILM4" ] && pass "bundle: other-seller film imported" || fail "bundle: import film 4" "http=$code"
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/purchases/bundle/test" \
  -H "Authorization: Bearer $BUYER_TOKEN" \
  -H 'Content-Type: application/json' -d "{\"film_ids\":[\"$FILM1\",\"$FILM4\"]}")
[ "$code" = "400" ] && pass "bundle: multi-seller rejected (400)" || fail "bundle multi-seller" "http=$code"

# validation guards
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/purchases/bundle/test" \
  -H "Authorization: Bearer $BUYER_TOKEN" \
  -H 'Content-Type: application/json' -d "{\"film_ids\":[\"$FILM1\",\"$FILM1\"]}")
[ "$code" = "400" ] && pass "bundle: duplicate film_ids rejected (400)" || fail "bundle duplicates" "http=$code"
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/purchases/bundle/test" \
  -H "Authorization: Bearer $BUYER_TOKEN" \
  -H 'Content-Type: application/json' -d "{\"film_ids\":[\"$FILM1\",\"film_nope\"]}")
[ "$code" = "404" ] && pass "bundle: unknown film returns 404" || fail "bundle unknown film" "http=$code"
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/purchases/bundle/test" \
  -H "Authorization: Bearer $BUYER_TOKEN" \
  -H 'Content-Type: application/json' -d "{\"film_ids\":[\"$FILM1\"]}")
[ "$code" = "400" ] && pass "bundle: single film rejected (400)" || fail "bundle single" "http=$code"

# already-owned films: nothing re-granted, no new order
code=$(curl -s -o "$TMPD/bundle2.json" -w "%{http_code}" -X POST "$BASE/api/purchases/bundle/test" \
  -H "Authorization: Bearer $BUYER_TOKEN" \
  -H 'Content-Type: application/json' -d "{\"film_ids\":[\"$FILM1\",\"$FILM3\"]}")
[ "$code" = "200" ] && [ "$(jget "$TMPD/bundle2.json" total_usd_cents)" = "0" ] \
  && pass "bundle: all-owned returns 200, zero total, no new grants" || fail "bundle already-owned" "http=$code"
code=$(curl -s -o "$TMPD/audb.csv" -w "%{http_code}" -H "Authorization: Bearer $FM_TOKEN" "$BASE/api/films/$FILM1/audience.csv")
[ "$code" = "200" ] && [ "$(grep -c "^$BUYER_EMAIL," "$TMPD/audb.csv")" = "1" ] \
  && pass "bundle: already-owned film not re-granted" || fail "bundle no double grant"
# Bundle granted FILM3 (not FILM1), check FILM3's CSV for bundle_purchase source
code=$(curl -s -o "$TMPD/audb3.csv" -w "%{http_code}" -H "Authorization: Bearer $FM_TOKEN" "$BASE/api/films/$FILM3/audience.csv")
grep -q ",bundle_purchase," "$TMPD/audb3.csv" \
  && pass "CSV records bundle_purchase source" || fail "CSV bundle source"

# --- M2: Collector Pass (test mode) -------------------------------------------------------
# SEC-001 (df-cycle-01): pass subscribe + redeem REQUIRE authentication and bind
# to the authenticated account; the request-body email is never trusted.
# Create the pass-buyer account first (its token is used for all pass calls below).
curl -s -o "$TMPD/pb-signup.json" -X POST "$BASE/api/auth/signup" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$PBEMAIL\",\"password\":\"testpass123\",\"role\":\"buyer\"}"
PB_TOKEN=$(jget "$TMPD/pb-signup.json" token)
[ -n "$PB_TOKEN" ] && pass "M2: pass-buyer signup returns token" || fail "M2: pass-buyer signup"

# unauthenticated subscribe: rejected BEFORE any pass/credit is minted
code=$(curl -s -o "$TMPD/passunauth.json" -w "%{http_code}" -X POST "$BASE/api/passes/test" \
  -H 'Content-Type: application/json' -d '{"email":"attacker@example.com"}')
[ "$code" = "401" ] && [ "$(jget "$TMPD/passunauth.json" error)" = "authentication required" ] \
  && pass "M2: unauthenticated pass subscribe rejected (401), mints nothing" || fail "M2: unauth pass subscribe 401" "http=$code"

# authenticated subscribe: exactly 1 credit, bound to the account (body email ignored)
code=$(curl -s -o "$TMPD/pass.json" -w "%{http_code}" -X POST "$BASE/api/passes/test" \
  -H "Authorization: Bearer $PB_TOKEN" \
  -H 'Content-Type: application/json' -d '{"email":"attacker@example.com"}')
PASSID=$(jget "$TMPD/pass.json" pass.pass_id)
[ "$code" = "201" ] && [ "$(jget "$TMPD/pass.json" balance)" = "1" ] \
  && [ "$(jget "$TMPD/pass.json" test_mode)" = "true" ] \
  && [ "$(jget "$TMPD/pass.json" pass.email)" = "$PBEMAIL" ] \
  && pass "M2: test pass subscription grants 1 credit, bound to the account" || fail "M2: pass subscribe" "http=$code"
grep -q "REQUIRES LEGAL REVIEW BEFORE LAUNCH" "$TMPD/pass.json" \
  && pass "M2: pass responses carry the legal-review warning" || fail "M2: pass legal warning"
node -e '
  const j = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  if (!/do not rely on subscribers forgetting to redeem/i.test(j.economics_warning || "")) process.exit(1);
' "$TMPD/pass.json" \
  && pass "M2: pass subscribe carries the economics warning" || fail "M2: pass economics warning"
# BUG-011: pass detail requires auth - existence is not revealed to strangers
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/passes/pass_nope")
[ "$code" = "401" ] && pass "M2: unauthenticated pass detail rejected (401)" || fail "M2: pass detail 401" "http=$code"
code=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $PB_TOKEN" "$BASE/api/passes/pass_nope")
[ "$code" = "404" ] && pass "M2: unknown pass returns 404 (authenticated)" || fail "M2: pass 404" "http=$code"

code=$(curl -s -o "$TMPD/passdetail.json" -w "%{http_code}" -H "Authorization: Bearer $PB_TOKEN" "$BASE/api/passes/$PASSID")
LEDGER1=$(node -e '
  const j = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  const ok = j.ledger.every((e) => e.transferable === false && e.cash_value_usd_cents === 0);
  console.log(j.balance + ":" + j.ledger.length + ":" + ok);
' "$TMPD/passdetail.json")
[ "$code" = "200" ] && [ "$LEDGER1" = "1:1:true" ] \
  && pass "M2: grant ledger entry is non-transferable + non-cashable" || fail "M2: ledger grant" "http=$code $LEDGER1"

code=$(curl -s -o "$TMPD/passco.json" -w "%{http_code}" -X POST "$BASE/api/passes/checkout" \
  -H 'Content-Type: application/json' -d '{}')
[ "$code" = "503" ] && grep -q "REQUIRES LEGAL REVIEW" "$TMPD/passco.json" \
  && pass "M2: real pass checkout without keys returns 503 + legal warning" || fail "M2: pass checkout 503" "http=$code"

# unauthenticated redeem: rejected BEFORE any credit is burned or entitlement granted.
# Placed before the real redemption: a phantom grant here would surface as
# already_owned (200) instead of 201 below.
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/passes/$PASSID/redeem" \
  -H 'Content-Type: application/json' -d "{\"film_id\":\"$FILM1\"}")
[ "$code" = "401" ] && pass "M2: unauthenticated redemption rejected (401)" || fail "M2: unauth redeem 401" "http=$code"

# non-transferability: a different AUTHENTICATED account cannot spend this pass's credits
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/passes/$PASSID/redeem" \
  -H "Authorization: Bearer $OTHER_TOKEN" \
  -H 'Content-Type: application/json' -d "{\"film_id\":\"$FILM1\"}")
[ "$code" = "403" ] && pass "M2: redemption by a different account rejected (403)" || fail "M2: non-transferable redeem" "http=$code"
code=$(curl -s -o "$TMPD/passbal.json" -w "%{http_code}" -H "Authorization: Bearer $PB_TOKEN" "$BASE/api/passes/$PASSID")
[ "$(jget "$TMPD/passbal.json" balance)" = "1" ] \
  && pass "M2: balance unchanged after rejected redemption" || fail "M2: balance after 403"
# BUG-011: only the pass holder may read the holder email + ledger
code=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $OTHER_TOKEN" "$BASE/api/passes/$PASSID")
[ "$code" = "403" ] && pass "M2: pass detail by a different account rejected (403)" || fail "M2: pass detail cross-account 403" "http=$code"

# redeem for real
code=$(curl -s -o "$TMPD/redeem.json" -w "%{http_code}" -X POST "$BASE/api/passes/$PASSID/redeem" \
  -H "Authorization: Bearer $PB_TOKEN" \
  -H 'Content-Type: application/json' -d "{\"film_id\":\"$FILM1\"}")
[ "$code" = "201" ] && [ "$(jget "$TMPD/redeem.json" already_owned)" = "false" ] \
  && [ "$(jget "$TMPD/redeem.json" balance)" = "0" ] \
  && [ "$(jget "$TMPD/redeem.json" license_term)" = "permanent" ] \
  && [ "$(jget "$TMPD/redeem.json" redemption.delta)" = "-1" ] \
  && [ "$(jget "$TMPD/redeem.json" entitlement.test_mode)" = "true" ] \
  && pass "M2: credit redemption grants permanent test-mode license (balance 0)" || fail "M2: redeem" "http=$code"

code=$(curl -s -o "$TMPD/passdetail2.json" -w "%{http_code}" -H "Authorization: Bearer $PB_TOKEN" "$BASE/api/passes/$PASSID")
LEDGER2=$(node -e '
  const j = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  const ok = j.ledger.every((e) => e.transferable === false && e.cash_value_usd_cents === 0);
  const deltas = j.ledger.map((e) => e.delta).sort().join(",");
  console.log(j.balance + ":" + j.ledger.length + ":" + ok + ":" + deltas);
' "$TMPD/passdetail2.json")
[ "$LEDGER2" = "0:2:true:-1,1" ] \
  && pass "M2: ledger shows +1 grant and -1 redemption, all non-transferable" || fail "M2: ledger after redeem" "$LEDGER2"

# duplicate redemption: must NOT spend a credit
code=$(curl -s -o "$TMPD/redeem2.json" -w "%{http_code}" -X POST "$BASE/api/passes/$PASSID/redeem" \
  -H "Authorization: Bearer $PB_TOKEN" \
  -H 'Content-Type: application/json' -d "{\"film_id\":\"$FILM1\"}")
[ "$code" = "200" ] && [ "$(jget "$TMPD/redeem2.json" already_owned)" = "true" ] \
  && pass "M2: duplicate redemption returns already_owned (200)" || fail "M2: duplicate redeem" "http=$code"
code=$(curl -s -o "$TMPD/passdetail3.json" -w "%{http_code}" -H "Authorization: Bearer $PB_TOKEN" "$BASE/api/passes/$PASSID")
LEDGER3=$(node -e '
  const j = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  console.log(j.balance + ":" + j.ledger.length);
' "$TMPD/passdetail3.json")
[ "$LEDGER3" = "0:2" ] \
  && pass "M2: duplicate redemption spent no credit (balance 0, 2 ledger entries)" || fail "M2: no credit lost" "$LEDGER3"

# insufficient credit: a different film with zero balance
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/passes/$PASSID/redeem" \
  -H "Authorization: Bearer $PB_TOKEN" \
  -H 'Content-Type: application/json' -d "{\"film_id\":\"$FILM2\"}")
[ "$code" = "409" ] && pass "M2: redemption with zero balance rejected (409)" || fail "M2: insufficient credit" "http=$code"
# (redeem email-validation is obsolete: the holder is the authenticated account)

# --- DF-MEDIA-3: signed short-lived playback URLs ------------------------------------------
# The native <video> element cannot send an Authorization header, so the
# Bearer-authed /api/films/:id/stream is unreachable from the player. The
# presigned-URL pattern fixes it: an entitled pass holder mints a short-lived
# HMAC-signed URL (authed JSON call), and the player loads THAT with no header.
# The pass buyer above redeemed FILM1, so they are entitled to it (but not FILM2).

# unauthenticated mint: rejected BEFORE any URL is minted (no existence leak)
code=$(curl -s -o "$TMPD/pburl-unauth.json" -w "%{http_code}" "$BASE/api/passes/$PASSID/playback-url?film=$FILM1")
[ "$code" = "401" ] && [ -z "$(jget "$TMPD/pburl-unauth.json" url)" ] \
  && pass "DF-MEDIA-3: unauthenticated playback-URL mint rejected (401), no URL minted" || fail "DF-MEDIA-3: mint 401" "http=$code"

# wrong holder: a different account cannot mint for this pass
code=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $OTHER_TOKEN" "$BASE/api/passes/$PASSID/playback-url?film=$FILM1")
[ "$code" = "403" ] && pass "DF-MEDIA-3: cross-account playback-URL mint rejected (403)" || fail "DF-MEDIA-3: mint cross-account 403" "http=$code"

# not entitled: the holder has no license for FILM2
code=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $PB_TOKEN" "$BASE/api/passes/$PASSID/playback-url?film=$FILM2")
[ "$code" = "403" ] && pass "DF-MEDIA-3: unentitled film rejected (403), no URL minted" || fail "DF-MEDIA-3: mint unentitled 403" "http=$code"

# entitled holder: mints a signed URL
code=$(curl -s -o "$TMPD/pburl.json" -w "%{http_code}" -H "Authorization: Bearer $PB_TOKEN" "$BASE/api/passes/$PASSID/playback-url?film=$FILM1")
PBURL=$(jget "$TMPD/pburl.json" url)
[ "$code" = "200" ] && [ -n "$PBURL" ] && [ "$(jget "$TMPD/pburl.json" expires_in)" = "900" ] \
  && pass "DF-MEDIA-3: entitled holder mints signed playback URL (15 min TTL)" || fail "DF-MEDIA-3: mint 200" "http=$code url=$PBURL"
echo "$PBURL" | grep -q "^/api/media/play?pass=" \
  && pass "DF-MEDIA-3: minted URL is a query-token media URL" || fail "DF-MEDIA-3: URL shape" "$PBURL"

# the signed URL plays with NO Authorization header (this is the whole point:
# <video> cannot send one)
code=$(curl -s -o "$TMPD/pbplay.mp4" -w "%{http_code}" "$BASE$PBURL")
[ "$code" = "200" ] && [ -s "$TMPD/pbplay.mp4" ] \
  && pass "DF-MEDIA-3: signed playback URL streams video with no auth header (200)" || fail "DF-MEDIA-3: play 200" "http=$code"

# Range requests work through the signed URL (seeking in <video>)
code=$(curl -s -o "$TMPD/pbplay-range.mp4" -w "%{http_code}" -H "Range: bytes=0-99" "$BASE$PBURL")
[ "$code" = "206" ] && [ "$(wc -c < "$TMPD/pbplay-range.mp4")" = "100" ] \
  && pass "DF-MEDIA-3: signed URL honors Range (206, seeking works)" || fail "DF-MEDIA-3: range 206" "http=$code"

# tampered signature: rejected
TAMPERED=$(node -e 'const u = new URL(process.argv[1], "http://x"); const p = u.searchParams; p.set("sig", "0".repeat(64)); console.log(u.pathname + "?" + p.toString());' "$PBURL")
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$TAMPERED")
[ "$code" = "403" ] && pass "DF-MEDIA-3: tampered signature rejected (403)" || fail "DF-MEDIA-3: tamper 403" "http=$code"

# retargeted film: signature binds pass+film, so swapping the film breaks it
RETARGET=$(node -e 'const u = new URL(process.argv[1], "http://x"); const p = u.searchParams; p.set("film", process.argv[2]); console.log(u.pathname + "?" + p.toString());' "$PBURL" "$FILM2")
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$RETARGET")
[ "$code" = "403" ] && pass "DF-MEDIA-3: film-swapped URL rejected (403)" || fail "DF-MEDIA-3: retarget 403" "http=$code"

# expired URL: rejected (crafted with the test secret, expired 60s ago)
EXPIRED=$(node -e '
  const crypto = require("node:crypto");
  const exp = Math.floor(Date.now() / 1000) - 60;
  const sig = crypto.createHmac("sha256", "test-media-secret-xyz").update([process.argv[1], process.argv[2], exp].join(".")).digest("hex");
  console.log(`/api/media/play?pass=${process.argv[1]}&film=${process.argv[2]}&exp=${exp}&sig=${sig}`);
' "$PASSID" "$FILM1")
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$EXPIRED")
[ "$code" = "403" ] && pass "DF-MEDIA-3: expired playback URL rejected (403)" || fail "DF-MEDIA-3: expired 403" "http=$code"

# missing parameters: rejected
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/media/play?film=$FILM1")
[ "$code" = "403" ] && pass "DF-MEDIA-3: parameter-less play URL rejected (403)" || fail "DF-MEDIA-3: missing params 403" "http=$code"

# non-integer expiry: rejected (exercises the bad-expiry branch of
# verifyPlaybackUrl — Number.isInteger(exp) is checked before the signature)
BAD_EXP=$(node -e 'const u = new URL(process.argv[1], "http://x"); const p = u.searchParams; p.set("exp", "not-a-number"); console.log(u.pathname + "?" + p.toString());' "$PBURL")
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$BAD_EXP")
[ "$code" = "403" ] && pass "DF-MEDIA-3: non-integer expiry rejected (403)" || fail "DF-MEDIA-3: bad expiry 403" "http=$code"

# truncated signature: rejected (exercises the length guard before
# crypto.timingSafeEqual — the tamper test uses a full-length signature)
SHORT_SIG=$(node -e 'const u = new URL(process.argv[1], "http://x"); const p = u.searchParams; p.set("sig", "abcd"); console.log(u.pathname + "?" + p.toString());' "$PBURL")
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$SHORT_SIG")
[ "$code" = "403" ] && pass "DF-MEDIA-3: truncated signature rejected (403)" || fail "DF-MEDIA-3: short sig 403" "http=$code"

# --- M2: buyer library (purchase history) ----------------------------------------------------
# (pass-buyer account + PB_TOKEN were created at the start of the Collector Pass section)
code=$(curl -s -o "$TMPD/lib.json" -w "%{http_code}" -H "Authorization: Bearer $PB_TOKEN" "$BASE/api/buyers/$PBEMAIL/library")
LIBCHECK=$(node -e '
  const j = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  const it = j.items[0] || {};
  const ent = it.entitlement || {};
  console.log(j.films_owned + ":" + ent.film_id + ":" + it.license_term + ":" + !!(it.receipt && it.signature) + ":" + ent.source);
' "$TMPD/lib.json")
[ "$code" = "200" ] && [ "$LIBCHECK" = "1:$FILM1:permanent:true:pass_redemption" ] \
  && pass "M2: library shows redeemed film, permanent license, signed receipt" || fail "M2: buyer library" "http=$code $LIBCHECK"
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/buyers/not-an-email/library")
[ "$code" = "401" ] && pass "M2: library without token -> 401" || fail "M2: library no token" "http=$code"
# Library with wrong email -> 403 (authenticated as buyer, requesting other email)
code=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $BUYER_TOKEN" "$BASE/api/buyers/$OTHER_EMAIL/library")
[ "$code" = "403" ] && pass "M2: library with wrong email -> 403" || fail "M2: library wrong email" "http=$code"

# --- M2: receipt terms (feasibility-corrected wording) ------------------------------------------
code=$(curl -s -o "$TMPD/terms.json" -w "%{http_code}" "$BASE/api/receipts/terms")
TERMSCHECK=$(node -e '
  const t = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  const lib = JSON.parse(require("fs").readFileSync(process.argv[2], "utf8"));
  const rh = lib.items[0].receipt.terms_hash;
  console.log(t.terms.includes("yours to keep") + ":" + t.terms.includes("NOT a transfer of copyright") + ":" + (t.terms_hash === rh));
' "$TMPD/terms.json" "$TMPD/lib.json")
[ "$code" = "200" ] && [ "$TERMSCHECK" = "true:true:true" ] \
  && pass "M2: receipt terms v2 (yours-to-keep, no copyright transfer, hash matches)" || fail "M2: receipt terms" "$TERMSCHECK"

# --- M2: pure-JS Ed25519 (lib + browser build) vs node:crypto -----------------------------------
node -e '
  const crypto = require("node:crypto");
  const ed = require("./lib/ed25519");
  const pub = require("./public/ed25519.js");
  const sha512 = async (d) => Uint8Array.from(crypto.createHash("sha512").update(Buffer.from(d)).digest());
  (async () => {
    for (let i = 0; i < 4; i++) {
      const kp = crypto.generateKeyPairSync("ed25519");
      const other = crypto.generateKeyPairSync("ed25519");
      const msg = Uint8Array.from(crypto.randomBytes(48));
      const sig = Uint8Array.from(crypto.sign(null, msg, kp.privateKey));
      const raw = ed.parseSpkiDerPublicKey(kp.publicKey.export({ type: "spki", format: "der" }));
      const rawOther = ed.parseSpkiDerPublicKey(other.publicKey.export({ type: "spki", format: "der" }));
      const tampered = Uint8Array.from(msg); tampered[0] ^= 1;
      const checks = [
        await ed.verify(raw, sig, msg, sha512),
        await pub.verify(raw, sig, msg, sha512),
        !(await ed.verify(raw, sig, tampered, sha512)),
        !(await pub.verify(raw, sig, tampered, sha512)),
        !(await ed.verify(rawOther, sig, msg, sha512)),
        !(await pub.verify(rawOther, sig, msg, sha512)),
        !(await ed.verify(raw, Uint8Array.from([1, 2, 3]), msg, sha512)),
        !(await pub.verify(raw, Uint8Array.from([1, 2, 3]), msg, sha512)),
      ];
      if (!checks.every(Boolean)) { console.log("ED25519_FAIL vector " + i); process.exit(1); }
    }
    console.log("ED25519_OK 4 vectors x lib+browser (valid/tampered/wrong-key/malformed)");
  })().catch((e) => { console.error("ED25519_ERR " + (e && e.message)); process.exit(1); });
' > "$TMPD/ed25519.txt" 2>&1
[ $? -eq 0 ] && grep -q "ED25519_OK" "$TMPD/ed25519.txt" \
  && pass "M2: pure-JS Ed25519 (lib + browser) matches node:crypto on 4 vectors" || fail "M2: ed25519 vectors" "$(cat "$TMPD/ed25519.txt")"

# --- M2: Stripe webhook signature verification (unit, no keys needed) ---------------------------
node -e '
  const crypto = require("node:crypto");
  const stripe = require("./lib/stripe");
  const secret = "whsec_test_unit";
  const payload = JSON.stringify({ type: "customer.subscription.created", id: "evt_1" });
  const t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac("sha256", secret).update(t + "." + payload, "utf8").digest("hex");
  const ev = stripe.verifyWebhookSignature(payload, "t=" + t + ",v1=" + sig, secret);
  if (!ev || ev.type !== "customer.subscription.created") { console.log("HOOK_FAIL parse"); process.exit(1); }
  let threw = 0;
  try { stripe.verifyWebhookSignature(payload, "t=" + t + ",v1=deadbeef", secret); } catch (e) { threw++; }
  const oldT = t - 600;
  const oldSig = crypto.createHmac("sha256", secret).update(oldT + "." + payload, "utf8").digest("hex");
  try { stripe.verifyWebhookSignature(payload, "t=" + oldT + ",v1=" + oldSig, secret); } catch (e) { threw++; }
  try { stripe.verifyWebhookSignature(payload, "t=" + t + ",v1=" + sig, ""); } catch (e) { threw++; }
  if (threw !== 3) { console.log("HOOK_FAIL throws=" + threw); process.exit(1); }
  console.log("HOOK_OK");
' > "$TMPD/hook.txt" 2>&1
[ $? -eq 0 ] && grep -q "HOOK_OK" "$TMPD/hook.txt" \
  && pass "M2: webhook signature verifies valid, rejects bad/stale/missing secret" || fail "M2: webhook sig" "$(cat "$TMPD/hook.txt")"

# --- M2: offline receipt verifier CLI ---------------------------------------------------------------
node tools/verify-receipt.js --pubkey "$PUBKEY" "$TMPD/verify-body.json" > "$TMPD/cli1.txt" 2>&1
[ $? -eq 0 ] && grep -q "^VALID" "$TMPD/cli1.txt" \
  && pass "M2: CLI verifies valid receipt offline (--pubkey)" || fail "M2: CLI valid" "$(cat "$TMPD/cli1.txt")"
node tools/verify-receipt.js --pubkey "$PUBKEY" "$TMPD/tamper-body.json" > "$TMPD/cli2.txt" 2>&1
[ $? -eq 1 ] && grep -q "INVALID" "$TMPD/cli2.txt" \
  && pass "M2: CLI rejects tampered receipt" || fail "M2: CLI tamper" "$(cat "$TMPD/cli2.txt")"
WRONGPUB=$(node -e 'const c=require("node:crypto");const kp=c.generateKeyPairSync("ed25519");console.log(kp.publicKey.export({type:"spki",format:"der"}).toString("base64"))')
node tools/verify-receipt.js --pubkey "$WRONGPUB" "$TMPD/verify-body.json" > "$TMPD/cli3.txt" 2>&1
[ $? -eq 1 ] && grep -q "INVALID" "$TMPD/cli3.txt" \
  && pass "M2: CLI rejects wrong-key receipt" || fail "M2: CLI wrong key" "$(cat "$TMPD/cli3.txt")"
node -e '
  const fs = require("fs");
  const o = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  o.signature = "AAAA";
  fs.writeFileSync(process.argv[2], JSON.stringify(o));
' "$TMPD/verify-body.json" "$TMPD/malformed.json"
node tools/verify-receipt.js --pubkey "$PUBKEY" "$TMPD/malformed.json" > "$TMPD/cli4.txt" 2>&1
[ $? -eq 1 ] && grep -q "INVALID" "$TMPD/cli4.txt" \
  && pass "M2: CLI rejects malformed signature" || fail "M2: CLI malformed" "$(cat "$TMPD/cli4.txt")"
node tools/verify-receipt.js --server "$BASE" "$TMPD/verify-body.json" > "$TMPD/cli5.txt" 2>&1
[ $? -eq 0 ] && grep -q "^VALID" "$TMPD/cli5.txt" \
  && pass "M2: CLI verifies via --server pubkey fetch" || fail "M2: CLI server mode" "$(cat "$TMPD/cli5.txt")"

# === end M2 tests ===============================================================

# --- DAT-002: crash between multi-file grant writes converges on reboot ---
# The node script stages a journaled txn, applies only part of it (simulating
# a crash between the file writes), then asserts reconcileOnBoot completes
# the missing writes idempotently. Uses a scratch data dir via
# store.setDataDir — never touches the suite's data/.
node ../../devteam/repro/dat-002-crash-recovery.js > "$TMPD/dat002.log" 2>&1
[ "$?" = "0" ] && pass "DAT-002 crash-recovery converges (journal + reconcile)" \
  || fail "DAT-002 crash recovery" "$(tail -3 "$TMPD/dat002.log")"


# --- STR-001: Lifeboat UI sends auth (Bearer token via login/logout) ---
# The node script loads public/app.js with shimmed browser APIs and asserts
# login stores the session token, the request helpers attach
# "Authorization: Bearer <token>", and logout revokes + clears local state.
node ../../devteam/repro/str-001-ui-auth.js > "$TMPD/str001.log" 2>&1
[ "$?" = "0" ] && pass "STR-001 UI auth (login stores token, helpers send Bearer)" \
  || fail "STR-001 UI auth" "$(tail -3 "$TMPD/str001.log")"

# --- MINT GATING (DECIDED 2026-09-29): test-mint endpoints are dev-only ---
# Restart the server WITHOUT DECENTRALFLIX_TEST_MINTS (production mode) and
# prove all three test endpoints refuse to mint, even when authenticated.
# Production credits come ONLY from confirmed payments (Stripe webhook).
kill "$SERVER_PID" 2>/dev/null
rm -rf "data"
env -u DECENTRALFLIX_TEST_MINTS PORT="$PORT" node server.js </dev/null >"$TMPD/server-prod.log" 2>&1 &
SERVER_PID=$!
ready=0
for _ in $(seq 1 60); do
  if curl -sf --max-time 2 "$BASE/api/films" >/dev/null 2>&1; then ready=1; break; fi
  sleep 0.25
done
[ "$ready" = 1 ] && pass "prod-mode: server restarted without test mints" || fail "prod-mode: server restart"
curl -s -o "$TMPD/prod-signup.json" -X POST "$BASE/api/auth/signup" \
  -H 'Content-Type: application/json' \
  -d '{"email":"prodbuyer@example.com","password":"testpass123","role":"buyer"}'
PROD_TOKEN=$(jget "$TMPD/prod-signup.json" token)
[ -n "$PROD_TOKEN" ] && pass "prod-mode: buyer signup works" || fail "prod-mode: signup"
for ep in passes/test purchases/test purchases/bundle/test; do
  code=$(curl -s -o "$TMPD/prod-refused.json" -w "%{http_code}" -X POST "$BASE/api/$ep" \
    -H "Authorization: Bearer $PROD_TOKEN" \
    -H 'Content-Type: application/json' -d '{}')
  [ "$code" = "403" ] && [ "$(jget "$TMPD/prod-refused.json" error)" = "test minting is disabled in this build" ] \
    && pass "prod-mode: POST /api/$ep refused (403), mints nothing" \
    || fail "prod-mode: /api/$ep not refused" "http=$code"
done
# unauthenticated probes still get 401 (auth is checked before the dev gate)
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/passes/test" \
  -H 'Content-Type: application/json' -d '{}')
[ "$code" = "401" ] && pass "prod-mode: unauthenticated test mint rejected (401)" || fail "prod-mode: unauth 401" "http=$code"
# no credit path without confirmed payments: the webhook without keys is dead
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/webhooks/stripe" \
  -H 'Content-Type: application/json' -d '{}')
[ "$code" = "503" ] && pass "prod-mode: stripe webhook without keys has no credit path (503)" || fail "prod-mode: webhook 503" "http=$code"

# --- summary -----------------------------------------------------------------------------------
echo "----------------------------------------"
echo "RESULT: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
