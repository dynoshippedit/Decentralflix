# S4 — challenged findings (checkup-df-renounce-2026-09-29)

No CONFIRMED_DEFECT and no SUPPORTED_IMPROVEMENT survived challenge. Three
candidate leads were investigated and rejected with counter-evidence. This
checkup worker is read-only on application source by assignment rules, so
nothing was edited; nothing needed editing.

## RL-01 — flag set before super.renounceOwnership() [REJECTED]
- Claim: if super.renounceOwnership() reverted after platformRenounced=true was
  written, the flag would be stranded true with an active owner.
- Location: RevenueSplitter.sol, renounceOwnership() (L73-76).
- Counter-check: read @openzeppelin/contracts/access/Ownable.sol —
  renounceOwnership() calls _transferOwnership(address(0)) which only writes
  storage (_owner) and emits OwnershipTransferred; no external calls, no
  conditions, no revert path. Flag-first ordering is safe here.
- Classification: REJECTED_LEAD. Resolution: REJECTED.

## RL-02 — MovieTicket redirect branch never executed by the tests [REJECTED]
- Claim: _splitRevenue's renounce branch is not covered for MovieTicket —
  post-renounce mints revert before reaching the splitter.
- Location: RenounceRedirect.test.ts MovieTicket describe; MovieTicket.sol
  mintPermanentPass (L229) / mintBurnableTicket (L287), both onlyOwner.
- Counter-check: both MovieTicket paid entry points are onlyOwner; post-renounce
  owner() = address(0) which cannot sign, so no MovieTicket sale can EVER occur
  post-renounce — there is no sale on which to redirect. The revert assertion is
  the correct and complete coverage for this contract; the shared branch is
  exercised by TicketNFT/PayPerView/SubscriptionManager. Documented in the test
  header ("the redirect can never burn or brick funds here").
- Classification: REJECTED_LEAD. Resolution: REJECTED.

## RL-03 — no dedicated PlatformRenounced event on renounce [REJECTED]
- Claim: indexers must infer the renounce from OwnershipTransferred(zero).
- Location: RevenueSplitter.sol renounceOwnership().
- Counter-check: super.renounceOwnership() emits OwnershipTransferred with the
  zero address (observable), and platformRenounced is a public getter readable
  at any block. A redundant event would add gas/log noise with no acceptance
  measure (no demonstrated indexing problem). Not a supported improvement.
- Classification: REJECTED_LEAD. Resolution: REJECTED.

## Disposition summary
- CONFIRMED_DEFECT: 0
- SUPPORTED_IMPROVEMENT: 0
- HYPOTHESIS: 0
- REJECTED_LEAD: 3 (RL-01, RL-02, RL-03 — all resolution REJECTED, counter-evidence above)
