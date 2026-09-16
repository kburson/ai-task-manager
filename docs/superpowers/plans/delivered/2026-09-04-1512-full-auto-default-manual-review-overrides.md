# Full-Auto Default and Manual Review Overrides Implementation Plan (#1512)

> **Execution:** Serial in the current issue worktree. The user explicitly requested Full-Auto delivery; no subagents are used for this task.

**Goal:** Make Full-Auto the default while adding independent manual plan, PR-code, and final-task review controls.

**Architecture:** Extend the existing session/project gate resolver, then insert exact-head human PR approval between required CI and merge-intent creation. Keep natural-language interpretation in the shared task skill and enforce authority in runtime code.

**Tech Stack:** Node.js ESM, Node test runner, GitHub CLI/GraphQL, existing AITM lifecycle and provider-action primitives.

---

### Task 1: Default and session policy

**Files:**

- Modify: `scripts/task-tracker/config.mjs`
- Modify: `scripts/task-tracker/lib/gate-resolve.mjs`
- Modify: `scripts/task-tracker/lib/session-store.mjs`
- Modify: `scripts/task-tracker/verbs/auto.mjs`
- Modify: `scripts/task-tracker/verbs/switch.mjs`
- Test: `scripts/tests/unit/task-tracker/lib/auto-mode.test.mjs`

- [ ] Add failing tests for three false defaults, legacy hydration, additive manual/auto choices, reset, and precedence.
- [ ] Run the focused test and confirm the expected failures.
- [ ] Implement `pullRequestReview`, Full-Auto defaults, additive choices, and retired first-bind prompt.
- [ ] Run the focused test green.

### Task 2: Exact-head human PR-review policy

**Files:**

- Create: `scripts/task-tracker/lib/manual-code-review.mjs`
- Create: `scripts/tests/unit/task-tracker/lib/manual-code-review-delivery.test.mjs`

- [ ] Add failing pure tests for eligible human identity, author/bot refusal, assignment-not-approval, exact-head approval, stale head, and latest review state.
- [ ] Implement immutable policy parsing and diagnostics.
- [ ] Run the focused tests green.

### Task 3: Delivery integration and reviewer request

**Files:**

- Modify: `scripts/task-tracker/lib/delivery-preflight.mjs`
- Modify: `scripts/task-tracker/verbs/deliver.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/manual-code-review-delivery.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/verbs/deliver.test.mjs`

- [ ] Add failing orchestration tests for required-CI-first ordering, one idempotent request, no intent/action while waiting, and merge action after current approval.
- [ ] Fetch author, requested reviewers, and review commit evidence; resolve the configured reviewer.
- [ ] Request an eligible reviewer through the governed verb and return a distinct prompt result.
- [ ] Preserve the existing provider-action path byte-for-byte after authorization.
- [ ] Run focused delivery tests green.

### Task 4: Help, skill, and user documentation

**Files:**

- Modify: `scripts/task-tracker/verbs/help-data.mjs`
- Modify: `scripts/task-tracker/lib/command-surface/catalog.mjs`
- Modify: `skill/shared/router.md`
- Create: `skill/shared/rules/full-auto.md`
- Modify: `skill/adapters/codex/SKILL.md`
- Modify: `skill/adapters/claude/SKILL.md`
- Modify: `skill/adapters/grok/SKILL.md`
- Modify: `docs/guides/workflow.md`
- Modify: `docs/guides/parallel-agents.md`
- Modify: `docs/guides/settings-guide.md`
- Create: `scripts/tests/unit/task-tracker/core/full-auto-default-doc.test.mjs`

- [ ] Add a failing documentation contract test for all phrases and boundaries.
- [ ] Document defaults, additive combinations, reviewer eligibility/freshness, and reset.
- [ ] Teach every adapter to translate the natural-language requests without prompting.
- [ ] Run help and documentation contract tests green.

### Task 5: Verification and lifecycle evidence

- [ ] Run the issue's targeted verification command.
- [ ] Run `npm run lint` and `npm run format:check`.
- [ ] Run `npm test` and `npm run test:slow`.
- [ ] Review `origin/trunk...HEAD` for regressions and exact issue scope.
- [ ] Stamp and tick each acceptance criterion and Functional DoD item from actual command receipts.
- [ ] Squash to one `[#1512]` candidate commit, reverify the exact SHA, then drive Test, Review, provider delivery, receipt, and close.
