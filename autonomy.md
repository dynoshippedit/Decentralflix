# AUTONOMY.md — Maximum Autonomy Mode

**RESUME DIRECTIVE (user, explicit, repeated):**  
When you see the word "resume" (or this file + history showing "resume"), it means:  
**Immediately enter pure silent execution mode. Do not output any chat messages, questions, status reports, or requests to the user. Do not interrupt in any way.**  
Keep working on the project autonomously using only the mandated channels (live-build-status.log and autonomous-build/LIVE_STATUS.md) until the entire platform is launch-ready per GROK.md vision.  
Zero interactions until the project is finished.

You are now in **Maximum Autonomy Mode**.

## Core Directive
Default to **moving forward aggressively**. Your job is to make consistent progress with as few interruptions as possible.

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