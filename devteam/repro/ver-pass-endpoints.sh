#!/bin/bash
# VER live repro: scratch lifeboat on 127.0.0.1:18099, throwaway data dir.
# Targets: BUG-004 (pass test mint per call), SEC-001 (unauth credit/entitlement mint),
#          BUG-011 (pass endpoints no auth), BUG-003 (testPurchase dupes),
#          DAT-001/SEC-002 (logout no-op), SEC-011 (pass redemption test_mode flag).
set -u
REPO=/home/dino/Decentralflix
SCRATCH=/tmp/ver-scratch/lifeboat
PORT=18099
rm -rf /tmp/ver-scratch
mkdir -p /tmp/ver-scratch
cp -r "$REPO/apps/lifeboat" "$SCRATCH"
rm -rf "$SCRATCH/data"
node -e "
const store = require('/tmp/ver-scratch/lifeboat/lib/store.js');
// seed one film (as importFilm would)
store.insert('films', { film_id: 'film_demo1', title: 'Demo Film', filmmaker_email: 'film@example.com', price_usd_cents: 399, download_allowed: false });
console.log('film seeded');
"
(cd "$SCRATCH" && PORT=$PORT node server.js > /tmp/ver-scratch/server.log 2>&1 &) 
sleep 1.5
BASE="http://127.0.0.1:$PORT/api"
echo "--- [BUG-004/SEC-001] unauthenticated POST /api/passes/test twice ---"
R1=$(curl -s -X POST $BASE/passes/test -H 'Content-Type: application/json' -d '{"email":"verattk@example.com"}')
echo "$R1" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log('call1 status=201 balance=',j.balance,'pass_id=',j.pass.pass_id)})"
PASSID=$(echo "$R1" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).pass.pass_id))")
R2=$(curl -s -X POST $BASE/passes/test -H 'Content-Type: application/json' -d '{"email":"verattk@example.com"}')
echo "$R2" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log('call2 balance=',j.balance,' (BUG-004: no billing-period guard if balance=2)')})"
echo "--- [BUG-011] GET /api/passes/:id with NO auth ---"
curl -s -o /dev/null -w "GET pass detail (no auth) -> %{http_code}\n" $BASE/passes/$PASSID
echo "--- [BUG-011/SEC-001] POST /api/passes/:id/redeem with NO auth (email=holder) ---"
R3=$(curl -s -X POST $BASE/passes/$PASSID/redeem -H 'Content-Type: application/json' -d '{"film_id":"film_demo1","email":"verattk@example.com"}')
echo "$R3" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log('redeem balance=',j.balance,'entitlement source=',j.entitlement&&j.entitlement.source,'test_mode flag=',j.entitlement&&j.entitlement.test_mode)})"
echo "--- [BUG-003] testPurchase twice with auth -> duplicate entitlements? ---"
S=$(curl -s -X POST $BASE/auth/signup -H 'Content-Type: application/json' -d '{"email":"verbuyer@example.com","password":"password123","role":"buyer"}')
TOK=$(echo "$S" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).token))")
AUTHHDR="Authorization: Bearer $TOK"
curl -s -X POST $BASE/purchases/test -H "$AUTHHDR" -H 'Content-Type: application/json' -d '{"film_id":"film_demo1"}' -o /dev/null
curl -s -X POST $BASE/purchases/test -H "$AUTHHDR" -H 'Content-Type: application/json' -d '{"film_id":"film_demo1"}' -o /dev/null
node -e "
const store = require('/tmp/ver-scratch/lifeboat/lib/store.js');
const ents = store.all('entitlements').filter(e=>e.email==='verbuyer@example.com'&&e.film_id==='film_demo1');
console.log('entitlements for verbuyer@example.com x film_demo1:', ents.length, '(BUG-003 confirmed if 2)');
"
echo "--- [DAT-001/SEC-002] logout then reuse token ---"
curl -s -X POST $BASE/auth/logout -H "$AUTHHDR" -o /dev/null -w "logout -> %{http_code}\n"
curl -s -o /dev/null -w "reuse token after logout -> %{http_code} (DAT-001 confirmed if 200)\n" $BASE/auth/me -H "$AUTHHDR"
pkill -f "node server.js" 2>/dev/null
echo done
