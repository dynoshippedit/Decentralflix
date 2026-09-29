# S2 — as-is architecture / flow map (DF-RENOUNCE-1)

## Contract index
- `RevenueSplitter` (abstract, `is Ownable` from @openzeppelin/contracts).
  Authoritative state: `PLATFORM_FEE_BPS = 2500` (immutable const),
  `BPS_DENOMINATOR = 10000` (const), `bool public platformRenounced`
  (default false; set once in renounceOwnership; no setter, one-way),
  `owner()` (OZ Ownable, → address(0) after renounce).
  Errors: MissingCreator, TransferFailed, NewOwnerCannotReceive.
  Event: RevenueSplit(creator, creatorShare, platformFee).
- Inheritors (none override renounceOwnership or _splitRevenue — verified by grep):
  TicketNFT (ERC721, RevenueSplitter, ReentrancyGuard),
  MovieTicket (ERC721A, RevenueSplitter, ReentrancyGuard),
  PayPerView (RevenueSplitter, ReentrancyGuard),
  SubscriptionManager (RevenueSplitter, ReentrancyGuard).

## Function index (RevenueSplitter)
- `renounceOwnership() public override onlyOwner` — sets platformRenounced=true,
  then super.renounceOwnership() (OZ: emits OwnershipTransferred, owner→address(0)).
- `transferOwnership(address) public override onlyOwner` — zero-value receive
  probe; reverts NewOwnerCannotReceive on failure; then super. (F-DFLIX-1 context;
  renounce bypasses the probe by design.)
- `_splitRevenue(address creator) internal returns (creatorShare, platformFee)` —
  MissingCreator on zero creator; if platformRenounced: creatorShare = msg.value,
  platformFee = 0, single creator call, emit RevenueSplit(creator, msg.value, 0),
  return (msg.value, 0). Else: fee = msg.value*2500/10000 (floor), creator gets
  msg.value − fee, creator paid first, then fee to owner(), emit + return pair.

## Paid entry points → splitter (all routes verified)
- TicketNFT.mintTicket(uint256) external payable nonReentrant → _splitRevenue(film.filmmaker) (L156; guarded by msg.value>0)
- PayPerView.buyAccess(uint256) external payable nonReentrant → _splitRevenue(film.filmmaker) (L105)
- SubscriptionManager.subscribe(uint256) external payable nonReentrant → _splitPayment(plan) → _splitRevenue(plan.creator) (L141/L220)
- MovieTicket.mintPermanentPass(...) public payable onlyOwner whenNotPaused nonReentrant → _splitMintPayment(creator, price) → _splitRevenue(creator) (L229-238)
- MovieTicket.mintBurnableTicket(...) public payable onlyOwner whenNotPaused nonReentrant → _splitMintPayment → _splitRevenue (L287-297)
  Return values used only for event/logging fields (AccessPurchased, CreatorPaid,
  PerpetualPassMinted) — no accrued-fee accounting anywhere in scope.

## Traced paths
- Primary success (pre-renounce): buyer pays PRICE → _splitRevenue → creator
  gets PRICE−fee, owner gets fee, RevenueSplit emitted. (Test: exact balances.)
- Renounce path: owner calls renounceOwnership → platformRenounced=true,
  owner()=address(0). Post-renounce sale: fee-leg SKIPPED ENTIRELY — no call to
  owner() (so a zero owner cannot brick payments), creator gets 100%.
- Consequential failure path: non-owner calls renounceOwnership →
  OwnableUnauthorizedAccount revert; platformRenounced stays false.
  Post-renounce onlyOwner entry points (registerFilm, mintPermanentPass,
  mintBurnableTicket, createPlan) revert for everyone (owner = address(0));
  permissionless paid flows (mintTicket, buyAccess, subscribe) continue at 100%.
- Free-mint paths (msg.value==0): skip the splitter entirely — renounce inert.

## Invariants
1. Fee leg never executes when owner is address(0) (no call target → no revert risk).
2. Creator share is never redirected to the owner; zero creator reverts.
3. platformRenounced is one-way: no setter, no un-renounce, transferOwnership
   unreachable post-renounce (onlyOwner with zero owner).
4. RevenueSplit event fields match the returned (creatorShare, platformFee) pair.

## Intended-vs-implemented
Matches decision record (redirect, don't burn, don't revert-guard). The test
header says "All four inheritors inherit the behavior" — accurate with one hop:
MovieTicket delegates via _splitMintPayment (exact-payment guard) into
_splitRevenue. No discrepancies found.
