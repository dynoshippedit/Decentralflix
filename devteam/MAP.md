# MAP — as-is codebase map
Owner: MAP (Cartographer) · Last updated: 2026-09-29 (skeleton — Cartographer to fill in Phase 1)
1. Summary — what this system is, in one paragraph
   - (Cartographer to write)
2. Stack & versions
   - (see PLAYBOOK B3; BLD to pin exact versions in BASELINE)
3. Directory tree (annotated)
   - (Cartographer to write)
4. Entry points & processes (how it starts, ports, scenes, jobs, scripts)
   - (Cartographer to write)
5. Module map (Mermaid) + notable coupling, cycles, god modules
   - (Cartographer to write)
6. Data stores & models (where each is written/read)
   - (Cartographer to write)
7. External services (and where each is called)
   - (Cartographer to write)
8. Inputs (sources) & outputs (sinks) — trust boundaries
   - (Cartographer to write)
9. Config & env (summary — full inventory in notes/env-inventory.md)
   - (Cartographer/BLD to write)
10. Critical flows (links to notes/flows/*)
    - filmmaker onboarding → upload → listing
    - viewer browse → purchase (test purchase + signed receipt) → stream 206 playback
    - pass create/redeem
    - Vimeo import → claim/approve
    - subscription purchase
    - payout/withdrawal
11. Oddities — duplicates, orphans, references to missing files
    - Hardhat build output (artifacts/, cache/, typechain-types/) is tracked in git — hygiene issue, BLD to confirm
