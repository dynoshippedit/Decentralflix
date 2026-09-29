# S4 — challenged findings (checkup-df13-2026-09-29b)

## FIND-01 — dual hardcoded contract lists can drift apart [SUPPORTED_IMPROVEMENT]
- Location: packages/contracts/scripts/export-abi.ts L14 (CONTRACTS, 10 names)
  vs apps/frontend/lib/contracts/abi-drift.test.ts L38-49 (CONTRACTS, 10 names).
- Expected: the drift guard covers exactly the ABIs the pipeline exports
  (the guard exists to prevent silent ABI drift — Dino 2026-09-29).
- Observed: two independent hardcoded lists in different languages/files.
  Counter-check: both currently list the same 10 contracts (verified by reading
  both files) — the defect is latent, not active.
- Reachable: the next contract addition or rename that updates one list only.
- Impact: a new/renamed contract ships an unchecked ABI — the exact failure mode
  the guard was built to prevent, silently reintroduced.
- Alternative: "developers will remember to update both" — rejected by the
  df-cycle-12 history, where the frontend drifted precisely because a manual step
  was forgotten.
- Action (smallest coherent): a test asserting the two lists are identical
  (parse export-abi.ts CONTRACTS, compare against the guard list).
- Verification: add a bogus entry to one list -> test fails; restore -> green;
  then the full frontend suite.

## FIND-02 — _safeMint external call precedes _splitRevenue [REJECTED_LEAD]
- Location: TicketNFT.mintTicket L150-157.
- Claim considered: a malicious buyer contract could exploit the ordering via
  onERC721Received before funds split.
- Counter-check (traced): mintTicket is nonReentrant; the buyer callback can
  only reach view functions or revert trying guarded ones (mintTicket,
  redeemTicket). All state changes (mint + split) are atomic in one transaction:
  any revert unwinds both. Reversing the order has identical atomicity.
- Rejected: no reachable exploit path; ordering is safe under the guard.

## FIND-03 — owner can front-run setFilmPrice against a buyer mint [REJECTED_LEAD]
- Location: TicketNFT.setFilmPrice L130-135.
- Claim considered: owner raises price before a buyer tx lands.
- Counter-check: buyer tx reverts with IncorrectPayment (fail-closed); buyer
  loses gas only, no funds move; owner is the trusted platform by design and the
  function is documented as future-mints-only.
- Rejected: by-design owner trust with fail-closed behavior; no fund risk.

## FIND-04 — useMovieTicket creates a viem publicClient per render [REJECTED_LEAD]
- Location: apps/frontend/lib/contracts/useMovieTicket.ts (createPublicClient
  in component body, both hooks).
- Claim considered: wasted client construction per render.
- Counter-check: pre-existing pattern, untouched by the df-cycle-13 semantics
  (the change only swapped which fee constant is read); trivial cost; out of
  this change-checkup scope.
- Rejected for this checkup; not queued (pre-existing nit, no defect).

## Priority
FIND-01 first (only actionable item; guards the guard). FIND-02/03/04 rejected
with counter-evidence retained above.
