# Side Plan: Fixing the DecentralFlix 7 Specialist Skills

**Date:** 2026-05-30
**Context:** Review of the current SKILL.md files for the 7 specialist agents after multiple iterations.
**Goal:** Make the skills lightweight enough to actually work well with the tool, while preserving the strict hierarchy (Senior Level Director gives steps) and the extreme literal obedience rules.

## Current Problems (Honest Review)

1. **Excessive duplication / bloat**
   - The long "Core Rules (Strict — Never Violate)" section is repeated almost verbatim across all 7 files. This is the single biggest source of weight.
   - Multiple structural sections (When This Skill Activates, Process, Key Rules, Ground Rules, Reference Files) add length even when the actual role-specific content is small.

2. **Over-structured for the use case**
   - The current format follows a generic "professional skill" template too closely.
   - For subordinate specialists whose main job is "execute only the narrow steps given by the Senior Level Director," this level of scaffolding is unnecessary and counterproductive.

3. **Hierarchy is present but diluted**
   - The "Hierarchy Rule" section was added (good), but it is buried inside a lot of other text. The signal that "the Director gives the steps and you only follow those" gets lost in the noise.

4. **Files are still too heavy**
   - User feedback has been consistent: the files are too big for the tool to handle well in the intended multi-agent setup.

## Proposed Fix Plan (Side Plan — Do Not Execute Yet)

### Phase 1: Extract Common Rules
- Create a single shared reference file (e.g. `references/core-rules.md`) that contains the universal literal obedience + autonomy rules.
- Each specialist SKILL.md will reference this file instead of repeating the full block.

### Phase 2: Dramatically Simplify Specialist Skills
For each of the 6 subordinate specialists, reduce the SKILL.md to something like:

- Minimal frontmatter (name + very short description focused on "executes narrow steps from the Senior Level Director").
- Short "Core Mandate" section that emphasizes:
  - Only do the exact steps given by the Senior Level Director in this task.
  - Do not expand scope.
  - Report back to the Director.
- Very short role-specific section (what this expert is good at).
- One clear "Ground Rules" block (ALWAYS/NEVER) focused on the hierarchy and literalism.
- Remove or heavily trim "When This Skill Activates", long Process checklists, and multiple Key Rules sections unless they are truly necessary.

Target: Most specialist skills should be 80–150 lines max (ideally closer to 80–100).

### Phase 3: Strengthen the Senior Level Director
- Make sure the Senior Director persona and any coordinating skill clearly own:
  - Breaking the user's request into specific, narrow steps.
  - Deciding which specialists to involve.
  - Assigning exact steps to each.
- The Director should be the primary interface that then spawns sub-agents with very scoped prompts.

### Phase 4: Remove Redundant Weight
- Cut repetitive language.
- Remove sections that don't add value for this specific "subordinate specialist under a Director" model.
- Keep only what is actually needed for the model to behave correctly when spawned as a sub-agent.

### Phase 5: Validation
- After rewriting, test invocation via `spawn_subagent` with the Senior Director persona + one or two specialists.
- Verify that the files feel light and the hierarchy is obvious in practice.
- Get explicit user sign-off before considering the fix complete.

## Priority Order (Recommended)

1. Extract common Core Rules to a shared reference file (biggest immediate win on bloat).
2. Rewrite the 6 subordinate specialist skills to be much shorter and Director-centric.
3. Review and tighten the Senior Level Director persona + any coordinating skill.
4. Clean up any remaining repetition or unnecessary sections.
5. Test the new lighter versions in actual spawn_subagent usage.

## Notes / Constraints from User

- Do not make changes to the actual skills until this plan is reviewed and approved.
- The primary goal is **lightweight + functional** over "looks like a complete professional skill."
- The hierarchy (Senior Level Director gives the steps) must be extremely clear and front-and-center.
- Avoid "retarded baby" over-engineering.

---

This plan is set aside for discussion. No changes will be made to the existing files until explicitly directed.