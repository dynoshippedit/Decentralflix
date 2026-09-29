#!/bin/bash
# Repro for BUG-002 (logout no-op), BUG-003 (duplicate test-purchase entitlements),
# BUG-004 (unbounded credit mint on /api/passes/test).
# Safe: runs a SCRATCH COPY of apps/lifeboat on 127.0.0.1:18099 with a throwaway
# data dir. Never touches the repo's data/. Requires: node, curl.
# Usage: bash devteam/repro/bug-auth-mint-dupe.sh
set -u
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
SCRATCH="$(mktemp -d)"
cp -r "$REPO/apps/lifeboat" "$SCRATCH/lb"
cd "$SCRATCH/lb" || exit 1
B=http://127.0.0.1:18099
if curl -s -o /dev/null --max-time 2 $B/api/health 2>/dev/null; then
  echo "ABORT: something already listens on 127.0.0.1:18099"; exit 2
fi
PORT=18099 HOST=127.0.0.1 node server.js > server.log 2>&1 &
SRV_PID=$!
sleep 2
cleanup() { kill $SRV_PID 2>/dev/null; rm -rf "$SCRATCH"; }
trap cleanup EXIT
fails=0
chk() { # chk <name> <expected> <actual>
  if [ "$2" = "$3" ]; then echo "PASS: $1"; else echo "FAIL: $1 (expected=$2 got=$3)"; fails=$((fails+1)); fi
}
tok_of() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).token))"; }

echo "== BUG-002: logout must invalidate the token =="
TOK=$(curl -s -X POST $B/api/auth/signup -H 'Content-Type: application/json' \
  -d '{"email":"repro@example.com","password":"testpass123","role":"buyer"}' | tok_of)
curl -s -o /dev/null -X POST $B/api/auth/logout -H "Authorization: Bearer $TOK"
code=$(curl -s -o /dev/null -w "%{http_code}" $B/api/auth/me -H "Authorization: Bearer $TOK")
chk "token rejected after logout (want 401)" "401" "$code"

echo "== BUG-003: repeat test-purchase must not mint a second entitlement =="
FTOK=$(curl -s -X POST $B/api/auth/signup -H 'Content-Type: application/json' \
  -d '{"email":"fm@example.com","password":"testpass123","role":"filmmaker"}' | tok_of)
head -c 2000 /dev/urandom > "$SCRATCH/fake.mp4"
META='{"title":"R","price_usd_cents":499,"territories":["US"],"download_allowed":false,"cleared_music_attested":true,"filmmaker_email":"fm@example.com"}'
FID=$(curl -s -X POST $B/api/films/import -H "Authorization: Bearer $FTOK" \
  -F "master=@$SCRATCH/fake.mp4;type=video/mp4" -F "meta=$META" \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).film_id))")
E1=$(curl -s -X POST $B/api/purchases/test -H "Authorization: Bearer $TOK" \
  -H 'Content-Type: application/json' -d "{\"film_id\":\"$FID\"}" \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).entitlement.entitlement_id))")
P2RESP=$(curl -s -X POST $B/api/purchases/test -H "Authorization: Bearer $TOK" \
  -H 'Content-Type: application/json' -d "{\"film_id\":\"$FID\"}")
ALREADY=$(echo "$P2RESP" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log(j.already_owned===true?'yes':'no')})")
E2=$(echo "$P2RESP" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).entitlement.entitlement_id)}catch(e){console.log('none')}})")
if [ "$ALREADY" = "yes" ] || { [ -n "$E1" ] && [ "$E1" = "$E2" ]; }; then
  echo "PASS: repeat purchase idempotent (already_owned or same entitlement)"
else
  echo "FAIL: duplicate entitlements ($E1 vs $E2)"; fails=$((fails+1))
fi

echo "== BUG-004: repeated /api/passes/test must not mint unbounded credits =="
B1=$(curl -s -X POST $B/api/passes/test -H 'Content-Type: application/json' -d '{"email":"mint@example.com"}' \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).balance))")
B2=$(curl -s -X POST $B/api/passes/test -H 'Content-Type: application/json' -d '{"email":"mint@example.com"}' \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).balance))")
chk "second subscribe grants no new credit (want balance 1)" "1" "$B2"
echo "(first subscribe balance was $B1)"

echo "----"; [ "$fails" = 0 ] && echo "ALL REPRO CHECKS PASS" || echo "$fails CHECK(S) FAILING — bugs reproduced"
exit "$fails"
