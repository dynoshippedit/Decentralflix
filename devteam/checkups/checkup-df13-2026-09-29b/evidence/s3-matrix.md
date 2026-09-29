# S3 — engineering matrix (checkup-df13-2026-09-29b)

## contract-ticketnft (TicketNFT.sol L1-241, test/TicketNFT.test.ts)
- COR: mintTicket (L140-161) enforces exact payment (`msg.value != film.priceWei`
  -> IncorrectPayment); free films skip _splitRevenue; fee=floor(v*2500/10000),
  creator=v-fee; _update override (L213-229) syncs _validTickets on transfers;
  redeemTicket burns once (burn path skips the transfer branch). S1 probe: 7 wei -> 1/6/0.
- ARC: ERC721 + RevenueSplitter + ReentrancyGuard; Ownable(msg.sender) resolves
  via RevenueSplitter; filmmaker immutable post-registration (no setter);
  registry (owner-only) / minting (permissionless) / redemption (ticket-owner)
  separated.
- TST: changeEtherBalances asserts [creatorShare, fee, 0n] (nothing retained);
  refusal paths IncorrectPayment/FilmInactive/FilmNotFound/ZeroAddress;
  falsification 3-fail/42-pass with contract stashed, green on restore.
- DOC: @notice on contract + mintTicket accurately describe 75/25 at purchase,
  remainder to filmmaker, MissingCreator revert.
- SEC: registry functions onlyOwner; mintTicket nonReentrant (the _safeMint
  external call precedes _splitRevenue but reentry into guarded fns reverts);
  no withdraw exists; owner price changes affect future mints only (documented).
- DAT: uint256 wei throughout; creator=msg.value-fee (remainder by construction);
  checked arithmetic (0.8.20); counts use checked decrement; no floats.
- DOM: owner registers / anyone mints / only ticket owner redeems; no signatures
  (no replay surface); reentrancy guarded; split-at-purchase (no withdrawal);
  hasValidTicket/validTicketCount track unredeemed mints.

## contract-splitter (RevenueSplitter.sol, unchanged since df-cycle-12)
- COR: PLATFORM_FEE_BPS=2500 constant, no setter; MissingCreator on zero;
  floor-division fee; creator=msg.value-fee; .call transfers with TransferFailed;
  RevenueSplit event. (git diff ff010bf..76c08f7 empty; file re-read.)
- ARC: abstract base for all four payment contracts; single definition of the rule.
- TST: exercised via inheritors (TicketNFT 6 new + df-cycle-10/12 suites); no
  standalone unit — acceptable, base is abstract and every path runs via inheritors.
- DOC: NatSpec states the four rules; matches implementation.
- SEC: no setter by design; MissingCreator blocks zero-address diversion; owner
  gets the fee but cannot alter or redirect.
- DAT: basis-point uint256 math; floor favors creator by construction.
- DOM: fee + creatorShare == msg.value exactly; nothing accrues (test-asserted).

## frontend-wrappers (payPerView.ts/.test.ts, useMovieTicket.ts, config.ts)
- COR: platformFeeBps() reads the immutable on-chain constant; buyAccess passes
  value via reqWei unchanged; getFilm maps (filmmaker, priceWei, exists);
  useMovieTicket fee=floor(price*bps/10000), creator=price-fee (mirrors chain);
  config PLATFORM_FEE_BPS=2500, CREATOR_SHARE_BPS=7500.
- ARC: thin validated adapters over ethers Contract; hook separates reads from UI
  state with canonical-mirror fallback; config centralizes mirrors + ABI aliases.
- TST: 11 tests — expectCall pins method names/args; validation suite rejects bad
  inputs; immutable-constant read asserted. Mocks at the chain boundary.
- DOC: header states "no fee setter, no withdraw, no accrued balance — those
  functions do not exist on-chain"; hook header documents the mirror fallback.
- API: wrappers are the frontend<->chain boundary; inputs validated pre-call
  (reqAddress/reqUint/reqWei); writes need signer; errors propagate.

## frontend-mint-page (app/mint/page.tsx)
- COR: feePct always defined from hook state (stale "30" fallback removed);
  priceWei=parseEther(price||"0.01"); fee/creator shares from the same hook math.
- ARC: composes useMovieTicket + viem wallet client + Privy auth; step machine
  choose/confirm/success; chain select by address match.
- TST: NOT_APPLICABLE — Next.js page, no page-level harness in repo; fee math
  covered at hook/config level + tsc; the change is display-only.
- DOC: tier labels current; fee display now reflects the immutable 25%.
- UIX: fee breakdown before confirm; step states; auth gate; consent modal.

## abi-pipeline (abi-drift.test.ts, export-abi.ts, package.json)
- COR: export-abi exits 1 ("run npx hardhat compile") on missing artifact; guard
  does order- and length-sensitive deep equality per contract, fail-closed.
- ARC: compile -> export-abi -> abis.generated.ts (do-not-edit) -> guard under
  npm test; generated file is the single ABI source (config aliases = _FULL).
- TST: 13 guard tests; refusal proven twice (worker + this checkup).
- DOC: generated header (AUTO-GENERATED/DO NOT EDIT/regenerate cmd); guard
  docstring states the fail-closed contract + the one SEEDER_CREDITS deviation.
- BLD: reproducible via `npm run export:abi` (auto-runs on compile); guard in
  the standard `npm test` gate.
- WRINKLE (S4 candidate): CONTRACTS hardcodings in export-abi.ts and
  abi-drift.test.ts are separate lists that can drift apart.

## docs-payout (notes x3, WHITEPAPER.md, QUESTIONS.md)
- COR: banners state 75/25 at purchase, remainder to filmmaker, MissingCreator,
  no redirect — matches TicketNFT.sol L140-161 + RevenueSplitter;
  WHITEPAPER 3.1 matches code.
- ARC: consistent supersede-in-place convention; Q-df12-001 RESOLVED with
  decision + date; whitepaper is normative.
- TST: NOT_APPLICABLE — docs have no executable behavior; accuracy by
  cross-reference (see COR).
- DOC: history preserved, current truth marked; no unmarked stale 100% claim.
