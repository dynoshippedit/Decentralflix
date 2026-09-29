# S3 — engineering matrix coverage (all cells REVIEWED unless noted)

Source identity for this coverage: `e7bc7f69bd593153d7e2523aee202b13afcc093f51850a032b172be2ed1d1d32`
(unit digests: unit-revenuesplitter `6bd793b725ce7fb0e59c98f6e59ef3ecd11d211a77e33910bd031bd6bc511051`,
unit-renouncetest `38cef779b87dda30ec45bea9ebf729b4f16222d270e9575bad2c3d8343c4ce79`)

## unit-revenuesplitter — packages/contracts/contracts/RevenueSplitter.sol

### COR (correctness) — REVIEWED
- `_splitRevenue` renounce branch (L~126-137): creatorShare = msg.value exactly
  (no division, no rounding); platformFee = 0; exactly one external call
  (creator, full value); emit RevenueSplit(creator, msg.value, 0); return
  (msg.value, 0). Matches the test's exact-balance assertions.
- Fee leg is SKIPPED, not redirected to address(0): no call to owner() post-renounce,
  so a zero owner cannot brick payments and no fee is silently burned. This is the
  decision (b) semantics, verified in source.
- `renounceOwnership() public override onlyOwner` (L~73-76): flag set before
  super.renounceOwnership(); OZ v5 renounce performs no external calls and has no
  revert path, so flag-first ordering cannot strand state (rejected lead RL-01
  records the counter-check).
- MissingCreator guard retained before the renounce branch — a zero creator still
  reverts rather than sending 100% into the void.
- Boundary: msg.value == 0 post-renounce → creator.call{value:0}; pre-existing
  free-mint paths (TicketNFT msg.value>0 guard, MovieTicket _splitMintPayment
  (0,0) return) bypass the splitter anyway.
- Cross-checked all four inheritors' payable entry points call _splitRevenue
  (TicketNFT L156, PayPerView L105, SubscriptionManager via _splitPayment L220,
  MovieTicket via _splitMintPayment L220→_splitRevenue); no inheritor overrides
  renounceOwnership or _splitRevenue (grep-verified).

### ARC (architecture) — REVIEWED
- Single source of truth: renounce state (platformRenounced) and split policy
  colocated in the abstract base; inheritors unchanged and behave uniformly
  through _splitRevenue (MovieTicket via the _splitMintPayment exact-payment
  guard — one documented hop, not a fork).
- platformRenounced is a public bool, one-way (no setter, no un-renounce);
  ownership instances are per-contract (separate storage), so renouncing one
  contract does not affect the others — intended per-contract operator exit.
- Post-renounce, transferOwnership is unreachable (onlyOwner, owner=address(0));
  the F-DFLIX-1 receive-probe is bypassed by renounce by design (probed only on
  rotation, not on exit).

### TST (test quality) — REVIEWED
- The 5 tests in RenounceRedirect.test.ts discriminate the decision: against the
  pre-repair behavior (fee burned to address(0)), the post-renounce assertion
  `creatorDelta == PRICE` would fail at 75% (and against a revert-guard design
  the post-renounce sale would revert). Pre-renounce 75/25 exact splits pin the
  regression baseline.
- MovieTicket covers the renounce decision via the onlyOwner-revert path; its
  redirect branch is unreachable by design (all its paid entry points are
  onlyOwner) — documented in the test header; the shared branch is exercised by
  the other three contracts (rejected lead RL-02).

### DOC (product truth) — REVIEWED
- NatSpec matches implementation: header documents DF-RENOUNCE-1 decision and
  rationale; renounceOwnership and _splitRevenue document the redirect; event
  fields match return values (RevenueSplit(creator, msg.value, 0)).
- "NOTE: this contract is unaudited." intact in RevenueSplitter.sol (verified by
  grep); test header also carries an unaudited notice. Nothing presents the
  contracts as audited.
- Minor observation (no finding): `_splitRevenue`'s one-line title still reads
  "Split msg.value 75/25 ..." — immediately qualified by the "or 100% once the
  platform has renounced" param doc. Accurate in full context.

### SEC (security boundaries) — REVIEWED
- renounceOwnership is onlyOwner — the authoritative boundary. Post-renounce no
  address holds the owner role (address(0) cannot sign): exit is irreversible.
- No reentrancy introduced: single external call in the renounce branch; entry
  points are nonReentrant; no state is written after the creator call in that
  branch (emit only). No signature/replay surface (no meta-transactions).
- Non-owner renounce reverts OwnableUnauthorizedAccount (negative test present).

### DAT (data integrity) — REVIEWED
- Wei accounting is exact: renounce branch has no division; 100% = msg.value.
  Contract balance is 0 after every sale (push-only, asserted in tests).
- Return pair (creatorShare, platformFee) equals emitted event fields; callers use
  the returns for logging fields only — no accrued-fee accounting to corrupt.

### DOM (blockchain domain invariants) — REVIEWED
- Role authority: enforced (onlyOwner; post-renounce owner=0 ⇒ no role holder).
- Arithmetic: no floor-division residue post-renounce (no division at all).
- Reward solvency: contract never holds funds; no withdraw sweep needed.
- Domain consequence (intended): post-renounce, owner-only functions
  (registerFilm, createPlan, mints) revert for everyone — the platform's control
  is fully exited; permissionless paid flows continue at 100% to creators.

## unit-renouncetest — packages/contracts/test/RenounceRedirect.test.ts

### COR — REVIEWED
- Fixtures match working-tree signatures: TicketNFT.registerFilm
  (filmId,title,priceWei,filmmaker,soulbound,metadataURI) L85-92;
  PayPerView.registerFilm (filmId,priceWei,filmmaker) L70 (new owner-only sig);
  SubscriptionManager.createPlan (planId,name,priceWei,durationSecs,creator) L97;
  MovieTicket.mintPermanentPass (to,creator,videoHash,price,tier) L229 with tier=0
  (valid: uint8(0) <= PRODUCER) and msg.value == PRICE (passes the exact-payment
  guard).
- Exact assertions: feeOf = v*2500/10000 (matches contract floor division);
  PRICE = 0.05 ETH divides evenly (fee = 0.0125 ETH) so exactness is meaningful.
- Owner-minter gas caveat handled correctly: no exact owner-delta assertion in the
  MovieTicket test. SubscriptionManager uses a second user post-renounce to avoid
  AlreadySubscribed — correct fixture hygiene.
- Event assertion `.to.emit(...).withArgs(creator, PRICE, 0n)` matches the
  contract's emit exactly.

### ARC — REVIEWED
- Test structure mirrors the architecture: four describes (one per inheritor),
  shared helpers (feeOf/creatorShareOf/bal), loadFixture isolation per case.
  The header documents the decision, the delegation path
  (RevenueSplitter ← _splitMintPayment for MovieTicket), and why MovieTicket's
  post-renounce case is a revert test. No mock at the wrong boundary — real
  in-process chain, real ETH transfers.

### TST — REVIEWED
- Assertions are meaningful (exact wei deltas, zero contract balance, event args,
  custom-error revert). The 5 tests fail against both rejected designs:
  (a) burn-to-zero (creator delta = 75%, not PRICE) and (c) revert-guard
  (post-renounce sale reverts). No tests-that-cannot-fail: balance-delta
  assertions would catch any accounting drift.

### DOC — REVIEWED
- Header comment states the decision, rationale, delegation, exact-split
  invariants, and the unaudited notice. All statements verified against source.
  (The claim "all four inheritors inherit the behavior" holds via the documented
  _splitMintPayment delegation for MovieTicket.)
