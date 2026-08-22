# Co-Review Archive Collision Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent new co-review protocols from reserving occupied archive leaves and give legacy accepted protocols one deterministic, auditable recovery publication path.

**Architecture:** Keep the accepted protocol immutable and derive recovery entirely from its configured destination, protocol ID, and a validated foreign archive manifest. Centralize archive validation and destination selection in `scripts/review/lib/archive.mjs`; let initialization and status consume those fail-closed helpers, while the CLI continues to use the existing explicit `--archive-dir` surface.

**Tech Stack:** Node.js ES modules, synchronous filesystem primitives for mutex-protected protocol operations, Git-backed repository boundaries, `node:test`, SHA-256 evidence manifests.

## Global Constraints

- Never overwrite, delete, rename, merge, or rewrite the occupied archive, accepted runtime, or immutable owner/reviewer evidence.
- The only recovery destination is `<configured>-recovery-<current-protocol-id>`; arbitrary `--archive-dir` overrides remain refused.
- Recovery is eligible only when the configured destination is a complete `aitm.co-review.archive/v1` archive for a different protocol.
- Validate legacy v1 archives structurally and by their recorded file digests; do not require current-renderer byte equality for the foreign `README.md`.
- Ordinary archive manifest bytes remain unchanged. The optional `recovery` object is absent for ordinary archives and appended after `normative` for recovered archives.
- Preserve repository containment, Git-ignore, runtime separation, symlink, staging, rename-race, exact-byte, and idempotency protections.
- Initialization occupancy refusal occurs inside the initialization mutex after exact-retry detection and before any new state or event write.

## File Structure

- `scripts/review/lib/archive.mjs` owns deterministic recovery naming, foreign archive validation, ordinary-versus-recovery destination selection, recovered manifest provenance, exact inspection, and publication.
- `scripts/review/lib/protocol.mjs` applies occupied-leaf prevention during initialization and projects ordinary or recovered archive completion into status.
- `scripts/review/co-review.mjs` keeps finalization on the existing `--archive-dir` surface and prints the selected effective destination.
- `scripts/review/lib/help.mjs` documents prevention, deterministic recovery, and exact retry behavior.
- `scripts/tests/fixtures/co-review-start-cases.mjs` covers empty/non-empty/file/symlink occupancy, direct init parity, and exact retry.
- `scripts/tests/fixtures/co-review-finalization-cases.mjs` covers foreign validation, deterministic recovery, provenance, preservation, conflict refusal, status, and idempotency.
- `scripts/tests/unit/review/co-review.test.mjs` remains the focused aggregate verifier and gains help assertions only when fixture-local coverage is insufficient.
- `docs/superpowers/reviews/README.md` documents first-published canonical paths, recovery siblings, recency, and independent immutability.

---

### Task 1: Refuse Occupied Configured Archive Leaves Before Initialization

**Files:**
- Modify: `scripts/tests/fixtures/co-review-start-cases.mjs`
- Modify: `scripts/review/lib/archive.mjs`
- Modify: `scripts/review/lib/protocol.mjs`

**Interfaces:**
- Consumes: `resolveArchiveDestination({ cwd, archiveDir, runtimeDir, repository })`.
- Produces: `assertArchiveDestinationAbsent(destination)` which returns normally only when the physical archive leaf is absent and otherwise throws `archive-destination-occupied` with the entry type.

- [ ] **Step 1: Write failing guided-start and direct-init occupancy tests**

Add `mkdirSync` to the filesystem imports and exercise both host-guided startup and the lower-level initializer. Snapshot the runtime before each refusal and assert that neither `state.json` nor `events.jsonl` is created.

```js
test('configured archive leaves must be absent before a new protocol initializes', async () => {
  for (const occupied of ['empty-directory', 'non-empty-directory', 'file', 'symlink']) {
    const fixture = memoryRepositoryFixture();
    const api = await memoryProtocol(fixture.repository);
    const archive = path.join(fixture.root, 'docs/superpowers/reviews/1272/spec');
    mkdirSync(path.dirname(archive), { recursive: true });
    if (occupied === 'empty-directory') mkdirSync(archive);
    if (occupied === 'non-empty-directory') {
      mkdirSync(archive);
      writeFileSync(path.join(archive, 'README.md'), '# prior archive\n');
    }
    if (occupied === 'file') writeFileSync(archive, 'occupied\n');
    if (occupied === 'symlink') symlinkSync(path.join(fixture.root, 'docs'), archive);

    const options = {
      cwd: fixture.root,
      artifact: fixture.artifact,
      owner: 'author-agent',
      reviewer: 'reviewer-agent',
      dir: `.tmp/occupied-${occupied}`,
      issue: '1272',
      artifactKind: 'spec',
    };
    assert.throws(
      () => startProtocol(options, startDependencies(api)),
      (error) => error.code === 'archive-destination-occupied'
    );
    assert.equal(existsSync(path.join(fixture.root, options.dir, 'state.json')), false);
    assert.equal(existsSync(path.join(fixture.root, options.dir, 'events.jsonl')), false);
  }
});
```

Add a direct `api.initializeProtocol({... archiveDir: 'docs/reviews/occupied' })` case with the same no-mutation assertions so guided and low-level entry points cannot diverge.

- [ ] **Step 2: Run the focused test and verify the new cases fail**

Run:

```bash
node --test scripts/tests/unit/review/co-review.test.mjs
```

Expected: FAIL because occupied configured destinations currently reach protocol initialization.

- [ ] **Step 3: Add the fail-closed archive-leaf assertion**

Add this helper beside `resolveArchiveDestination` in `scripts/review/lib/archive.mjs`:

```js
export function assertArchiveDestinationAbsent(destination) {
  let info;
  try {
    info = lstatSync(destination.absolute);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    fail('archive-destination-occupied', `${destination.relative}: unreadable: ${error.message}`);
  }
  const kind = info.isSymbolicLink()
    ? 'symlink'
    : info.isDirectory()
      ? readdirSync(destination.absolute).length === 0
        ? 'empty-directory'
        : 'directory'
      : info.isFile()
        ? 'file'
        : 'special-entry';
  fail('archive-destination-occupied', `${destination.relative}: ${kind}`);
}
```

This deliberately treats an empty directory as occupied.

- [ ] **Step 4: Apply the assertion after exact-retry detection inside the init mutex**

Import `assertArchiveDestinationAbsent` in `scripts/review/lib/protocol.mjs` and place the call after the existing-state exact retry branch, not before it:

```js
return withMutex(paths, 'system', 'init', () => {
  if (existsSync(paths.state)) {
    const existing = readProtocol({ cwd: root, dir: paths.relative, repository });
    if (sameInitialization(existing, initialization)) return existing;
    fail('already-initialized', paths.relative);
  }
  if (existsSync(paths.events)) fail('orphaned-events', paths.relative);
  if (archive) assertArchiveDestinationAbsent(archive);
  // existing state/event construction follows
});
```

- [ ] **Step 5: Prove exact retry remains valid after later publication**

Extend the existing guided host-context test: initialize once, materialize any entry at the configured archive leaf, retry the identical `startProtocol` call, and assert the original state/events are returned unchanged. Expected: PASS because retry returns before occupancy validation.

- [ ] **Step 6: Run the focused verifier**

Run:

```bash
node --test scripts/tests/unit/review/co-review.test.mjs
```

Expected: PASS, including all new prevention cases.

- [ ] **Step 7: Commit prevention**

```bash
git add scripts/review/lib/archive.mjs scripts/review/lib/protocol.mjs scripts/tests/fixtures/co-review-start-cases.mjs
git commit -m "[#1374] Refuse occupied co-review archive leaves"
```

---

### Task 2: Validate Foreign Archives and Publish Deterministic Recovery Siblings

**Files:**
- Modify: `scripts/tests/fixtures/co-review-finalization-cases.mjs`
- Modify: `scripts/review/lib/archive.mjs`

**Interfaces:**
- Produces: `deriveRecoveryArchiveDir(configuredArchiveDir, protocolId) -> string`.
- Produces: `inspectForeignArchive({ root, destination, currentProtocolId }) -> { manifest, protocolId, acceptedAt }`; throws on any structural, path, schema, file-set, symlink, or digest violation.
- Changes: `prepareArchive(options)` accepts the exact derived recovery sibling only after foreign validation and adds immutable recovery provenance to the prepared manifest.

- [ ] **Step 1: Add a reusable foreign-archive fixture and failing recovery tests**

Create an accepted foreign protocol, prepare its ordinary archive, and materialize those exact files at the current protocol's configured destination. The protocols may use separate in-memory repository fixtures because foreign eligibility authenticates the preserved archive itself rather than resolving its artifact commit in the current repository. Use the current protocol's exact recovery path and assert:

```js
const occupied = await acceptedConsensus();
const occupiedPrepared = prepareArchive(archiveOptions(occupied, 'docs/reviews/occupied-source'));
const current = await acceptedConsensus({ archiveDir: 'docs/reviews/configured' });
materializePrepared(
  path.join(current.root, 'docs/reviews/configured'),
  occupiedPrepared
);
const recoveryDir = `docs/reviews/configured-recovery-${current.state.protocolId}`;
const recovered = prepareArchive({
  ...current.api.validatedArchiveSnapshot({ cwd: current.root, dir: current.options.dir }),
  archiveDir: recoveryDir,
  repository: current.repository,
});
assert.equal(recovered.destination.relative, recoveryDir);
assert.deepEqual(recovered.manifest.recovery, {
  configuredDestination: 'docs/reviews/configured',
  occupiedProtocolId: occupied.state.protocolId,
  recoveryDestination: recoveryDir,
  occupiedAcceptedAt: occupied.state.acceptance.at,
  relationship: 'newer-than-occupied',
});
```

Also assert the ordinary prepared manifest has no own `recovery` property.

- [ ] **Step 2: Add failing refusal and compatibility cases**

Add this local exact-byte directory snapshot helper, then preserve snapshots of the current protocol and configured archive before every recovery refusal:

```js
function snapshotDirectory(directory) {
  return Object.fromEntries(
    readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((entry) => [
        entry.name,
        entry.isFile() && !entry.isSymbolicLink()
          ? readFileSync(path.join(directory, entry.name)).toString('base64')
          : `${entry.isSymbolicLink() ? 'symlink' : entry.isDirectory() ? 'directory' : 'other'}`,
      ])
  );
}
```

For each case, construct a fresh `current` and `occupiedPrepared` pair as in Step 1, apply exactly one mutation, attempt recovery, then compare the bytes afterward:

```js
for (const mutation of [
  'arbitrary-destination',
  'same-protocol',
  'partial-archive',
  'extra-file',
  'corrupt-manifest',
  'digest-mismatch',
  'symlink-entry',
  'conflicting-recovery-destination',
]) {
  const protocolBefore = snapshotProtocol(current.root, current.options.dir);
  const occupiedBefore = snapshotDirectory(configuredAbsolute);
  assert.throws(() => prepareArchive(recoveryOptions), /co-review:archive-/);
  assert.deepEqual(snapshotProtocol(current.root, current.options.dir), protocolBefore);
  assert.deepEqual(snapshotDirectory(configuredAbsolute), occupiedBefore);
}
```

Add a legacy v1 `README.md` case that changes only JSON whitespace and key order while retaining the same parsed model and recorded evidence digests. Expected: recovery remains eligible.

- [ ] **Step 3: Run the focused verifier and confirm recovery cases fail**

Run:

```bash
node --test scripts/tests/unit/review/co-review.test.mjs
```

Expected: FAIL with `archive-destination-mismatch` for the derived sibling because only configured-path equivalence is currently allowed.

- [ ] **Step 4: Implement deterministic naming and canonical manifest extraction**

Add:

```js
export function deriveRecoveryArchiveDir(configuredArchiveDir, protocolId) {
  if (!/^[0-9a-f-]{36}$/i.test(String(protocolId))) {
    fail('archive-recovery-protocol', String(protocolId));
  }
  return `${String(configuredArchiveDir).replace(/\/$/, '')}-recovery-${protocolId}`;
}

function parseArchiveManifest(readmeBytes) {
  const text = readmeBytes.toString('utf8');
  const matches = [...text.matchAll(
    /<!-- aitm-co-review-manifest:start -->\n```json\n([\s\S]*?\n)```\n<!-- aitm-co-review-manifest:end -->/g
  )];
  if (matches.length !== 1) fail('archive-foreign-manifest', `marker-count=${matches.length}`);
  let manifest;
  try {
    manifest = JSON.parse(matches[0][1]);
  } catch (error) {
    fail('archive-foreign-manifest', error.message);
  }
  return manifest;
}
```

The regex authenticates the one canonical marker block but does not compare the foreign README against current rendered bytes.

- [ ] **Step 5: Implement structural and digest validation for a foreign v1 archive**

Validate required objects (`protocol`, `artifact`, `participants`, `decision`, `budget`, `evidence`, `normative`), schema `aitm.co-review.archive/v1`, a different protocol ID, valid `decision.at`, safe basename-only archive paths, exact directory entries, regular non-symlink files, and every `archivedSha256`. Derive the required set exactly from:

```js
const required = [
  'README.md',
  manifest.evidence.ownerResponse.archivePath,
  manifest.evidence.reviewerReview.archivePath,
  ...(manifest.artifact.mode === 'reference' ? [] : [manifest.artifact.archivePath]),
];
```

Accept absent `artifact.mode` as `legacy-copy` and tolerate documented optional v1 fields, including `recovery`, without allowing extra filesystem entries.

- [ ] **Step 6: Select recovery only for the exact derived destination**

Replace the current configured-versus-requested equality block in `buildPrepared` with a selector that:

```js
const configuredDestination = configured
  ? resolveArchiveDestination({ cwd: root, archiveDir: configured, runtimeDir, repository })
  : null;
const expectedRecovery = configured
  ? deriveRecoveryArchiveDir(configuredDestination.relative, state.protocolId)
  : null;
const isConfigured = configuredDestination?.absolute === destination.absolute;
const isRecovery = expectedRecovery === destination.relative;
if (configuredDestination && !isConfigured && !isRecovery) {
  fail('archive-destination-mismatch', `${destination.relative}; configured ${configured}`);
}
const occupied = isRecovery
  ? inspectForeignArchive({ root, destination: configuredDestination, currentProtocolId: state.protocolId })
  : null;
```

Every containment and ignore check still runs through `resolveArchiveDestination` for both configured and recovery paths.

- [ ] **Step 7: Add recovered manifest provenance and prose without changing ordinary bytes**

Build the existing manifest exactly as today, then append the optional object only for recovery:

```js
const manifest = {
  schema: 'aitm.co-review.archive/v1',
  protocol: { id: state.protocolId, schema: state.schema },
  artifact: artifactManifest(artifact, mode, artifactFile),
  participants: { owner: state.roles.owner, reviewer: state.roles.reviewer },
  decision: decisionModel(evidence.decision),
  budget: budgetModel(state),
  evidence: evidenceModel,
  normative: 'The accepted artifact remains normative; the archived review and owner response are evidence.',
  ...(occupied
    ? {
        recovery: {
          configuredDestination: configuredDestination.relative,
          occupiedProtocolId: occupied.protocolId,
          recoveryDestination: destination.relative,
          occupiedAcceptedAt: occupied.acceptedAt,
          relationship: compareDecisionTimes(evidence.decision.at, occupied.acceptedAt),
        },
      }
    : {}),
};
```

In `renderArchiveManifest`, add recovery prose only when `model.recovery` exists. Use a relative Markdown link from the recovery directory to `${configuredDestination}/README.md`, print both acceptance timestamps, and state the derived relationship.

- [ ] **Step 8: Prove publication preservation and idempotency**

Publish the recovered archive, assert every occupied archive byte and every runtime/evidence byte is unchanged, then retry and compare recovery `README.md` mtime:

```js
assert.equal(publishPreparedArchive(recovered).status, 'published');
const beforeMtime = statSync(path.join(recovered.destination.absolute, 'README.md')).mtimeMs;
assert.equal(publishPreparedArchive(prepareArchive(recoveryOptions)).status, 'complete');
assert.equal(statSync(path.join(recovered.destination.absolute, 'README.md')).mtimeMs, beforeMtime);
```

- [ ] **Step 9: Run the focused verifier**

Run:

```bash
node --test scripts/tests/unit/review/co-review.test.mjs
```

Expected: PASS for reference, copy, legacy-copy, recovery, refusal, preservation, race, and idempotency cases.

- [ ] **Step 10: Commit recovery publication**

```bash
git add scripts/review/lib/archive.mjs scripts/tests/fixtures/co-review-finalization-cases.mjs
git commit -m "[#1374] Add deterministic co-review archive recovery"
```

---

### Task 3: Expose Recovery Through Status, CLI Help, and Documentation

**Files:**
- Modify: `scripts/tests/fixtures/co-review-finalization-cases.mjs`
- Modify: `scripts/tests/unit/review/co-review.test.mjs`
- Modify: `scripts/review/lib/protocol.mjs`
- Modify: `scripts/review/co-review.mjs`
- Modify: `scripts/review/lib/help.mjs`
- Modify: `docs/superpowers/reviews/README.md`

**Interfaces:**
- Consumes: `deriveRecoveryArchiveDir` and `inspectArchive` from `archive.mjs`.
- Produces: accepted status whose `archive.destination` is the effective ordinary or recovery directory, with `configuredDestination` retained as provenance when recovery applies.
- Preserves: `finalize --dir ... --archive-dir ...` as the only publication command surface.

- [ ] **Step 1: Add failing status-before/status-after recovery tests**

Before publication, assert status prints exactly one safe action:

```js
assert.deepEqual(status.archive, {
  destination: recoveryDir,
  configuredDestination: configuredDir,
  completion: 'absent',
  recovery: true,
});
assert.deepEqual(status.availableActions, [{
  kind: 'finalize',
  command: `npx aitm co-review finalize --dir ${absoluteRuntime} --archive-dir ${recoveryDir}`,
}]);
```

After publication, assert `completion: 'complete-and-identical'`, the same effective destination, no finalize action, and protocol state/events byte identity.

Add conflict variants proving same-protocol corruption, ineligible foreign archives, and pre-created conflicting recovery siblings produce `completion: 'conflict'` with no alternate unsafe path.

- [ ] **Step 2: Run the focused verifier and confirm the status case fails**

Run:

```bash
node --test scripts/tests/unit/review/co-review.test.mjs
```

Expected: FAIL because status currently repeats the configured conflicting destination.

- [ ] **Step 3: Project ordinary, recoverable, recovered, and conflict states**

In accepted status handling:

```js
try {
  const configuredInspection = inspectArchive({ ...snapshot, archiveDir: configured, repository });
  archive = configuredInspection.status === 'complete'
    ? { destination: configured, completion: 'complete-and-identical' }
    : { destination: configured, completion: configuredInspection.status };
} catch (configuredError) {
  const recovery = deriveRecoveryArchiveDir(configured, state.protocolId);
  try {
    const recoveryInspection = inspectArchive({ ...snapshot, archiveDir: recovery, repository });
    archive = {
      destination: recovery,
      configuredDestination: configured,
      recovery: true,
      completion: recoveryInspection.status === 'complete'
        ? 'complete-and-identical'
        : recoveryInspection.status,
    };
  } catch (recoveryError) {
    archive = {
      destination: configured,
      completion: 'conflict',
      errors: [configuredError.message, recoveryError.message],
    };
  }
}
```

Only emit a finalize action when the derived recovery destination is eligible and absent. Build the command from `archive.destination`, never by repeating `state.initialization.archiveDir` unconditionally.

- [ ] **Step 4: Keep finalization output aligned with the selected destination**

Verify `scripts/review/co-review.mjs` prints `prepared.destination.relative` for both ordinary and recovered finalization. If any branch still prints `state.initialization.archiveDir`, replace only that output source; do not add a new override flag.

- [ ] **Step 5: Expand structured help assertions and help text**

Update `COMMANDS.start`, `COMMANDS.init`, `COMMANDS.status`, and `COMMANDS.finalize` so rendered help states:

```text
New configured archive leaves must be absent before initialization.
Legacy accepted collisions recover only at <configured>-recovery-<protocol-id>.
The configured archive must validate as a complete different-protocol v1 archive.
Arbitrary --archive-dir overrides and every overwrite remain refused.
```

Add assertions against both `renderHelp()` and `renderHelp('finalize')` so the expanded CLI API and top-level help remain in parity.

- [ ] **Step 6: Document first-publication authority and recency**

Add a `Collision recovery` section to `docs/superpowers/reviews/README.md` explaining:

- `<issue>/<kind>` is the first-published archive, not necessarily the newest accepted design;
- `<kind>-recovery-<protocol-id>` is an independently immutable sibling, not a replacement;
- the occupied primary is never edited to add a backlink;
- readers compare `decision.at` and the recovery relationship, then follow the recovered archive's configured-destination link.

- [ ] **Step 7: Run focused and CLI help verification**

Run:

```bash
node --test scripts/tests/unit/review/co-review.test.mjs
npx aitm co-review help
npx aitm co-review finalize --help
```

Expected: focused tests PASS; both help pages describe prevention and deterministic recovery consistently.

- [ ] **Step 8: Commit status and documentation**

```bash
git add scripts/review/lib/protocol.mjs scripts/review/co-review.mjs scripts/review/lib/help.mjs scripts/tests/fixtures/co-review-finalization-cases.mjs scripts/tests/unit/review/co-review.test.mjs docs/superpowers/reviews/README.md
git commit -m "[#1374] Surface co-review archive recovery"
```

---

### Task 4: Verify the Complete #1374 Delivery

**Files:**
- Verify only; modify implementation or tests only if a verifier exposes a defect.

**Interfaces:**
- Consumes: the complete prevention, recovery, status, CLI, and documentation behavior from Tasks 1-3.
- Produces: exact command evidence for every #1374 Acceptance Criterion and Functional Definition-of-Done item.

- [ ] **Step 1: Run the focused regression suite**

```bash
node --test scripts/tests/unit/review/co-review.test.mjs
```

Expected: PASS, including occupied-start prevention and accepted collision recovery.

- [ ] **Step 2: Run the repository fast suite**

```bash
npm test
```

Expected: PASS.

- [ ] **Step 3: Run the repository slow suite**

```bash
npm run test:slow
```

Expected: PASS.

- [ ] **Step 4: Run lint**

```bash
npm run lint
```

Expected: PASS with no lint errors.

- [ ] **Step 5: Run formatting verification**

```bash
npm run format:check
```

Expected: PASS with no formatting drift.

- [ ] **Step 6: Verify commit history and working tree**

```bash
git log --oneline -5
git status --short
```

Expected: #1374 commits follow repository convention and the worktree is clean.

- [ ] **Step 7: Stamp each Acceptance Criterion and Functional DoD item individually**

Use the governed #1374 verification commands after the exact implementation SHA is committed. Do not bulk-check and do not fabricate evidence; each stamp must reuse or execute its declared verifier.

- [ ] **Step 8: Commit any verifier-driven correction separately**

If verification required a code correction, repeat the failed verifier and then the focused suite before committing. Stage only changed paths from this governed file set:

```bash
git add scripts/review/lib/archive.mjs scripts/review/lib/protocol.mjs scripts/review/co-review.mjs scripts/review/lib/help.mjs scripts/tests/fixtures/co-review-start-cases.mjs scripts/tests/fixtures/co-review-finalization-cases.mjs scripts/tests/unit/review/co-review.test.mjs docs/superpowers/reviews/README.md
git commit -m "[#1374] Fix archive recovery verification finding"
```

Expected: no correction commit when every prior task is green.
