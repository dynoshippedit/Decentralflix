# S0 — scope and reality freeze (checkup-df13-2026-09-29b)

## Amendment record
Revision b of checkup-df13-2026-09-29 (prior record retained at
devteam/checkups/checkup-df13-2026-09-29/). Reason: the frozen r1 spec defined
check-drift-refusal argv as ["bash", "devteam/checkups/.../drift_refusal.sh"]
with cwd apps/frontend, so the runner resolved the script under apps/frontend
and the baseline attempt failed with exit 127 (file not found). The check
purpose is unchanged; only the argv path was corrected to
["bash", "../../devteam/checkups/checkup-df13-2026-09-29b/scripts/drift_refusal.sh"]
(repo-root-relative from the check cwd). r1 receipts are NOT reused; all four
baseline checks are re-run under this revision.

## Selected program
Decentralflix, /home/dino/Decentralflix, branch devteam/review-2026-09-29,
HEAD 277820e (controller acceptance of df-cycle-13). Tree clean, nothing pushed.
Contracts UNAUDITED. No deployment, broadcast, funded key, or production payment.

## Scope: CHANGE checkup
The df-cycle-13 change (commit 76c08f7) plus affected callers, contracts, and
workflows:
- TicketNFT.sol now splits mint payments 75/25 via the shared RevenueSplitter
  (owner decision 2026-09-29: no exceptions).
- Frontend ABI regenerated; payPerView.ts rewritten; useMovieTicket.ts and
  config.ts updated; mint/page.tsx stale 30% default removed.
- New ABI-drift guard (abi-drift.test.ts) + export-abi.ts pipeline.
- Notes/whitepaper/questions updated (superseded banners, Q-df12-001 resolved).

Not in scope: In The Red (mid-playtest, read-only constraint), HypeLab,
Music Scene API, lifeboat app (no TicketNFT usage; ABI surface changed only by
addition of RevenueSplitter members).

## Requirements / invariants under review
1. One rule everywhere: every viewer-payment contract splits 75/25 through the
   single immutable RevenueSplitter (PLATFORM_FEE_BPS=2500, no setter).
2. Creator receives msg.value - fee (rounding remainder favors creator).
3. Zero creator reverts (MissingCreator); never falls back to owner.
4. Owner cannot redirect funds or change the split.
5. Frontend ABI exactly matches compiled artifacts (drift guard).
6. Exact payment enforced at mint; free mints skip transfers; nothing accrues.

## Review units (6) and lenses
- contract-ticketnft: TicketNFT.sol + TicketNFT.test.ts — COR ARC TST DOC SEC DAT DOM
- contract-splitter: RevenueSplitter.sol — COR ARC TST DOC SEC DAT DOM
- frontend-wrappers: payPerView.ts/.test.ts, useMovieTicket.ts, config.ts — COR ARC TST DOC API
- frontend-mint-page: app/mint/page.tsx — COR ARC TST DOC UIX
- abi-pipeline: abi-drift.test.ts, export-abi.ts, packages/contracts/package.json — COR ARC TST DOC BLD
- docs-payout: payout-math.md, flows/payout-withdrawal.md, contracts.md,
  WHITEPAPER.md, QUESTIONS.md — COR ARC TST DOC

## Checks (behavior-bearing)
- check-hardhat: npx hardhat test (packages/contracts) — split behavior.
- check-frontend: npm test (apps/frontend) — suite incl. drift guard.
- check-tsc: npx tsc --noEmit (apps/frontend) — type consistency.
- check-drift-refusal: tamper-then-restore script proving the guard fails on a
  stale ABI (exits 0 only on observed refusal).

## Registry / task context consulted
~/workspace/MUSE_TASK_QUEUE.md (queue head), ~/MEMORY.md (df-cycle-13 verified
state; checkup wired into kit as ENTRYPOINT step 6 on 2026-09-29). In The Red
excluded by the live-playtest constraint in the dispatch; Decentralflix
df-cycle-13 is the active change per the S0 selection rule.
