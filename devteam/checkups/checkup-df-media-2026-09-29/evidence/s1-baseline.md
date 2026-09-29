# S1 — Executable baseline (checkup-df-media-2026-09-29)

## Baseline command receipt
- Check: `lifeboat-e2e` (phase baseline)
- Receipt: devteam/checkups/checkup-df-media-2026-09-29/receipts/baseline-lifeboat-e2e.json
- argv: ["bash", "test.sh"], cwd: apps/lifeboat, exit_code 0, timed_out false
- Source identity before == after == initial snapshot (713c1aba09164799):
  the suite did not mutate any selected source file.
- Result: **165 PASS / 0 FAIL**, 0 skips (log: receipts/baseline-lifeboat-e2e.json.log)

## DF-MEDIA-3 behavior exercised (all 11, real server + curl, no mocks)
1. unauthenticated mint -> 401, no URL minted
2. cross-account mint -> 403
3. unentitled film -> 403, no URL minted
4. entitled holder mint -> 200, expires_in = 900
5. minted URL shape: ^/api/media/play?pass=
6. headerless play -> 200 with non-empty bytes (the whole point: video element
   cannot send Authorization)
7. Range: bytes=0-99 -> 206, exactly 100 bytes (seeking works)
8. tampered sig (64 zeros) -> 403
9. film-swapped (sig binds pass+film) -> 403
10. expired (crafted exp = now-60, valid HMAC) -> 403
11. missing params -> 403

Also observed: STR-001 UI auth test passes (login stores token, helpers send
Bearer), confirming the D.getJSON helper film.html uses attaches the
Authorization header for the mint call.

## Environment notes
- Threadripper, node available, test ran against the DEV build with
  DECENTRALFLIX_TEST_MINTS=1 and DECENTRALFLIX_MEDIA_SECRET=test-media-secret-xyz
  (fixed test secret; the dev-only default path is exercised by the startup
  warning branch, not by this suite).
- No environment faults: server started, all curl fixtures reachable, prod-mode
  refusal section at suite end also green.
- Named limits: baseline covers the test-secret path; the production secret path
  (DECENTRALFLIX_MEDIA_SECRET set in prod) is behaviorally identical — same
  HMAC code, only the key bytes differ — and is not separately exercised here.
  mediaPlay trusts the signature (no re-check of live entitlement at play time);
  that is the presigned-URL design, reviewed in S3/S4.
