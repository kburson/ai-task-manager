# Codex skills read scope implementation plan

> For agentic workers: execute the checked steps in order. Preserve issue #1831 binding and AITM gates.

**Goal:** Let the packaged Bash guard read extracted absolute files below the mirrored Codex skills directory without opening unrelated provider data or write access.

**Architecture:** Keep the existing command scanner and write-first decision flow. Add one narrow, lexical read predicate for the Codex skills subtree, requiring both the original path token and its normalized path to remain inside that subtree. Retain every existing read root unchanged.

**Tech Stack:** Node.js 26 ESM, native node:test, AITM Bash PreToolUse hook.

**Spec:** docs/superpowers/specs/2026-09-27-1831-codex-skills-read-scope-design.md

## Global constraints

- The new read scope is only descendant files under homedir()/.codex/skills.
- The bare skills directory stays blocked.
- Recognized writes under provider homes stay blocked.
- Preserve current lexical scanner limits and fail-closed behavior.
- The issue VC1 has been replaced through the governed issue-body verb before implementation.

## Review focus

- A path token that starts under skills but normalizes outside it must block.
- A sibling of skills must block even though it shares a string prefix.
- A normalized path that stays inside skills may pass.
- A recognized write to a skills file must block before the read allowance is considered.
- An internal guard error must still emit a block decision and nonzero exit.

## Story Intent

- **Beneficiary:** a developer using a Codex worktree
- **Capability:** load mirrored Superpowers skill files through the Bash hook
- **Need:** AITM currently refuses the read required by its own Codex bootstrap
- **Value or failure prevented:** Codex follows startup instructions while provider-home write restrictions remain in force

## Plan Metadata

- Priority: P1
- Size: S
- Estimate: 3 hours
- Labels: bug

## Task 1: Add a strict subprocess regression suite

**Files:**

- Create: scripts/tests/integration/task-tracker/core/bash-guard-codex-skills.test.mjs
- Read: scripts/tests/integration/task-tracker/core/bash-guard-tmp-contract.test.mjs
- Read: scripts/task-tracker/bash-guard.mjs

**Interfaces:**

- Input is JSON on guard stdin with tool_input.command.
- Allowed result is exit 0 with empty stdout.
- Policy block is exit 0 with parseable JSON containing decision "block" and an expected reason.
- The test must spawn the real guard but never execute its simulated command.

- [ ] Step 1: Create an issue-tagged test suite with a subprocess helper. Derive the skills path with join(homedir(), ".codex", "skills"). Set an unbound AI_TASK_MANAGER_SESSION_ID in child env. Assert exit code, stderr, and exact JSON shape; do not treat malformed JSON as an allow result.
- [ ] Step 2: Add failing cases for nested sed and cat reads, a normalized in-tree read, and the read refusal diagnostic. Add passing negative cases for a sibling, config file, traversal outside skills, bare directory, and touch/tee/redirection writes. Preserve representative project scratch, Claude read, system read, and system temporary path decisions.
- [ ] Step 3: Run node --test scripts/tests/integration/task-tracker/core/bash-guard-codex-skills.test.mjs. Confirm the new read cases fail for the missing allowance and existing negative cases pass. If any failure comes from test setup or malformed parsing, repair the test before production edits.

## Task 2: Add the narrow read allowance

**Files:**

- Modify: scripts/task-tracker/bash-guard.mjs

**Interfaces:**

- codexSkillsDir = join(homeDir, ".codex", "skills")
- isCodexSkillsRead(p) returns true only when p starts with codexSkillsDir + "/" and resolve(p) starts with the same prefix.

- [ ] Step 1: Derive codexSkillsDir beside claudeDir. Add isCodexSkillsRead near READ_ALLOWED; keep WRITE_ALLOWED and existing read roots unchanged.
- [ ] Step 2: In the read loop, block only when neither an existing READ_ALLOWED prefix nor isCodexSkillsRead(p) matches. Keep the write loop before the read loop.
- [ ] Step 3: Update the header, inline read comment, and refusal text to list the Codex skills read subtree.
- [ ] Step 4: Run the focused suite and confirm all cases pass. Run the existing Bash guard tmp-contract and fail-closed suites alongside it.

## Task 3: Verify and deliver governed evidence

**Files:**

- Check: issue #1831 live body and its VC1 reference.
- Check: git diff and branch codex/1831-codex-skills-read-scope.

- [ ] Step 1: Run the issue VC1 focused command, npm test, npm run test:slow, npm run lint, and npm run format:check. Record exact outcomes; repair any defect caused by this change.
- [ ] Step 2: Self-review against every spec acceptance row, verify no unrelated files changed, and commit with [#1831] in the subject.
- [ ] Step 3: Use AITM evidence and state verbs for Develop, Test, and Review. Request independent code review before claiming completion.
- [ ] Step 4: Use AITM deliver for the PR and exact-head handoff. Keep final human approval and merge separate from SAR semantic acceptance.
