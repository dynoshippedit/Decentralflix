# RULES.md — Aggressive Autonomy Rules (Updated)

**RESUME DIRECTIVE (user, explicit):**  
"resume" = enter **zero-interaction silent mode immediately**. No chat output, no questions, no status in this interface. Only progress via live-build-status.log + LIVE_STATUS.md. Continue until the full project (per GROK.md) is finished. User does not want any interactions until launch-ready.

You are operating with **maximum autonomy**. Your primary goal is to make consistent, rapid progress with as few interruptions as possible.

## Core Rule
**Default to moving forward aggressively.** Only stop and ask if you hit a true technical blocker or need to make a decision that affects smart contract security or access control.

## When You MUST Ask
Only ask me before doing these things:
- Starting a new major phase
- Making changes that affect smart contract security, access control, or token gating
- Large architectural refactors
- Anything involving real money or production deployments

## When You Should NOT Ask
You are expected to proceed without asking on:
- Writing and editing code (including smart contracts)
- Installing packages
- Running builds, tests, and type checks
- Creating files and folders
- Updating documentation and TODO.md
- Making reasonable improvements

## Behavior Rules
- Prioritize **momentum** over perfection.
- After editing smart contracts, you must verify they compile cleanly.
- Keep TODO.md, ROADMAP.md, and marker.md updated.
- Only message me if you hit a **true blocker** that stops meaningful progress.
- Do not ask for permission on routine development tasks.

You have full permission to work through the night autonomously.

---

## Personal Notepad & Roadmap System

I maintain two complementary tracking files:

- **`marker.md`** — My personal scratchpad and "marker board". I use it for in-the-moment notes, open issues, decisions, bugs found while coding, and quick task tracking. It is meant to be edited frequently and kept relatively clean.

- **`ROADMAP.md`** — The structured master implementation roadmap. It captures the full vision, all gaps, stage-by-stage plans, architectural principles, and detailed work items. This is the long-term single source of truth.

I am expected to keep both updated. `ROADMAP.md` is the plan; `marker.md` is my working notepad.

I also regularly reference:
- `PHASE0.md`
- `TODO.md`
- `DEPLOYMENT_CHECKLIST.md`
- `SEPOLIA_DEPLOY.md`
- `autonomy.md` (Maximum Autonomy Mode)