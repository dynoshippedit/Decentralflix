# IDEAS — opportunities, not defects
(none yet — anyone may add; never mixed into the ledger)

## IDEA-001 — Docs versioning policy: one canonical state + dated archive (from DOC-004)
The repo carries three generations of architecture/business docs (ADR-001 → ARCHITECTURE_REVIEW_v2 → whitepaper/AGENTS.md) that contradict each other on fees, phase, and cost models. Opportunity: adopt the pattern AGENTS.md already uses ("research PDFs win") as a repo-wide rule — one `docs/STATUS.md` stating the canonical source per topic, with superseded docs moved to `docs/archive/` carrying a banner naming their replacement. Prevents the next agent from following the wrong generation.

## IDEA-002 — "Custody map" diagram for the legal review (from DOC-001/DOC-002)
A one-page diagram showing exactly where funds sit at each step of each flow (TicketNFT mint: buyer→filmmaker direct; PPV: buyer→contract escrow→withdraw; platform fees: contract accrual→owner withdraw; receipts: off-chain). The whitepaper's legal posture (§8, §13-14) would be stronger with this picture than with the current "wallet-to-wallet" shorthand, and it gives counsel a concrete artifact to react to before any testnet deploy.

## IDEA-003 — Extend the copy-honesty test from frontend to docs/ (from DOC-004)
`apps/frontend/lib/copy-honesty.test.ts` already guards UI copy against banned perpetuity promises and the 90% share. The same banned-pattern scan could run over `docs/` and `*.md` to catch 70/30 regressions and "permanent access" advice in stale docs. Cheap, high-leverage, matches the project's honesty-policy brand.

## IDEA-004 — Publish the claims-audit as a living honesty artifact (from this DOC pass)
`devteam/notes/claims-audit.md` (Phase 1) is the first doc in the repo that lists every factual claim with a verdict and evidence. Turned into a maintained `docs/CLAIMS.md`, it becomes the proof behind "the protocol's honesty policy applied to its own economics" (whitepaper §6.2) — useful for filmmakers, investors, and counsel, and a differentiator vs. competitors' marketing.

## IDEA-005 — Canonical cost-model decision (from claims-audit C-053)
ADR-001 models ~$5-10M/month at 120M MAU (DePIN hybrid); ARCHITECTURE_REVIEW_v2 models ~$60-200K/month (Cloudflare R2). The two are ~50× apart and both are cited by other docs. Picking the canonical model (or scoping each to its architecture) unblocks honest unit-economics work and removes a contradiction a reviewer will eventually find. Needs Dino's call — logged as a question candidate for QUESTIONS.md.
