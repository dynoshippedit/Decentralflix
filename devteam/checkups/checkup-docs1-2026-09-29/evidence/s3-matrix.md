# S3 — Review matrix: audit-correction (1 unit x 4 lenses)

## DOC — product truth: PASS
- The correction note is dated (2026-09-29), labeled (DOCS-1), and explains the supersession: platformFeeBps -> RevenueSplitter (PLATFORM_FEE_BPS=2500, immutable, no setter, remainder to creator, MissingCreator revert, no owner withdraw).
- Both stale lines are marked inline with "(was platformFeeBps — see correction note)".
- Original audit claims preserved: header Date 2026-09-28 / commit ccf762c intact; no silent rewrite; the note explicitly quotes the superseded mentions and keeps them attributable.

## COR — correctness: PASS
- Every factual claim in the note is traced to the tree (see S7): RevenueSplitter.sol:33 constant 2500; :61-62 floor division with remainder to creator; :39,:59 MissingCreator revert; zero `platformFeeBps` hits across contracts/*.sol; zero withdraw functions in the four viewer-payment contracts; all four inherit RevenueSplitter.
- The note's "see correction note" cross-references resolve: lines 66 and 87 both carry the marker.

## ARC — architecture: PASS
- The historical record stays coherent: dated audit untouched in substance, correction layered as an attributable annotation. Readers cannot mistake the 2026-09-28 claims for current mechanics because the note intercepts at the header.

## TST — NOT_APPLICABLE (explained)
- No test harness exists for a Markdown audit; a passing/failing test suite cannot verify prose-to-tree correspondence. The equivalent falsification evidence is command receipts: check-doc-diff (only intended edits), check-spec-match (byte-identical to the spec-fixed copy), check-onchain-truth (zero stale state vars, constant present).

No new findings in the matrix pass. The S-1/S-2 staleness was the known defect under treatment, already corrected per spec.
