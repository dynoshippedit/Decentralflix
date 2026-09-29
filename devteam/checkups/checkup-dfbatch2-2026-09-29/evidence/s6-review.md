# S6 — Review (checkup-dfbatch2-2026-09-29)

Lens-by-lens over the 11 units. Reviewer posture: read-only, adversarial where
cheap. No new findings opened; notes below.

## lifeboat-server (SEC/API/COR/ARC/TST/DOC/REL/DAT)
- SEC: the buyers-import gate now enforces authN (requireFilmmaker) + authZ
  (ownsFilm) at the route — the authoritative boundary. Negative tests cover
  unauthenticated, wrong-role, and non-owner. PASS.
- API: 401 vs 403 semantics correct (unauthenticated → 401, authenticated but
  unauthorized → 403). DAT: no duplicate/imported-contact dedup change — out of
  scope; the finding was authz only. REL: fail-closed on missing film (404
  before authz — no information leak beyond existence, acceptable).
- Webhook idempotency: dedup key (pass_id, stripe_invoice_id) is correct for
  at-least-once delivery. invoiceCredited scans the pass ledger — O(n) on a
  small ledger, fine. REL: a replayed invoice no longer double-credits; a new
  invoice still credits (not over-blocking). PASS.

## lifeboat-pass-lib (COR/ARC/DAT/TST/DOC/REL)
- invoiceCredited matches on stripe_invoice_id equality; null invoice IDs:
  two nulls would match — edge: Stripe always sends an invoice id on
  invoice.payment_succeeded, and the handler passes through null only if the
  object lacks id (defensive). Two null-ID events crediting once is the safe
  direction (under-credit beats double-credit). Noted, not a finding.

## lifeboat-tests (COR/ARC/TST/DOC)
- Assertions are wire-level (HTTP status, balances, ledger counts). The webhook
  section signs with HMAC locally — tests the real verification path, not a
  mock. PASS.

## splitter (COR/ARC/SEC/TST/DOC)
- COR: probe-then-rotate ordering correct (state unchanged on probe failure);
  creator-first ordering preserves 75/25 math exactly. All 4 inheritors covered
  by their suites (245/245).
- SEC: the threat (non-receiving owner bricking paid flows) is closed at the
  rotation boundary. Residual: renounceOwnership → zero address still possible
  (DF-RENOUNCE-1, Dino's economic decision — explicitly out of scope).
- ARC: guard lives in the shared base — single enforcement point, no per-
  contract duplication. DOC: NatSpec updated; the "nothing accrues / no
  withdraw" comments remain true (unchanged).

## splitter-mocks, splitter-tests (COR/ARC/TST/DOC)
- Mocks are minimal and honest (one reverts, one accepts). Tests assert the
  security property (rotation blocked, ownership unchanged, payments intact)
  plus no-overblock guards (EOA, zero-address OZ rule, non-owner). PASS.

## page-watch, page-film (COR/ARC/UIX/DOC/TST)
- COR: r2SignedUrl receives a URL — matches useVideoSources' r2 branch
  (priority 1). The mangled-URL defect is structurally eliminated.
- UIX: preview-unavailable card gives the user a path (Watch link) instead of
  a dead player. DOC: comments cite the canonical architecture decision.
- TST: no new automated tests for the page changes (vitest covers lib, not
  pages; tsc guards the prop types). Acceptable; noted.

## cf-access, worker-access (COR/ARC/DOC)
- URL swap only; comments mark the asset as public test/simulation content.
  Consistent with demo-content.ts. PASS.

## abi-regen (COR/ARC/BLD/TST/DOC)
- Regenerated from compiled artifacts via the documented pipeline; drift guard
  green. The 4 pre-regen failures prove the guard works.

## Verdict on review
No defects found in the repairs. Two non-findings noted above (null invoice-ID
edge, page-level test coverage). Residual risks live with Dino's explicit
decisions (DF-RENOUNCE-1, DF-MEDIA-3 D-1).
