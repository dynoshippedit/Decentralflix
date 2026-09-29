# S7 — Challenge pass (incl. docs-vs-tree check)

Cause removed at the source: the two stale passages are annotated; nothing remains unmarked. Remaining `platformFeeBps` occurrences in the doc (grep): lines 5, 8, 10 are inside the correction note explaining the supersession; lines 66 and 87 are the inline "(was platformFeeBps — see correction note)" markers. No unmarked occurrence exists.

Docs-vs-tree check (correction note claims traced to the tree):
- "PLATFORM_FEE_BPS=2500, immutable constant, no setter" -> RevenueSplitter.sol:33 `uint256 public constant PLATFORM_FEE_BPS = 2500;`; no `setPlatformFee`/`_platformFee` anywhere in contracts/*.sol.
- "creator receives msg.value - fee (rounding remainder favors creator)" -> RevenueSplitter.sol:61-62.
- "zero-creator reverts MissingCreator" -> :39 `error MissingCreator();`, :59 revert.
- "no owner withdraw path" -> grep `function withdraw|withdraw(` in SubscriptionManager/PayPerView/MovieTicket/TicketNFT: zero hits.
- "platformFeeBps mentions no longer exist anywhere in packages/contracts/" -> grep -rc `platformFeeBps` across contracts/*.sol: all zero (receipt in check-onchain-truth log).
- All four viewer-payment contracts inherit the splitter: SubscriptionManager.sol:23, PayPerView.sol:21, MovieTicket.sol:45, TicketNFT.sol:23 (`is ..., RevenueSplitter, ...`).
- "For the current fee mechanics see DEPLOYMENT_CHECKLIST.md and docs/WHITEPAPER.md §§3.1–3.3" -> DEPLOYMENT_CHECKLIST.md:4,12 state the immutable 2500 split; WHITEPAPER.md:41,45 state 75/25 + immutable PLATFORM_FEE_BPS=2500 + owner-cannot-change + no withdraw path. References resolve.

No ordering/auth/semantics changes possible (prose-only). The change is strictly additive in substance: the 2 deleted lines are the replaced stale lines, whose content the note preserves and attributes.

SELF_REVIEW declared (sequential role pass, not independent review). reviewer_mode: SELF_REVIEW.
