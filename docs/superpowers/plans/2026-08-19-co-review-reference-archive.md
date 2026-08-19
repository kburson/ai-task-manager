# Co-review Reference Archive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish reference-only co-review archives for reachable in-repository artifacts while preserving copy fallback, evidence copies, integrity checks, and legacy archive retries.

**Architecture:** Build deterministic reference, current-copy, and legacy-copy prepared candidates from one validated terminal snapshot. Pin an exact archive already present; otherwise choose reference only when the accepted commit resolves exactly and remains reachable. Make prepared-model validation and manifest rendering mode-aware without weakening destination containment or atomic publication.

**Tech Stack:** Node.js ESM, built-in `node:test`, filesystem staging/rename primitives, Git repository boundary adapters, canonical JSON-in-Markdown manifests.

## Global Constraints

- Keep schema `aitm.co-review.archive/v1`; add `artifact.mode` only to newly produced manifests.
- Never remove the full reviewer-review or owner-response evidence copies.
- Never allow an archive destination outside the repository or inside ignored runtime state.
- Never rewrite an exact complete legacy archive.
- Reference validation must prove `acceptedCommit`, `sourcePath`, `gitBlob`, and `sha256` against repository bytes.
- Copy validation must preserve `archivePath` and `archivedSha256` byte verification.
- Use strict red-green-refactor cycles and commit each task independently with `[#1314]` attribution.

---

### Task 1: Mode selection and prepared archive shapes

**Files:**
- Modify: `scripts/tests/fixtures/co-review-finalization-cases.mjs`
- Modify: `scripts/review/lib/archive.mjs`

**Interfaces:**
- Consumes: `repository.resolveReachableCommit(root, revision)` and the already validated committed artifact record.
- Produces: a prepared archive whose `manifest.artifact.mode` is `reference` or `copy`; reference mode has three files and copy mode has four.

- [ ] **Step 1: Replace the existing artifact-copy expectation with a failing reachable-reference test**

Add assertions equivalent to:

```js
const prepared = prepareArchive(archiveOptions(fixture));
assert.equal(prepared.manifest.artifact.mode, 'reference');
assert.equal(prepared.manifest.artifact.archivePath, undefined);
assert.equal(prepared.manifest.artifact.archivedSha256, undefined);
assert.equal(prepared.files.some((file) => file.kind === 'artifact'), false);
assert.deepEqual(prepared.files.map((file) => file.kind).sort(), [
  'manifest',
  'response',
  'review',
]);
assert.match(
  renderArchiveManifest(prepared.manifest).toString('utf8'),
  new RegExp(`git cat-file blob ${prepared.manifest.artifact.gitBlob}`)
);
```

- [ ] **Step 2: Add a failing copy-fallback test with an injected unreachable commit**

Wrap the fixture repository without changing artifact bytes:

```js
const repository = {
  ...fixture.repository,
  resolveReachableCommit(_root, revision) {
    return { commit: revision, reachable: false };
  },
};
const prepared = prepareArchive({
  ...archiveOptions(fixture, 'docs/reviews/copy-fallback'),
  repository,
});
assert.equal(prepared.manifest.artifact.mode, 'copy');
assert.ok(prepared.files.some((file) => file.kind === 'artifact'));
assert.equal(
  output(prepared, 'artifact').sha256,
  prepared.manifest.artifact.archivedSha256
);
```

- [ ] **Step 3: Run the focused tests and verify the expected failures**

Run: `node --test scripts/tests/unit/review/co-review.test.mjs`

Expected: the default archive still has an artifact file and no `artifact.mode`; the unreachable wrapper still selects the old shape.

- [ ] **Step 4: Implement deterministic candidate construction and mode selection**

In `archive.mjs`, factor artifact fields and candidate construction so the new-mode model is explicit:

```js
function artifactManifest(artifact, mode, artifactFile) {
  const common = {
    mode,
    sourcePath: artifact.path,
    acceptedCommit: artifact.commit,
    gitBlob: artifact.blob,
    sha256: artifact.sha256,
  };
  return mode === 'copy'
    ? {
        ...common,
        archivePath: artifactFile.path,
        archivedSha256: artifactFile.sha256,
      }
    : common;
}

function canReferenceArtifact(root, artifact, repository) {
  const resolved = repositoryCall(artifact.commit, () =>
    repository.resolveReachableCommit(root, artifact.commit)
  );
  return resolved.commit === artifact.commit && resolved.reachable === true;
}
```

Construct reference files as `[reviewFile, responseFile, manifestFile]` and copy files as `[artifactFile, reviewFile, responseFile, manifestFile]`. Do not add a CLI option.

- [ ] **Step 5: Render the reference recovery command without changing copy/legacy prose**

Use fixed blob metadata only:

```js
const recovery =
  model.artifact?.mode === 'reference'
    ? `Recover the accepted artifact with \`git cat-file blob ${model.artifact.gitBlob}\`.`
    : null;
```

Insert the line before the embedded manifest only when `recovery` is non-null.

- [ ] **Step 6: Run the focused tests and verify they pass**

Run: `node --test scripts/tests/unit/review/co-review.test.mjs`

Expected: all co-review tests pass with reachable reference and unreachable copy coverage.

- [ ] **Step 7: Commit Task 1**

```bash
git add scripts/review/lib/archive.mjs scripts/tests/fixtures/co-review-finalization-cases.mjs
git commit -m '[#1314] feat: select reference or copy co-review archives'
```

### Task 2: Mode-aware integrity and atomic publication

**Files:**
- Modify: `scripts/tests/fixtures/co-review-finalization-cases.mjs`
- Modify: `scripts/review/lib/archive.mjs`

**Interfaces:**
- Consumes: the Task 1 prepared candidates and `committedArtifact(root, record, repository)`.
- Produces: `validatePrepared(prepared, repository)` accepting exactly the safe file set for the manifest mode and revalidating reference metadata before filesystem publication.

- [ ] **Step 1: Add failing reference publication and tamper tests**

Publish a reference candidate and assert:

```js
assert.equal(publishPreparedArchive(prepared).status, 'published');
assert.deepEqual(readdirSync(prepared.destination.absolute).sort(), [
  'README.md',
  output(prepared, 'response').path,
  output(prepared, 'review').path,
].sort());
assert.equal(inspectArchive({ prepared, repository: fixture.repository }).status, 'complete');
```

Then forge each of `acceptedCommit`, `sourcePath`, `gitBlob`, and `sha256` on a structured clone and assert `inspectArchive` and `publishPreparedArchive` throw `archive-prepared-integrity` or the exact repository-evidence error before writing.

- [ ] **Step 2: Add failing copy publication and evidence-retention tests**

Publish the unreachable-commit candidate and assert the artifact bytes, owner response, and reviewer review all exist and match their prepared bytes. In both modes, delete or change either evidence file and assert inspection returns `conflict`.

- [ ] **Step 3: Run the focused tests and verify they fail in prepared validation**

Run: `node --test scripts/tests/unit/review/co-review.test.mjs`

Expected: reference candidates fail the fixed four-file/four-kind validator before publication.

- [ ] **Step 4: Make prepared validation derive the exact contract from mode**

Use mode-specific kinds and manifest entries:

```js
const mode = prepared.manifest?.artifact?.mode;
const legacyCopy = mode === undefined;
if (!['reference', 'copy'].includes(mode) && !legacyCopy) {
  fail('archive-prepared-integrity', 'artifact mode');
}
const expectedKinds = mode === 'reference'
  ? ['review', 'response', 'manifest']
  : ['artifact', 'review', 'response', 'manifest'];
```

Require exactly one safe basename per expected kind, no extra kinds, and exact path/digest agreement. For reference mode, call `committedArtifact` with the manifest record and reject any mismatch before destination inspection. For copy and legacy-copy, retain the existing artifact-file digest checks.

- [ ] **Step 5: Keep publication order generic and manifest-last**

Retain:

```js
const ordered = [
  ...prepared.files.filter((file) => file.path !== 'README.md'),
  prepared.files.find((file) => file.path === 'README.md'),
];
```

Assert the observed last write is `README.md` in both modes.

- [ ] **Step 6: Run focused and archive fixture-cost tests**

Run: `node --test scripts/tests/unit/review/co-review.test.mjs scripts/tests/unit/review/co-review-fixture-cost.test.mjs`

Expected: both test files pass and the in-memory corpus still spawns no external Git process.

- [ ] **Step 7: Commit Task 2**

```bash
git add scripts/review/lib/archive.mjs scripts/tests/fixtures/co-review-finalization-cases.mjs
git commit -m '[#1314] fix: verify mode-aware archive publication'
```

### Task 3: Legacy archive pinning and full regression proof

**Files:**
- Modify: `scripts/tests/fixtures/co-review-finalization-cases.mjs`
- Modify: `scripts/review/lib/archive.mjs`

**Interfaces:**
- Consumes: deterministic reference/current-copy candidates from Tasks 1-2.
- Produces: recognition-only legacy-copy candidate selection when the existing destination exactly matches pre-#1314 bytes.

- [ ] **Step 1: Add a failing legacy-copy retry test**

Create a helper that builds the pre-#1314 manifest with no `artifact.mode`, includes the artifact file, and uses the historical manifest prose. Materialize those exact four files, capture `README.md` mtime, then call `prepareArchive` and `publishPreparedArchive`:

```js
assert.equal(prepared.manifest.artifact.mode, undefined);
assert.equal(prepared.status, 'complete');
assert.equal(publishPreparedArchive(prepared).status, 'complete');
assert.equal(statSync(readme).mtimeMs, beforeMtime);
```

- [ ] **Step 2: Add mode-conflict and retry tests**

Prove exact new reference and new copy archives retry as complete. Prove a hybrid directory (reference manifest plus artifact copy, or copy manifest without artifact copy) remains a conflict and is never normalized in place.

- [ ] **Step 3: Run focused tests and verify legacy currently conflicts**

Run: `node --test scripts/tests/unit/review/co-review.test.mjs`

Expected: the exact legacy archive is reported as extra/different because reference mode is preferred.

- [ ] **Step 4: Select an exact existing candidate before the new default**

Construct all candidates from the same validated evidence, then inspect without mutation:

```js
for (const candidate of [referencePrepared, copyPrepared, legacyCopyPrepared]) {
  if (inspectExpected(candidate.destination, candidate.files).status === 'complete') {
    return candidate;
  }
}
return canReferenceArtifact(root, artifact, repository)
  ? referencePrepared
  : copyPrepared;
```

The legacy candidate must preserve the historical manifest object and rendered bytes exactly. It is never returned for an absent destination.

- [ ] **Step 5: Run all declared local gates**

Run in order:

```bash
node --test scripts/tests/unit/review/co-review.test.mjs
npm run format:check
npm run lint
npm test
npm run test:slow
git diff --check
git status --short
git log --oneline -4
```

Expected: every command exits 0; only the planned source, test, spec, and plan files differ from trunk; the branch is clean after the final commit.

- [ ] **Step 6: Commit Task 3**

```bash
git add scripts/review/lib/archive.mjs scripts/tests/fixtures/co-review-finalization-cases.mjs
git commit -m '[#1314] test: preserve legacy co-review archives'
```

- [ ] **Step 7: Complete governed evidence and review**

Run the issue’s AC stamps and Functional DoD stamps only from fresh passing commands, update the commit trace, run `/task test #1314`, request independent review of the exact final SHA, resolve any findings test-first, then run `/task review`, Full-Auto approval, PR integration, remote-SHA/CI verification, and `/task close #1314`.
