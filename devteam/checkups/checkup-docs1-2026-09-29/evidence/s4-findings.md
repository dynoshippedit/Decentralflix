# S4 — Findings

No NEW confirmed defects, supported improvements, or hypotheses. One known defect was under treatment and is verified corrected:

- CONFIRMED_DEFECT (pre-existing, from DOCS-1 sweep): docs/PHASE2_AUDIT.md contained two stale `platformFeeBps` passages (S-1 :56 repo map, S-2 :77 MovieTicket function surface) describing a fee-admin field that no longer exists after df-cycle-12/13.
  - Counter-evidence captured: `git show HEAD:docs/PHASE2_AUDIT.md` contains the two UNMARKED stale lines at :56 and :77 and zero "Correction note" occurrences — the defect was real, not an artifact of the diff.
  - Sibling sweep (from the spec, already performed by the steward): WHITEPAPER.md, DEPLOYMENT_CHECKLIST.md, README.md, REPUTATION_LIMITATIONS.md, docs/legal/, and nested READMEs are clean — no other stale fee language. Out-of-scope incidentals (ARCHITECTURE_REVIEW_v2.md:242-243, marker.md:223) remain flagged elsewhere and are not this task's lane.

Rejected leads: none arose during this checkup — the change is 14 insertions / 2 deletions of prose.
