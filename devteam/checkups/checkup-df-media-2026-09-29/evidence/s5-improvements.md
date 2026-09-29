# S5 — Implementation disposition (checkup-df-media-2026-09-29)

## Rule applied
This run operates under the task rule "read-only on source (write only under
devteam/checkups/<review-id>/)". The two supported improvements (F1, F5) are
therefore NOT applied to the tree in this run. They are recorded below as
exact, ready-to-apply patches with acceptance measures, and queued as findings
F1/F5 for the main engineering loop. No product-code change was indicated:
zero confirmed defects were found in S3/S4.

## Before-state (for the main loop's re-verification)
- apps/lifeboat/test.sh DF-MEDIA-3 section: 11 assertions, ends with the
  "parameter-less play URL rejected (403)" test (~line 791), followed by the
  "# --- M2: buyer library" section header.
- apps/frontend/lib/playback-url.test.ts: 7 tests; the fetchPlaybackUrl
  describe block covers 200/401/403/missing-token/malformed.

## Patch F1 — test.sh: 2 new DF-MEDIA-3 assertions
Insert after the "parameter-less play URL rejected (403)" test, before the
"# --- M2: buyer library" header:

```sh
# non-integer expiry: rejected (exercises the 'bad expiry' branch —
# verifyPlaybackUrl checks Number.isInteger(exp) BEFORE the signature)
BAD_EXP=$(node -e 'const u = new URL(process.argv[1], "http://x"); const p = u.searchParams; p.set("exp", "not-a-number"); console.log(u.pathname + "?" + p.toString());' "$PBURL")
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$BAD_EXP")
[ "$code" = "403" ] && pass "DF-MEDIA-3: non-integer expiry rejected (403)" || fail "DF-MEDIA-3: bad expiry 403" "http=$code"

# truncated signature: rejected (exercises the length-guard branch before
# crypto.timingSafeEqual — the existing tamper test uses a full-length sig)
SHORT_SIG=$(node -e 'const u = new URL(process.argv[1], "http://x"); const p = u.searchParams; p.set("sig", "abcd"); console.log(u.pathname + "?" + p.toString());' "$PBURL")
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$SHORT_SIG")
[ "$code" = "403" ] && pass "DF-MEDIA-3: truncated signature rejected (403)" || fail "DF-MEDIA-3: short sig 403" "http=$code"
```

Acceptance: `bash test.sh` in apps/lifeboat -> 167 PASS / 0 FAIL (165 baseline + 2).

## Patch F5 — playback-url.test.ts: 1 new vitest test
Insert in the `describe("fetchPlaybackUrl (DF-MEDIA-3)")` block, after the
403 test:

```ts
it("not found (404) -> PlaybackUrlError", async () => {
  mockFetch(404, { error: "pass not found" });
  await expect(fetchPlaybackUrl(OPTS)).rejects.toMatchObject({ status: 404 });
});
```

Acceptance: `npx vitest run` in apps/frontend -> 233 passed (232 baseline + 1).

## Disposition summary
- F1: QUEUED (queue_task_id DF-MEDIA-3-F1) — patch above; reason: read-only rule.
- F5: QUEUED (queue_task_id DF-MEDIA-3-F5) — patch above; reason: read-only rule.
- R1/R2/R3: REJECTED leads, no action.
- No other candidates justified an edit. The implementation itself needed no
  repair: all acceptance behavior verified green at baseline (S1) and final (S6).
