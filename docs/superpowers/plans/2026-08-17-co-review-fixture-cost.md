<!-- @story #1292 -->

# Co-Review Fixture Cost Reduction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove real Git and external Node subprocesses from pure co-review
protocol tests while retaining a minimal real-boundary suite and passing the
unchanged governed unit timing ceiling.

**Architecture:** Route repository observations through a behavior-oriented
adapter whose default implementation preserves the existing Git commands.
Pure fixtures inject a deterministic in-process repository model; explicitly
selected slow tests continue through real Git, filesystem, concurrency, and
CLI boundaries.

**Tech Stack:** Node.js ESM, `node:test`, synchronous filesystem primitives,
Git CLI at the production boundary, and AITM's discovered test runners.

## Global Constraints

- Do not change co-review state/event schemas, CLI output, or production error
  categories.
- Do not relax the 600-second governed unit-section ceiling.
- Keep path containment, symlink, tracked/index/HEAD, commit-reachability,
  publication, and mutex/concurrency assertions real in the boundary suite.
- The in-memory adapter is available only through explicit test dependency
  injection; production defaults to real Git.
- Use repository-local `.tmp/test/` helpers for every test sandbox.
- Preserve the current 61 behavioral outcomes across the fast and boundary
  entrypoints.

---

### Task 1: Define and extract the repository boundary

**Files:**

- Create: `scripts/review/lib/repository-boundary.mjs`
- Create: `scripts/tests/unit/review/repository-boundary.test.mjs`
- Modify: `scripts/review/lib/protocol.mjs`
- Modify: `scripts/review/lib/archive.mjs`

**Interfaces:**

- Produces: `createRealRepositoryBoundary({ execFileSyncImpl })` and
  `REAL_REPOSITORY_BOUNDARY`.
- Produces methods `repositoryRoot`, `runtimeStatus`, `trackedArtifact`,
  `resolveReachableCommit`, `committedArtifact`, and `identity`.
- Every method either returns normalized data or throws a supplied protocol
  error factory's result; callers retain ownership of domain error codes.

- [ ] **Step 1: Write the failing real-boundary contract tests**

Add tests that create one project-isolated real repository and assert these
return shapes:

```js
assert.equal(boundary.repositoryRoot(root), realpathSync(root));
assert.deepEqual(boundary.runtimeStatus(root, '.tmp/review'), {
  ignored: true,
  tracked: false,
});
assert.deepEqual(boundary.identity(root), {
  branch: 'trunk',
  head: initialCommit,
});
assert.deepEqual(boundary.trackedArtifact(root, 'docs/artifact.md'), {
  worktree: Buffer.from('# Artifact\n'),
  index: Buffer.from('# Artifact\n'),
  head: Buffer.from('# Artifact\n'),
  commit: initialCommit,
  blob: expectedBlob,
});
```

Also inject an `execFileSyncImpl` spy and assert argv/`cwd`/buffer mode for
`rev-parse`, `check-ignore`, `ls-files`, `show`, and `merge-base`.

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
node --test scripts/tests/unit/review/repository-boundary.test.mjs
```

Expected: fail because `repository-boundary.mjs` does not exist.

- [ ] **Step 3: Implement the minimal real adapter**

Use this exported shape:

```js
export function createRealRepositoryBoundary({ execFileSyncImpl = execFileSync } = {}) {
  function run(cwd, args, { buffer = false, allowFailure = false } = {}) {
    try {
      return execFileSyncImpl('git', args, {
        cwd,
        encoding: buffer ? null : 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
      });
    } catch (error) {
      if (allowFailure) return null;
      throw error;
    }
  }

  return Object.freeze({
    repositoryRoot(cwd) {},
    runtimeStatus(root, relative) {},
    trackedArtifact(root, relative) {},
    resolveReachableCommit(root, revision) {},
    committedArtifact(root, commit, relative) {},
    identity(root) {},
  });
}

export const REAL_REPOSITORY_BOUNDARY = createRealRepositoryBoundary();
```

Keep `ProtocolError` translation in `protocol.mjs`; the adapter exposes Git
failure facts without depending on protocol types.

- [ ] **Step 4: Route protocol and archive helpers through the adapter**

Add `repository = REAL_REPOSITORY_BOUNDARY` to every exported protocol option
object and propagate it through nested `readProtocol`, `statusProtocol`, and
`assertIntegrity` calls. Replace inline Git calls with the adapter methods.
Change archive resolution to accept the same optional repository argument.

Production call sites omit it and therefore remain on the real adapter.

- [ ] **Step 5: Run focused regression tests**

Run:

```bash
node --test scripts/tests/unit/review/repository-boundary.test.mjs scripts/tests/unit/review/co-review.test.mjs
```

Expected: repository-boundary tests pass and all existing co-review cases still
pass on the default real adapter.

- [ ] **Step 6: Commit the boundary extraction**

```bash
git add scripts/review/lib/repository-boundary.mjs \
  scripts/review/lib/protocol.mjs scripts/review/lib/archive.mjs \
  scripts/tests/unit/review/repository-boundary.test.mjs
git commit -m "refactor: isolate co-review repository boundary [#1292]"
```

### Task 2: Build the deterministic repository fixture

**Files:**

- Create: `scripts/tests/fixtures/co-review-memory-repository.mjs`
- Create: `scripts/tests/unit/review/co-review-fixture-cost.test.mjs`
- Modify: `scripts/tests/fixtures/co-review-fixture.mjs`

**Interfaces:**

- Produces: `createMemoryRepository({ root, branch, artifact, bytes })`.
- Produces model operations `commit(path, bytes, message)` and `setIndex(path,
bytes)` for drift cases.
- Produces adapter methods identical to `REAL_REPOSITORY_BOUNDARY`.
- Produces fixture helpers `memoryRepositoryFixture`,
  `realRepositoryFixture`, `memoryProtocol`, and `realProtocol`.

- [ ] **Step 1: Write the failing cost-contract test**

Inject spies into the fixture and assert that a memory initialization, claim,
owner handoff, reviewer handoff, status, and cleanup path records:

```js
assert.equal(processCalls.git, 0);
assert.equal(processCalls.nodeCli, 0);
assert.equal(state.lifecycle, 'accepted');
assert.deepEqual(
  readEvents(root, options.dir).map((row) => row.type),
  ['init', 'claim', 'owner-handoff', 'claim', 'reviewer-handoff']
);
```

Add parity assertions for repository identity, ignored/untracked runtime,
tracked artifact, reachable commit, committed bytes, and deliberate drift.

- [ ] **Step 2: Run the cost test and verify RED**

Run:

```bash
node --test scripts/tests/unit/review/co-review-fixture-cost.test.mjs
```

Expected: fail because the memory repository fixture is absent.

- [ ] **Step 3: Implement the in-memory model**

Use stable SHA-256-derived 40-character identifiers so state validation sees
Git-shaped values without invoking Git:

```js
const oid = (kind, bytes) =>
  createHash('sha256').update(kind).update(Buffer.from(bytes)).digest('hex').slice(0, 40);
```

Store commits as immutable snapshots of tracked paths. `commit()` writes the
artifact bytes to disk, updates index and HEAD snapshots, adds the prior HEAD to
the reachable set, and returns the new commit id. Unknown commits or paths
return the same failure facts as the real adapter.

- [ ] **Step 4: Bind fixture protocol calls to the model**

Return a protocol facade that injects the adapter into every repository-aware
public method while preserving exported classes and constants unchanged:

```js
function bindProtocol(api, repository) {
  const inject =
    (name) =>
    (options = {}) =>
      api[name]({ ...options, repository });
  return {
    ...api,
    initializeProtocol: inject('initializeProtocol'),
    readProtocol: inject('readProtocol'),
    statusProtocol: inject('statusProtocol'),
    claimTurn: inject('claimTurn'),
    registerSupplement: inject('registerSupplement'),
    handoffOwner: inject('handoffOwner'),
    handoffReviewer: inject('handoffReviewer'),
    setMaxReviewTurns: inject('setMaxReviewTurns'),
    continueProtocol: inject('continueProtocol'),
  };
}
```

Keep `realRepositoryFixture()` and the current external `runCli()` explicitly
named so real-boundary use is visible in review.

- [ ] **Step 5: Run the new unit tests**

Run:

```bash
node --test scripts/tests/unit/review/repository-boundary.test.mjs scripts/tests/unit/review/co-review-fixture-cost.test.mjs
```

Expected: pass with zero real process calls on the memory path.

- [ ] **Step 6: Commit the deterministic fixture**

```bash
git add scripts/tests/fixtures/co-review-memory-repository.mjs \
  scripts/tests/fixtures/co-review-fixture.mjs \
  scripts/tests/unit/review/co-review-fixture-cost.test.mjs
git commit -m "test: add deterministic co-review repository fixture [#1292]"
```

### Task 3: Migrate pure protocol behavior in small slices

**Files:**

- Modify: `scripts/tests/fixtures/co-review-budget-cases.mjs`
- Modify: `scripts/tests/fixtures/co-review-handoff-cases.mjs`
- Modify: `scripts/tests/fixtures/co-review-supplement-cases.mjs`
- Modify: `scripts/tests/fixtures/co-review-e2e-cases.mjs`
- Modify: `scripts/tests/unit/review/co-review.test.mjs`

**Interfaces:**

- Consumes: `memoryProtocol`, `memoryRepositoryFixture`, and model mutation
  methods from Task 2.
- Produces: the fast 61-outcome protocol corpus with no external Git/Node calls
  except cases explicitly moved to Task 4.

- [ ] **Step 1: Convert budget and supplement state cases**

Replace implicit real fixtures with memory fixtures. Express drift by changing
model and filesystem state explicitly, for example:

```js
repository.setWorktree(options.artifact, Buffer.from('# Drift\n'));
assert.match(api.statusProtocol(options).integrity.errors.join('\n'), /artifact-drift/);
```

Run:

```bash
node --test scripts/tests/unit/review/co-review.test.mjs
```

Expected: the converted slice passes with unchanged assertions.

- [ ] **Step 2: Convert handoff and supplement lifecycle cases**

Use `repository.commit()` wherever `commitArtifact()` previously invoked Git.
Preserve every response/review/supplement byte-integrity and idempotency
assertion.

Run the same focused command and verify all converted cases pass.

- [ ] **Step 3: Convert direct CLI routing cases**

Use `runCliDirect` with an injected protocol facade for parser, identity,
status, and error-code tests that do not need a process boundary. Keep only one
representative external path per command family for Task 4.

- [ ] **Step 4: Assert the fast entrypoint is process-free**

Extend `co-review-fixture-cost.test.mjs` to import the fast case graph with
process spies and assert zero real Git and Node CLI calls. Remove the
`@parallel-unsafe` annotation only after this assertion passes.

- [ ] **Step 5: Commit the pure-case migration**

```bash
git add scripts/tests/fixtures/co-review-*-cases.mjs \
  scripts/tests/unit/review/co-review.test.mjs \
  scripts/tests/unit/review/co-review-fixture-cost.test.mjs
git commit -m "test: run pure co-review cases in process [#1292]"
```

### Task 4: Retain and prove the real boundary suite

**Files:**

- Create: `scripts/tests/slow/review/co-review-boundaries.test.mjs`
- Modify: `scripts/tests/unit/review/co-review.test.mjs`
- Modify: `scripts/tests/unit/meta/package-test-corpus.test.mjs` only if the
  repository's discovery test requires an immutable surface assertion.

**Interfaces:**

- Consumes: `realRepositoryFixture`, `realProtocol`, `runCli`, and `runCliAsync`.
- Produces: one explicit slow entrypoint for real Git/filesystem/concurrency/
  publication/CLI contracts.

- [ ] **Step 1: Move the minimum real-boundary cases**

Retain cases for runtime escape/symlink refusal, ignored/untracked enforcement,
artifact/index/HEAD drift, unreachable commit, committed publication bytes,
surviving mutex, identical concurrent claim, external help/init/status, and one
terminal CLI workflow.

- [ ] **Step 2: Run boundary and combined corpus tests**

Run:

```bash
node --test scripts/tests/slow/review/co-review-boundaries.test.mjs
node --test scripts/tests/unit/review/co-review.test.mjs scripts/tests/slow/review/co-review-boundaries.test.mjs
```

Expected: all retained behaviors pass and the combined outcome count equals the
baseline 61 cases (plus the new fixture architecture tests).

- [ ] **Step 3: Verify package discovery**

Run:

```bash
node --test scripts/tests/unit/meta/package-test-corpus.test.mjs
```

Expected: both discovered roots remain represented without adding a mutable
central census unless that test explicitly requires the shipped surface.

- [ ] **Step 4: Commit the boundary split**

```bash
git add scripts/tests/slow/review/co-review-boundaries.test.mjs \
  scripts/tests/unit/review/co-review.test.mjs \
  scripts/tests/unit/meta/package-test-corpus.test.mjs
git commit -m "test: isolate real co-review boundaries [#1292]"
```

### Task 5: Prove timing headroom and complete governed verification

**Files:**

- Modify only files required by formatter or verified test-corpus metadata.

**Interfaces:**

- Consumes: all prior implementation and test entrypoints.
- Produces: exact-SHA evidence for the issue's targeted, unit, lint, format,
  fast, and slow commands.

- [ ] **Step 1: Run targeted commands**

```bash
node --test scripts/tests/unit/review/co-review-fixture-cost.test.mjs
node --test scripts/tests/slow/review/co-review-boundaries.test.mjs
node --test scripts/tests/unit/review/co-review.test.mjs scripts/tests/slow/review/co-review-boundaries.test.mjs
```

Expected: all commands pass; pure instrumentation reports zero Git/Node CLI
processes.

- [ ] **Step 2: Run formatting and lint before heavy suites**

```bash
npm run format:check
npm run lint
```

Expected: both exit 0 with a clean diff afterward.

- [ ] **Step 3: Run the governed unit lane**

```bash
npm run test:unit
```

Expected: all unit sections pass and the exclusive-serial section remains below
600 seconds without changing runner ceilings.

- [ ] **Step 4: Run repository fast and slow lanes**

```bash
npm test
npm run test:slow
```

Expected: both lanes exit 0.

- [ ] **Step 5: Confirm verification left no unowned diff**

```bash
git status --short
```

Expected: clean. If formatting or verification changed a file, return to the
task that owns that file, re-run its focused test cycle, and include the file in
that task's named commit. Then stamp each root criterion with `npx aitm
ac-stamp`, run the governed Test verb, and continue through Full-Auto Review and
Done using the exact SHA required by AITM.
