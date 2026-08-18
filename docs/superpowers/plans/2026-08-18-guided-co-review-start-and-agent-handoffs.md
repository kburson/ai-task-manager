<!-- @story #1269 -->

# Guided Co-Review Start and Agent Handoffs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one safe `npx aitm co-review start` entrypoint that initializes the existing protocol and emits durable, self-contained author and reviewer handoffs.

**Architecture:** Keep `initializeProtocol` as the only lifecycle authority. A focused startup module resolves interactive or flagged input, derives a unique ignored runtime directory, validates and renders all startup artifacts in memory, publishes them atomically, and verifies a deterministic manifest before the CLI prints two thin handoff prompts. Existing protocol, repository-boundary, and archive semantics remain unchanged.

**Tech Stack:** Node.js ESM, `node:test`, synchronous filesystem primitives for atomic publication, `node:readline/promises` for the interactive adapter, SHA-256 manifests, and AITM package/help contracts.

## Global Constraints

- Preserve `aitm.co-review/v1`; the startup manifest is metadata, never lifecycle authority.
- Reuse `initializeProtocol`; do not copy or fork initialization validation.
- Never launch agents, mutate Git, stage files, change task state, or make network calls.
- Default to 10 reviewer turns, 20 observed wait cycles, and a 60-second wait interval.
- Publish no terminal prompt until state, both handoffs, and the manifest are present and hash-verified.
- Exact retries add no protocol event and rewrite no identical file; conflicting retries fail closed.
- Preserve existing `init`, lifecycle, archive, repository-boundary, and package test behavior.

---

### Task 1: Build the deterministic startup core with failing tests

**Files:**

- Create: `scripts/tests/fixtures/co-review-start-cases.mjs`
- Create: `scripts/review/lib/start.mjs`
- Modify: `scripts/tests/unit/review/co-review.test.mjs`

**Interfaces:**

- Export `START_DEFAULTS`, `deriveRuntimeDir`, `renderAuthorHandoff`, `renderReviewerHandoff`, and `startProtocol` from `scripts/review/lib/start.mjs`.
- `startProtocol(options, dependencies)` accepts explicit resolved values and injectable `initialize`, `clock`, `creationId`, and filesystem operations.
- Return `{ state, manifest, authorHandoff, reviewerHandoff, output }`; each file record exposes its repository-relative path and the absolute path used by the terminal prompt.

- [ ] **Step 1: Add failing default, validation, and delegation tests**

Import the new fixture from the package test entrypoint and assert:

```js
assert.deepEqual(START_DEFAULTS, {
  maxReviewTurns: 10,
  waitCycles: 20,
  waitIntervalSeconds: 60,
});
assert.equal(calls.initialize.length, 1);
assert.equal(calls.initialize[0].maxReviewTurns, 10);
assert.throws(() => resolveStartOptions({ waitCycles: 0 }), /wait-cycles/);
assert.throws(() => resolveStartOptions({ waitIntervalSeconds: 61 }), /wait-interval/);
```

Cover distinct identities, blank required values, integer-only limits, repository-contained paths, unique `.tmp/co-review/<artifact-slug>-<creation-id>` derivation, explicit `--dir`, and symlink/path refusal delegated to initialization.

- [ ] **Step 2: Run the focused test and verify RED**

```bash
node --test scripts/tests/unit/review/co-review.test.mjs
```

Expected: failure because the startup module and fixture do not exist.

- [ ] **Step 3: Implement minimal option resolution and directory derivation**

Use stable normalization without probing for a reusable prior review:

```js
export const START_DEFAULTS = Object.freeze({
  maxReviewTurns: 10,
  waitCycles: 20,
  waitIntervalSeconds: 60,
});

export function deriveRuntimeDir(artifact, creationId) {
  const stem = path.parse(artifact).name;
  const slug =
    stem
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'artifact';
  return path.posix.join('.tmp/co-review', `${slug}-${creationId}`);
}
```

Validate before calling `initializeProtocol`. Include the resolved explicit `--dir` in every post-resolution failure so recovery never derives and abandons another directory.

- [ ] **Step 4: Add failing concrete handoff tests**

Assert both generated documents contain concrete repository root, worktree, branch, protocol ID, runtime path, artifact, identities, budget, wait settings, exact `status`/`claim`/`wait`/role-specific `handoff` forms, immutable evidence rules, exit handling, accepted/intervention behavior, human-only boundaries, and compaction recovery. Assert no `<placeholder>` tokens survive.

- [ ] **Step 5: Implement the two deterministic renderers**

Render repository-ready Markdown from one frozen model:

```js
const model = Object.freeze({
  repositoryRoot: state.repositoryRoot,
  worktree: state.worktree,
  branch: state.branch,
  protocolId: state.protocolId,
  runtimeDir: state.initialization.runtimeDir,
  artifact: state.artifact.path,
  owner: state.roles.owner,
  reviewer: state.roles.reviewer,
  maxReviewTurns: state.maxReviewTurns,
  waitCycles,
  waitIntervalSeconds,
});
```

Keep shared recovery/wait text in one renderer helper and role-only responsibilities in the author/reviewer sections.

- [ ] **Step 6: Run focused tests and commit the contract slice**

```bash
node --test scripts/tests/unit/review/co-review.test.mjs
git add scripts/review/lib/start.mjs scripts/tests/fixtures/co-review-start-cases.mjs scripts/tests/unit/review/co-review.test.mjs
git commit -m "feat: define guided co-review startup [#1269]"
```

#### Publish and recover deterministic startup materials

**Files:**

- Modify: `scripts/review/lib/start.mjs`
- Modify: `scripts/tests/fixtures/co-review-start-cases.mjs`

**Interfaces:**

- Manifest schema: `aitm.co-review-start/v1`.
- Generated files: `author-handoff.md`, `reviewer-handoff.md`, `start-manifest.json`.
- Each handoff manifest record has repository-relative `path` and `sha256:<hex>`.

- [ ] **Step 1: Add failing publication and manifest tests**

Assert the manifest records protocol ID, runtime, artifact, roles, limits, creation time, and exact handoff hashes:

```js
assert.equal(manifest.schema, 'aitm.co-review-start/v1');
assert.equal(manifest.protocolId, state.protocolId);
assert.equal(manifest.handoffs.author.sha256, digest(authorBytes));
assert.equal(manifest.handoffs.reviewer.sha256, digest(reviewerBytes));
```

Assert startup uses same-directory temporary files and atomic rename, leaves unrelated files untouched, and emits no prompt until all hashes verify.

- [ ] **Step 2: Run the focused test and verify RED**

```bash
node --test scripts/tests/unit/review/co-review.test.mjs
```

Expected: publication, manifest, and recovery cases fail.

- [ ] **Step 3: Implement atomic publication and verification**

Render bytes before the first startup-file write. For each destination, create an exclusive same-directory temporary file, close it, and rename it. Publish the manifest last. Read all three files back and verify exact bytes/hashes before returning output.

- [ ] **Step 4: Add failing exact-retry and partial-recovery tests**

Cover:

```js
assert.deepEqual(readEvents(root, dir), eventsBeforeRetry);
assert.equal(readFileSync(authorPath, 'utf8'), authorBeforeRetry);
assert.throws(() => retry({ waitCycles: 21 }), /startup-conflict/);
assert.throws(() => retryAfterEditing(reviewerPath), /startup-conflict/);
```

Also cover reconstruction of exactly one missing handoff when protocol state, manifest settings, surviving bytes, and retry inputs agree; refusal for changed identities, artifact, limits, manifest bytes, or incompatible lifecycle.

- [ ] **Step 5: Implement manifest-led retry and recovery**

When a manifest exists, validate it and protocol state before accepting or reconstructing anything. When state exists but manifest publication did not complete, compare retry inputs to initialization and regenerate deterministic startup bytes using the state's identity/time anchor. Never overwrite conflicting bytes. Wrap errors with the resolved directory and exact explicit retry command.

- [ ] **Step 6: Add injected failure coverage**

Inject failures before initialization, immediately after initialization, between handoff renames, and before manifest rename. Assert pre-initialization failures say `no state changed`; post-initialization failures preserve protocol state and print the explicit recovery command.

- [ ] **Step 7: Run focused tests and commit publication**

```bash
node --test scripts/tests/unit/review/co-review.test.mjs
git add scripts/review/lib/start.mjs scripts/tests/fixtures/co-review-start-cases.mjs
git commit -m "feat: publish co-review agent handoffs [#1269]"
```

### Task 2: Add interactive and flagged CLI forms

**Files:**

- Modify: `scripts/review/co-review.mjs`
- Modify: `scripts/review/lib/start.mjs`
- Modify: `scripts/tests/fixtures/co-review-fixture.mjs`
- Modify: `scripts/tests/fixtures/co-review-start-cases.mjs`

**Interfaces:**

- `start` flags: `--artifact`, `--owner`, `--reviewer`, `--dir`, `--max-turns`, `--wait-cycles`, `--wait-interval`.
- Add an injectable prompt adapter to `runCli`; production uses `node:readline/promises` only when required values are absent and both input/output are interactive.
- Cancellation returns exit 0 and writes no state.

- [ ] **Step 1: Add failing non-interactive CLI tests**

Assert a complete invocation bypasses prompts, defaults omitted limits, accepts every override, prints only:

```text
AUTHOR PROMPT
Read and follow this handoff completely, then begin:
<absolute-author-path>

REVIEWER PROMPT
Read and follow this handoff completely, then begin:
<absolute-reviewer-path>
```

Missing required values without a TTY return exit 2 with `no state changed`.

- [ ] **Step 2: Add failing interactive tests**

Inject scripted answers for all seven fields and confirmation. Assert displayed labels use `Author`, the complete resolved configuration is shown before mutation, accepted defaults work, cancellation returns 0 with `no state changed`, and a rejected confirmation never calls initialization.

- [ ] **Step 3: Implement CLI orchestration**

Add `start` before `init` in dispatch. Parse integer strings at the CLI boundary, select the interactive adapter only for incomplete input on a TTY, then call `startProtocol`. Return its thin output directly instead of JSON.

- [ ] **Step 4: Preserve parser and exit behavior**

Reject unknown, duplicate, missing-value, malformed, and out-of-range flags with exit 2. Map repository/protocol/publication conflicts to exit 1. Preserve existing command parsing and output byte-for-byte.

- [ ] **Step 5: Run focused and parser regression tests**

```bash
node --test scripts/tests/unit/review/co-review.test.mjs
```

Expected: all startup and existing co-review cases pass.

- [ ] **Step 6: Commit CLI integration**

```bash
git add scripts/review/co-review.mjs scripts/review/lib/start.mjs scripts/tests/fixtures/co-review-fixture.mjs scripts/tests/fixtures/co-review-start-cases.mjs
git commit -m "feat: add guided co-review start command [#1269]"
```

### Task 3: Bring help and package documentation into parity

**Files:**

- Modify: `scripts/review/lib/help.mjs`
- Modify: `scripts/lib/self-doc.mjs`
- Modify: `scripts/tests/fixtures/co-review-start-cases.mjs`
- Modify: `scripts/tests/unit/meta/package-test-corpus.test.mjs`

- [ ] **Step 1: Add failing command-help tests**

Assert `COMMANDS` lifecycle order starts with `start`, and `co-review help start` covers interactive and flagged forms, defaults, directory derivation, generated filenames, thin prompts, role/human boundaries, separately observed waits, compaction recovery, exact retry, partial publication recovery, exits, and the no-agent-launch non-goal.

- [ ] **Step 2: Add failing package-facing documentation tests**

Assert `aitm help`, package command routing, examples, and self-documentation name the `start` form and flags without removing low-level commands. Add the startup fixture module to the package corpus only if discovery does not already include it.

- [ ] **Step 3: Implement structured help and package parity**

Add the `start` structured record before `init`, update top-level lifecycle prose and examples, and extend the package command usage/contract. Keep help read-only and render all records through the existing authority.

- [ ] **Step 4: Run documentation-focused verification**

```bash
node --test scripts/tests/unit/review/co-review.test.mjs scripts/tests/unit/meta/package-test-corpus.test.mjs
npm run format:check
npm run spell:check
npm run lint
git diff --check
```

- [ ] **Step 5: Commit documentation parity**

```bash
git add scripts/review/lib/help.mjs scripts/lib/self-doc.mjs scripts/tests/fixtures/co-review-start-cases.mjs scripts/tests/unit/meta/package-test-corpus.test.mjs
git commit -m "docs: document guided co-review startup [#1269]"
```

#### Final verification and delivery

**Files:**

- Verify all files changed since `origin/trunk`.

- [ ] **Step 6: Run focused behavioral verification**

```bash
node --test scripts/tests/unit/review/co-review.test.mjs
node --test scripts/tests/unit/meta/package-test-corpus.test.mjs
```

- [ ] **Step 7: Run governed quality verification**

```bash
npm test
npm run test:slow
npm run lint
npm run format:check
git diff --check
```

Do not raise any timeout. Report a baseline, capacity, or timing failure exactly and rerun only when the governed workflow permits it.

- [ ] **Step 8: Inspect the final scope and provenance**

```bash
git status --short
git log --oneline origin/trunk..HEAD
git diff --stat origin/trunk...HEAD
git diff --check origin/trunk...HEAD
```

Confirm the approved design and this plan remain committed, all generated examples are concrete, and unrelated artifacts are untouched.

- [ ] **Step 9: Obtain an independent exact-SHA review**

Request review of the exact HEAD against `origin/trunk`, including design/acceptance coverage, initialization delegation, retry atomicity, help/API parity, and test adequacy. Resolve every Critical, Important, and Minor finding with fresh verification and re-review.

- [ ] **Step 10: Complete the governed branch workflow**

Advance #1269 through Test and Review, create its PR, require CI for the pushed SHA, record Full-Auto approval, squash-merge, verify the trunk receipt, finalize evidence, and close only after all gates pass.
