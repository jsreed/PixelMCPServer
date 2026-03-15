# Implement Task $ARGUMENTS

You are executing the `/work` command for task **$ARGUMENTS** from the PixelMCPServer implementation plan. Follow the 5 steps below in order. Do not skip steps.

---

## Step 1: Understand the Task

Read the implementation plan and design spec to fully understand what needs to be built.

1. Read `docs/implementation-plan.md`. Find all **unchecked** (`- [ ]`) tasks matching `$ARGUMENTS`:
   - If `$ARGUMENTS` matches a specific task number (e.g., `8A.1.1`), work on that single task.
   - If `$ARGUMENTS` matches a parent number (e.g., `8A.1`), include **all unchecked sub-tasks** under it (e.g., `8A.1.1`, `8A.1.2`, ...).
   - If `$ARGUMENTS` matches a section (e.g., `8A`), include **all unchecked tasks** in that entire section.
2. Read the relevant sections of `docs/design.md` — tasks reference them with `[design §X.Y]` notation.
3. Read existing source files that will be modified or that the new code depends on.
4. Produce a clear summary of:
   - What needs to be built
   - Which files to create or modify
   - Dependencies on existing code
   - Acceptance criteria from the implementation plan

If no unchecked tasks match `$ARGUMENTS`, tell the user and stop.

---

## Step 2: Plan with Opus

Spawn an **Opus 4.6 Plan agent** to design the implementation.

Use the Agent tool with:
- `model: "opus"`
- `subagent_type: "Plan"`

In the agent prompt, include:
- The task descriptions and acceptance criteria from Step 1
- Relevant design spec sections (quote or summarize key requirements)
- Existing code patterns and file paths discovered in Step 1
- The coding standards from CLAUDE.md (TypeScript strict, ESM with .js extensions, indexed color, command pattern for undo/redo, import layering rules, etc.)

The agent should return a concrete implementation plan: files to create/modify, functions to write, types to define, tests to include, and the order of operations.

---

## Step 3: Implement with Sonnet (+ Quality Checks)

Spawn a **Sonnet 4.6 implementation agent** to execute the plan from Step 2 **and** run quality checks before returning.

Use the Agent tool with:
- `model: "sonnet"`
- `mode: "auto"`

In the agent prompt, include:
- The full implementation plan from Step 2
- Key coding standards: `.js` import extensions, `interface` for data / `type` for unions, no `any`, `console.error` not `console.log`, Zod schemas for tool validation, command pattern for mutations, indexed color everywhere, colocated `*.test.ts` files
- Explicit instruction to write both implementation code AND tests

For larger tasks with 3+ independent sub-tasks, consider spawning multiple Sonnet agents in parallel (one per independent sub-task) to speed up implementation.

**Quality checks (must be done inside the same agent):** After writing all code, the agent must run a fix-and-retry loop — up to 3 attempts:

For each attempt:
1. `npm run format` — auto-fix formatting
2. `npm run lint` — check for lint errors; fix any that appear
3. `npm run typecheck` — check for type errors; fix any that appear
4. `npm run test` — run the test suite; fix any failing tests

If all four pass, the agent is done. If after 3 full attempts there are still failures, the agent should report the remaining errors in its response.

---

## Step 4: Review with Opus

Spawn an **Opus 4.6 code review agent** to verify the implementation.

Use the Agent tool with:
- `model: "opus"`
- `subagent_type: "superpowers:requesting-code-review"`

In the agent prompt, include:
- The git diff of all changes (`git diff` output)
- The original task requirements from Step 1
- The implementation plan from Step 2

The reviewer should check for:
- Correctness — does the code fulfill the task requirements?
- Completeness — are all sub-tasks addressed? Are tests included?
- Quality — does it follow CLAUDE.md standards? Import layering? No `any`?
- Edge cases — are bounds checked? Are errors handled with the shared error factory?

If the reviewer identifies issues that need fixing:
1. Fix the issues
2. Run quality checks (`npm run format && npm run lint && npm run typecheck && npm run test`)
3. Re-run Step 4 (review) — but only once to avoid infinite loops

---

## Step 5: Mark Tasks Done

Edit `docs/implementation-plan.md` to mark all completed tasks:
- Change `- [ ]` to `- [x]` for each task that was implemented
- Do NOT mark tasks that were already checked or that were not part of this work

---

## Summary

After all steps complete, provide a brief summary:
- Which tasks were completed
- What files were created or modified
- Any notable decisions or trade-offs made
- Any issues the user should be aware of
