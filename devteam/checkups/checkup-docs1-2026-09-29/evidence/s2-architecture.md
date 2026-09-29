# S2 — Design reconstructed from the implementation

The correction follows the dated-audit + correction-note pattern specified in stale-doc-sweep.md:

- The audit header remains pinned: "Date: 2026-09-28. Scope: entire repository at /home/dino/Decentralflix, commit ccf762c" — a pre-df-cycle-12 tree. Original claims are preserved and attributable to the commit they describe.
- The 2026-09-29 DOCS-1 correction note sits directly under the header. It states the supersession (per-contract `platformFeeBps` admin field -> shared `RevenueSplitter`), the immutable mechanics, the zero-hit grep, and points readers to the current-truth docs: DEPLOYMENT_CHECKLIST.md and docs/WHITEPAPER.md §§3.1–3.3.
- The two stale passages are corrected inline (not deleted-and-replaced silently): S-1 now reads "RevenueSplitter / (was platformFeeBps — see correction note), pausable"; S-2 now reads "RevenueSplitter (was `platformFeeBps` admin — see correction note)".
- No duplication of fee policy into the audit: the audit does not restate the split mechanics; it defers to the living docs. This keeps exactly one source of fee truth (RevenueSplitter.sol + WHITEPAPER §§3.1–3.3).

Downstream workflows affected: none beyond doc reads. The audit is not consumed by builds, deploys, or code — its only contract is factual accuracy against the tree.
