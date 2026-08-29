# #1411 Residue Audit Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the legacy state-vocabulary residue audit reject non-canonical path aliases and prove that genuine product residue produces the promised `UNEXPECTED` failure.

**Architecture:** Keep Git and filesystem collection in the integration test, while moving legacy-token matching and residue classification into a pure helper that consumes explicit `{ file, source }` entries. Narrow the existing generated-research predicate to canonical repository-relative paths without changing its anchored root, extension set, allowlist, or failure-string contract.

**Tech Stack:** Node.js ESM, `node:test`, `node:assert/strict`, Git `ls-files -z`, AITM governed task workflow

## Global Constraints

- Work only in issue #1411's recorded worktree and issue-specific branch.
- Preserve the exact compatibility allowlist and all existing count semantics.
- Keep the generated-data extensions exactly `.json`, `.txt`, `.csv`, and `.ndjson`.
- Keep the exemption anchored at the exact `docs/research/` prefix.
- Treat non-canonical input as audited, never normalized or repaired.
- Keep Git and filesystem access out of the pure evaluator.
- Do not change production runtime, lifecycle behavior, Git behavior, or CI lane placement.
- Keep the live audit in the integration lane established by #1413.
- Use test-driven development: observe the intended red failure before each implementation change.
- Use the AITM task skill for all issue lifecycle transitions; never call the raw state mover.

---

## File Map

- Modify `scripts/tests/lib/residue-audit-scope.mjs`: own canonical generated-research recognition, legacy-token matching, and pure residue evaluation.
- Modify `scripts/tests/unit/task-tracker/core/residue-audit-scope.test.mjs`: pin canonical-path boundaries and the evaluator's `UNEXPECTED`, `COUNT`, and `MISSING` behavior.
- Modify `scripts/tests/integration/task-tracker/core/assigned-state-residue.test.mjs`: retain repository collection and the exact allowlist, then delegate classification to the pure evaluator.

### Task 1: Reject Non-Canonical Generated-Research Paths

**Files:**

- Modify: `scripts/tests/unit/task-tracker/core/residue-audit-scope.test.mjs`
- Modify: `scripts/tests/lib/residue-audit-scope.mjs`

**Interfaces:**

- Consumes: `isGeneratedResearchArtifact(file: unknown): boolean`
- Produces: the same function with a strict canonical repository-path precondition; canonical callers retain their current results.

- [ ] **Step 1: Replace the backslash-normalization expectation with failing canonical-path boundary cases**

Replace the final test in `scripts/tests/unit/task-tracker/core/residue-audit-scope.test.mjs` with:

```js
test('non-canonical research paths are audited rather than exempted', () => {
  const nonCanonicalPaths = [
    'docs\\research\\audit\\overlap.json',
    '/docs/research/audit/overlap.json',
    'docs/research//overlap.json',
    'docs/research/./overlap.json',
    'docs/research/../src/overlap.json',
  ];

  for (const file of nonCanonicalPaths) {
    assert.equal(isGeneratedResearchArtifact(file), false, file);
  }
});

test('non-string paths are audited rather than coerced', () => {
  assert.equal(isGeneratedResearchArtifact(undefined), false);
  assert.equal(isGeneratedResearchArtifact({ toString: () => 'docs/research/data.json' }), false);
});
```

- [ ] **Step 2: Run the focused unit test and observe the red failure**

Run:

```bash
node --test scripts/tests/unit/task-tracker/core/residue-audit-scope.test.mjs
```

Expected: FAIL in `non-canonical research paths are audited rather than exempted`; the current implementation returns `true` for the literal-backslash path and traversal-shaped research paths.

- [ ] **Step 3: Implement the minimal canonical repository-path check**

In `scripts/tests/lib/residue-audit-scope.mjs`, replace `isGeneratedResearchArtifact` and add its private predicate as follows:

```js
/**
 * @param {unknown} file candidate repo-relative path
 * @returns {file is string} true only for canonical Git repository paths
 */
function isCanonicalRepositoryPath(file) {
  if (typeof file !== 'string' || file.length === 0) return false;
  if (file.includes('\\') || file.startsWith('/')) return false;

  return file.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

/**
 * @param {unknown} file repo-relative path
 * @returns {boolean} true when the path is a generated research artifact and so
 *   is exempt from the residue walk
 */
export function isGeneratedResearchArtifact(file) {
  if (!isCanonicalRepositoryPath(file)) return false;
  if (!file.startsWith(RESEARCH_ROOT)) return false;
  return GENERATED_DATA_EXTENSIONS.some((ext) => file.endsWith(ext));
}
```

Do not call `String(file)`, replace separators, resolve segments, or otherwise normalize the input.

- [ ] **Step 4: Run the focused boundary and live audit tests**

Run:

```bash
node --test \
  scripts/tests/unit/task-tracker/core/residue-audit-scope.test.mjs \
  scripts/tests/integration/task-tracker/core/assigned-state-residue.test.mjs
```

Expected: 8 tests pass, 0 fail. The live audit remains green because `git ls-files -z` already supplies canonical repository paths.

- [ ] **Step 5: Commit the independently reviewable path hardening**

```bash
git add \
  scripts/tests/lib/residue-audit-scope.mjs \
  scripts/tests/unit/task-tracker/core/residue-audit-scope.test.mjs
git commit -m "[#1411] fix(test): reject noncanonical residue paths"
```

### Task 2: Extract and Behaviorally Test the Pure Residue Evaluator

**Files:**

- Modify: `scripts/tests/unit/task-tracker/core/residue-audit-scope.test.mjs`
- Modify: `scripts/tests/lib/residue-audit-scope.mjs`
- Modify: `scripts/tests/integration/task-tracker/core/assigned-state-residue.test.mjs`

**Interfaces:**

- Consumes: `entries: Array<{ file: string, source: string }>` and `allowlist: Map<string, [number, string]>`
- Produces: `legacyMatches(source: unknown): string[]`
- Produces: `evaluateResidueAudit({ entries, allowlist }): string[]`
- Preserves: failure strings beginning with `UNEXPECTED`, `COUNT`, and `MISSING` exactly as emitted by the current live integration test.

- [ ] **Step 1: Add focused failing tests for the wished-for evaluator**

Change the unit-test import and add a failing-export helper:

```js
import * as residueAudit from '../../../lib/residue-audit-scope.mjs';

const { isGeneratedResearchArtifact } = residueAudit;

function requiredFunction(name) {
  assert.equal(typeof residueAudit[name], 'function', `${name} must be exported`);
  return residueAudit[name];
}
```

Then append these tests to `scripts/tests/unit/task-tracker/core/residue-audit-scope.test.mjs`:

```js
const LEGACY_STATE = ['On', 'Deck'].join(' ');
const RESIDUE_LINE = `const currentState = '${LEGACY_STATE}';`;

test('legacy matcher catches a state name split across comment lines', () => {
  const legacyMatches = requiredFunction('legacyMatches');
  assert.deepEqual(legacyMatches('current state: On\n// Deck waiting room'), [
    '1:split:On // Deck',
  ]);
});

test('audit reports product residue but ignores generated research data', () => {
  const evaluateResidueAudit = requiredFunction('evaluateResidueAudit');
  const failures = evaluateResidueAudit({
    entries: [
      {
        file: 'scripts/product-state.mjs',
        source: RESIDUE_LINE,
      },
      {
        file: 'docs/research/audit/inventory.json',
        source: RESIDUE_LINE,
      },
    ],
    allowlist: new Map(),
  });

  assert.deepEqual(failures, [`UNEXPECTED scripts/product-state.mjs\n  1:${RESIDUE_LINE}`]);
});

test('audit preserves exact count and missing allowlist failures', () => {
  const evaluateResidueAudit = requiredFunction('evaluateResidueAudit');
  const failures = evaluateResidueAudit({
    entries: [
      {
        file: 'scripts/compatibility.mjs',
        source: RESIDUE_LINE,
      },
    ],
    allowlist: new Map([
      ['scripts/compatibility.mjs', [2, 'compatibility seam']],
      ['docs/migration-history.md', [1, 'expected historical carrier']],
    ]),
  });

  assert.deepEqual(failures, [
    `COUNT scripts/compatibility.mjs: expected 2, found 1 (compatibility seam)\n  1:${RESIDUE_LINE}`,
    'MISSING docs/migration-history.md: expected 1 (expected historical carrier)',
  ]);
});
```

- [ ] **Step 2: Run the unit test and observe the red failure**

Run:

```bash
node --test scripts/tests/unit/task-tracker/core/residue-audit-scope.test.mjs
```

Expected: FAIL with `legacyMatches must be exported` and `evaluateResidueAudit must be exported`. These assertion failures identify the missing pure seam required by the approved design without turning the red phase into a module-loading error.

- [ ] **Step 3: Move matching and classification into the pure helper**

In `scripts/tests/lib/residue-audit-scope.mjs`, add these constants below the generated-data constants:

```js
const LEGACY_TOKEN = /on[- _]?deck/i;
const SPLIT_LEGACY_TOKEN = /on[ \t]*\r?\n[ \t]*(?:(?:\/\/|#|\*)[ \t]*)?deck/gi;
```

Add these exports after `isGeneratedResearchArtifact`:

```js
/**
 * @param {unknown} source file contents
 * @returns {string[]} matching line descriptions
 */
export function legacyMatches(source) {
  const text = String(source || '');
  const matches = [];
  text.split('\n').forEach((line, index) => {
    if (LEGACY_TOKEN.test(line)) matches.push(`${index + 1}:${line.trim()}`);
  });
  for (const match of text.matchAll(SPLIT_LEGACY_TOKEN)) {
    const line = text.slice(0, match.index).split('\n').length;
    matches.push(`${line}:split:${match[0].replace(/\s+/g, ' ')}`);
  }
  return matches;
}

/**
 * @param {{
 *   entries: Array<{ file: string, source: string }>,
 *   allowlist: Map<string, [number, string]>
 * }} input explicit audit inputs
 * @returns {string[]} deterministic policy failures
 */
export function evaluateResidueAudit({ entries, allowlist }) {
  const residue = new Map();
  for (const { file, source } of entries) {
    if (isGeneratedResearchArtifact(file)) continue;
    const matches = legacyMatches(source);
    if (matches.length > 0) residue.set(file, matches);
  }

  const failures = [];
  for (const [file, matches] of residue) {
    const allowed = allowlist.get(file);
    if (!allowed) {
      failures.push(`UNEXPECTED ${file}\n  ${matches.join('\n  ')}`);
    } else if (matches.length !== allowed[0]) {
      failures.push(
        `COUNT ${file}: expected ${allowed[0]}, found ${matches.length} (${allowed[1]})\n  ${matches.join('\n  ')}`
      );
    }
  }
  for (const [file, [count, reason]] of allowlist) {
    if (!residue.has(file)) failures.push(`MISSING ${file}: expected ${count} (${reason})`);
  }

  return failures;
}
```

This is a mechanical extraction of the existing matcher and failure builder. Do not alter its regexes, ordering, formatting, or exact-count behavior.

- [ ] **Step 4: Run the focused unit test and confirm the pure policy is green**

Run:

```bash
node --test scripts/tests/unit/task-tracker/core/residue-audit-scope.test.mjs
```

Expected: 9 tests pass, 0 fail, including the behavioral `UNEXPECTED`, `COUNT`, and `MISSING` regressions.

- [ ] **Step 5: Make the live integration audit call the pure evaluator**

In `scripts/tests/integration/task-tracker/core/assigned-state-residue.test.mjs`, replace the helper import with:

```js
import { evaluateResidueAudit } from '../../../lib/residue-audit-scope.mjs';
```

Delete `LEGACY_TOKEN`, `SPLIT_LEGACY_TOKEN`, the local `legacyMatches` function, and the standalone split-line matcher test. Preserve `SELF` and the complete `ALLOWLIST` byte-for-byte.

Replace the body of the live compatibility-allowlist audit test after the `files` collection with:

```js
const entries = [];
for (const file of files) {
  if (file === SELF) continue;
  try {
    entries.push({ file, source: readFileSync(file, 'utf8') });
  } catch {
    continue;
  }
}

const failures = evaluateResidueAudit({ entries, allowlist: ALLOWLIST });

assert.deepEqual(
  failures,
  [],
  `legacy Assigned-state residue audit failed:\n${failures.join('\n')}`
);
```

The integration test still owns Git enumeration, self-exclusion, file reads, and the final assertion. The helper owns only deterministic classification.

- [ ] **Step 6: Run both focused files and the complete integration lane**

Run:

```bash
node --test \
  scripts/tests/unit/task-tracker/core/residue-audit-scope.test.mjs \
  scripts/tests/integration/task-tracker/core/assigned-state-residue.test.mjs
npm run test:integration
```

Expected: focused tests pass with 0 failures; the integration lane passes with the live repository audit consuming the extracted evaluator.

- [ ] **Step 7: Commit the independently reviewable evaluator extraction**

```bash
git add \
  scripts/tests/lib/residue-audit-scope.mjs \
  scripts/tests/unit/task-tracker/core/residue-audit-scope.test.mjs \
  scripts/tests/integration/task-tracker/core/assigned-state-residue.test.mjs
git commit -m "[#1411] test(residue): prove unexpected vocabulary failures"
```

### Task 3: Verify and Enter Governed Test

**Files:**

- Verify only: `scripts/tests/lib/residue-audit-scope.mjs`
- Verify only: `scripts/tests/unit/task-tracker/core/residue-audit-scope.test.mjs`
- Verify only: `scripts/tests/integration/task-tracker/core/assigned-state-residue.test.mjs`

**Interfaces:**

- Consumes: the two independently committed deliverables from Tasks 1 and 2.
- Produces: complete local quality evidence and a fresh issue #1411 governed Test receipt.

- [ ] **Step 1: Run formatting and static quality gates**

```bash
npm run format:check
npm run lint
```

Expected: both commands exit 0. If formatting fails, run `npx prettier --write` only on the three modified source/test files, inspect the diff, and rerun both commands before continuing.

- [ ] **Step 2: Run the fast and slow test lanes required by the design**

```bash
npm test
npm run test:slow
```

Expected: both lanes pass with 0 failures.

- [ ] **Step 3: Inspect the exact delivery delta**

```bash
git status --short
git log --oneline origin/trunk..HEAD
git diff --check origin/trunk...HEAD
git diff --stat origin/trunk...HEAD
```

Expected: the worktree is clean; the log contains the approved design/plan commits and the two implementation commits; `git diff --check` emits no output; the diff is limited to the approved design, plan, helper, and two test files.

- [ ] **Step 4: Run the governed Test transition in a fresh sandbox**

Reload the AITM task skill and its boot rules, confirm issue #1411 is bound to this recorded worktree, then run:

```bash
npx aitm test 1411
```

Expected: the governed verifier passes and advances #1411 from Develop to Test with fresh receipts. Do not reuse the invalidated pre-amendment receipts.

- [ ] **Step 5: Request independent agent review before human approval**

Use the `requesting-code-review` skill against the exact `origin/trunk...HEAD` delta. Require the reviewer to check:

- non-canonical paths cannot enter the generated-research exemption;
- the behavioral regression observes `UNEXPECTED` for product residue;
- generated research data remains exempt;
- `COUNT` and `MISSING` strings and allowlist behavior remain exact;
- the live integration test calls the same evaluator proven by unit tests; and
- no production or unrelated policy changed.

Expected: no unresolved Critical or Important findings before proceeding to the AITM Review and human-approval gates.
