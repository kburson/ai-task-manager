# #2020 Registered Review Command Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline, followed by one focused fresh review.

**Goal:** Let the already registered local review command execute through AITM's existing Bash hook without unrelated outside-path permissions.

**Architecture:** A data-only helper reads the account selection and package manifest. It returns only the exact registered Node and CLI paths for a conservative direct invocation. The existing guard consumes that Set only after its existing write and lifecycle checks.

**Tech Stack:** Node standard libraries and the real hook subprocess integration harness; no new dependency.

**Spec:** Human-approved bounded design and canonical Deep-Dive Analysis on [AITM #2020](https://github.com/kburson/ai-task-manager/issues/2020).

## Global Constraints

- No native binaries, builds or downloads; no ACL subprocesses or new permission framework.
- Project-only writes, exact reviewer response-note writes, author-only file revisions, authentication, locking, recovery and worktree/lifecycle guards remain intact.
- No consumer pending journal, provider process or selected runtime mutation; no new/resumed provider launch.
- Preserve all original operation and provider deadlines. No PATH/npx or quote-based scanner evasion.
- Registration is existing data, not permission to import runtime implementation or grant identity, approval or write authority.

## Story Intent

- **Beneficiary:** a user running two trusted agents in one local project
- **Capability:** execute the already registered review command under existing filesystem boundaries
- **Need:** the host Bash hook rejects the installed Node and peer-review executable paths
- **Value or failure prevented:** avoid a blocked review handoff without granting unrelated reads or writes

## Review Focus

- A stale/malformed record must grant nothing, including a record whose package name/bin declaration disagrees with the installation.
- Aliases, traversal or symlink target changes must not turn this exception into arbitrary executable access.
- Node options, shell wrappers and mixed commands must not reuse the registered Node permission for other code.
- An additional outside argument or redirection must retain the existing denial even when the first two words match.
- New helper import/read failures must preserve fail-closed behavior; unrelated existing allowed commands must still work with no registration.

### Task 1: Exact registered executable reads

**Files:**

- Create: `scripts/task-tracker/lib/registered-review-command.mjs`
- Modify: `scripts/task-tracker/bash-guard.mjs`
- Test: `scripts/tests/integration/task-tracker/core/bash-guard-registered-runtime.test.mjs`

**Interfaces:**

- Consumes: existing `ai-peer-review.runtime-selection/v1` closed JSON record and `@kburson/ai-peer-review` package manifest.
- Produces: `registeredReviewCommandPaths(command, { homeDir }) -> Set<string>` containing zero or exactly two normalized physical paths. Only a direct Node plus CLI invocation is recognized; unsupported shell syntax returns an empty Set.

- [ ] Step 1: Write an isolated account/project subprocess fixture. The inputs are policy data and never execute as shell commands. The positive assertion is:

```js
const result = runGuard(`${registeredNode} ${registeredCli} help --json`);
assert.equal(result.stdout, '');
assert.equal(result.status, 0);
```

Include negative variants for missing/malformed/extra-field/retargeted registrations, manifest disagreement, missing targets, executable and entrypoint aliases/traversal, unrelated argument reads, Node flags, wrappers, mixed commands, outside writes and redirection. Baseline normal project reads and missing-record commands remain allowed.

- [ ] Step 2: Run `node --test scripts/tests/integration/task-tracker/core/bash-guard-registered-runtime.test.mjs`.
      Expected: the registered pair fails with the observed outside-scope refusal; negative cases retain their expected refusals. A setup/import failure is not the intended RED.

- [ ] Step 3: Add the smallest synchronous data matcher with bounded JSON reads. Check the closed schema, UUID/time, absolute normalized physical targets and manifest name/bin declaration. Do not execute installation code. Unsupported or inconsistent input returns an empty Set. Wire only the existing read/execute conditional:

```js
if (!allowedPath(p, READ_ALLOWED) && !isCodexSkillsRead(p) && !registeredPaths.has(p)) {
  // existing denial, unchanged
}
```

- [ ] Step 4: Rerun the new test and the four declared guard regression files. Expected: no failures and unchanged write/worktree/GitHub/fail-closed decisions. Run the source verification provider, full lint/format and package test lanes as required by the issue. Record actual failures rather than claiming baseline success.

- [ ] Step 5: Commit with `[#2020]` attribution, create the source PR and run exact-SHA cloud Test verification through AITM. Review the whole bounded delta once with a fresh reviewer. Any Important correction gets its own RED/GREEN; record Minor findings without broadening this repair.

- [ ] Step 6: Produce a supported installed-consumer fixture package verification and owner handoff. Do not edit a live installed dependency or automatically launch/reconcile the consumer review. Report CODE_COMPLETE only with verified evidence and leave human Review/approval/Close to its owner.

## Self-review

The one task covers all three acceptance criteria and all five review-focus cases. There are no inter-task interface conflicts or new dependencies. The implementation WBS is two human hours; AITM adds 1.5 hours of required repository verification overhead, yielding size M and 3.5 human hours. The AI forecast remains separately derived by AITM; no operation or provider budget changes. The human has approved this exact bounded repair and inline execution; this plan makes that decision executable without expanding it.
