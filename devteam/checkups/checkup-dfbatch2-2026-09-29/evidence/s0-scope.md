# S0 — Scope (checkup-dfbatch2-2026-09-29)

Review ID: checkup-dfbatch2-2026-09-29
Date: 2026-09-29. Mode: SELF_REVIEW (repair engineer ran the gate on own change;
principal review was not separately staffed this cycle — recorded as a limitation).

## Frozen source identity
- Repo: /home/dino/Decentralflix
- Branch: devteam/review-2026-09-29 @ 15b6f5e0af99674b85aa3b6a6950a181bcff2095
- Working tree at snapshot time: uncommitted changes from this batch (df-batch2)
  PLUS pre-existing uncommitted work from earlier batches (df-cycle-12..15:
  RevenueSplitter 75/25 NatSpec, PayPerView F-3 owner-restriction, frontend mint
  page rewire, abis regen, contract artifacts/typechain). The earlier work is
  OUT OF SCOPE for this checkup except where this batch touches the same files
  (PayPerView.test.ts, abis.generated.ts, watch/film pages, cloudflare-access.ts).

## Declared scope (11 review units, 11 source paths, 4 checks)
Units: lifeboat-server (SEC/API/COR/ARC/TST/DOC/REL/DAT),
lifeboat-pass-lib (COR/ARC/DAT/TST/DOC/REL), lifeboat-tests (COR/ARC/TST/DOC),
splitter (COR/ARC/SEC/TST/DOC), splitter-mocks (COR/ARC/TST/DOC),
splitter-tests (COR/ARC/TST/DOC), page-watch (COR/ARC/UIX/DOC/TST),
page-film (COR/ARC/UIX/DOC), cf-access (COR/ARC/DOC),
worker-access (COR/ARC/DOC), abi-regen (COR/ARC/BLD/TST/DOC).

Every unit carries COR, ARC, TST, DOC. Omitted lenses (PRF, API on some units,
SEC on pure-UI units, DOM where no domain mechanics changed) were judged
non-applicable: no hot paths, no new external integrations, no economic
mechanics altered (75/25 split unchanged), no new user flows.

## Exclusions
.git (inspect git status separately), node_modules/**, __pycache__/**,
devteam/checkups (changing checkup output, not application source).

## Task coverage
DF-SEC-1 (buyers import authz), DF-SEC-2 (Stripe invoice idempotency),
DF-SEC-3 (fee-bricking owner rotation), DF-MEDIA-1 (playback prop/ID fixes),
DF-MEDIA-2 (dead demo stream URL), DF-MEDIA-3 (conditional: /stream auth —
verified no query-param support; NO code change per brief, reported back).
DF-RENOUNCE-1 explicitly NOT in scope (pending Dino decision; queue file untouched).
