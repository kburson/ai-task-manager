# DoD and Evidence Contract-Source Reads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This issue prohibits subagents and requires one final story commit.

**Goal:** Complete Delivery Sequence Task 10c by giving Definition of Done and evidence consumers immutable, fail-closed read adapters over the normalized legacy-or-GitHub Delivery Contract source.

**Architecture:** Extend normalized DoD items with raw declarations, then add one pure projection and one one-shot async resolver adapter in each consumer. Keep every existing synchronous body parser and write helper unchanged so Task 11 can adopt the new read models without pulling Task 12 write scope forward.

**Tech Stack:** Node.js ESM, `node:test`, AITM Delivery Contracts, injected GitHub comment readers, immutable JavaScript data models.

## Global Constraints

- A valid issue directory makes its Delivery Contract authoritative; every directory, reader, record, contract, and projection failure refuses without parsing the embedded legacy body again.
- Preserve all existing synchronous exports and mutation behavior in `functional-dod-evidence.mjs` and `evidence-markers.mjs`.
- Preserve stable logical IDs, raw declarations, cleaned labels, checked projections, accepted record IDs, and authority provenance.
- Resolve a contract exactly once per async consumer invocation.
- Load the default contract resolver lazily inside each new adapter so existing synchronous parser imports retain their dependency footprint.
- Do not change citation syntax, lifecycle gates, checklist writes, evidence writes, plan approval, amendment, or demotion.
- Return deeply frozen read projections.
- Deliver exactly one `[#1119]` story commit containing the design, plan, tests, and implementation.

---

### Task 1: Preserve DoD Declarations in the Normalized Contract

**Files:**

- Modify: `scripts/task-tracker/lib/github-records/contract-source.mjs`
- Test: `scripts/task-tracker/tests/unit/lib/github-records/contract-source.test.mjs`

**Interfaces:**

- Consumes: legacy DoD checkbox labels and Delivery Contract `definitionOfDone` entries.
- Produces: `definitionOfDone: Array<{ logicalId, text, declaration, checked }>` for both source kinds.
- Preserves: `resolveContractSource(...)` input, source discrimination, authority object, and fail-closed errors.

- [ ] **Step 1: Add failing DoD declaration parity assertions**

Give the equivalent legacy and directory fixtures the same declaration-bearing
Functional DoD item and assert both normalized models retain the raw declaration
and cleaned display text:

```js
assert.deepEqual(legacy.contract.definitionOfDone[0], {
  logicalId: 'dod-tests',
  text: 'Automated tests pass',
  declaration:
    'Automated tests pass <!-- aitm-verified cmd="`npm test`" --> <!-- dod:functional:tests -->',
  checked: true,
});
assert.deepEqual(github.contract.definitionOfDone, legacy.contract.definitionOfDone);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test scripts/task-tracker/tests/unit/lib/github-records/contract-source.test.mjs
```

Expected: FAIL because normalized DoD items do not expose `declaration` and the
legacy adapter currently cleans the only stored text.

- [ ] **Step 3: Preserve raw and cleaned DoD forms**

Update both adapters to use the same shape:

```js
{
  logicalId,
  text: cleanText(declaration),
  declaration,
  checked,
}
```

For legacy items, `declaration` is the full checkbox label before marker
stripping. For directory items, `declaration` is the contract definition's
`text` field. Keep deterministic legacy IDs and source ordering unchanged.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the Task 1 command again. Expected: PASS with immutable legacy/directory DoD
parity and every existing contract-source test still green.

---

### Task 2: Add the Evidence Read Projection

**Files:**

- Modify: `scripts/task-tracker/lib/evidence-markers.mjs`
- Test: `scripts/task-tracker/tests/unit/lib/github-records/contract-source.test.mjs`

**Interfaces:**

- Consumes: a resolved contract source from `resolveContractSource(...)`.
- Produces: `projectEvidenceChecklist(contractSource)` and
  `resolveEvidenceChecklist({ repository, issue, issueBody, graphql, readContractRecord, deps })`.
- Preserves: `parseEvidenceChecklist`, `auditEvidenceMarkers`, backfill, and Verification Command insertion APIs.

- [ ] **Step 1: Add failing equivalent-source and authority tests**

Add paired calls for an equivalent legacy body and directory record. Assert the
new evidence model carries:

```js
{
  sourceKind,
  acceptanceCriteria: [
    { logicalId, checked, label, evidenceCommands },
  ],
  functionalDodItems: [
    { logicalId, checked, label, evidenceCommands },
  ],
  verificationCommands: [
    { logicalId, command, checked },
  ],
  acceptedRecordIds,
  authority,
}
```

For parity comparisons, normalize only source-specific `sourceKind`,
`acceptedRecordIds`, and `authority`. Assert stable logical IDs, declarations,
checked state, and resolved commands match.

- [ ] **Step 2: Add failing one-shot and fail-closed tests**

Inject `deps.resolveContractSource` and count calls. Require one call for a
successful projection and one call for a rejection. Put valid checked legacy
Markdown beside a directory-backed contract that reports unchecked state and
assert directory state wins. Reject with `contract-source:unavailable` and
assert the same error propagates without invoking a body parser fallback.

- [ ] **Step 3: Run focused tests and verify RED**

Run:

```bash
node --test scripts/task-tracker/tests/unit/lib/github-records/contract-source.test.mjs
```

Expected: FAIL because the projection and async adapter exports do not exist.

- [ ] **Step 4: Implement the pure evidence projection**

Import `resolveContractSource`. Build citation inputs from normalized
Verification Commands while retaining their logical IDs and checked state:

```js
const vcItems = contract.verificationCommands.map((item) => ({
  ...item,
  id: /^vc-(\d+)$/.test(item.logicalId) ? Number(/^vc-(\d+)$/.exec(item.logicalId)[1]) : null,
}));
```

Use the existing private `evidenceCommands(declaration, vcItems)` helper for AC
and DoD declarations. Do not reinterpret `vc-list` syntax. Include cloned
accepted record IDs and the source authority object. Deep-freeze the result and
all nested arrays/items.

- [ ] **Step 5: Implement the one-shot async adapter**

Use the established Task 10 adapter pattern while loading the default resolver
only when the adapter is invoked:

```js
export async function resolveEvidenceChecklist({
  repository,
  issue,
  issueBody,
  graphql,
  readContractRecord,
  deps = {},
} = {}) {
  const resolve =
    deps.resolveContractSource ||
    (await import('./github-records/contract-source.mjs')).resolveContractSource;
  const source = await resolve({
    repository,
    issue,
    issueBody,
    graphql,
    readContractRecord,
  });
  return projectEvidenceChecklist(source);
}
```

Do not catch resolver errors and do not call a legacy parser after rejection.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run the Task 2 command again. Expected: PASS for parity, directory authority,
single resolution, accepted-record preservation, immutability, and fail-closed
errors.

---

### Task 3: Add the Functional DoD Read Projection

**Files:**

- Modify: `scripts/task-tracker/lib/functional-dod-evidence.mjs`
- Test: `scripts/task-tracker/tests/unit/lib/github-records/contract-source.test.mjs`

**Interfaces:**

- Consumes: `projectEvidenceChecklist(contractSource)` and a resolved contract source.
- Produces: `projectFunctionalDodEvidence(contractSource)` and
  `resolveFunctionalDodEvidence({ repository, issue, issueBody, graphql, readContractRecord, deps })`.
- Preserves: existing parsing, stamping, reconciliation, and derived-status exports.

- [ ] **Step 1: Add failing Functional DoD projection tests**

Assert equivalent source models produce items with:

```js
{
  logicalId: 'dod-tests',
  key: 'tests',
  checked: true,
  label: 'Automated tests pass',
  declaration,
  evidenceCommands: ['npm test'],
  evidenceMarker,
  classification: 'stampable',
}
```

Add a directory contract with an unknown stable DoD ID and require the item to
remain present with `key: null` and `classification: null`. Assert accepted
record IDs and authority provenance match the evidence projection.

- [ ] **Step 2: Add failing one-shot and fail-closed tests**

Count an injected resolver and require exactly one call. Reject the resolver
beside a valid body and assert the error propagates unchanged without a body
fallback. Assert all returned objects and arrays are frozen.

- [ ] **Step 3: Run focused tests and verify RED**

Run:

```bash
node --test scripts/task-tracker/tests/unit/lib/github-records/contract-source.test.mjs
```

Expected: FAIL because the Functional DoD read exports do not exist.

- [ ] **Step 4: Implement the pure Functional DoD projection**

Import `projectEvidenceChecklist` and lazily load the default contract resolver
inside the async adapter. Derive a key only from canonical `dod-<known-key>`
logical IDs:

```js
const candidate = /^dod-([a-z0-9-]+)$/.exec(item.logicalId)?.[1] ?? null;
const key = candidate && candidate in KEY_CLASSIFICATION ? candidate : null;
```

Use the declaration to parse execution proof, preserve evidence commands from
the evidence projection, clean the visible label without guessing identity from
wording, and deep-freeze the full result.

- [ ] **Step 5: Implement the one-shot async adapter**

Resolve once through an injected-or-default `resolveContractSource`, then call
the pure projection. Load the default resolver dynamically at invocation time
to avoid expanding legacy parser import graphs. Propagate all resolver failures
unchanged.

- [ ] **Step 6: Run focused and legacy regression tests**

Run:

```bash
node --test \
  scripts/task-tracker/tests/unit/lib/github-records/contract-source.test.mjs \
  scripts/task-tracker/tests/unit/lib/functional-dod-evidence.test.mjs \
  scripts/task-tracker/tests/unit/lib/evidence-markers.test.mjs
```

Expected: PASS with the new normalized read path and unchanged body-only APIs.

---

### Task 4: Verify and Commit the Single Story

**Files:**

- Create: `docs/superpowers/specs/2026-08-07-dod-evidence-contract-source-design.md`
- Create: `docs/superpowers/plans/2026-08-07-dod-evidence-contract-source.md`
- Modify: `scripts/task-tracker/lib/github-records/contract-source.mjs`
- Modify: `scripts/task-tracker/lib/evidence-markers.mjs`
- Modify: `scripts/task-tracker/lib/functional-dod-evidence.mjs`
- Test: `scripts/task-tracker/tests/unit/lib/github-records/contract-source.test.mjs`

**Interfaces:**

- Consumes: the completed Task 1-3 implementation.
- Produces: one clean exact-SHA #1119 commit ready for governed Test and Agent Review.

- [ ] **Step 1: Run all required verification**

Run:

```bash
node --test scripts/task-tracker/tests/unit/lib/github-records/contract-source.test.mjs
npm test
npm run test:slow
npm run lint
npm run format:check
git diff --check
```

Expected: every command exits 0.

- [ ] **Step 2: Review exact story scope**

Run:

```bash
git status --short
git diff --stat
git diff -- scripts/task-tracker/lib/github-records/contract-source.mjs
git diff -- scripts/task-tracker/lib/evidence-markers.mjs
git diff -- scripts/task-tracker/lib/functional-dod-evidence.mjs
git diff -- scripts/task-tracker/tests/unit/lib/github-records/contract-source.test.mjs
```

Expected: only the two documents, three read-side modules, and one focused test
file are changed.

- [ ] **Step 3: Create exactly one story commit**

```bash
git add \
  docs/superpowers/specs/2026-08-07-dod-evidence-contract-source-design.md \
  docs/superpowers/plans/2026-08-07-dod-evidence-contract-source.md \
  scripts/task-tracker/lib/github-records/contract-source.mjs \
  scripts/task-tracker/lib/evidence-markers.mjs \
  scripts/task-tracker/lib/functional-dod-evidence.mjs \
  scripts/task-tracker/tests/unit/lib/github-records/contract-source.test.mjs
git commit -m "[#1119] feat(records): route DoD evidence reads"
```

- [ ] **Step 4: Prove the one-commit boundary**

Run:

```bash
git rev-list --count feature/epic/1067..HEAD
git log --oneline feature/epic/1067..HEAD
git status --short
```

Expected: count `1`, one `[#1119]` subject, and a clean worktree.

- [ ] **Step 5: Enter governed delivery**

Run the exact-SHA Develop finalization, `/task test`, one Agent Review, Full-Auto
approval, `merge-back 1119`, remote epic verification, and sanctioned close.
Do not merge the child directly to trunk and do not add a second story commit.
