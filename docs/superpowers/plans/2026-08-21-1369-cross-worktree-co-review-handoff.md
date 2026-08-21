# Cross-Worktree Co-Review Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make generated co-review handoffs work safely from a session whose cwd differs from the protocol's linked worktree, while closing the associated reviewer-grant fallthrough.

**Architecture:** Derive a target worktree from the canonical runtime path, verify it belongs to the caller's Git repository family, and use that root consistently throughout protocol reads and mutations. Generate absolute commands, then bind the reviewer guard to the command's canonical runtime plus provider/session rather than the caller cwd.

**Tech Stack:** Node.js ES modules, Git CLI boundary, `node:test`, AITM co-review CLI, Claude Bash PreToolUse guard, Markdown.

## Global Constraints

- Preserve existing relative-path behavior inside the owning worktree.
- Never trust `state.repositoryRoot` before independently deriving and validating the runtime's Git worktree.
- Preserve physical containment, single-command parsing, provider/session binding, immutable artifacts, protocol locks, and fail-closed errors.
- A command targeting a live reviewer claim must not fall through as `not-applicable` when its grant cannot be uniquely bound.
- Leave #939's runtime and immutable review draft untouched.

---

### Task 1: Authoritative Runtime Root

**Files:**

- Create: `scripts/review/lib/runtime-root.mjs`
- Modify: `scripts/review/lib/repository-boundary.mjs`
- Modify: `scripts/review/lib/protocol.mjs`
- Test: `scripts/tests/slow/review/co-review-boundaries.test.mjs`

**Interfaces:**

- Produces: `resolveRuntimeRoot({ cwd, dir, repository }) -> { callerRoot, root }` and `repository.commonDirectory(root) -> canonical Git common directory`.
- Consumes: existing `repositoryRoot(cwd)` and the protocol's `protocolPaths(root, dir)` containment checks.

- [ ] **Step 1: Write the linked-worktree RED tests**

Create a real linked worktree `W` from the fixture repository, initialize and advance a protocol to a claimed reviewer turn in `W`, then call `statusProtocol` and `handoffReviewer` with `cwd` set to the main fixture and `dir` set to the absolute runtime in `W`. Assert healthy integrity, visible owner terminal evidence, and a successful reviewer handoff. Add refusal cases for an absolute runtime in a different repository and for state whose recorded root does not equal `W`.

- [ ] **Step 2: Run the focused boundary test and verify RED**

```bash
node --test scripts/tests/slow/review/co-review-boundaries.test.mjs
```

Expected: the foreign-cwd status reports branch/artifact drift and the reviewer handoff refuses with `co-review:integrity`.

- [ ] **Step 3: Add the shared resolver and Git-family observation**

Implement `commonDirectory(root)` with `git rev-parse --git-common-dir` followed by canonical absolute resolution. In `resolveRuntimeRoot`, preserve the caller root for relative `dir`; for absolute `dir`, derive `root` by invoking `repositoryRoot` from the runtime directory. If roots differ, require equal canonical common directories or throw `co-review:repository-identity`. Do not fall back to the caller root after a failed absolute resolution.

- [ ] **Step 4: Route protocol reads and mutators through the resolved root**

Keep `initializeProtocol` caller-rooted. Replace the bare caller-root lookup in `readStatusSnapshot`, `readProtocol`, `validatedArchiveSnapshot`, `claimTurn`, `registerSupplement`, `handoffOwner`, `handoffReviewer`, `prepareGoodEnoughSnapshot`, `acceptGoodEnough`, `setMaxReviewTurns`, and `continueProtocol` with the shared resolver. Recompute `protocolPaths` from the returned root before acquiring a mutex or reading/writing state. After parsing state, require canonical `state.repositoryRoot` and `state.worktree` to equal the resolved root.

- [ ] **Step 5: Run boundary and protocol suites GREEN**

```bash
node --test scripts/tests/slow/review/co-review-boundaries.test.mjs
node --test scripts/tests/unit/review/co-review.test.mjs
```

Expected: PASS, including the new cross-worktree and repository-identity cases.

- [ ] **Step 6: Commit the root-resolution slice**

```bash
git add scripts/review/lib/runtime-root.mjs scripts/review/lib/repository-boundary.mjs scripts/review/lib/protocol.mjs scripts/tests/slow/review/co-review-boundaries.test.mjs
git commit -m "fix: resolve co-review runtime worktree [#1369]"
```

### Task 2: Cwd-Independent Generated Commands

**Files:**

- Modify: `scripts/review/lib/start.mjs`
- Modify: `scripts/task-tracker/lib/reviewer-co-review-command.mjs`
- Test: `scripts/tests/unit/review/co-review.test.mjs`
- Test: `scripts/tests/unit/task-tracker/lib/co-review-write-policy.test.mjs`

**Interfaces:**

- Consumes: `model.runtimeAbsolute` from `start.mjs`.
- Produces: generated lifecycle commands whose `--dir` and runtime-local artifact arguments are absolute; classifier result shapes remain unchanged.

- [ ] **Step 1: Write renderer/classifier RED tests**

Assert author and reviewer handoffs render `--dir <runtimeAbsolute>`, absolute round response/review paths, and no lifecycle command using the relative runtime directory. Feed the exact generated status and reviewer handoff shapes to `classifyReviewerCoReviewCommand` and assert recognition. Retain rejection assertions for traversal, wrappers, composition, expansion, malformed quotes, and unknown flags.

- [ ] **Step 2: Run the focused tests and verify RED**

```bash
node --test scripts/tests/unit/review/co-review.test.mjs
node --test scripts/tests/unit/task-tracker/lib/co-review-write-policy.test.mjs
```

Expected: renderer assertions fail on relative paths and classifier assertions fail with `status-grammar` or `handoff-dir`.

- [ ] **Step 3: Render absolute runtime-local arguments**

Use `model.runtimeAbsolute` for every generated `--dir`. Build response, review, and optional summary paths beneath `model.runtimeAbsolute`; keep repository artifact paths and commit placeholders unchanged. Update recovery prose so the printed commands remain the authoritative post-compaction instructions.

- [ ] **Step 4: Permit canonical absolute literal paths in the classifier**

Replace the absolute-path blanket refusal with a literal-path predicate that permits absolute or repository-relative values but still rejects backslashes, `.`/`..` segments, control bytes, and non-literal shell syntax. Do not alter `shellWords`, the closed flag grammar, or accepted decision values.

- [ ] **Step 5: Run focused tests GREEN and commit**

```bash
node --test scripts/tests/unit/review/co-review.test.mjs
node --test scripts/tests/unit/task-tracker/lib/co-review-write-policy.test.mjs
git add scripts/review/lib/start.mjs scripts/task-tracker/lib/reviewer-co-review-command.mjs scripts/tests/unit/review/co-review.test.mjs scripts/tests/unit/task-tracker/lib/co-review-write-policy.test.mjs
git commit -m "fix: render absolute co-review handoffs [#1369]"
```

### Task 3: Target-Runtime Reviewer Authorization

**Files:**

- Modify: `scripts/review/lib/index.mjs`
- Modify: `scripts/task-tracker/lib/co-review-write-policy.mjs`
- Test: `scripts/tests/unit/task-tracker/lib/co-review-write-policy.test.mjs`
- Test: `scripts/tests/unit/task-tracker/core/reviewer-co-review-command-boundary.test.mjs`

**Interfaces:**

- Consumes: canonical `reviewerCommand.runtimeDir`, provider, session id, protocol index rows, and the shared runtime-root resolver.
- Produces: `resolveReviewerGrant` support for exact canonical runtime targeting, with zero-or-many represented as refusal rather than first-match authorization.

- [ ] **Step 1: Write policy RED tests for the authorization gap**

Add cases where the caller is the main checkout and the command targets an absolute runtime in linked worktree `W`: the exact provider/session grant for `W` authorizes; wrong worktree, wrong provider/session, zero grants, and two matching grants refuse. Assert a runtime with a live reviewer claim never returns `not-applicable` merely because the caller worktree differs.

- [ ] **Step 2: Run the policy test and verify RED**

```bash
node --test scripts/tests/unit/task-tracker/lib/co-review-write-policy.test.mjs
```

Expected: the valid foreign-cwd grant is invisible under the caller-worktree filter, and at least one mismatch falls through as `not-applicable`.

- [ ] **Step 3: Resolve grants by target runtime**

Canonicalize the command runtime with the shared resolver before grant selection. Select rows by exact canonical `row.dir`, provider, and session; require exactly one. Then verify canonical `row.worktree` equals the resolved runtime root and validate the live reviewer claim. Preserve the existing caller-worktree path for non-command callers. Return a distinct ambiguity/refusal outcome rather than picking the first row.

- [ ] **Step 4: Close the not-applicable fallthrough**

In `evaluateCoReviewWrite`, compute target rows from the recognized command runtime. When that target has a live reviewer claim, deny any unrecognized, zero-grant, ambiguous, wrong-session, or mismatched command. Reserve `not-applicable` for targets without a live reviewer claim and for commands outside the co-review reviewer grammar.

- [ ] **Step 5: Prove guard-to-CLI behavior**

Extend the real boundary test so a Bash guard invoked from a foreign checkout accepts the exact generated absolute status/handoff command for `W`, the CLI completes the reviewer handoff, and negative actor/session/runtime/compound-command cases remain blocked.

- [ ] **Step 6: Run focused suites GREEN and commit**

```bash
node --test scripts/tests/unit/task-tracker/lib/co-review-write-policy.test.mjs
node --test scripts/tests/unit/task-tracker/core/reviewer-co-review-command-boundary.test.mjs
git add scripts/review/lib/index.mjs scripts/task-tracker/lib/co-review-write-policy.mjs scripts/tests/unit/task-tracker/lib/co-review-write-policy.test.mjs scripts/tests/unit/task-tracker/core/reviewer-co-review-command-boundary.test.mjs
git commit -m "fix: bind reviewer grants to target runtime [#1369]"
```

### Task 4: Full Verification and Governed Evidence

**Files:**

- No planned source edits; deterministic failures return to the owning task above.

**Interfaces:**

- Consumes: the three implementation slices.
- Produces: complete #1369 verification evidence without touching #939.

- [ ] **Step 1: Run all focused co-review and guard suites**

```bash
node --test scripts/tests/unit/review/co-review.test.mjs
node --test scripts/tests/slow/review/co-review-boundaries.test.mjs
node --test scripts/tests/unit/task-tracker/lib/co-review-write-policy.test.mjs
node --test scripts/tests/unit/task-tracker/core/reviewer-co-review-command-boundary.test.mjs
```

Expected: PASS.

- [ ] **Step 2: Run repository verification commands**

```bash
npm test
npm run test:slow
npm run lint
npm run format:check
git log --oneline -1
```

Expected: all commands exit 0 and the final commit names #1369.

- [ ] **Step 3: Inspect the final diff and commit any deterministic cleanup**

```bash
git diff --check origin/trunk...HEAD
git status --short
```

Expected: no whitespace errors and no uncommitted implementation changes.
