# S3 — Diff review (checkup-dfbatch2-2026-09-29)

Inspected via `git diff` (working tree vs HEAD 15b6f5e). This batch's changes only:

## DF-SEC-1 — apps/lifeboat/server.js, apps/lifeboat/test.sh
- `POST /api/buyers/import` route now calls `requireFilmmaker(req, res)` (401 when
  unauthenticated) and `importBuyers(req, res, account)` checks
  `ownsFilm(account, film)` → 403 for non-owners. Fail-closed per chief decision
  2026-09-29 (comment in code; Dino can deliberately revert if open migration
  import was intended).
- test.sh: +3 assertions (unauth 401, buyer-role 403, non-owner-filmmaker 403);
  existing owner-success case unchanged.
- Surface: one route + one function signature. No other callers of importBuyers.

## DF-SEC-2 — apps/lifeboat/lib/pass.js, apps/lifeboat/server.js, apps/lifeboat/test.sh
- `passLib.invoiceCredited({pass_id, stripe_invoice_id})` added: scans the
  pass's ledger for a matching stripe_invoice_id.
- `invoice.payment_succeeded` handler checks it before `issueCredits`; dedup key
  is the invoice ID within the pass (mirrors checkout.session.completed's
  alreadyEntitled guard). A new invoice ID still credits.
- test.sh: new webhook section — restarts server with synthetic
  STRIPE_WEBHOOK_SECRET, HMAC-signs synthetic events, creates a pass via
  synthetic customer.subscription.created, then: first invoice → 1 credit;
  retried identical invoice → still 1 credit, one ledger entry; second invoice
  ID → 2 credits. No real Stripe calls.
- One display-pipeline note: the agent tooling redacts `TOKEN=$(...)` patterns
  in output; the file itself was verified byte-correct (od) and `bash -n` clean.

## DF-SEC-3 — packages/contracts/contracts/RevenueSplitter.sol (+ mocks, tests)
- New `NewOwnerCannotReceive(address)` error; `transferOwnership` override probes
  the new owner with a zero-value call and reverts when it cannot receive ETH.
  Probe is reentrancy-safe (reentrant call fails onlyOwner as non-owner).
  renounceOwnership untouched (DF-RENOUNCE-1, Dino's call).
- `_splitRevenue`: creator paid FIRST, then the platform fee (was fee-first).
  75/25 math untouched; all four inheritors (MovieTicket, PayPerView,
  SubscriptionManager, TicketNFT) inherit the guard automatically.
- New test-only `contracts/mocks/MockFeeRecipients.sol` (RevertingReceiver,
  AcceptingReceiver). 6 new PayPerView tests (see S2).
- apps/frontend/lib/contracts/abis.generated.ts regenerated via
  `npm run export:abi` (NewOwnerCannotReceive in 4 contract ABIs); required by
  the abi-drift guard (4 failures before regen, 0 after).

## DF-MEDIA-1 — apps/frontend/app/watch/[hash]/page.tsx, app/film/[hash]/page.tsx
- Watch page: `livepeerPlaybackId={signedUrl}` → `r2SignedUrl={signedUrl}` with
  comment citing GROK.md 2026-09-28 (R2-primary via signed URLs; supersedes
  ADR-001 Filecoin-primary) and the mangled-URL mechanism. This settles the
  brief's D-4 via document supremacy, not guesswork.
- Film page: removed fabricated `livepeerPlaybackId={'demo-'+hash}`; demo films
  wire their real `videoUrl` to `r2SignedUrl`; films with no preview render an
  explicit preview-unavailable card with a Watch link. No ID is fabricated.

## DF-MEDIA-2 — apps/frontend/lib/cloudflare-access.ts, cloudflare-worker/access-control.js
- Dead `https://test-streams.github.io/streams/xbox.m3u8` (404) →
  `https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8` (verified live 2026-09-29),
  matching the URL already used in lib/demo-content.ts. Comments mark it as a
  public test/simulation asset.

## DF-MEDIA-3 — no diff (conditional)
- Verified: getAuthAccount reads only the Authorization header; searchParams
  used only for q/genre/film_id. No query-token auth exists; none invented.
  Reported back per brief; D-1 stays with Dino.
