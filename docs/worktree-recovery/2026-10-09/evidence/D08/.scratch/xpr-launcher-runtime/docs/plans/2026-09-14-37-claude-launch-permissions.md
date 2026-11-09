# Claude Reviewer Launch Permissions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one package-owned Claude reviewer launch path that authorizes exactly the pending response, refuses unsafe paths before provider work, and surfaces same-session recovery when `dontAsk` denies the response write.

**Architecture:** A focused `src/provider/claude-launch.mjs` adapter consumes the sealed invitation routing already produced by `startReview`, builds an immutable literal-argv Claude invocation, runs it through an injected host executor, stores raw session continuity only in ignored review scratch, and classifies the result by re-reading protocol authority. One additive `launch-reviewer` CLI command and public API use that same adapter; the existing protocol, identity, reviewer guard, transport, and coordinator remain authoritative and unchanged.

**Tech Stack:** Node.js 24+ ESM, built-in `node:test`, `node:child_process`, existing `AprError`, contained-path helpers, canonical JSON/event authority, Prettier, ESLint, markdownlint, cspell.

**Spec:** `docs/design/2026-09-14-37-claude-launch-permissions-design.md`

## Global Constraints

- Support only Claude Code for this story; do not implement the SPR/XPR broker or a provider-neutral supervisor.
- Use `--permission-mode dontAsk`; allow only exact package-generated `join` and `submit` Bash commands, and never use `bypassPermissions`, a directory/repository wildcard, or Bash to write the response.
- Derive the response, artifact, workspace, review ID, and revision from the sealed invitation and event authority; never accept caller-selected replacements.
- Validate canonical native POSIX or Windows absolute paths, translate them into Claude's forward-slash provider namespace, encode the resulting filesystem-root Edit pattern with a double leading slash, and fail closed on unproven permission-pattern metacharacters.
- Pass executable arguments as an array with shell execution disabled.
- Keep raw provider session handles and process diagnostics under ignored review scratch; public results contain only fingerprints or opaque recovery references.
- Only a verified reviewer submission transition produces `submitted`; process success, completed analysis, doctor health, join success, or response bytes do not.
- Resume the same recorded Claude session/model/effort; never let the author submit for the reviewer.
- Keep the default test suite deterministic and offline; any live-Claude conformance is separately gated and non-required.
- Commit messages follow the project issue convention and contain the canonical `[#37]` attribution token. Pull requests do not use auto-closing keywords; the governed AITM close transition owns issue closure.

### Post-implementation platform clarification

The implementation and regression suite established that filesystem paths, Claude permission paths, and package-command arguments are three distinct representations. A canonical Windows path such as `C:\work\repo\reviewer-response-1.md` becomes `/c/work/repo/reviewer-response-1.md` for Claude matching and `Edit(//c/work/repo/reviewer-response-1.md)` for the allow rule, while command argv uses the portable `C:/work/repo/reviewer-response-1.md` form. Apply the same native-to-provider normalization to structured Edit/Write denial paths before exact-response comparison. Do not pass Windows-native paths through POSIX normalization or compare the two namespaces directly.

---

### Task 1: Exact Claude permission and launch-contract core

**Files:**

- Create: `src/provider/claude-launch.mjs`
- Create: `test/unit/claude-launch-permissions.test.mjs`
- Modify: `src/public-api.mjs`

**Interfaces:**

- Consumes: `resolveContainedPath(root, candidate, label)` from `src/collateral/paths.mjs`, `canonicalProjection(value)` from `src/protocol/service.mjs`, `AprError`, and sealed invitation routing shaped as `{ schema, review_id, artifact, workspace, response }`.
- Produces: `encodeClaudeEditRule(absolutePath) -> string`, `buildClaudeReviewerLaunch({ repositoryRoot, invitation, routing, model, effort, resumeHandle? }) -> Frozen<ClaudeLaunchContract>`, and `matchesClaudeEditRule(rule, candidate, { projectRoot }) -> boolean` for production preflight and the conformant fixture.

- [ ] **Step 1: Write failing exact-rule tests**

Create `test/unit/claude-launch-permissions.test.mjs` with table-driven assertions equivalent to:

```js
test('encodes one exact absolute Claude Edit rule', () => {
  assert.equal(
    encodeClaudeEditRule('/work/project/reviewer-response-1.md'),
    'Edit(//work/project/reviewer-response-1.md)'
  );
  assert.equal(
    matchesClaudeEditRule(
      'Edit(//work/project/reviewer-response-1.md)',
      '/work/project/reviewer-response-1.md',
      { projectRoot: '/work/project' }
    ),
    true
  );
  assert.equal(
    matchesClaudeEditRule(
      'Edit(/work/project/reviewer-response-1.md)',
      '/work/project/reviewer-response-1.md',
      { projectRoot: '/work/project' }
    ),
    false
  );
});
```

Add cases proving that spaces remain literal, relative/non-normalized paths fail, and `*`, `?`, `[`, `]`, or `\` produces `APR_CLAUDE_PERMISSION_INVALID` before a contract exists.

- [ ] **Step 2: Run the unit test and confirm the red state**

Run: `node --test test/unit/claude-launch-permissions.test.mjs`

Expected: FAIL because `src/provider/claude-launch.mjs` does not exist.

- [ ] **Step 3: Implement exact rule encoding and matching**

Implement the closed grammar first:

```js
const UNSUPPORTED_PATTERN = /[*?\[\]\\]/u;

export function encodeClaudeEditRule(absolutePath) {
  if (
    typeof absolutePath !== 'string' ||
    !path.isAbsolute(absolutePath) ||
    path.normalize(absolutePath) !== absolutePath ||
    UNSUPPORTED_PATTERN.test(absolutePath)
  ) {
    fail(
      'APR_CLAUDE_PERMISSION_INVALID',
      'Claude response permission path is not exactly representable.',
      'Use a canonical physical response path without permission-pattern metacharacters.'
    );
  }
  return `Edit(/${absolutePath})`;
}
```

Implement `matchesClaudeEditRule` only for the two documented exact forms needed by the safety proof: `Edit(//...)` resolves from filesystem root and `Edit(/...)` resolves from `projectRoot`. Reject wildcard-bearing or malformed rules instead of becoming a general gitignore implementation.

- [ ] **Step 4: Add failing launch-contract safety tests**

Create a disposable repository path containing a space. Supply routing for an artifact, workspace, response, and invitation. Assert that the contract:

```js
assert.deepEqual(contract.permissions.allow, [
  'Read',
  'Glob',
  'Grep',
  exactJoinRule,
  exactSubmitRule,
  encodeClaudeEditRule(response),
]);
assert.equal(Object.isFrozen(contract), true);
assert.equal(contract.command.file, 'claude');
assert.equal(contract.command.shell, false);
assert.equal(contract.readiness.exact_response, true);
assert.equal(contract.readiness.bad_single_slash_rejected, true);
assert.equal(contract.readiness.artifact_rejected, true);
assert.equal(contract.readiness.neighbor_rejected, true);
```

Also assert rejection for a response outside the repository, a symlink escape, a routing response different from the event-authorized value, model/effort omission, and a caller-supplied raw resume handle on a fresh launch.

- [ ] **Step 5: Implement the immutable launch contract**

Build this closed shape:

```js
{
  schema: 'ai-peer-review.claude-launch/v1',
  review_id,
  invitation,
  workspace,
  response,
  model,
  effort,
  mode: resumeHandle ? 'resume' : 'launch',
  permissions: {
    allow: ['Read', 'Glob', 'Grep', exactJoinRule, exactSubmitRule, exactEditRule],
  },
  command: { file: 'claude', args, shell: false },
  readiness: {
    exact_response: true,
    bad_single_slash_rejected: true,
    artifact_rejected: true,
    neighbor_rejected: true,
  },
}
```

Use `resolveContainedPath` for the invitation, workspace, artifact, and response. Construct a sibling response control by changing only the response basename. Put `--permission-mode`, `dontAsk`, `--output-format`, `json`, explicit model/effort, and each allow rule into literal argv elements. The resume argv uses Claude's official `--resume` form and a package-loaded handle; the public contract must omit that raw handle.

- [ ] **Step 6: Export and verify the core**

Export the three functions from `src/public-api.mjs`, run:

`node --test test/unit/claude-launch-permissions.test.mjs`

Expected: PASS with all exact-path and launch-contract cases green.

- [ ] **Step 7: Commit the core**

```bash
git add src/provider/claude-launch.mjs src/public-api.mjs test/unit/claude-launch-permissions.test.mjs
git commit -m "feat: build exact Claude reviewer permissions" -m "Closes #37"
```

---

### Task 2: Provider execution, private session continuity, and outcome authority

**Files:**

- Modify: `src/provider/claude-launch.mjs`
- Modify: `test/unit/claude-launch-permissions.test.mjs`
- Create: `test/integration/claude-launch-permissions.test.mjs`
- Modify: `test/helpers/internal-api.mjs`

**Interfaces:**

- Consumes: Task 1's `ClaudeLaunchContract`, injected `execFile(file, args, options)`, `inspectReviewAuthority(workspace)`, `atomicWrite`, and canonical hashing.
- Produces: `runClaudeReviewerLaunch({ contract, execFile, inspectAuthority, stateStore }) -> Promise<ClaudeLaunchResult>` and `classifyClaudeReviewerOutcome({ before, after, providerResult, contract }) -> Frozen<ClaudeLaunchResult>`.

- [ ] **Step 1: Write failing outcome-classification tests**

Add unit cases for the four closed statuses:

```js
assert.equal(
  classifyClaudeReviewerOutcome({
    before,
    after: afterReviewerAccepted,
    providerResult: { exit_code: 0, permission_denials: [] },
    contract,
  }).status,
  'submitted'
);

assert.equal(
  classifyClaudeReviewerOutcome({
    before,
    after: before,
    providerResult: {
      exit_code: 1,
      permission_denials: [{ tool: 'Edit', path: contract.response }],
    },
    contract,
  }).status,
  'permission-blocked'
);
```

Add controls proving that zero exit, completed analysis text, response bytes, or a joined reviewer without a new `reviewer-accepted`/`reviewer-revisions-requested` event remains `outcome-unknown`. A definite non-permission provider error is `failed`. A submission from a different fingerprint is an identity error, not `submitted`.

- [ ] **Step 2: Run the focused unit test and confirm failure**

Run: `node --test test/unit/claude-launch-permissions.test.mjs`

Expected: FAIL because execution and classification exports are absent.

- [ ] **Step 3: Implement private launch-state persistence**

Store launch state at:

```text
<workspace>/provider/claude/launch-state.json
```

Use atomic writes and a closed shape containing schema, review ID, session handle, session fingerprint, model, effort, invitation digest, response digest/path, and last observed protocol revision. Refuse symlinks, malformed state, changed model/effort, or routing drift with `APR_CLAUDE_SESSION_INVALID`. Never include the raw handle in `toJSON`, returned results, error details, logs, or durable protocol events.

- [ ] **Step 4: Implement execution and authority-first classification**

`runClaudeReviewerLaunch` must:

1. Inspect and save `before` authority.
2. Call `execFile(contract.command.file, contract.command.args, { cwd: repositoryRoot, shell: false })`.
3. Parse bounded Claude JSON output and store a valid session handle privately.
4. Re-inspect authority even after a thrown process error.
5. Classify `submitted` only from a new expected reviewer submission event.
6. Return a sanitized result with the exact response and a rendered `launch-reviewer ... --resume` recovery command for `permission-blocked`.

Use this result shape:

```js
{
  schema: 'ai-peer-review.claude-launch-result/v1',
  review_id,
  status: 'submitted' | 'permission-blocked' | 'failed' | 'outcome-unknown',
  protocol_revision,
  response,
  session_fingerprint,
  recovery: null | { command, reason: 'response-permission-denied' },
}
```

- [ ] **Step 5: Write the conformant disposable integration fixture**

In `test/integration/claude-launch-permissions.test.mjs`, start a real disposable review and implement an injected Claude executor that:

- interprets `dontAsk` by allowing only matching rules;
- distinguishes `Edit(/project-relative)` from `Edit(//absolute)` through `matchesClaudeEditRule`;
- joins using the sealed invitation;
- retains one fixture session ID, model, effort, and analysis text across resume;
- attempts the artifact, a neighboring response, and the exact response;
- writes and submits through the real `joinReview` and `submitReviewTurn` services only when permission permits.

The first run must override the rule with the reproduced single-slash form and return a structured denial. Assert unchanged artifact/neighbor bytes, state `reviewer-turn`, status `permission-blocked`, and an exact resume command. The second run must rebuild the package rule, resume the same fixture session, preserve its analysis, submit, and return `submitted` without duplicate events.

- [ ] **Step 6: Run the required new suites**

Run:

```bash
node --test test/unit/claude-launch-permissions.test.mjs
node --test test/integration/claude-launch-permissions.test.mjs
```

Expected: both suites PASS; the bad-rule leg proves denial and the corrected same-session leg proves write plus submission.

- [ ] **Step 7: Commit execution and conformance**

```bash
git add src/provider/claude-launch.mjs test/unit/claude-launch-permissions.test.mjs test/integration/claude-launch-permissions.test.mjs test/helpers/internal-api.mjs
git commit -m "feat: surface Claude permission recovery" -m "Closes #37"
```

---

### Task 3: Closed CLI, schema, and public operator contract

**Files:**

- Modify: `src/cli/parse.mjs`
- Modify: `src/cli/run.mjs`
- Modify: `src/cli/help-data.mjs`
- Create: `schemas/claude-launch-result-v1.json`
- Modify: `test/unit/cli-parse.test.mjs`
- Modify: `test/golden/help.test.mjs`
- Modify: `test/helpers/internal-api.mjs`

**Interfaces:**

- Consumes: Task 1's builder and Task 2's runner.
- Produces: `peer-review launch-reviewer <invitation> --host claude [--model <id> --effort <level> | --resume] [--json]` and schema `ai-peer-review.claude-launch-result/v1`.

- [ ] **Step 1: Add failing parser tests**

Assert the exact grammar:

```js
assert.deepEqual(
  parseCommand([
    'launch-reviewer',
    '/repo/reviewer-invitation.md',
    '--host',
    'claude',
    '--model',
    'claude-opus-5',
    '--effort',
    'high',
    '--json',
  ]),
  {
    command: 'launch-reviewer',
    args: ['/repo/reviewer-invitation.md'],
    options: { host: 'claude', model: 'claude-opus-5', effort: 'high', json: true },
  }
);
```

Reject unknown hosts, missing model/effort on a fresh launch, model/effort combined with `--resume`, a caller session ID, extra positions, and duplicate flags.

- [ ] **Step 2: Run parser and help tests to confirm failure**

Run: `node --test test/unit/cli-parse.test.mjs test/golden/help.test.mjs`

Expected: FAIL because the command is not in the frozen catalog.

- [ ] **Step 3: Add the closed command catalog and JSON schema**

Add `launch-reviewer` to `COMMAND_FLAGS`, `COMMAND_USAGE`, positional grammar, boolean flags, enums, and cross-flag validation. Create `schemas/claude-launch-result-v1.json` with `additionalProperties: false`, the four status values, fingerprint format, absolute response, nullable recovery, and a command enum fixed to `launch-reviewer`.

- [ ] **Step 4: Wire the CLI runner**

In `src/cli/run.mjs`, reuse the sealed invitation parser and current repository/config loaders. For a fresh invocation, build then run the adapter using `io.execFile ?? execFile`. For resume, load the package-owned launch state and reject caller model/effort. Render text as a short operational status, exact response pointer, and exact next action; render JSON against the new schema. Do not print raw Claude stdout/stderr or session handles.

- [ ] **Step 5: Define help and stable errors**

Add complete help catalog entries for purpose, roles, states, arguments, flags, defaults, environment, preconditions, effects, no-commit behavior, examples, result schema, and errors. Register:

- `APR_CLAUDE_PERMISSION_INVALID`
- `APR_CLAUDE_SESSION_INVALID`
- `APR_CLAUDE_LAUNCH_FAILED`
- `APR_CLAUDE_RESULT_INVALID`

Each explanation must name a bounded recovery. The permission explanation must state that `//` is filesystem-root absolute while `/` is project-relative.

- [ ] **Step 6: Run parser/help tests and update deterministic help digest**

Run:

```bash
node --test test/unit/cli-parse.test.mjs test/golden/help.test.mjs
node --input-type=module -e "import{createHash}from'node:crypto';import{writeFileSync}from'node:fs';import{helpRequest}from'./src/cli/help-data.mjs';writeFileSync('test/golden/help/all.sha256.txt',createHash('sha256').update(helpRequest(null,'text',{all:true})).digest('hex')+'\n')"
node --test test/golden/help.test.mjs
```

Expected: all focused CLI/help tests PASS and only `all.sha256.txt` changes among existing digest fixtures.

- [ ] **Step 7: Commit the command surface**

```bash
git add src/cli/parse.mjs src/cli/run.mjs src/cli/help-data.mjs schemas/claude-launch-result-v1.json test/unit/cli-parse.test.mjs test/golden/help.test.mjs test/golden/help/all.sha256.txt test/helpers/internal-api.mjs
git commit -m "feat: add governed Claude reviewer launch command" -m "Closes #37"
```

---

### Task 4: Reviewer-boundary and recovery controls

**Files:**

- Modify: `test/integration/reviewer-boundary.test.mjs`
- Modify: `test/integration/reviewer-guard.test.mjs`
- Modify: `src/config/guards.mjs` only if the tests prove the existing guard cannot express the exact adapter operation.
- Modify: `src/provider/claude-launch.mjs` only for defects exposed by the boundary tests.

**Interfaces:**

- Consumes: `buildClaudeReviewerLaunch`, `runClaudeReviewerLaunch`, and `deriveReviewerGuard`.
- Produces: regression proof that provider permissions and the reviewer guard authorize the same single response without weakening Git or identity enforcement.

- [ ] **Step 1: Add failing cross-boundary tests**

Extend `reviewer-guard.test.mjs` to derive a guard and launch contract from the same reviewer status, then assert:

```js
assert.equal(guard.checkOperation({ kind: 'write', path: contract.response }), true);
assert.equal(
  matchesClaudeEditRule(contract.permissions.allow.at(-1), contract.response, {
    projectRoot: repositoryRoot,
  }),
  true
);
for (const rejected of [artifact, neighboringResponse, outsideWorktree]) {
  assert.throws(() => guard.checkOperation({ kind: 'write', path: rejected }), {
    code: 'APR_REVIEWER_GUARD',
  });
  assert.equal(
    matchesClaudeEditRule(contract.permissions.allow.at(-1), rejected, {
      projectRoot: repositoryRoot,
    }),
    false
  );
}
```

Extend `reviewer-boundary.test.mjs` with a recovered launch that proves HEAD, branch, index, retained refs, artifact bytes, staged/unstaged pre-existing work, neighbor bytes, reviewer fingerprint, and event sequence are unchanged except for the legitimate response/submission transition.

- [ ] **Step 2: Run the boundary suites and confirm the red state**

Run: `node --test test/integration/reviewer-boundary.test.mjs test/integration/reviewer-guard.test.mjs`

Expected: FAIL until fixture wiring and any exact-operation alignment are implemented.

- [ ] **Step 3: Implement only the required boundary alignment**

Prefer adapting the test fixture to the existing `deriveReviewerGuard` contract. Modify `src/config/guards.mjs` only if a real mismatch exists; do not add Claude syntax to the provider-neutral guard and do not widen its command grammar. Any adapter fix must remain inside the exact response path and package-owned scratch path.

- [ ] **Step 4: Run all required permission and boundary suites**

Run:

```bash
node --test test/unit/claude-launch-permissions.test.mjs
node --test test/integration/claude-launch-permissions.test.mjs
node --test test/integration/reviewer-boundary.test.mjs test/integration/reviewer-guard.test.mjs
```

Expected: every suite PASS, including artifact/neighbor negative controls and same-session submission.

- [ ] **Step 5: Commit boundary coverage**

```bash
git add test/integration/reviewer-boundary.test.mjs test/integration/reviewer-guard.test.mjs src/config/guards.mjs src/provider/claude-launch.mjs
git commit -m "test: preserve reviewer launch boundaries" -m "Closes #37"
```

---

### Task 5: Skill guidance, golden contract, and optional live gate

**Files:**

- Modify: `skills/peer-review/SKILL.md`
- Modify: `test/golden/skill.test.mjs`
- Modify: `test/golden/help.test.mjs`
- Modify: `.github/workflows/ci.yml`
- Modify: `test/packaging/package.test.mjs`

**Interfaces:**

- Consumes: the `launch-reviewer` CLI contract from Task 3.
- Produces: package-owned author guidance and a disabled-by-default live-provider job that cannot affect required CI.

- [ ] **Step 1: Write failing guidance tests**

Require the normalized skill text to contain all of:

```js
for (const phrase of [
  'peer-review launch-reviewer',
  'permission-mode dontAsk',
  'double leading slash',
  'do not construct Edit or Write rules by hand',
  'same recorded Claude session',
  'provider exit is not submission',
  'permission-blocked',
])
  assert.ok(normalized.includes(phrase.toLowerCase()), phrase);
```

Extend help assertions to require exact-response readiness, private session continuity, and the bounded resume command.

- [ ] **Step 2: Run golden tests and confirm failure**

Run: `node --test test/golden/skill.test.mjs test/golden/help.test.mjs`

Expected: FAIL because the active guidance does not yet mention the adapter.

- [ ] **Step 3: Update the installable skill**

Add a concise Claude-launch section that requires the package command, prohibits freehand permission rules, explains the double-leading-slash absolute form, requires prompt surfacing of a permission-blocked exit, and requires the printed `--resume` command to preserve session/model/effort. Keep the skill provider-neutral outside this explicitly Claude-specific subsection and retain the terse-chat policy.

- [ ] **Step 4: Make the optional live-provider lane executable but non-required**

Replace the current hard-disabled echo-only job with a `workflow_dispatch`-gated job that runs only when an explicit live-provider input and required secret are present. Keep `continue-on-error: true`; create a disposable fixture in runner scratch; run only the focused live conformance entry point; upload sanitized evidence; and ensure pull requests, pushes, forks, and ordinary dispatches never invoke Claude.

Update `test/packaging/package.test.mjs` to assert that `live-provider-optional` remains separately gated, continue-on-error, outside every required job, and absent from required status semantics.

- [ ] **Step 5: Run skill, help, packaging, and focused permission suites**

Run:

```bash
node --test test/golden/skill.test.mjs test/golden/help.test.mjs
node --test test/packaging/package.test.mjs
node --test test/unit/claude-launch-permissions.test.mjs
node --test test/integration/claude-launch-permissions.test.mjs
```

Expected: all suites PASS; no live provider is contacted.

- [ ] **Step 6: Commit guidance and live-gate policy**

```bash
git add skills/peer-review/SKILL.md test/golden/skill.test.mjs test/golden/help.test.mjs .github/workflows/ci.yml test/packaging/package.test.mjs
git commit -m "docs: govern Claude reviewer launch recovery" -m "Closes #37"
```

---

### Task 6: Full verification and governed handoff

**Files:**

- Modify only files required by formatter, linter, or genuine failing regressions.
- Verify: GitHub issue #37 root verification commands and Definition of Done.

**Interfaces:**

- Consumes: all preceding tasks.
- Produces: exact command evidence at the final commit and a `CODE_COMPLETE` report for the orchestrator/human review path.

- [ ] **Step 1: Run targeted verification in issue order**

Run each separately and inspect its output:

```bash
node --test test/unit/claude-launch-permissions.test.mjs
node --test test/integration/claude-launch-permissions.test.mjs
node --test test/integration/reviewer-boundary.test.mjs test/integration/reviewer-guard.test.mjs
node --test test/golden/skill.test.mjs test/golden/help.test.mjs
```

Expected: every command exits 0 with no skipped deterministic assertions.

- [ ] **Step 2: Run formatting and lint before the full suites**

```bash
npm run format:check
npm run lint
```

Expected: both commands exit 0. If formatting changes are needed, run `npm run format`, inspect the diff, commit the mechanical changes, then rerun both checks.

- [ ] **Step 3: Run the complete fast and slow suites**

```bash
npm test
npm run test:slow
```

Expected: all unit, golden, integration, MCP, and smoke tests pass.

- [ ] **Step 4: Verify packaging and extraction boundaries**

```bash
npm run test:packaging
node scripts/verify-extraction.mjs --require-legacy-removed
npm pack --dry-run
```

Expected: all commands exit 0; the package includes the new provider source/schema/skill and excludes test/runtime scratch/private handles.

- [ ] **Step 5: Commit any final verified corrections**

If Step 2-4 required tracked fixes:

```bash
git add src/provider/claude-launch.mjs test/unit/claude-launch-permissions.test.mjs
git commit -m "fix: complete Claude launch verification" -m "Closes #37"
```

If no files changed, do not create an empty commit.

- [ ] **Step 6: Record issue evidence one command at a time**

Use the governed task helpers to stamp `vc:1` through `vc:8` only after their exact successful command output has been inspected. Stamp commit evidence from:

```bash
git log --oneline -1
```

Then stamp the functional DoD items for tests, lint, commits, acceptance criteria, and the final checkbox invariant. Do not stamp lifecycle or housekeeping items; those belong to Review and Close.

- [ ] **Step 7: Capture completion accounting and report**

Run:

```bash
node node_modules/ai-task-manager/scripts/task-tracker/task-tracker.mjs words-count
git status --short --branch
git log --oneline origin/trunk..HEAD
```

Compute `words_delta` from the pickup `W_start=295`, include focused active duration, list any genuinely unverifiable checkbox, and report exactly `CODE_COMPLETE`. Do not run `/task review` or `/task close`; the governed orchestrator/human path owns those transitions.
