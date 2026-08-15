# Co-Review Finalization and Turn-Budget Control Implementation Plan

<!-- cspell:ignore ENOTEMPTY TOCTOU noreplace supplementals -->

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `npx aitm co-review` with authenticated active-session budget control, closing-owner exhaustion handling, supplemental human context, and deterministic publication of accepted review evidence.

**Architecture:** Keep `scripts/review/lib/protocol.mjs` authoritative for validated state transitions, event ordering, mutex use, and terminal acceptance. Add pure budget arithmetic, a small authenticated-GitHub-identity adapter, and an archive library that resolves terminal evidence from validated protocol events and publishes a byte-deterministic tree without mutating protocol state. The CLI composes protocol mutation and archive publication so acceptance is durable before any fallible post-acceptance publication.

**Tech Stack:** Node.js 22+ ESM, `node:test`, built-in filesystem/crypto/child-process APIs, Git CLI, GitHub CLI, and the existing AITM command registry and self-documentation catalog.

## Global Constraints

- Preserve the `aitm.co-review/v1` state envelope and `aitm.co-review-event/v1` event envelope; new state fields are optional for legacy readers and new event types are additive.
- Initialization continues to require `--max-turns >= 1`; persisted runtime state allows `maxReviewTurns >= 0`, and `remainingReviewTurns` must always equal `maxReviewTurns - reviewTurnsUsed` without becoming negative.
- A review turn is one successful reviewer handoff. Owner handoffs never consume budget, and a final changes-requested review always permits its closing owner response.
- Accepted state is immutable. Reviewer consensus and explicit human-good-enough are the only accepted decision bases.
- `set-max-turns`, `supplement`, `continue`, and `finalize --good-enough` resolve the authenticated GitHub login before mutation. There is no unauthenticated override.
- Agent `claim` and `handoff` commands retain `--actor`; human-governed commands do not accept a new actor argument.
- Existing `continue --additional-turns`, `continue --focus`, and deprecated `--approved-by` inputs remain accepted. The authenticated GitHub login is authoritative.
- Every protocol mutation uses the existing non-stealing mutex, validates integrity before and inside the lock, appends exactly one event, atomically replaces state, and preserves failed-transition evidence.
- Supplements remain runtime context. They are acknowledged by the next reviewer but are never copied into or listed in the durable archive.
- Archives contain the authoritative artifact, the terminal reviewer document, the terminal owner response, and `README.md`; review and response bytes are copied exactly.
- Archive output is deterministic from terminal protocol evidence. The manifest contains no invocation time, host, locale, tool version, or elapsed duration.
- Archive publication preflights completely, writes to a unique sibling staging directory, writes the manifest last, validates the staged tree, and atomically renames it into place.
- A complete identical destination is an idempotent success. Missing, extra, or different destination content is a precise conflict and is never rewritten.
- Finalization never edits runtime originals, the authoritative artifact, Git state, unrelated dirty files, a GitHub issue, or any remote ref.
- Help remains read-only before repository discovery and renders top-level and per-command lifecycle/authority data from the same `COMMANDS` records.
- Use test-driven development: add focused failing behavior tests, observe the intended failure, then write the smallest implementation that turns them green.
- Do not push, open a pull request, merge, rebase, or force-update any ref without separate human approval.

---

## File Structure

- Create: `scripts/review/lib/budget.mjs` — pure role-dependent floor, absolute maximum, and continuation arithmetic.
- Create: `scripts/review/lib/github-identity.mjs` — authenticated GitHub login resolution with dependency injection and recovery-grade failures.
- Create: `scripts/review/lib/archive.mjs` — archive destination validation, terminal evidence resolution, deterministic names/manifest, conflict inspection, staging, and atomic publication.
- Modify: `scripts/review/lib/protocol.mjs` — optional v1 state fields, new event types, budget mutation, closing-owner state, supplements, continuation, good-enough acceptance, and validated archive snapshot export.
- Modify: `scripts/review/co-review.mjs` — strict parsing/dispatch for new commands, identity orchestration, status decoration, automatic finalization, and exit code 4.
- Modify: `scripts/review/lib/help.mjs` — lifecycle-aware `COMMANDS` metadata and complete recovery documentation.
- Modify: `scripts/lib/self-doc.mjs` — package-facing subcommands, flags, outputs, and exit code 4.
- Modify: `scripts/tests/fixtures/co-review-fixture.mjs` — injected GitHub identity, archive helpers, event/state mutation helpers, and reusable closing-owner fixtures.
- Create: `scripts/tests/fixtures/co-review-budget-cases.mjs` — active adjustment, short-circuit, closing-owner, and continuation cases.
- Create: `scripts/tests/fixtures/co-review-supplement-cases.mjs` — supplement registration, freeze, acknowledgment, consumption, and compatibility cases.
- Create: `scripts/tests/fixtures/co-review-finalization-cases.mjs` — consensus/good-enough publication, manifest, retry, conflict, failure, and concurrency cases.
- Modify: `scripts/tests/unit/review/co-review.test.mjs` — imports the new case modules and owns focused CLI/help/catalog assertions.
- Modify: `scripts/tests/unit/task-tracker/lib/command-catalog-policy.test.mjs` — add explicit co-review synopsis and exit-code 4 assertions to the package command-catalog policy.
- Preserve: `scripts/tests/unit/meta/package-test-corpus.test.mjs` — package-wide discovery already finds `scripts/tests/unit/review/co-review.test.mjs`; do not add a mutable census entry for fixture modules.
- Preserve: `docs/superpowers/specs/2026-08-15-co-review-finalization-and-turn-budget-control-design.md` — approved normative behavior.

## Shared Interfaces

`scripts/review/lib/budget.mjs` exports:

```js
export function reviewBudgetFloor(state, resumeRole);
export function planAbsoluteBudget(state, requestedMax, resumeRole);
export function planContinuationBudget(state, options);
```

`planAbsoluteBudget` returns a frozen record with `priorMax`, `requestedMax`,
`effectiveMax`, `reviewTurnsUsed`, and `remainingReviewTurns`. `options` for
`planContinuationBudget` is `{ resumeRole, maxReviewTurns, additionalTurns }`.

`scripts/review/lib/github-identity.mjs` exports:

```js
export class GitHubIdentityError extends Error;
export function resolveGitHubLogin(options);
```

`resolveGitHubLogin({ cwd, execFileSyncImpl })` returns the non-blank login from
`gh api user --jq .login`. `GitHubIdentityError` carries stable `code`, `message`,
and `exitCode = 1`; its message includes authenticate-and-rerun guidance supplied
by the caller.

`scripts/review/lib/archive.mjs` exports:

```js
export function resolveArchiveDestination(options);
export function inspectArchive(options);
export function prepareArchive(options);
export function publishPreparedArchive(prepared, options);
export function renderArchiveManifest(model);
```

`prepareArchive({ root, state, events, archiveDir })` performs all integrity,
evidence, source-byte, destination, name, and manifest preflight without writing.
It returns a frozen publication model consumed by `publishPreparedArchive`.

`scripts/review/lib/protocol.mjs` retains every #1266 export and adds:

```js
export function setMaxReviewTurns(options);
export function registerSupplement(options);
export function acceptGoodEnough(options);
export function validatedArchiveSnapshot(options);
```

Human-governed protocol mutators receive an already resolved `humanLogin`. The
CLI owns GitHub authentication and passes the login into protocol functions so an
identity failure cannot occur after protocol mutation.

### Task 1: Add authenticated active-session budget adjustment

**Files:**

- Create: `scripts/review/lib/budget.mjs`
- Create: `scripts/review/lib/github-identity.mjs`
- Create: `scripts/review/lib/archive.mjs`
- Create: `scripts/tests/fixtures/co-review-budget-cases.mjs`
- Modify: `scripts/tests/fixtures/co-review-fixture.mjs`
- Modify: `scripts/tests/unit/review/co-review.test.mjs`
- Modify: `scripts/review/lib/protocol.mjs:20-433`
- Modify: `scripts/review/co-review.mjs:9-148`

**Interfaces:**

- Produces: `reviewBudgetFloor`, `planAbsoluteBudget`, `resolveGitHubLogin`,
  `resolveArchiveDestination`, and `setMaxReviewTurns`.
- Extends: `initializeProtocol` with optional `archiveDir` while retaining a
  positive initialization minimum.
- Consumes: existing mutex, integrity, event append, and atomic state-write helpers.

- [ ] **Step 1: Add failing pure budget and identity tests**

Import `co-review-budget-cases.mjs` from `co-review.test.mjs`. Cover owner,
reviewer-available, reviewer-claimed, increase, decrease, zero, floor clamping,
exact no-op retry, invalid numeric input, missing login, and failed `gh` execution.
Use an injected function rather than the real network:

```js
const resolved = resolveGitHubLogin({
  cwd: root,
  execFileSyncImpl(command, args) {
    assert.equal(command, 'gh');
    assert.deepEqual(args, ['api', 'user', '--jq', '.login']);
    return 'kendrick\n';
  },
});
assert.equal(resolved, 'kendrick');

assert.deepEqual(planAbsoluteBudget({ reviewTurnsUsed: 2, maxReviewTurns: 6 }, 0, 'reviewer'), {
  priorMax: 6,
  requestedMax: 0,
  effectiveMax: 3,
  reviewTurnsUsed: 2,
  remainingReviewTurns: 1,
});
```

- [ ] **Step 2: Add failing archive-destination containment tests**

Exercise `resolveArchiveDestination` before implementing it. Assert refusal for a
repository escape, a symlink escape, an ignored destination, and the live protocol
runtime directory. Assert acceptance for a nonexistent repository-relative final
path whose nearest existing ancestor resolves inside the physical repository.
Verify every refusal performs no filesystem write and leaves protocol state/events
unchanged.

- [ ] **Step 3: Add failing protocol and CLI adjustment tests**

Initialize active owner/reviewer fixtures and assert `set-max-turns` preserves
`currentRole`, `turnState`, `claim`, `round`, `artifact`, and
`immutableArtifacts`; appends one `budget-adjustment` event; records login and
requested/effective values; and leaves bytes unchanged on exact no-op retry.
Assert accepted/intervention states and mutex contention refuse without mutation.

```js
const before = snapshotProtocol(root, options.dir);
const adjusted = api.setMaxReviewTurns({
  cwd: root,
  dir: options.dir,
  requestedMax: 0,
  humanLogin: 'kendrick',
});
assert.equal(adjusted.maxReviewTurns, 0);
assert.equal(adjusted.reviewTurnsUsed, 0);
assert.equal(adjusted.currentRole, 'owner');
assert.deepEqual(readEvents(root, options.dir).at(-1).adjustment, {
  priorMax: 6,
  requestedMax: 0,
  effectiveMax: 0,
  reviewTurnsUsed: 0,
  remainingReviewTurns: 0,
  approvedBy: 'kendrick',
});
assert.notDeepEqual(snapshotProtocol(root, options.dir), before);
```

- [ ] **Step 4: Run the focused suite and verify RED**

Expected failures name missing `budget.mjs`, `github-identity.mjs`, optional archive
destination support, and `setMaxReviewTurns`/`set-max-turns` dispatch.

- [ ] **Step 5: Implement pure role-dependent arithmetic**

Use this complete arithmetic in `budget.mjs`:

```js
function integer(value, label, minimum = 0) {
  if (!Number.isInteger(value) || value < minimum) {
    throw new RangeError(`${label} must be an integer >= ${minimum}: ${String(value)}`);
  }
  return value;
}

export function reviewBudgetFloor(state, resumeRole) {
  const used = integer(state.reviewTurnsUsed, 'reviewTurnsUsed');
  if (!['owner', 'reviewer'].includes(resumeRole)) {
    throw new RangeError(`resumeRole must be owner or reviewer: ${String(resumeRole)}`);
  }
  return resumeRole === 'reviewer' ? used + 1 : used;
}

export function planAbsoluteBudget(state, requestedMax, resumeRole) {
  const requested = integer(requestedMax, 'requestedMax');
  const priorMax = integer(state.maxReviewTurns, 'maxReviewTurns');
  const reviewTurnsUsed = integer(state.reviewTurnsUsed, 'reviewTurnsUsed');
  const effectiveMax = Math.max(requested, reviewBudgetFloor(state, resumeRole));
  return Object.freeze({
    priorMax,
    requestedMax: requested,
    effectiveMax,
    reviewTurnsUsed,
    remainingReviewTurns: effectiveMax - reviewTurnsUsed,
  });
}
```

- [ ] **Step 6: Implement authenticated identity and archive-dir normalization**

`resolveGitHubLogin` must execute only `gh api user --jq .login`, reject blank
stdout, preserve the original error as `cause`, and include the exact command the
caller should rerun. `resolveArchiveDestination` must normalize a repository-
relative directory, reject repository escape/symlink escape, reject the runtime
directory and ignored destinations, and permit a nonexistent final path whose
nearest existing ancestor resolves inside the repository.

- [ ] **Step 7: Extend v1 validation, initialization, events, and mutation**

Relax only the runtime validator from `maxReviewTurns < 1` to
`maxReviewTurns < 0`; keep `initializeProtocol` input validation at one. Add all
three new event types—`budget-adjustment`, `supplement`, and `human-good-enough`—to
`eventIntegrity`'s allowed set, and add optional `archiveDir` to
`state.initialization`. Implement `setMaxReviewTurns` under `withMutex`, return the
existing state without an event when `effectiveMax === state.maxReviewTurns`, and
otherwise append exactly one event before atomic state replacement.

- [ ] **Step 8: Add CLI parsing and injected identity orchestration**

Accept:

```text
init ... [--archive-dir <tracked-repo-path>]
set-max-turns --dir <runtime-path> --max-turns <nonnegative-integer>
```

Resolve identity before calling `setMaxReviewTurns`. Add `nonnegativeInteger` rather
than weakening the existing positive initialization parser. Keep help short-circuit
ahead of dynamic protocol/archive imports and identity/network access.

- [ ] **Step 9: Run focused and repository Develop verification, then commit**

Expected: focused tests pass; invalid/identity/lock/lifecycle refusals preserve
state/events; initialization still rejects zero.

```bash
node --test scripts/tests/unit/review/co-review.test.mjs
node scripts/task-tracker/verify-develop.mjs
git add scripts/review/co-review.mjs scripts/review/lib/protocol.mjs \
  scripts/review/lib/budget.mjs scripts/review/lib/github-identity.mjs \
  scripts/review/lib/archive.mjs scripts/tests/fixtures/co-review-fixture.mjs \
  scripts/tests/fixtures/co-review-budget-cases.mjs \
  scripts/tests/unit/review/co-review.test.mjs
git commit -m "[#1268] feat: add co-review budget control"
```

**Verification Commands:**

```text
node --test scripts/tests/unit/review/co-review.test.mjs
node scripts/task-tracker/verify-develop.mjs
```

### Task 2: Preserve the closing owner turn and unify continuation arithmetic

**Files:**

- Modify: `scripts/review/lib/budget.mjs`
- Modify: `scripts/review/lib/protocol.mjs:617-845`
- Modify: `scripts/review/co-review.mjs:86-148`
- Modify: `scripts/tests/fixtures/co-review-budget-cases.mjs`
- Modify: `scripts/tests/fixtures/co-review-e2e-cases.mjs`
- Modify: `scripts/tests/fixtures/co-review-handoff-cases.mjs`

**Interfaces:**

- Produces: `planContinuationBudget(state, options)`.
- Changes: final changes-requested reviewer handoff transfers to an available owner
  instead of entering intervention immediately.
- Changes: owner handoff with zero remaining turns enters `intervention-required`.
- Preserves: `continue --additional-turns`, `continue --focus`, and deprecated
  ignored `--approved-by` parsing.

- [ ] **Step 1: Add failing closing-owner and zero-short-circuit tests**

Cover final changes-requested without a summary, available closing owner, required
`--answers`, zero-turn opening-owner handoff, owner handoff returning to
intervention, unchanged reviewer acceptance precedence, and `wait` returning
intervention rather than `invalid-state`.

```js
const exhaustedReview = api.handoffReviewer({
  cwd: root,
  dir: options.dir,
  actor: 'reviewer-agent',
  review,
  reviewOf: commit,
  decision: 'changes-requested',
  message: 'final findings',
});
assert.equal(exhaustedReview.lifecycle, 'active');
assert.equal(exhaustedReview.currentRole, 'owner');
assert.equal(exhaustedReview.turnState, 'available');
assert.equal(exhaustedReview.remainingReviewTurns, 0);

const closedCycle = completeOwnerHandoff(exhaustedReview);
assert.equal(closedCycle.lifecycle, 'intervention-required');
assert.equal(closedCycle.currentRole, null);
assert.equal(closedCycle.lastHandoff.from, 'owner');
```

- [ ] **Step 2: Add failing legacy and author-completed continuation tests**

Test bare continuation of a legacy reviewer-exhausted state resumes owner with
`maxReviewTurns === reviewTurnsUsed`; bare continuation after a closing owner resumes
reviewer with `maxReviewTurns === reviewTurnsUsed + 1`; absolute values clamp to the
same floors; absolute/additional flags are mutually exclusive; and additional-turn
compatibility computes `currentMaxReviewTurns + N`.

- [ ] **Step 3: Run focused tests and verify RED**

Expected: current final-review logic still demands summary/intervenes too early and
current continuation always resumes owner with additive budget.

- [ ] **Step 4: Implement shared continuation planning**

Add this decision shape to `budget.mjs`:

```js
export function planContinuationBudget(
  state,
  { resumeRole, maxReviewTurns, additionalTurns } = {}
) {
  if (maxReviewTurns !== undefined && additionalTurns !== undefined) {
    throw new RangeError('maxReviewTurns and additionalTurns are mutually exclusive');
  }
  const requestedMax =
    additionalTurns === undefined
      ? maxReviewTurns === undefined
        ? reviewBudgetFloor(state, resumeRole)
        : maxReviewTurns
      : state.maxReviewTurns + additionalTurns;
  return planAbsoluteBudget(state, requestedMax, resumeRole);
}
```

Determine `resumeRole` from evidence, not a new schema version: a legacy intervention
whose last handoff is from reviewer resumes owner; an author-completed intervention
whose last handoff is from owner resumes reviewer.

- [ ] **Step 5: Change reviewer and owner handoff transitions**

Reviewer changes-requested always records the immutable review and makes owner
available, even when remaining becomes zero. Remove the new-summary requirement but
retain legacy summary ingestion when supplied by a legacy-compatible caller. Owner
handoff computes its next lifecycle solely from remaining budget: zero enters
intervention with no claimable role; positive makes reviewer available.

- [ ] **Step 6: Rewrite continuation through the shared primitive**

Resolve authenticated login before the mutator, freeze no supplements yet, preserve
focus hashing semantics, record requested/effective/prior maximum plus resumed role,
and set `currentRole` to the derived owner/reviewer role. Exact retry after success
continues to be rejected by lifecycle rather than replaying an event.

- [ ] **Step 7: Update CLI forms and status next actions**

Accept bare `continue`, `continue --max-turns N`, or legacy
`continue --additional-turns N`; reject both budget flags together. Accept but ignore
`--approved-by`, emitting one deprecation line. Human-readable/JSON status identifies
closing-owner exhaustion and prints one copyable command. The single continuation
command shown after intervention is an intentional provisional Task 2 surface;
Task 5 replaces that intervention rendering with its complete available-action
enumeration.

- [ ] **Step 8: Run focused and repository Develop verification, then commit**

```bash
node --test scripts/tests/unit/review/co-review.test.mjs
node scripts/task-tracker/verify-develop.mjs
git add scripts/review/co-review.mjs scripts/review/lib/protocol.mjs \
  scripts/review/lib/budget.mjs scripts/tests/fixtures/co-review-budget-cases.mjs \
  scripts/tests/fixtures/co-review-e2e-cases.mjs \
  scripts/tests/fixtures/co-review-handoff-cases.mjs
git commit -m "[#1268] feat: preserve exhausted review cycles"
```

**Verification Commands:**

```text
node --test scripts/tests/unit/review/co-review.test.mjs
node scripts/task-tracker/verify-develop.mjs
```

### Task 3: Register supplements and require reviewer acknowledgments

**Files:**

- Create: `scripts/tests/fixtures/co-review-supplement-cases.mjs`
- Modify: `scripts/tests/unit/review/co-review.test.mjs`
- Modify: `scripts/tests/fixtures/co-review-fixture.mjs`
- Modify: `scripts/review/lib/protocol.mjs`
- Modify: `scripts/review/co-review.mjs`

**Interfaces:**

- Produces: `registerSupplement({ cwd, dir, file, humanLogin }) -> State`.
- Adds optional state array `supplements`, with stable entries
  `{ id, path, sha256, registeredBy, registeredAt, targetRound, status }`.
- Consumes: continuation role/budget logic from Task 2 and existing immutable
  runtime artifact/path helpers.

- [ ] **Step 1: Add failing registration tests**

Cover one/multiple supplements, stable `S-001` IDs, regular files without extension
requirements, symlink/state/event/lock/outside-runtime refusal, intervention-only
enforcement, exact idempotent retry, and changed bytes or reused path conflict.
After each successful `supplement` append, call status and assert the event log still
reports `integrity.ok === true` with no event-type error.

```js
const registered = api.registerSupplement({
  cwd: root,
  dir: options.dir,
  file: `${options.dir}/human-context`,
  humanLogin: 'kendrick',
});
assert.deepEqual(registered.supplements[0], {
  id: 'S-001',
  path: '.tmp/review/human-context',
  sha256: digestFileForTest(root, '.tmp/review/human-context'),
  registeredBy: 'kendrick',
  registeredAt: registered.updatedAt,
  targetRound: registered.round + 1,
  status: 'pending',
});
```

- [ ] **Step 2: Add failing freeze/acknowledgment/consumption tests**

Continue freezes all pending supplements. A closing owner handoff preserves the
frozen set. Reviewer handoff refuses when any `[supplement:S-NNN]` marker is absent,
accepts each required marker once, marks the set consumed, and prevents later-round
leakage. Good-enough eligibility ignores pending/frozen supplements.

- [ ] **Step 3: Add compatibility tests for focus**

Prove `continue --focus` still records an immutable focus artifact, creates no
supplement ID, and imposes no reviewer acknowledgment marker.

- [ ] **Step 4: Run focused tests and verify RED**

Expected: missing `registerSupplement`, `supplement` CLI command, event allowance,
state collection, and reviewer acknowledgment checks.

- [ ] **Step 5: Implement supplement registration under the mutex**

Use `exchangeArtifact`-equivalent containment but additionally reject symlinks via
`lstatSync(...).isSymbolicLink()`. Assign the next ID from the maximum existing
numeric suffix, target the next reviewer round, append one `supplement` event, and
leave lifecycle/current role/round/budget unchanged. Exact same path/hash retry is a
no-op; a same path with different bytes is `supplement-conflict`.

- [ ] **Step 6: Freeze and consume supplements**

Continuation converts pending entries to frozen without changing their ID/path/hash
or target reviewer round. Reviewer handoff reads review bytes, extracts unique
`[supplement:S-NNN]` markers, requires every frozen ID and rejects unknown or
duplicate markers, then marks the frozen set consumed only in the successful
reviewer transition.

- [ ] **Step 7: Add CLI parsing and status projection**

Accept only `supplement --dir <runtime> --file <runtime-file>`. Resolve GitHub login
before mutation. Human-readable and JSON status list pending/frozen IDs, paths,
hashes, and target round while excluding consumed entries from next-action guidance.

- [ ] **Step 8: Run focused and repository Develop verification, then commit**

```bash
node --test scripts/tests/unit/review/co-review.test.mjs
node scripts/task-tracker/verify-develop.mjs
git add scripts/review/co-review.mjs scripts/review/lib/protocol.mjs \
  scripts/tests/fixtures/co-review-fixture.mjs \
  scripts/tests/fixtures/co-review-supplement-cases.mjs \
  scripts/tests/unit/review/co-review.test.mjs
git commit -m "[#1268] feat: add co-review supplements"
```

**Verification Commands:**

```text
node --test scripts/tests/unit/review/co-review.test.mjs
node scripts/task-tracker/verify-develop.mjs
```

### Task 4: Build deterministic terminal evidence archives

**Files:**

- Modify: `scripts/review/lib/archive.mjs`
- Modify: `scripts/review/lib/protocol.mjs`
- Create: `scripts/tests/fixtures/co-review-finalization-cases.mjs`
- Modify: `scripts/tests/fixtures/co-review-fixture.mjs`
- Modify: `scripts/tests/unit/review/co-review.test.mjs`

**Interfaces:**

- Produces: complete `inspectArchive`, `prepareArchive`,
  `publishPreparedArchive`, and `renderArchiveManifest` implementations.
- Produces: `validatedArchiveSnapshot({ cwd, dir }) -> { root, state, events }`.
- Consumes: accepted state/event integrity from protocol; it never mutates protocol.

- [ ] **Step 1: Add failing evidence-resolution and filename tests**

Build terminal consensus and author-completed good-enough candidate fixtures. Assert
sources are selected from event references/hashes, never filename patterns. Assert
the authoritative artifact is always archived as `artifact-<original-basename>`;
consensus owner round 2/reviewer round 3 names both role files with `r3`; and
good-enough review round 5/owner round 6 names both role files with `r6`. Cover an
authoritative artifact named `README.md`, arbitrary basenames, and lossy/colliding
identity slugs with deterministic short digests.

- [ ] **Step 2: Add failing deterministic manifest tests**

Assert exact LF bytes, fixed explanatory prose, fixed key order, one unique marker
pair, one JSON fence, canonical JSON, accepted commit/blob/SHA, source/archive hashes,
decision basis, human provenance when applicable, and no generation-time/host/tool
fields. Parse the marked region and deep-equal the recomputed model.

```js
const first = renderArchiveManifest(model);
const second = renderArchiveManifest(structuredClone(model));
assert.equal(first.equals(second), true);
assert.equal((first.toString().match(/aitm-co-review-manifest:start/g) ?? []).length, 1);
assert.deepEqual(parseManifestRegion(first), model);
```

- [ ] **Step 3: Add failing publication/retry/conflict tests**

Cover manifest-last staging, injected copy/manifest/validation failures, unique
concurrent staging names, complete-identical idempotency without rewrite, missing /
extra / different file conflicts across the exact four-path set (`README.md`,
`artifact-<original-basename>`, reviewer document, owner response), pre-existing
empty-directory conflict, post-preflight empty-destination replacement, non-empty
`ENOTEMPTY` race recovery, runtime originals unchanged, unrelated dirty files
unchanged, and unchanged HEAD/index.

- [ ] **Step 4: Run focused tests and verify RED**

Expected: archive exports are incomplete and no terminal evidence/publication model
exists.

- [ ] **Step 5: Export a validated protocol snapshot**

`validatedArchiveSnapshot` calls current integrity validation, reads and parses the
complete ordered event log, freezes the returned state/events, and exposes the
physical repository root. It refuses active/incomplete evidence but performs no
write and acquires no mutation lock.

- [ ] **Step 6: Implement evidence and source-byte resolution**

For reviewer consensus, select the accepting reviewer event and immediately
preceding owner handoff. For human good enough, select the `human-good-enough` event,
its closing owner handoff, and the unresolved preceding reviewer handoff. Verify each
recorded path/SHA, resolve accepted artifact bytes with `git show <commit>:<path>`,
and verify blob and SHA-256 before constructing output.

- [ ] **Step 7: Implement deterministic names and manifest**

Copy the authoritative artifact to `artifact-<original-basename>`, preserving its
basename bytes and extension; the `artifact-` prefix prevents collision with the
generated `README.md`, including when the source itself is named `README.md`.
Normalize lowercase identities to `[a-z0-9]+` hyphen slugs. Append the first eight
hex characters of SHA-256 when normalization loses information or collides. Build
the manifest object in one documented insertion order and serialize it with
two-space JSON and LF. Emit the exact wrapper byte sequence defined by the approved
specification: start marker, LF, opening ` ```json ` fence, LF, serialized JSON
ending in LF, closing ` ``` ` fence, LF, and end marker. The implementation must
escape the fences when embedded in template source so the emitted Markdown bytes
match that grammar exactly.

- [ ] **Step 8: Implement preflight, staging, atomic rename, and retry**

Preflight source/destination before writing. Stage in a unique sibling directory
whose name includes destination basename, protocol ID, PID, millisecond timestamp,
and `randomUUID()`. Write artifact/review/response exact bytes, write manifest last,
enumerate and validate the staged tree, then `renameSync(staging, destination)`.
On a losing `ENOTEMPTY`/existence race, inspect the destination and return idempotent
success only if every expected path and byte matches. Never delete a staging remnant
or any caller-owned destination.

- [ ] **Step 9: Run focused and repository Develop verification, then commit**

```bash
node --test scripts/tests/unit/review/co-review.test.mjs
node scripts/task-tracker/verify-develop.mjs
git add scripts/review/lib/archive.mjs scripts/review/lib/protocol.mjs \
  scripts/tests/fixtures/co-review-finalization-cases.mjs \
  scripts/tests/fixtures/co-review-fixture.mjs \
  scripts/tests/unit/review/co-review.test.mjs
git commit -m "[#1268] feat: publish deterministic review archives"
```

**Verification Commands:**

```text
node --test scripts/tests/unit/review/co-review.test.mjs
node scripts/task-tracker/verify-develop.mjs
```

### Task 5: Orchestrate consensus and human-good-enough finalization

**Files:**

- Modify: `scripts/review/lib/protocol.mjs`
- Modify: `scripts/review/lib/archive.mjs`
- Modify: `scripts/review/co-review.mjs`
- Modify: `scripts/tests/fixtures/co-review-finalization-cases.mjs`
- Modify: `scripts/tests/fixtures/co-review-e2e-cases.mjs`
- Modify: `scripts/tests/unit/review/co-review.test.mjs`

**Interfaces:**

- Produces: `acceptGoodEnough({ cwd, dir, humanLogin, expectedRevision }) -> State`.
- Composes: terminal transition first, archive publication second, with exit code 4
  for durable acceptance plus pending publication.
- Extends: human and JSON status with decision basis, archive completion, terminal
  evidence, budget adjustment, supplements, and exact recovery command.

- [ ] **Step 1: Add failing automatic consensus finalization tests**

Reviewer `accepted` with configured destination must persist accepted state, release
the mutex, publish the archive, and exit 0. Missing destination or injected
post-acceptance archive failure must preserve accepted state, lead output with
`ACCEPTED: protocol state is durable; archive publication is pending`, print the
exact `finalize` retry, and exit 4. Retrying reviewer handoff must remain forbidden.

- [ ] **Step 2: Add failing explicit accepted-session finalization tests**

Cover configured and explicit destinations, differing override refusal, legacy
accepted sessions requiring `--archive-dir`, identical retry, conflict refusal, and
status values `absent`, `complete-and-identical`, `conflict`, or unknown destination.

- [ ] **Step 3: Add failing human-good-enough tests**

Require author-completed intervention with both final evidence sides, authenticated
login, and valid destination. Refuse active, legacy reviewer-only intervention, and
opening zero-turn short circuit. Assert one `human-good-enough` event, immutable
accepted state, decision basis/human/timestamp, optional unconsumed supplements,
publication, and exit 4 if only publication fails. Immediately after the
`human-good-enough` event, assert status reports `integrity.ok === true`. Before
acceptance, assert human and JSON intervention status enumerate continue, eligible
good-enough finalization, and no-action/return-later as three distinct choices. For
an opening zero-turn short circuit, assert JSON `availableActions` omits the
good-enough action while retaining continue and no-action, and assert human output
states that good enough is unavailable because no two-sided evidence pair exists.

- [ ] **Step 4: Run focused tests and verify RED**

Expected: current reviewer acceptance has no archive orchestration, no exit 4, and
there is no finalization/good-enough command.

- [ ] **Step 5: Record explicit acceptance provenance**

Reviewer acceptance stores optional v1 `acceptance` data
`{ basis: 'reviewer-consensus', at, reviewer }`. `acceptGoodEnough` revalidates the
same revision prepared for archive, requires a closing owner handoff paired with the
unresolved review, appends `human-good-enough`, and stores
`{ basis: 'human-good-enough', at, approvedBy }`. Both terminal states reject every
later protocol mutator.

- [ ] **Step 6: Compose finalization outside the mutation mutex**

For consensus: mutate reviewer acceptance, release mutex, call `prepareArchive` /
`publishPreparedArchive`, and map a publication failure to exit 4 without rollback.
For good enough: resolve identity, validate protocol/evidence/destination and prepare
the publication model before mutation, pass expected revision into
`acceptGoodEnough`, then publish. Explicit finalization of already accepted state
never mutates protocol.

- [ ] **Step 7: Add strict CLI command forms**

Accept:

```text
finalize --dir <runtime-path> [--archive-dir <tracked-repo-path>]
finalize --dir <runtime-path> --good-enough [--archive-dir <tracked-repo-path>]
```

Treat `--good-enough` and `--json` as booleans. Reject unknown flags before protocol
discovery. Print each produced path and repository verification/commit guidance,
without staging or committing anything.

- [ ] **Step 8: Decorate human and JSON status**

Compose protocol status with `inspectArchive`. For unconfigured accepted state,
report unknown destination/completion and an explicit retry containing
`--archive-dir`. For configured state, inspect without writing and report exact
completion/conflict. Include unresolved finding IDs, closing-owner state, latest
budget adjustment, supplement sets, and decision basis. At
`intervention-required`, human and JSON output must enumerate three available
actions: continue with a copyable command, finalize good enough with a copyable
command only when a two-sided author-completed pair exists, or make no mutation and
return later. JSON represents these in `availableActions`; when no two-sided pair
exists, it omits good enough from that array rather than emitting a disabled entry,
and human output explains the two-sided-evidence requirement. Outside intervention,
emit the single state-appropriate next command.

- [ ] **Step 9: Run focused and repository Develop verification, then commit**

```bash
node --test scripts/tests/unit/review/co-review.test.mjs
node scripts/task-tracker/verify-develop.mjs
git add scripts/review/co-review.mjs scripts/review/lib/protocol.mjs \
  scripts/review/lib/archive.mjs \
  scripts/tests/fixtures/co-review-finalization-cases.mjs \
  scripts/tests/fixtures/co-review-e2e-cases.mjs \
  scripts/tests/unit/review/co-review.test.mjs
git commit -m "[#1268] feat: finalize accepted co-reviews"
```

**Verification Commands:**

```text
node --test scripts/tests/unit/review/co-review.test.mjs
node scripts/task-tracker/verify-develop.mjs
```

### Task 6: Complete lifecycle help, package documentation, and release verification

**Files:**

- Modify: `scripts/review/lib/help.mjs`
- Modify: `scripts/review/co-review.mjs`
- Modify: `scripts/lib/self-doc.mjs`
- Modify: `scripts/tests/unit/review/co-review.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/command-catalog-policy.test.mjs`

**Interfaces:**

- Extends every `COMMANDS` record with `lifecycleStates` and `mutationBoundary`.
- Renders top-level command order entirely from `COMMANDS`:
  `init`, `status`, `claim`, `wait`, `handoff`, `set-max-turns`, `supplement`,
  `continue`, `finalize`.
- Extends package self-documentation with all commands/flags and exit code 4.

- [ ] **Step 1: Add failing structured help-parity tests**

Assert every command record has non-empty `lifecycleStates` and
`mutationBoundary`; top-level and per-command output render those exact values; the
top-level order matches lifecycle order; and help for every command works in both
forms before repository discovery without writes or network calls.

```js
for (const [name, entry] of Object.entries(COMMANDS)) {
  assert.ok(entry.lifecycleStates.length > 0, name);
  assert.ok(entry.mutationBoundary.length > 0, name);
  const page = renderHelp(name);
  assert.match(page, new RegExp(escapeRegex(entry.lifecycleStates.join(', '))));
  assert.match(page, new RegExp(escapeRegex(entry.mutationBoundary)));
}
```

- [ ] **Step 2: Add failing recovery and package-catalog tests**

Cover initialization archive destination, ordinary automatic consensus, active
increase/decrease, closing owner, indefinite pause, supplement/acknowledgment, bare /
absolute / legacy continuation, good enough, exit-4 retry, legacy explicit archive,
exact-byte policy, GitHub authentication recovery, host-governance reminder, and
package-facing command/flag parity.

- [ ] **Step 3: Run focused help/catalog tests and verify RED**

Expected: missing fields/commands/flags/exit 4 and remaining hard-coded six-command
top-level text.

- [ ] **Step 4: Make `COMMANDS` the only help authority**

Add the two fields to all nine records. Render the command table, lifecycle states,
mutation boundary, usage, authority, examples, recovery, and next commands from the
records. Update init/status/handoff/continue semantics and add full entries for
set-max-turns/supplement/finalize. Keep `helpRequest` read-only and independent of
protocol/archive/GitHub imports.

- [ ] **Step 5: Update self-documentation and exit contracts**

Extend `ROUTABLE_SELF_DOC`, `ROUTABLE_ARGUMENTS`, and `ROUTABLE_CONTRACTS` for every
new form. Add `4=acceptance durable; archive publication pending`. Ensure
`npx aitm help co-review`, the top-level command catalog, and direct co-review help
name the same surface.

- [ ] **Step 6: Run focused and CI-equivalent checks**

Run the focused co-review suite first, then command-catalog policy, the repository
Develop verification gate, formatting, spelling, lint, diff whitespace, and the
issue-declared package lanes. Any failing baseline unrelated to #1268 must be
reported with exact command/output rather than altered silently.

- [ ] **Step 7: Commit the documentation and final verification surface**

```bash
git add scripts/review/lib/help.mjs scripts/review/co-review.mjs \
  scripts/lib/self-doc.mjs scripts/tests/unit/review/co-review.test.mjs \
  scripts/tests/unit/task-tracker/lib/command-catalog-policy.test.mjs
git commit -m "[#1268] docs: complete co-review lifecycle help"
```

**Verification Commands:**

```text
node --test scripts/tests/unit/review/co-review.test.mjs
node --test scripts/tests/unit/task-tracker/lib/command-catalog-policy.test.mjs
npm run format:check
npm run lint:spell
npm run lint
git diff --check
node scripts/task-tracker/verify-develop.mjs
npm test
npm run test:slow
```

## Execution Order and Review Gates

Tasks are intentionally sequential because Tasks 2-5 build on the protocol and
interfaces created earlier and all touch `protocol.mjs`. Each task still produces a
separately reviewable, focused-test-green commit:

1. Task 1 establishes authenticated budget primitives and optional archive paths.
2. Task 2 corrects exhaustion semantics and continuation before supplements depend
   on the resumed role.
3. Task 3 adds supplement state only after continuation semantics are stable.
4. Task 4 builds publication as a protocol-read-only library.
5. Task 5 composes immutable acceptance and fallible publication.
6. Task 6 exposes the settled lifecycle through one help/catalog authority and runs
   final verification.

Do not execute multiple tasks concurrently against separate branches without first
landing each predecessor into the parent branch. The shared protocol file and event
schema make unordered parallel implementation unsafe even though the eventual child
issues are independently reviewable.
