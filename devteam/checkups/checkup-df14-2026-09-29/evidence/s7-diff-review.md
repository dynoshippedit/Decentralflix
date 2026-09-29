# S7 — post-fix diff review (docs-vs-tree)

git status / git diff --stat reviewed after the fix. Changed files:
- apps/frontend/app/dashboard/page.tsx (1 line)
- apps/frontend/app/demo/page.tsx (1 line)
- packages/contracts/scripts/deploy.ts (1 line)
- DEPLOYMENT_CHECKLIST.md (pre-existing uncommitted rewrite from the earlier
  session, per Dino's decision; not part of this change, left untouched)

Docs-vs-tree check: the new dashboard footnote and demo card now state the
immutable 75/25 split, matching RevenueSplitter.sol (PLATFORM_FEE_BPS =
2500), the four viewer-payment contracts, and the rewritten
DEPLOYMENT_CHECKLIST.md. No stale 30% / adjustable / withdraw language
remains anywhere in apps/frontend (repo-wide grep clean). The deploy script
now type-checks and its verify step matches the parameterless constructor.

No other source file changed. Coverage unit digests are current.
