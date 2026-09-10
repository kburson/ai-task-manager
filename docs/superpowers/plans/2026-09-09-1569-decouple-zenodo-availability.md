# Decouple Zenodo Availability from Release Authority Implementation Plan

<!-- cspell:words ACDMRTUXB Zenodo zenodo dois -->

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the published `v0.1.0` release verifier require durable DataCite DOI authority while treating only transient Zenodo landing-page failures as warnings.

**Architecture:** Keep the immutable release manifest and signed release untouched. Add pure authority-validation and health-classification seams inside `scripts/verify-release.mjs`, inject deterministic observers in unit tests, and replace the aggregate post-release delta with an exact ordered two-commit proof: immutable evidence commit followed by one verifier/test correction commit.

**Tech Stack:** Node.js 22, ECMAScript modules, built-in `fetch`, `AbortSignal.timeout`, `node:test`, Git plumbing commands, DataCite REST API.

## Global Constraints

- Do not modify `provenance/release-manifest.json` or its `ai-peer-review.release/v1` schema.
- Do not rewrite the signed `v0.1.0` tag, release commit `1c86f21a8aacca77dc7ebdc8299606fabfaa7e50`, evidence commit `5b06e29a54ddac959f6b3d8c90c3fea8737d2766`, GitHub release, npm package, Zenodo deposit, Software Heritage archive, or existing public history.
- Land exactly one new standalone-repository commit, changing only `scripts/verify-release.mjs` and `test/unit/verify-release.test.mjs`.
- DataCite authority unavailability or mismatch remains a hard failure.
- Zenodo timeout, transport failure, or HTTP 5xx becomes a warning only after authority passes; HTTP 4xx and unexpected observations remain hard failures.
- Software Heritage and every signed-tag, repository, GitHub/npm checksum, provenance, manifest-byte, and release-history mismatch remain hard failures.
- Unit tests use injected observers and never contact a live provider.

---

### Task 1: Add the Atomic Verifier Correction

**Files:**

- Modify: `/Users/kpburson/projects/Vibe-Coding/ai-peer-review/test/unit/verify-release.test.mjs`
- Modify: `/Users/kpburson/projects/Vibe-Coding/ai-peer-review/scripts/verify-release.mjs`

**Interfaces:**

- Consumes: `manifest.archives.zenodo`, `manifest.repository.url`, `manifest.version`, DataCite's `data` resource, normalized Zenodo health observations, and Git history rooted at the signed release commit.
- Produces: `validateZenodoAuthority({ manifest, record })`, `classifyZenodoHealth(observation)`, `observeReleaseDelta(root, releaseCommit, head)` with ordered per-commit paths, and `verifyRelease()` results containing `warnings`.

- [ ] **Step 1: Replace the unit-test release-history fixture with immutable identities**

In `test/unit/verify-release.test.mjs`, remove the dynamic `git rev-parse HEAD` release identity. Use the published identities and a deterministic correction SHA:

```js
const releaseCommit = '1c86f21a8aacca77dc7ebdc8299606fabfaa7e50';
const evidenceCommit = '5b06e29a54ddac959f6b3d8c90c3fea8737d2766';
const correctionCommit = 'c'.repeat(40);
```

Update the default observer fixture so `head()` returns `correctionCommit` and `releaseDelta()` returns:

```js
{
  ancestor: true,
  commits: [
    {
      sha: evidenceCommit,
      paths: ['provenance/release-manifest.json'],
    },
    {
      sha: correctionCommit,
      paths: ['scripts/verify-release.mjs', 'test/unit/verify-release.test.mjs'],
    },
  ],
}
```

Update `releaseManifestBlobs()` in the fixture to return identical `evidence`, `head`, and `index` buffers. Add a negative assertion that a substituted `evidence` buffer fails even when `head`, `index`, and working bytes agree.

- [ ] **Step 2: Add a deterministic DataCite fixture and archive observers**

Add this fixture helper:

```js
function zenodoRecord(value = manifest()) {
  return {
    data: {
      id: value.archives.zenodo.doi,
      type: 'dois',
      attributes: {
        doi: value.archives.zenodo.doi,
        state: 'findable',
        publisher: 'Zenodo',
        version: `v${value.version}`,
        titles: [{ title: `kburson/ai-peer-review: v${value.version}` }],
        relatedIdentifiers: [
          {
            relationType: 'IsSupplementTo',
            relatedIdentifier: `${value.repository.url}/tree/v${value.version}`,
            resourceTypeGeneral: 'Software',
            relatedIdentifierType: 'URL',
          },
        ],
      },
    },
  };
}
```

Extend `observers(value)` with:

```js
zenodoDoi: async () => zenodoRecord(value),
zenodoHealth: async () => ({ status: 200 }),
reachable: async () => true,
```

`reachable` now represents only Software Heritage.

- [ ] **Step 3: Write RED authority and health tests**

Import `classifyZenodoHealth` and `validateZenodoAuthority`. Add tests with these assertions:

```js
test('valid DOI authority tolerates transient Zenodo health failures', async () => {
  for (const health of [{ status: 504 }, { error: 'timeout' }, { error: 'network' }]) {
    const value = manifest();
    const observed = observers(value);
    observed.zenodoHealth = async () => health;
    const result = await verify(value, observed);
    assert.deepEqual(result.warnings, [
      {
        provider: 'zenodo',
        category: 'temporary-unavailability',
        ...health,
      },
    ]);
  }
});

test('healthy Zenodo produces no warning', async () => {
  const result = await verify(manifest());
  assert.deepEqual(result.warnings, []);
});

test('Zenodo 4xx and malformed health observations fail closed', async () => {
  for (const health of [{ status: 404 }, { status: 302 }, {}, { error: 'unexpected' }]) {
    const value = manifest();
    const observed = observers(value);
    observed.zenodoHealth = async () => health;
    await assert.rejects(verify(value, observed), /Zenodo health observation/);
  }
});
```

Add a table-driven authority test that clones `zenodoRecord()` and independently substitutes `data.id`, `attributes.doi`, `state`, `publisher`, `version`, `titles`, and `relatedIdentifiers`. Each case must reject with `/Zenodo DOI authority/`. Add separate cases for a manifest DOI suffix that differs from `/records/<id>`, a thrown `zenodoDoi()` observer, and `reachable()` returning false for Software Heritage.

- [ ] **Step 4: Write RED ordered-history tests**

Replace the old aggregate-count/path tests with exact sequence failures:

```js
const invalidDeltas = [
  { ancestor: false, commits: [] },
  { ancestor: true, commits: [] },
  {
    ancestor: true,
    commits: [{ sha: evidenceCommit, paths: ['provenance/release-manifest.json'] }],
  },
  {
    ancestor: true,
    commits: [
      { sha: 'd'.repeat(40), paths: ['provenance/release-manifest.json'] },
      {
        sha: correctionCommit,
        paths: ['scripts/verify-release.mjs', 'test/unit/verify-release.test.mjs'],
      },
    ],
  },
  {
    ancestor: true,
    commits: [
      { sha: evidenceCommit, paths: ['provenance/release-manifest.json'] },
      { sha: correctionCommit, paths: ['scripts/verify-release.mjs', 'src/public-api.mjs'] },
    ],
  },
  {
    ancestor: true,
    commits: [
      { sha: evidenceCommit, paths: ['provenance/release-manifest.json'] },
      {
        sha: correctionCommit,
        paths: ['scripts/verify-release.mjs', 'test/unit/verify-release.test.mjs'],
      },
      { sha: 'f'.repeat(40), paths: ['README.md'] },
    ],
  },
];
```

Inject each delta and assert `verify()` rejects with `/post-release history/`. Update the temporary-repository tests to assert `observeReleaseDelta()` returns ordered commit objects and preserves adversarial path bytes per commit.

- [ ] **Step 5: Run the focused test to prove RED**

Run:

```bash
node --test test/unit/verify-release.test.mjs
```

Expected: non-zero with missing export/observer failures for `validateZenodoAuthority`, `classifyZenodoHealth`, `zenodoDoi`, or the new `commits` result shape. Existing unrelated release-verifier tests must still execute.

- [ ] **Step 6: Implement exact Zenodo authority validation**

In `scripts/verify-release.mjs`, add:

```js
const EVIDENCE_COMMIT = '5b06e29a54ddac959f6b3d8c90c3fea8737d2766';
const CORRECTION_PATHS = ['scripts/verify-release.mjs', 'test/unit/verify-release.test.mjs'];
const ZENODO_DOI = /^10\.5281\/zenodo\.(\d+)$/i;
```

Export `validateZenodoAuthority({ manifest, record })`. It must validate the exact fields from the design, derive the expected title and repository-tag URL from the manifest, require `relatedIdentifierType === 'URL'` and `resourceTypeGeneral === 'Software'`, parse the manifest URL with `new URL()`, require `https:`, host `zenodo.org`, and exact path `/records/<doi-suffix>`, then return `true`. Every refusal calls `fail('Zenodo DOI authority: <specific boundary>')`.

- [ ] **Step 7: Implement closed Zenodo health classification**

Export `classifyZenodoHealth(observation)` with this closed behavior:

```js
export function classifyZenodoHealth(observation) {
  if (Number.isInteger(observation?.status)) {
    if (observation.status >= 200 && observation.status < 300) return null;
    if (observation.status >= 500 && observation.status < 600) {
      return Object.freeze({
        provider: 'zenodo',
        category: 'temporary-unavailability',
        status: observation.status,
      });
    }
    fail(`Zenodo health observation is not retryable: HTTP ${observation.status}`);
  }
  if (observation?.error === 'timeout' || observation?.error === 'network') {
    return Object.freeze({
      provider: 'zenodo',
      category: 'temporary-unavailability',
      error: observation.error,
    });
  }
  fail('Zenodo health observation is malformed');
}
```

- [ ] **Step 8: Implement default DataCite and health observers**

Add `zenodoDoi(doi)` to `defaultObservers(root)`. Fetch `https://api.datacite.org/dois/${encodeURIComponent(doi)}` with a finite timeout, require `response.ok`, and parse JSON. A non-success response fails with only its numeric status.

Add `zenodoHealth(url)`. Fetch with `redirect: 'follow'` and a finite timeout. Return `{ status: response.status }`; catch only `TimeoutError`/`AbortError` as `{ error: 'timeout' }` and fetch `TypeError` as `{ error: 'network' }`. Rethrow every unexpected exception.

- [ ] **Step 9: Implement ordered per-commit release history**

Change `observeReleaseDelta()` to run:

```text
git rev-list --reverse <releaseCommit>..<head>
git diff-tree --no-commit-id --name-only -z --no-renames --diff-filter=ACDMRTUXB -r <sha> --
```

for each returned SHA and produce `{ ancestor, commits: [{ sha, paths }] }`. Continue using `parseGitChangedPaths()` so NUL termination, UTF-8, and whitespace bytes remain fail-closed.

Extend `observeReleaseManifestBlobs()` to read `provenance/release-manifest.json` from `EVIDENCE_COMMIT`, `HEAD`, and the index. Return `{ evidence, head, index }`. `verifyRelease()` must require all three buffers and the working bytes to be identical.

In `verifyRelease()`, require exactly two commits, exact first SHA `EVIDENCE_COMMIT`, first paths exactly `['provenance/release-manifest.json']`, second SHA equal to observed `head`, and second paths equal to sorted `CORRECTION_PATHS`. Any mismatch fails with `post-release history`.

- [ ] **Step 10: Orchestrate authority, health, and warning output**

Replace the two-archive reachability loop with:

```js
const zenodoRecord = await observed.zenodoDoi(manifest.archives.zenodo.doi);
validateZenodoAuthority({ manifest, record: zenodoRecord });

const warnings = [];
const zenodoWarning = classifyZenodoHealth(
  await observed.zenodoHealth(manifest.archives.zenodo.url)
);
if (zenodoWarning) warnings.push(zenodoWarning);

if (!(await observed.reachable(manifest.archives.software_heritage.url))) {
  fail(`archive is not reachable: ${manifest.archives.software_heritage.url}`);
}
```

Return `warnings: Object.freeze(warnings)` alongside the existing result fields.

- [ ] **Step 11: Run focused and formatting verification before commit**

Run:

```bash
node --test test/unit/verify-release.test.mjs
npm run format:check
npm run lint
git diff --check
git status --short
```

Expected: all commands exit 0 except `git status --short`, which lists exactly the two intended modified files. Inspect `git diff -- provenance/release-manifest.json` and require no output.

- [ ] **Step 12: Commit the atomic correction**

Run:

```bash
git add scripts/verify-release.mjs test/unit/verify-release.test.mjs
git commit -m "fix: separate archive authority from availability [#1569]"
```

Expected: one commit whose parent is `5b06e29a54ddac959f6b3d8c90c3fea8737d2766` and whose changed paths are exactly the two staged files.

---

### Task 2: Verify the Committed Release Evidence

**Files:**

- Verify only: `/Users/kpburson/projects/Vibe-Coding/ai-peer-review/scripts/verify-release.mjs`
- Verify only: `/Users/kpburson/projects/Vibe-Coding/ai-peer-review/test/unit/verify-release.test.mjs`
- Must remain unchanged: `/Users/kpburson/projects/Vibe-Coding/ai-peer-review/provenance/release-manifest.json`

**Interfaces:**

- Consumes: the committed #1569 correction, public DataCite/GitHub/npm/Software Heritage evidence, and current Zenodo health.
- Produces: exact-SHA local and hosted verification evidence for #1569 and unblocks #1545 after #1569 reaches Done.

- [ ] **Step 1: Verify exact committed lineage and paths**

Run:

```bash
git rev-list --reverse 1c86f21a8aacca77dc7ebdc8299606fabfaa7e50..HEAD
git diff-tree --no-commit-id --name-only -r 5b06e29a54ddac959f6b3d8c90c3fea8737d2766
git diff-tree --no-commit-id --name-only -r HEAD
git diff 5b06e29a54ddac959f6b3d8c90c3fea8737d2766..HEAD -- provenance/release-manifest.json
```

Expected: two post-release commits in order; evidence commit changes only the manifest; `HEAD` changes only the verifier and focused test; the manifest diff from evidence commit to `HEAD` is empty.

- [ ] **Step 2: Run the full standalone verification lanes**

Run:

```bash
npm run format:check
npm run lint
npm test
npm run test:integration
node --test test/unit/verify-release.test.mjs
git diff --check
git status --short
```

Expected: every command exits 0 and the worktree is clean.

- [ ] **Step 3: Run the verifier against public evidence**

Run:

```bash
node scripts/verify-release.mjs
```

Expected: exit 0. The JSON binds `v0.1.0`, the published package checksum, and a `warnings` array. A current Zenodo timeout/network/5xx condition appears only as one normalized warning; healthy Zenodo yields an empty array. DataCite, Software Heritage, GitHub, npm, tag, checksum, provenance, manifest, and history failures remain fatal.

- [ ] **Step 4: Verify hosted CI for the exact correction SHA**

Push the existing `extraction-source` branch without rewriting history. Require the public repository's required GitHub Actions checks to pass for the exact `HEAD` SHA. Record the check URLs and exact SHA in the governed issue evidence; do not substitute local green tests for hosted CI.

- [ ] **Step 5: Complete governed #1569 evidence and resume #1545**

Run each issue #1569 verifier through its governed evidence command, advance #1569 through Test and Review, apply the Full-Auto review approval markers, and close it through `/task close`. Confirm #1545's native dependency on #1569 is satisfied and its Disposition clears only when all remaining blockers are Done. Resume #1545 and rerun its public release verifier.
