---
model: gpt-6-astra
effort: high
filepath: docs/superpowers/plans/2026-09-29-1841-worktree-hook-boundary.md
commit_sha: 311fba95cd695f5e50241f54d691b3e8477b4fe9
uncommitted_changes: false
reviewed_file_sha256: 852f939e0e51eaa55a75db19fa1268b9eef62c88dac28da930fc6f4ba94ad843
turn_ordinal: SAR r1
turn_description: Independent implementation plan Single Agent Review round 1
finding_count: 3
---

# #1841 implementation plan: SAR round 1

## Scope and disposition

**Changes requested.** This review compares the committed implementation plan with the accepted design and the current session, worktree, publication, and installation paths. Three actionable gaps remain. The review did not edit the plan, specification, implementation, hook settings, or dependency setup, and did not commit anything.

The plan otherwise preserves the main design: physical owning-worktree equality, captured provider payloads, atomic file-target refusal, host responsibility for shell effects, local self-edit allowance, independent governed mutation gates, and an explicit unmet acceptance gate for the owning peer-review package. Its AC12 check correctly refuses to treat a linked dependency as delivered behavior; implementation must continue to honor that gate.

## Findings

### F1 — P1: Carry the authoritative session and invoking root through the governed CLI context

**Plan location:** Task 1, especially the interface at line 47 and implementation action at line 51; the session-authority file map at line 33.

The proposed repair concretely changes `resolveCurrentSessionWorktreeBinding`, which is the hook-side selector, and adds a session-ID check at the governed verb entry. The actual governed CLI execution path uses a different resolver: `enforceVerbWorktreeBinding` calls `resolveProjectDir`, whose `defaultBindingForIssue` independently calls diagnostic `currentSessionId()` and whose environment override returns a directory without checking any session record (`scripts/task-tracker/lib/project-dir.mjs:25–75`). `enforceVerbWorktreeBinding` accepts equal worktree roots without proving that the requested issue and exact live session have a matching record. `task-tracker.mjs:469` also constructs `ctx` before the existing guard at line 513, and `runtime.mjs:278–285` fixes its project/state paths during that construction.

For example, a governed invocation with an exact session environment key, an override pointing at its current checkout, and no record for that session can pass the existing root comparison. Merely establishing that a live session ID exists and fixing the hook-side fleet scan does not establish the spec's required mutation authority. Resolving a different root later can also leave the verb's already-created context pointed at the earlier directory.

**Required change:** Expand Task 1 to include the governed context/resolution call chain (`project-dir.mjs`, the relevant `runtime.mjs` context construction, and downstream binding checks). Specify one authoritative session/root/issue context passed into both validation and the eventual mutation. Diagnostic identity fallback must not reenter this path. Define explicit handling for initial binding verbs, which legitimately create a record, separately from mutations requiring an existing record. Preserve the audited foreign-target exception without turning environment overrides into authority.

**Required verification:** Add actual CLI tests proving that (a) a present exact session ID plus a missing or wrong-issue local record cannot authorize a governed mutation, (b) either project-dir override cannot redirect it silently, (c) two concurrent sessions use the same validated identity through the eventual mutation, and (d) ordinary local work and diagnostic commands remain available. Assert the mutation's selected directory and side effects, not only the return value of the new resolver. These cases implement the accepted specification's “Exact session and checkout resolution” contract and AC1–AC6.

### F2 — P1: Cover automatic commit-trail publication when moving ownership checks

**Plan location:** Task 4, lines 93–100, particularly the instruction to call the shared validator at the three named boundaries; Task 6's retained hook contract.

The plan places the new validator in `commit-trace`, review preflight, and close, but leaves another live publication route outside the migration. Claude and Codex retain the PostToolUse commit handler (`scripts/package/install-content.mjs:44,60`). After a successful local commit, `commit-trail-handler.mjs:225–278` reads an active issue and calls `postCommitTrail` directly. That function writes or updates the issue's commit-evidence comment without validating the live owner or exact commit attribution. The handler only warns about a mismatched subject. It also selects its directory from hook `cwd` and an environment override, rather than the exact command target and session context.

Once the PreToolUse commit owner lock is removed, this path can immediately publish a commit claim for the wrong owner or issue even if the explicit `commit-trace` command would refuse it. Later rejection at review or close does not undo the unvalidated remote publication. This contradicts the accepted design's move of ownership checks to governed publication and protected evidence boundaries.

**Required change:** Add `commit-trail-handler.mjs` and its publication tests to Task 4. Gate every authoritative commit-trail write through the shared validation boundary before `create` or `update`, including automatic PostToolUse publication, or explicitly stop automatic remote publication while retaining local subject lint. If automatic publication remains, derive its exact session, effective command checkout, and target issue using the validated context. Keep any refusal or unavailable owner lookup nonfatal to the already-successful local commit.

**Required verification:** Exercise the actual retained PostToolUse handler with wrong owner, unavailable owner, wrong issue, different tool workdir/direct `git -C` checkout, and valid exact attribution. Assert zero remote writes for rejected claims and continued local commit success; assert a valid claim publishes once. Also assert explicit `commit-trace` validates before its `postCommitTrail` side effect, since the current implementation posts before computing attribution. This closes the AC9/AC10 publication gap.

### F3 — P2: Put the full migration gate before installed-hook retirement

**Plan location:** Task 6, lines 117–122; Task 7, lines 126–132; AC13 delivery map at line 144.

The accepted spec's migration step 5 requires focused real-payload tests, installer parity, fast/slow suites, lint, and format before obsolete hook removal and restoration of the installed hook configuration. The plan's AC13 row repeats that ordering. The executable steps disagree: Task 6 removes old generated registrations and commits the switched installer after focused tests; Task 7 removes modules before running the full suite, lint, and format. In this source checkout, the self-linked package makes changes to generated installation/repair code available immediately. The documented sequence therefore permits retirement before its stated gate, including before resolving the known format failure.

**Required change:** Distinguish candidate generation and disposable installer tests from activation of the worktree's installed contract. Build and verify the complete candidate without removing the active registrations; run the required migration suites and resolve the accepted-spec formatting disposition; then switch the installed set and retire unreachable modules. Explicitly rerun the relevant parity/load and regression checks after the final removal so the delivered state is verified. If a different sequencing policy is intended, obtain a review-safe specification change rather than leave contradictory requirements in the implementation plan.

**Required verification:** Make the task dependencies and acceptance table name the same pre-activation gate and the same final verification. Preserve the existing Grok payload-evidence stop condition and require a passing gate before provider-wide activation or old-module retirement. This repairs the AC13 execution order without weakening the file-boundary or provider coverage checks.

## Evidence and limits

- Reviewed artifact: `docs/superpowers/plans/2026-09-29-1841-worktree-hook-boundary.md` at commit `311fba95cd695f5e50241f54d691b3e8477b4fe9`.
- The working file and `git show HEAD:<plan-path>` both hashed to `852f939e0e51eaa55a75db19fa1268b9eef62c88dac28da930fc6f4ba94ad843`. The artifact had no staged or unstaged changes. `uncommitted_changes: false` refers to the reviewed artifact, not the whole checkout.
- The accepted design was read from `docs/superpowers/specs/2026-09-28-1841-worktree-hook-boundary-design.md`; the plan and spec were unchanged during this review.
- Repository evidence included the session resolver, hook binding resolver, governed verb binding resolver, mutation-context and patch-target parsing, CLI entry/context construction, assignee policy, commit-trace and automatic commit-trail publisher, review preflight, close references, installer contracts, and hook bootstrap.
- Existing unrelated `.ai-peer-review.json`, `.claude/settings.json`, `.codex/hooks.json`, and backup-file changes were observed and left untouched.
- This is a read-only implementation-plan review apart from this collateral file. No runtime test suite, real provider sandbox exercise, remote mutation, or implementation acceptance was performed. The findings concern executable plan completeness and ordering, not claims that the proposed implementation has already failed tests.

## Next review

Revise and commit the plan with dispositions for F1–F3, then review the new exact bytes in a second SAR round. Do not treat this round as plan acceptance or Develop approval.
