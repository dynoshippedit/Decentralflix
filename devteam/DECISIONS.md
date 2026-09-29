# DECISIONS

### D-001 · Review program launched for Decentralflix on devteam/review-2026-09-29, no push — 2026-09-29 · LEAD
- Context: Owner dispatched the AI dev team review kit (MASTER_PROMPT.md) for Decentralflix with explicit corrections: repo exists at /home/dino/Decentralflix; profile built from scratch; push target NONE.
- Options considered: (a) work on main directly; (b) feature branch with no push.
- Decision & why: (b). The Playbook (B15) forbids committing to the default branch; the owner set push target NONE. All commits stay local on devteam/review-2026-09-29.
- Consequences: REPORT.md/QUESTIONS.md delivered via the agent handoff, not via git push.

### D-002 · Specialists activated: STR + W3B + MUS (+ all core roles) — 2026-09-29 · LEAD
- Context: P3 card says activate STR; add W3B if contracts/wallets/IPFS present; apply MUS money checks to creator payouts. Recon found all three present (10 .sol contracts, ethers v6 wallet layer, storage module, payout math in PayPerView + pricing.ts).
- Decision & why: activate all three. AIX not activated — no LLM features found in recon; DOC to confirm during claims audit.
- Consequences: W3B owns the "is paid content actually protected?" crown-jewel check; MUS owns 75/25 split consistency.

### D-003 · Contracts treated as unaudited in the report — 2026-09-29 · LEAD
- Context: Owner correction states contracts are UNAUDITED; no Slither/Aderyn output exists in the repo.
- Decision & why: BLD will attempt static analysis (slither if installable without spend); regardless, the final report will state UNAUDITED plainly.
- Consequences: no audit claims in REPORT.md beyond what this run actually executes.

### D-004 · Accept MAP's CJ1 refinement: encryption module exists but is unwired — 2026-09-29 · LEAD
- Context: MAP-010 found packages/storage (AES-256-GCM fragments) has zero importers outside its own tests; lifeboat serves unencrypted masters behind entitlement checks. DOC-001 found the legal page claiming 'audited smart contracts' protection.
- Decision & why: accept the refinement. Crown jewel 1 now reads: 'paid/token-gated content actually protected — note: encrypted-fragment module exists but is NOT wired into the lifeboat serving path; current protection is entitlement checks on unencrypted masters.' This is the honest protection story for W3B/STR to review in Phases 2-3.
- Consequences: W3B's 'is paid content actually protected?' check must evaluate the entitlement-check path as the real gate, not the storage module.
