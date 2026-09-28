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
node server.js </dev/null >"$TMPD/server.log" 2>&1 &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null; rm -rf "$TMPD"' EXIT

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
  -F "master=@/tmp/testfilm.mp4;type=video/mp4" -F "meta=$META1")
[ "$code" = "201" ] && pass "import film returns 201" || fail "import film" "http=$code"
FILM1=$(jget "$TMPD/import1.json" film_id)
[ -n "$FILM1" ] && pass "film_id returned ($FILM1)" || fail "film_id missing in import response"
[ -n "$(jget "$TMPD/import1.json" download_url)" ] && pass "download_url present (download_allowed=true)" || fail "download_url missing"
[ -n "$(jget "$TMPD/import1.json" playback_url)" ] && pass "playback_url present" || fail "playback_url missing"

# --- import validation: music-rights rule ------------------------------------
METABAD='{"title":"Bad","price_usd_cents":100,"territories":["US"],"download_allowed":false,"cleared_music_attested":false,"filmmaker_email":"f@example.com"}'
code=$(curl -s -o "$TMPD/bad.json" -w "%{http_code}" -X POST "$BASE/api/films/import" \
  -F "master=@/tmp/testfilm.mp4;type=video/mp4" -F "meta=$METABAD")
[ "$code" = "400" ] && pass "cleared_music_attested=false rejected (400)" || fail "music-rights rejection" "http=$code"

METABAD2='{"title":"Bad","price_usd_cents":0,"territories":["US"],"download_allowed":false,"cleared_music_attested":true,"filmmaker_email":"f@example.com"}'
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/films/import" \
  -F "master=@/tmp/testfilm.mp4;type=video/mp4" -F "meta=$METABAD2")
[ "$code" = "400" ] && pass "price_usd_cents=0 rejected (400)" || fail "price validation" "http=$code"

METABAD3='{"title":"Bad","price_usd_cents":100,"territories":[],"download_allowed":false,"cleared_music_attested":true,"filmmaker_email":"f@example.com"}'
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/films/import" \
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

# --- streaming + Range ----------------------------------------------------------
code=$(curl -s -D "$TMPD/stream.hdr" -o "$TMPD/stream.mp4" -w "%{http_code}" "$BASE/api/films/$FILM1/stream")
[ "$code" = "200" ] && pass "stream full returns 200" || fail "stream full" "http=$code"
grep -qi "^content-type: video/mp4" "$TMPD/stream.hdr" && pass "stream content-type video/mp4" || fail "stream content-type"
grep -qi "^accept-ranges: bytes" "$TMPD/stream.hdr" && pass "stream advertises Accept-Ranges" || fail "accept-ranges header"

code=$(curl -s -D "$TMPD/range.hdr" -o "$TMPD/range.bin" -w "%{http_code}" -r 0-1023 "$BASE/api/films/$FILM1/stream")
[ "$code" = "206" ] && pass "Range request returns 206" || fail "range 206" "http=$code"
grep -qi "^content-range: bytes 0-1023/" "$TMPD/range.hdr" && pass "Content-Range header correct" || fail "content-range header"
[ "$(stat -c%s "$TMPD/range.bin")" = "1024" ] && pass "range body is 1024 bytes" || fail "range body size"
# byte-exactness: first 1024 bytes of the range must match the full stream
cmp -s <(head -c 1024 "$TMPD/stream.mp4") "$TMPD/range.bin" && pass "range bytes match stream start" || fail "range byte-exactness"

code=$(curl -s -o /dev/null -w "%{http_code}" -H "Range: bytes=99999999999-" "$BASE/api/films/$FILM1/stream")
[ "$code" = "416" ] && pass "out-of-range Range returns 416" || fail "range 416" "http=$code"

# --- buyers import -----------------------------------------------------------------
code=$(curl -s -o "$TMPD/buyers.json" -w "%{http_code}" -X POST "$BASE/api/buyers/import" \
  -H 'Content-Type: application/json' \
  -d "{\"film_id\":\"$FILM1\",\"emails\":[\"buyer1@example.com\",\"buyer2@example.com\",\"not-an-email\"]}")
[ "$code" = "201" ] && [ "$(jget "$TMPD/buyers.json" imported)" = "2" ] \
  && pass "buyers import grants 2 entitlements" || fail "buyers import" "http=$code body=$(cat "$TMPD/buyers.json")"
[ "$(jget "$TMPD/buyers.json" invalid_emails)" = "not-an-email" ] && pass "invalid email reported" || fail "invalid email reporting"

# --- vimeo claim flow ----------------------------------------------------------------
code=$(curl -s -o "$TMPD/claim.json" -w "%{http_code}" -X POST "$BASE/api/claims" \
  -H 'Content-Type: application/json' \
  -d "{\"film_id\":\"$FILM1\",\"email\":\"claimer@example.com\",\"vimeo_receipt_ref\":\"vimeo-ord-123\"}")
[ "$code" = "201" ] && [ "$(jget "$TMPD/claim.json" status)" = "pending" ] \
  && pass "claim filed as pending" || fail "file claim" "http=$code"
CLAIM1=$(jget "$TMPD/claim.json" claim_id)

code=$(curl -s -o "$TMPD/claims.json" -w "%{http_code}" "$BASE/api/claims?film_id=$FILM1")
[ "$code" = "200" ] && grep -q "$CLAIM1" "$TMPD/claims.json" \
  && pass "filmmaker claim list shows pending claim" || fail "claim list" "http=$code"

code=$(curl -s -o "$TMPD/approve.json" -w "%{http_code}" -X POST \
  -H 'Content-Type: application/json' -d '{}' "$BASE/api/claims/$CLAIM1/approve")
[ "$code" = "200" ] && [ -n "$(jget "$TMPD/approve.json" signature)" ] \
  && pass "claim approved with signed receipt (empty {} body, frontend shape)" || fail "approve claim" "http=$code"
[ "$(jget "$TMPD/approve.json" receipt.transferable)" = "false" ] \
  && pass "receipt is non-transferable" || fail "receipt transferable flag"

# --- test purchase ---------------------------------------------------------------------
code=$(curl -s -o "$TMPD/purchase.json" -w "%{http_code}" -X POST "$BASE/api/purchases/test" \
  -H 'Content-Type: application/json' \
  -d "{\"film_id\":\"$FILM1\",\"email\":\"purchaser@example.com\"}")
[ "$code" = "201" ] && [ "$(jget "$TMPD/purchase.json" test_mode)" = "true" ] \
  && pass "test purchase returns test_mode=true" || fail "test purchase" "http=$code"

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
code=$(curl -s -o "$TMPD/aud.csv" -w "%{http_code}" "$BASE/api/films/$FILM1/audience.csv")
[ "$code" = "200" ] && pass "audience.csv returns 200" || fail "audience.csv" "http=$code"
head -1 "$TMPD/aud.csv" | grep -q "^email,granted_at,source,price_usd_cents$" \
  && pass "CSV header correct" || fail "CSV header"
for em in buyer1@example.com buyer2@example.com claimer@example.com purchaser@example.com; do
  grep -q "^$em," "$TMPD/aud.csv" && pass "CSV contains $em" || fail "CSV missing $em"
done
grep -q ",claim," "$TMPD/aud.csv" && grep -q ",import," "$TMPD/aud.csv" && grep -q ",purchase," "$TMPD/aud.csv" \
  && pass "CSV sources import/claim/purchase present" || fail "CSV sources"

# --- downloads: allowed vs AB2426 ---------------------------------------------------------------
code=$(curl -s -D "$TMPD/dl.hdr" -o "$TMPD/dl.mp4" -w "%{http_code}" "$BASE/api/films/$FILM1/download")
[ "$code" = "200" ] && pass "download allowed film returns 200" || fail "download allowed" "http=$code"
grep -qi "attachment" "$TMPD/dl.hdr" && pass "download sends attachment disposition" || fail "download disposition"
cmp -s "$TMPD/stream.mp4" "$TMPD/dl.mp4" && pass "download bytes equal stream bytes" || fail "download byte-exactness"

META2='{"title":"Streaming Only Film","price_usd_cents":299,"territories":["US"],"download_allowed":false,"cleared_music_attested":true,"filmmaker_email":"filmmaker@example.com"}'
code=$(curl -s -o "$TMPD/import2.json" -w "%{http_code}" -X POST "$BASE/api/films/import" \
  -F "master=@/tmp/testfilm.mp4;type=video/mp4" -F "meta=$META2")
FILM2=$(jget "$TMPD/import2.json" film_id)
[ "$code" = "201" ] && [ -z "$(jget "$TMPD/import2.json" download_url)" ] \
  && pass "streaming-only film has no download_url" || fail "import film 2" "http=$code"

code=$(curl -s -o "$TMPD/dl403.json" -w "%{http_code}" "$BASE/api/films/$FILM2/download")
[ "$code" = "403" ] && grep -qi "ab 2426" "$TMPD/dl403.json" \
  && pass "streaming-only download → 403 with AB2426 message" || fail "AB2426 403" "http=$code"
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/films/$FILM2/stream")
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

# --- summary -----------------------------------------------------------------------------------
echo "----------------------------------------"
echo "RESULT: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
