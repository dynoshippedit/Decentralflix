# S3 (amendment) - unit-abi-generated coverage detail

Unit digest: d33c7a9ee8b4dae07eb9b91fc68d8edd546022cb6386fe111892bd3ae75ff3d6
(all observations reference this source identity).

## COR - REVIEWED
- git diff vs HEAD: 106 insertions, 0 deletions - pure addition, no entry
  removed or altered, so no existing frontend wiring can break from this regen.
- platformRenounced() view entry present in all four inheritor ABIs:
  MOVIE_TICKET_ABI_FULL (L1034), TICKET_NFT_ABI_FULL (L4071),
  SUBSCRIPTION_MANAGER_ABI_FULL (L4907), PAY_PER_VIEW_ABI_FULL (L5359).
- renounceOwnership() present in the same four (L1047/4135/4933/5395).
- The drift guard (check-abi-drift, 14/14) proves by order- and
  length-sensitive deep equality that every generated const exactly matches
  its compiled artifact - the regen is faithful, not drift.
- Observed, out of scope: NewOwnerCannotReceive error entries were also added
  by this regen (they come from the uncommitted F-DFLIX-1 transferOwnership
  probe in the working tree, a separate repair on this branch).

## ARC - REVIEWED
- The generated file is a checked-in build artifact, not hand-written source:
  header forbids hand edits; single source of truth is the export script plus
  the compiled artifacts. Regen is part of the compile pipeline
  ("auto-runs on npm run compile").
- The drift guard pins the export-abi.ts CONTRACTS list to the guard
  CONTRACTS list (FIND-01 from the df13 checkup), so a future contract added
  to one list but not the other fails the gate instead of shipping unchecked.

## TST - REVIEWED
- check-abi-drift is the behavior-bearing check for this unit: 14/14 passing
  post-regen (1 artifacts-exist + 10 per-contract exact-match +
  seeder-deviation-only + export-pipeline parity + no-removed-fee-setters).
- It fails closed: missing artifact file, missing generated const, or any
  added/removed/changed entry fails the gate - this is the check that would
  have caught the df-cycle-12 drift before it shipped.
- check-frontend (232/232) includes this guard file, so the full suite
  independently confirms the same result; check-tsc clean confirms the
  generated TS consts type-check in the frontend.

## DOC - REVIEWED
- File header documents the generator (packages/contracts/scripts/export-abi.ts),
  the source (compiled Hardhat artifacts), the regen command, and the
  auto-run on compile - all verified to exist (script present, package.json
  has the export:abi script, artifacts present).
- The regen claim "part of Repair 1 acceptance, not drift" holds: the diff is
  exactly the artifact-derived additions for the renounce change (plus the
  noted F-DFLIX-1 error entries from the same working tree), and the guard
  passes.
