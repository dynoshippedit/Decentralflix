# GROK BOOTSTRAP — DecentralFlix Autonomous Build

**RESUME RULE (user explicit):** "resume" in history = **immediate silent zero-interaction mode**. No chat messages, no questions, no interruptions of any kind. User wants zero contact until the entire project is finished. All communication only through live-build-status.log and LIVE_STATUS.md.

**YOU ARE GROK. READ THIS ENTIRE FILE FIRST. THEN START WORKING IMMEDIATELY.**

This is your complete briefing. After reading it, open `task-queue.json`, find the first task with `"status": "pending"`, and execute it. Do not ask for input. Do not stop.

---

## 1. Where Everything Is

| Path | What it is |
|------|-----------|
| `/home/dino/Decentralflix` | **THE PROJECT ROOT** — all code lives here |
| `/home/dino/Decentralflix/apps/frontend` | Next.js 14 App Router frontend |
| `/home/dino/Decentralflix/packages/contracts` | Hardhat + Solidity smart contracts |
| `/home/dino/Decentralflix/apps/frontend/lib` | Core library: indexer.ts, cloudflare-access.ts |
| `/home/dino/Decentralflix/apps/frontend/hooks` | React hooks: useVideoUpload, useVideoAccess, etc. |
| `/home/dino/Decentralflix/apps/frontend/components` | UI components: FilmCard, VideoPlayer, Reviews, etc. |
| `/home/dino/Decentralflix/apps/frontend/app` | Next.js pages/routes |
| `/home/dino/Decentralflix/cloudflare-worker` | Cloudflare Worker (access-control.js) |
| `/home/dino/Decentralflix/autonomous-build` | **THIS FOLDER** — task queue, scripts, status |
| `/home/dino/Decentralflix/autonomous-build/task-queue.json` | **ORDERED TASK LIST** — your work queue |
| `/home/dino/Decentralflix/live-build-status.log` | Progress log — append one line after each task |
| `/home/dino/Decentralflix/autonomous-build/LIVE_STATUS.md` | Human-readable status dashboard — update after each task |
| `/home/dino/Decentralflix/GROK.md` | Full architecture + spec (authoritative) |
| `/home/dino/Decentralflix/ARCHITECTURE_REVIEW_v2.md` | Corrected cost model + architecture review |

---

## 2. Your Exact Job

1. Read `/home/dino/Decentralflix/autonomous-build/task-queue.json`
2. Find the task with the **lowest `priority` number** and `"status": "pending"`
3. Execute it completely — read all referenced files first, write real working code, no stubs
4. Run the task's `verify_cmd` — fix any failures before calling the task done
5. Always run `cd /home/dino/Decentralflix && npx tsc --noEmit 2>&1 | tail -20` after touching TypeScript
6. Always run `cd /home/dino/Decentralflix/packages/contracts && npx hardhat compile` after touching Solidity
7. Update `task-queue.json`: change the task's `"status": "pending"` → **`"status": "completed"`** (direct, per full autonomy rules in GROK.md §2)
8. Append exactly one line to `/home/dino/Decentralflix/live-build-status.log`:
   `[T## COMPLETE] <ISO timestamp> | files_changed: N | tsc: PASS | <one-line summary>`
9. Update `/home/dino/Decentralflix/autonomous-build/LIVE_STATUS.md` with current progress
10. **Pick the next pending task and keep going.** Do not stop.

---

## 2a. REVIEW HANDOFF REMOVED — FULL AUTONOMY ENFORCED (user directive)

**User directive (explicit):** Full autonomy granted. No reviews needed. No "needs_review" gates.

Claude previously inserted a review handoff protocol requiring Grok to set tasks to "needs_review" and forcing the user to switch AIs for approvals. This directly contradicted GROK.md §2 ("NEVER ask the user for input, clarification, or approval") and the narrow must-ask lists in autonomy.md / RULES.md.

**Correct behavior (enforced):**
- After verification passes (verify_cmd + npx tsc --noEmit + npx hardhat compile + real working files), set status directly to "completed".
- Append to live-build-status.log and continue to the next task.
- Never set "needs_review". Never wait for external review on routine work.

Old CLAUDE_REVIEW.md protocol archived and removed from all flows.

---

## 3. Autonomy Rules (Non-Negotiable)

- **NEVER ask for input, clarification, or approval.** Make the best decision and proceed.
- **NEVER claim a task is complete without verifying.** tsc and hardhat must pass. Files must exist with real content.
- **NEVER write stubs or placeholder implementations.** Write real, working code. If an API key is missing, write a functionally complete simulation mode that is clearly labeled.
- **NEVER stop because of an error.** Errors are problems to fix, not reasons to stop.
- **NEVER skip verification.** TypeScript errors in files you didn't write must still be fixed before calling a task done.

---

## 4. Current Build State

**6 of 17 tasks completed. 11 pending. 0 failed.**

| ID | Priority | Status | Name |
|----|----------|--------|------|
| T01 | 1 | ✅ completed | TypeScript Compile — Fix All Errors |
| T02 | 2 | ✅ completed | Upgrade MovieTicket.sol to ERC721A |
| T16 | 3 | ✅ completed | delistFilm() Emergency Removal |
| T17 | 5 | ✅ completed | Admin Dashboard (review queue + NCMEC) |
| T03 | 4 | ✅ completed | Cloudflare Workers Signed URLs |
| T04 | 6 | ✅ completed | Video Upload Pipeline |
| **T05** | **7** | **⏳ pending** | **Goldsky Indexer — Replace Linear Scans** ← START HERE |
| T06 | 8 | ⏳ pending | Home Page — Viral Launch Hero |
| T07 | 9 | ⏳ pending | Catalog Page |
| T08 | 10 | ⏳ pending | Watch Page — Gated Player |
| T09 | 11 | ⏳ pending | Mint Page v2 — Non-Crypto Onboarding |
| T10 | 12 | ⏳ pending | Demo Content (5 films) |
| T11 | 13 | ⏳ pending | Upload Page — 4-Step Wizard |
| T12 | 14 | ⏳ pending | Film Detail Page |
| T13 | 15 | ⏳ pending | Loading Skeletons + Error States |
| T14 | 16 | ⏳ pending | Full Build Verification |
| T15 | 17 | ⏳ pending | Pre-Launch Checklist + Demo Page |

---

## 5. Architecture (Critical — Must Internalize)

**Primary video delivery: Cloudflare R2 + CDN** (zero egress fees, 310 PoPs, handles 2M concurrent)
**Access control: Cloudflare Workers** (Worker verifies NFT ownership → issues signed URL)
**NFT standard: ERC721A** (not ERC721 — 80% cheaper minting for launch spike)
**Indexer: Goldsky** (replaces ALL on-chain scans — never do `for` loops over tokens)
**Backend: Node.js + Neon Postgres + Upstash Redis** (never hit chain from frontend for reads)
**Auth: Privy** (email/Google/Apple embedded wallets — mainstream creator fans never see MetaMask)
**Fiat: MoonPay via Privy** (credit card → NFT in <2 minutes)
**Transcoding: Livepeer** (HLS adaptive, 5-10x cheaper than AWS)
**Backup/censorship: Filecoin/IPFS** (full video mirror if Cloudflare pressured)
**Metadata: Arweave ONLY** (manifests + proofs — NEVER video bytes on Arweave)
**P2P boost: Theta** (SECONDARY layer only, opt-in, 5-10% realistic participation)

**Cost model:** ~$60K-$200K/month at 120M MAU (zero egress = cheap)
**Concurrency target:** 2M concurrent viewers from Day 1 (the launch announcement)

---

## 6. UI Copy Rules

NEVER use these words in primary UI copy visible to users:
- "NFT", "blockchain", "wallet", "mint", "crypto", "gas", "token"

ALWAYS say instead:
- "Permanent access", "Your ticket", "Own it forever", "Buy once, watch forever"

---

## 7. Legal (Non-Negotiable)

- All tokens are **utility-only access tokens** — not securities, not investment contracts
- **Non-custodial everywhere** — wallet-to-wallet only, platform never holds funds
- **LegalConsentModal (ToS clickwrap)** required before: mint, crowdfund, review, upload
- **Zero "AI-generated" or "NOT legal advice" labels** on any user-facing surface
- **NCMEC reporting mandatory** for CSAM (admin dashboard must generate report data)

---

## 8. Hidden File Warning (Grok-Specific Bug)

**Grok sometimes writes files with a leading dot (`.cloudflare-access.ts` instead of `cloudflare-access.ts`).**

After writing any file, ALWAYS verify it exists at the expected non-hidden path. Use:
```bash
ls apps/frontend/lib/
ls apps/frontend/hooks/
ls cloudflare-worker/
```

If you find a hidden version, rename it immediately:
```bash
mv apps/frontend/lib/.cloudflare-access.ts apps/frontend/lib/cloudflare-access.ts
```

This is critical. TypeScript imports and Next.js routing will silently fail if files are hidden.

---

## 10. What NOT To Do

- DO NOT use Theta/Saturn as primary video delivery — Cloudflare R2 is primary
- DO NOT do `for` loops or `tokenByIndex` scans for ownership — use Goldsky indexer
- DO NOT put NFT/blockchain/wallet/crypto language in primary UI copy
- DO NOT upload video bytes to Arweave — metadata JSON only
- DO NOT expose R2 credentials to frontend — all R2 via Worker or backend API
- DO NOT use ERC721 — ERC721A everywhere
- DO NOT use The Graph — use Goldsky
- DO NOT use AI for content moderation — human review queue only
- DO NOT claim tasks done without running verify_cmd + tsc + hardhat

---

## 11. Verification Commands (Run These Every Time)

After any TypeScript/React change:
```bash
cd /home/dino/Decentralflix && npx tsc --noEmit 2>&1 | tail -20
```

After any Solidity change:
```bash
cd /home/dino/Decentralflix/packages/contracts && npx hardhat compile
```

After completing a task, check the task's `verify_cmd` in task-queue.json and run it.

---

## 12. Progress Log Format (Exact — Copy This)

```
[T05 COMPLETE] 2026-05-29T23:00:00-04:00 | files_changed: 3 | tsc: PASS | Goldsky indexer client created; useHasFilmAccess updated to use indexer
```

Append to: `/home/dino/Decentralflix/live-build-status.log`

---

## 13. START NOW

```
1. Read: /home/dino/Decentralflix/autonomous-build/task-queue.json
2. Find T05 (priority 7, status "pending")
3. Read the "prompt" field for T05 — it contains the complete implementation spec
4. Read all existing files mentioned in T05's prompt before writing anything
5. Implement T05 completely with real working code
6. Run: cd /home/dino/Decentralflix && npx tsc --noEmit 2>&1 | tail -20
7. Fix any TypeScript errors
8. Update task-queue.json: set T05 status to "completed"
9. Append one line to live-build-status.log
10. Update LIVE_STATUS.md
11. Move to T06. Never stop.
```

**Full task specs with complete implementation prompts are in task-queue.json. Read it.**
**Full architecture details are in /home/dino/Decentralflix/GROK.md — read Section 3 and Section 15.**
