# #1841 Worktree Hook Boundary Implementation Plan

> **For agentic workers:** Use the executing-plans workflow to implement this plan task by task. Each checkbox is a separate action; complete the named test before the corresponding production edit.

**Status:** Draft implementation plan; not yet peer reviewed or approved for Develop.

**Goal:** Give agents unrestricted local work within their invoking Git worktree while retaining accurate worktree isolation, governed issue mutations, and author ownership of an active review artifact.

**Architecture:** Resolve the invoking checkout and exact live session independently of fleet recency. Apply a small target-aware boundary only to file tools; let the host sandbox govern Bash process effects. Keep issue, board, evidence, and commit-attribution checks at their governed mutation or publication points, then replace the generated hook set and retire obsolete local activity gates.

**Tech stack:** Node.js 24 or newer, ES modules, node:test, Git linked worktrees, AITM's existing provider hook and installer contracts.

**Spec:** [Accepted #1841 design](../specs/2026-09-28-1841-worktree-hook-boundary-design.md), accepted artifact commit 6ac59f4955aa5a39b3940f02a2c3f25b7f3275de; XPR manifest at docs/peer-reviews-1841-retry/spec/2026-09-29-2026-09-28-1841-worktree-hook-boundary-design-review-2029bf3992ea856fe54a731a3197bd68/review-2029bf3992ea856fe54a731a3197bd68-review-manifest.md. GitHub issue #1841 body version 14 links both.

## Global constraints

- The issue remains Backlog while this draft is written. Do not treat this plan as Plan-stage approval, alter acceptance checkboxes, or create implementation receipts before the governed state walk.
- The physically resolved target's containing Git worktree root must equal the invoking root. Nested linked worktrees, nested fixture repositories, and submodules are different roots even when lexically below the primary checkout.
- Missing exact session authority may block a governed AITM mutation, never contained local work. No fleet newest-record, transcript-mtime, or default-session fallback can authorize a mutation.
- Bash command text cannot prove filesystem confinement. Report the host sandbox capability accurately; do not claim that a regex guards a shell process.
- The file-tool hook is registered only for explicit-target tools. Malformed payloads, missing targets, parser errors, unresolvable roots, and mixed-target patches refuse atomically.
- Captured real Codex and Claude payloads determine the accepted parser keys. Do not infer tool_input.command from an error echo alone. A non-string command alongside a valid patch field is ambiguous and refused.
- Preserve governed issue creation, body, state, approval, protected evidence, and close validators. Keep read-only GitHub inspection available.
- Contained edits to installed AITM scripts and generated hook registrations are allowed intentionally. Doctor reports drift; it is not a security boundary against the local agent.
- The author-only review artifact rule is owned by ai-peer-review. #1841 cannot claim AC12 from a dependency link alone; verify the adopted installed package and a real reviewer fixture.
- Keep unrelated hook edits, backup files, and failed XPR attempts out of every implementation commit. Use exact paths in each commit.
- The accepted spec currently fails Prettier, and the new XPR root is outside the existing markdownlint/Prettier review-output exclusions. Treat these as observed baseline failures: preserve the sealed review response bytes, repair tooling scope explicitly, and do not alter the accepted spec blob without a review-safe successor or an approved formatting disposition.

## File map and sequence

| Unit                  | Production files                                                                                                                       | Responsibility                                                                                                         |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Session authority     | scripts/task-tracker/lib/session-id.mjs, lib/worktree-binding-guard.mjs, lib/bash-worktree-guard.mjs, bash-guard.mjs, task-tracker.mjs | Distinguish exact live identity from diagnostic fallbacks; select only the invoking checkout record for governed work. |
| File targets          | scripts/task-tracker/lib/mutation-context.mjs, lib/apply-patch-targets.mjs, new lib/file-tool-contract.mjs                             | Resolve realpath and nearest owning Git root; parse every explicit target using captured provider shapes.              |
| File hook             | new scripts/task-tracker/file-boundary-guard.mjs and provider adapters                                                                 | Fail closed for known file-tool payloads without lifecycle, owner, or network reads.                                   |
| Publication authority | scripts/task-tracker/verbs/commit-trace.mjs, lib/review-preflight.mjs, verbs/close.mjs, lib/assignee-guard.mjs                         | Validate a claimed issue's owner and attributed commits when evidence is published or accepted.                        |
| Remote guard          | new scripts/task-tracker/remote-mutation-guard.mjs, lib/gh-edit-guard.mjs, lib/gh-project-guard.mjs, lib/aitm-path-guard.mjs           | Preserve narrow direct-mutation warnings without local path or activity classification.                                |
| Installation          | scripts/package/install-content.mjs, install-observer.mjs, doctor.mjs, scripts/task-tracker/hooks/grok-wire.mjs                        | Generate the final provider hook set and report missing or drifted coverage.                                           |
| Retirement            | scripts/task-tracker/activity-guard.mjs, activity-policy.mjs, source-edit-gate.mjs, bash-guard.mjs, affected guidance and tests        | Remove dead stage and source gates only after all replacement tests pass.                                              |

The units above form one migration because removing an old hook before its replacement is installed would break the boundary. Tasks 1 through 5 can be reviewed independently; Task 6 changes the installed contract; Task 7 proves the integrated result and retires the old wiring.

### Task 1: Anchor session and binding to the invoking checkout

**Files:** Modify scripts/task-tracker/lib/session-id.mjs, lib/worktree-binding-guard.mjs, lib/bash-worktree-guard.mjs, bash-guard.mjs, and the governed verb entry in task-tracker.mjs. Extend scripts/tests/unit/task-tracker/lib/worktree-binding-guard.test.mjs and scripts/tests/integration/task-tracker/lib/bash-guard-worktree-binding.test.mjs; create scripts/tests/unit/task-tracker/lib/session-authority.test.mjs.

**Interface:** Add resolveAuthoritativeSessionId({ env, provider }) to session-id.mjs. It returns an exact session string from AI_TASK_MANAGER_SESSION_ID or the active provider's documented key, and throws a named refusal otherwise. Keep resolveSessionId for diagnostic callers. Change resolveCurrentSessionWorktreeBinding({ invokingDir, sessionId }) so it canonicalizes invokingDir once and reads only getActiveTask(sessionId, invokingRoot). Do not scan fleet entries or compare timestamps. Pass payload.session_id from Bash hook calls. Governed verbs call the authoritative resolver before target issue/branch/worktree checks.

- [ ] Write separate failing tests for a payload session differing from the environment, two concurrent CLI sessions with reversed transcript modification times, a stale default-session parent, a nested child, a genuine foreign issue, an audited override whose audit write fails, and stop/resume occupancy.
- [ ] Run: node --test scripts/tests/unit/task-tracker/lib/session-authority.test.mjs scripts/tests/unit/task-tracker/lib/worktree-binding-guard.test.mjs scripts/tests/integration/task-tracker/lib/bash-guard-worktree-binding.test.mjs. Confirm the new cases fail for the current newest-record or fallback behavior.
- [ ] Implement exact session and root selection. Preserve existing audited foreign-target override behavior and refusal context; do not make the Bash local-work classification a new prerequisite for file access.
- [ ] Rerun the focused command and the existing scripts/tests/integration/task-tracker/lib/worktree-binding-lifecycle.test.mjs. Test a real nested git worktree, not only injected records.
- [ ] Commit only this unit with subject [#1841] Anchor governed binding to the invoking session.

Test assertion shape:

```js
assert.equal(
  resolveCurrentSessionWorktreeBinding({
    invokingDir: childRoot,
    sessionId: childSession,
    deps: fixtureDeps,
  }).issueNumber,
  1841
);
assert.throws(() => resolveAuthoritativeSessionId({ env: {}, provider: codexProvider }), {
  code: 'provider-session-id-required',
});
```

### Task 2: Resolve every explicit file target and pin provider payloads

**Files:** Modify scripts/task-tracker/lib/mutation-context.mjs and lib/apply-patch-targets.mjs. Create scripts/task-tracker/lib/file-tool-contract.mjs and sanitized fixtures under scripts/tests/fixtures/task-tracker/provider-payloads/. Extend scripts/tests/unit/task-tracker/lib/apply-patch-targets.test.mjs; create scripts/tests/unit/task-tracker/lib/file-target-boundary.test.mjs.

**Interface:** Define resolveContainedFileTarget({ target, invocationDir, invokingRoot }) returning lexical, physical, relative, and targetWorktreeRoot only when targetWorktreeRoot equals invokingRoot. Resolve symlinks and the nearest existing ancestor before discovering the nearest .git file or directory. Reuse safePatchPath for patch headers. Export the provider/tool/target-field table from file-tool-contract.mjs for both installer and doctor; unknown explicit-target tools are reported as uncovered.

- [ ] Capture one sanitized real PreToolUse payload for each current Codex apply_patch and Claude Edit, Write, and NotebookEdit shape. Record provider/tool/version/source and remove credentials or user content; fail this task's parser acceptance if a real payload cannot be captured. Capture Grok's currently installed search_replace and write target shapes before the provider-wide hook switch; missing Grok evidence blocks Task 6 rather than silently removing its only guard.
- [ ] Write failing tests for primary to nested .worktrees child, primary to nested .tmp/.task-test child, nested child to parent, nested child self-write, a nonexistent path under a nested root, symlink escape, nested standalone .git fixture repo, submodule marker, and a mixed safe/unsafe patch.
- [ ] Write parser tests for command string when captured, conflicting fields, a non-string command beside valid input, malformed patch header, move target, and every Add/Update/Delete target. Run: node --test scripts/tests/unit/task-tracker/lib/apply-patch-targets.test.mjs scripts/tests/unit/task-tracker/lib/file-target-boundary.test.mjs; confirm new cases fail.
- [ ] Implement the resolver and contract table. Keep the accepted payload-key set limited to observed fixtures; reject ambiguous fields before any target is applied.
- [ ] Rerun focused tests, including an actual nested Git repo fixture. Commit with subject [#1841] Resolve explicit file targets by owning worktree.

### Task 3: Add the file-tool-only fail-closed hook

**Files:** Create scripts/task-tracker/file-boundary-guard.mjs and scripts/tests/integration/task-tracker/lib/file-boundary-guard.test.mjs. Modify scripts/task-tracker/hooks/grok-wire.mjs only to expose the new handler; do not switch installer registrations yet.

**Interface:** One handler consumes the hook JSON only for the explicit file-tool matcher set. It resolves the invoking directory, selects the target extractor from file-tool-contract.mjs, and validates every target through resolveContainedFileTarget. It emits the provider's refusal result for malformed JSON, empty/non-string target, parser error, or unresolved root; it performs no issue, state, assignee, or network read. The hook bootstrap itself refuses if its module or self-link cannot load.

- [ ] Write failing subprocess tests using the real provider payload fixtures and an empty/malformed stdin; assert all known file-tool failures refuse and a contained .scratch/gh input succeeds with and without a task.
- [ ] Run: node --test scripts/tests/integration/task-tracker/lib/file-boundary-guard.test.mjs. Confirm missing module, malformed JSON, and mixed-target cases do not pass.
- [ ] Implement the hook and Grok adapter. Preserve provider-specific refusal formats and fail the whole operation before mutation.
- [ ] Rerun focused tests and scripts/tests/unit/task-tracker/lib/guard-entrypoint-resolution.test.mjs. Commit with subject [#1841] Enforce explicit file target containment.

### Task 4: Move owner and commit claims to governed evidence points

**Files:** Modify scripts/task-tracker/verbs/commit-trace.mjs, lib/review-preflight.mjs, verbs/close.mjs, and the smallest shared attribution helper under scripts/task-tracker/lib/. Extend scripts/tests/unit/task-tracker/lib/review-preflight.test.mjs and the existing commit-trace and close tests found by rg --files scripts/tests | rg 'commit-trace|close'.

**Interface:** Validate each claimed [#N] commit against the target issue, the issue's single live owner, and attribution evidence before the governed publication or acceptance result is marked valid. An owner lookup error refuses that claim with a typed reason. A local git commit and ordinary file edits never call this helper. Preserve no-commit kinds and existing audited waivers.

- [ ] Write failing tests: offline local git commit succeeds; commit-trace claim with wrong issue or owner refuses; unavailable owner refuses only publication; valid owner and exact target pass; review preflight and close consume the same evidence. Cover an epic/no-commit path separately.
- [ ] Run focused commit-trace, review-preflight, and close tests; confirm the new publication failures are visible.
- [ ] Implement one shared validator and call it at the three named boundaries. Do not introduce an ownership query in a PreToolUse path.
- [ ] Rerun focused tests. Commit with subject [#1841] Validate attribution when evidence is published.

### Task 5: Narrow the Bash hook to direct remote mutation warnings

**Files:** Create scripts/task-tracker/remote-mutation-guard.mjs. Reuse scripts/task-tracker/lib/gh-edit-guard.mjs, gh-project-guard.mjs, and aitm-path-guard.mjs. Extend scripts/tests/integration/task-tracker/core/bash-guard-move-state.test.mjs and add scripts/tests/integration/task-tracker/core/remote-mutation-guard.test.mjs.

**Interface:** The remote guard receives raw Bash command text and applies only the existing obvious raw issue creation/body/close/protected-comment/Project mutation checks and direct move-state warning. Keep each existing raw-versus-quote-stripped rule's intended input. Read-only gh issue, board, and Project inspection passes. No path regex, activity class, local Git command, or assignee network lookup runs here. The canonical governed AITM APIs remain authoritative.

- [ ] Write failing tests for each raw mutation refusal, read-only inspection, a quoted mention of move-state, wrapper limitations, local .scratch/gh creation, local tests/builds, and local git commit during Backlog with network unavailable.
- [ ] Run: node --test scripts/tests/integration/task-tracker/core/remote-mutation-guard.test.mjs scripts/tests/integration/task-tracker/core/bash-guard-move-state.test.mjs. Confirm the current mixed Bash guard blocks the permitted local cases.
- [ ] Extract the narrow checks, retaining their current evaluators and decision formatting. Do not attempt a new shell parser or a hidden subprocess escape detector.
- [ ] Rerun focused tests and the existing gh-edit-guard unit files. Commit with subject [#1841] Separate remote mutation warnings from local work.

### Task 6: Switch generated hooks and make doctor truthful

**Files:** Modify scripts/package/install-content.mjs, install-observer.mjs, doctor.mjs, scripts/task-tracker/hooks/grok-wire.mjs, provider setup templates and AITM guidance that name retired guards. Extend scripts/tests/unit/package/install-content.test.mjs, doctor.test.mjs, scripts/tests/integration/task-tracker/lib/install-hooks.test.mjs, and scripts/tests/integration/package/doctor-cli.test.mjs.

**Interface:** Installer required PreToolUse matchers derive the explicit-target set from file-tool-contract.mjs, plus the narrow remote-mutation Bash matcher and unrelated retained agent/on-ask hooks. No activity-guard or source-edit-gate registration remains. Doctor verifies actual generated registration and module-load behavior, reports drift or unknown provider tool coverage, and distinguishes host sandbox verified from unverified. Its status must not say file containment is enforced when the hook cannot load.

- [ ] Write failing fresh-install, update, repair, and consumer-install parity tests for Claude, Codex, and Grok. Assert exact matcher/tool coverage, absence of old registrations after verified replacement, missing-module refusal, deliberate local self-edit allowance, and doctor drift reporting. If Grok payload evidence is unavailable, report unverified coverage and defer the provider-wide hook switch and old-module retirement.
- [ ] Run the four focused test files above; confirm current generated sets and doctor behavior fail the new expectations.
- [ ] Change the generated contract and repair paths together. Update install contract fixtures intentionally; do not copy this worktree's temporary .claude/settings.json or .codex/hooks.json edits into the generated source.
- [ ] Rerun focused tests and scripts/tests/integration/package/install-health.test.mjs. Commit with subject [#1841] Install and diagnose the reduced hook set.

### Task 7: Prove end-to-end behavior and retire obsolete gates

**Files:** Remove unused scripts/task-tracker/activity-guard.mjs, activity-policy.mjs, source-edit-gate.mjs, and the old generic Bash path scanner only after Tasks 1–6 pass. Update references in scripts/task-tracker/lib/command-surface/entrypoints.mjs, scripts/task-tracker/verbs/help-data.mjs, skill/shared/rules/hooks.md, installer tests, and any other live rg matches. Add scripts/tests/integration/task-tracker/lib/worktree-file-boundary-contract.test.mjs.

- [ ] Run one actual linked-worktree scenario through each provider hook adapter: contained source and .scratch writes with no task and in every stage; primary-to-child and child-to-primary refusal; host-authorized git add/commit; malformed file-tool payload refusal; read-only GitHub pass; governed foreign mutation and bad evidence refusal.
- [ ] Validate the installed ai-peer-review version against AC12. Exercise registered reviewer artifact refusal, unrelated/scratch write allowance, and post-review release. If its package still imposes reviewer-wide write/Git restrictions, leave AC12 open and record the precise owning-package dependency; do not claim this AITM change satisfies it.
- [ ] Remove only modules and instructions made unreachable by the installed contract. Keep independent agent, timing, on-ask, and governed API gates. Replace test fixtures that asserted the old stage matrix with fixtures that assert the new boundary. Add a narrow immutable-review-output exclusion for docs/peer-reviews-1841-retry/** to the existing markdownlint and Prettier policies; verify the exclusion does not cover the spec or plan.
- [ ] Run: node --test scripts/tests/integration/task-tracker/lib/worktree-file-boundary-contract.test.mjs, then npm test, npm run test:slow, npm run lint, and npm run format:check. Resolve the existing accepted-spec formatting failure through a review-safe artifact disposition before claiming the whole-tree format gate. Run the issue's vc:1 and vc:7 commands only after their paths are updated to cover the new contract. Record any host sandbox refusal separately from an AITM hook refusal.
- [ ] Inspect the generated hook diff against the temporary local .claude/settings.json and .codex/hooks.json edits, restore only the intended generated set, and verify no failed XPR collateral or backup file is staged. Commit with subject [#1841] Retire obsolete local activity gates.

## Acceptance and delivery map

| Issue criteria | Plan tasks                       | Proof before acceptance                                                                                                                                  |
| -------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1–AC6        | 1, 7                             | Exact session/checkout fixtures, nested and parallel worktrees, genuine foreign refusal, audited override and failed audit.                              |
| AC7–AC8        | 2, 3, 5, 7                       | Physical root equality, symlink and mixed-target refusal, every-state and no-task .scratch Bash/file writes.                                             |
| AC9            | 4, 5, 7                          | Contained edit/test/build/commit offline and real linked-worktree Git metadata operation under host authorization; invalid evidence claim refused later. |
| AC10           | 4, 5, 7                          | Governed remote mutation and protected evidence refusal, read-only inspection pass.                                                                      |
| AC11           | 2, 3, 6                          | Sanitized real provider payload fixtures; conflict and non-string cases; every patch target validated.                                                   |
| AC12           | 7 plus ai-peer-review dependency | Installed package enforcement and post-review release demonstrated; package issue or prose alone is insufficient.                                        |
| AC13           | 1–7                              | Focused, installer parity, fast, slow, lint and format checks pass before old registrations are removed.                                                 |

## Plan self-review

- The file map covers every hook and gate named in the accepted spec. The host sandbox is verified by integration observation, not implemented with shell text.
- The dependent ai-peer-review artifact rule is an explicit acceptance gate rather than an AITM imitation.
- The issue body currently cites vc:1 and vc:7 commands written for the old guard names. Task 7 updates their coverage through governed issue-body mutation after implementation evidence exists; it does not mark them complete while planning.
- This plan is a draft. Review and accept it through the story's Plan-stage review choice before plan-derived hydration, estimate/decomposition decisions, or Develop.
