# Package Boundary Ceiling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the package-boundary guard accept the reviewed 779-entry branch surface while explicitly requiring #1546's shipped peer-review adapter.

**Architecture:** Preserve the existing six-case `npm pack --dry-run --json` guard and change only its attribution, ceiling history, required-entry list, and exact ceiling. Before implementation, align #1578's live GitHub authority with the ratified spec through the canonical fresh-base issue-body mutator.

**Tech Stack:** Node.js 25, ECMAScript modules, built-in `node:test`, npm pack manifests, AITM governed issue-body and verification workflows.

## Global Constraints

- Governing design: `docs/superpowers/specs/2026-09-10-1578-package-boundary-ceiling-design.md` accepted at `4e96a7a8ff39444d69580a3ee2f331572966d8ab`.
- Modify no tracked implementation file except `scripts/tests/unit/task-tracker/core/package-boundary.test.mjs`.
- Do not change `package.json`, `package-lock.json`, package allowlists, exclusions, production code, or existing package-boundary assertions.
- Add only `scripts/task-tracker/lib/peer-review-adapter.mjs` to the required runtime-entry list.
- Keep the working-tree pack measurement exact at 779; add no contingency headroom and do not filter through `git ls-files`.
- Run exact-count checks with no untracked package-eligible files or concurrent repository writers.
- Do not integrate or cherry-pick #1578 independently of #1546's adapter commit `311cef526`.
- Task 15/#1546 owns any later remeasurement required by legacy-runtime removal.

## File Structure

- Governed record: GitHub issue #1578 — align Scope, Fix Direction, deep-dive steps, and the second acceptance criterion with the ratified required-entry decision.
- Temporary: `.scratch/gh/1578-align-body.mjs` — one-use fresh-base issue-body transformation; delete after verified read-back.
- Modify: `scripts/tests/unit/task-tracker/core/package-boundary.test.mjs` — record #1578, require the adapter, and raise the exact ceiling.
- Test: `scripts/tests/unit/task-tracker/core/package-boundary.test.mjs` — existing six-case regression; no new test file.

---

## Pre-Implementation Authority Gate

Complete this gate after plan peer-review acceptance and before `npx aitm plan-approve 1578` or any implementation edit.

- [ ] **Step 1: Verify the live issue still needs the ratified alignment**

Run:

```bash
gh issue view 1578 --repo kburson/ai-task-manager --json body --jq .body
```

Expected: the body still says the required runtime-entry assertions remain unchanged in Scope, the deep-dive steps omit the adapter assertion, and the second acceptance criterion requires those assertions to remain unchanged.

- [ ] **Step 2: Create the exact fresh-base alignment script**

Use `apply_patch` to create `.scratch/gh/1578-align-body.mjs` with:

```js
import { mutateIssueBody } from '../../scripts/task-tracker/lib/issue-body-mutate.mjs';

const replacements = Object.freeze([
  {
    label: 'scope',
    expected:
      "Update only the package-boundary test's story attribution, explanatory ceiling history, and numeric entry ceiling. Record that #1546 intentionally adds the shipped `scripts/task-tracker/lib/peer-review-adapter.mjs` entry, whose measured branch package surface is 779 entries. Preserve every package allowlist, exclusion, exact introduction-document inventory, and required runtime-entry assertion.",
    replacement:
      "Update only the package-boundary test's story attribution, explanatory ceiling history, required runtime-entry list, and numeric entry ceiling. Record that #1546 intentionally adds the shipped `scripts/task-tracker/lib/peer-review-adapter.mjs` entry, whose measured branch package surface is 779 entries. Preserve every package allowlist, exclusion, exact introduction-document inventory, and existing required runtime entry while adding the adapter requirement.",
  },
  {
    label: 'fix-direction',
    expected:
      "Add the new defect's story tag to the package-boundary test, append a concise ceiling-history note naming #1546's one shipped adapter, and raise `ENTRY_CEILING` from 778 to 779. Re-run the focused package-boundary file and the normal governed verification lanes. Do not change `package.json`, package contents, allowlists, exclusions, or runtime code.",
    replacement:
      "Add the new defect's story tag to the package-boundary test, append a concise ceiling-history note naming #1546's one shipped adapter, require `scripts/task-tracker/lib/peer-review-adapter.mjs`, and raise `ENTRY_CEILING` from 778 to 779. Re-run the focused package-boundary file and the normal governed verification lanes. Do not change `package.json`, package contents, allowlists, exclusions, or runtime code.",
  },
  {
    label: 'deep-dive-file',
    expected:
      '- `scripts/tests/unit/task-tracker/core/package-boundary.test.mjs` — add #1578 to the existing story attribution, document the single intentional packed entry introduced by #1546, and raise the exact ceiling from 778 to 779.',
    replacement:
      '- `scripts/tests/unit/task-tracker/core/package-boundary.test.mjs` — add #1578 to the existing story attribution, document the single intentional packed entry introduced by #1546, require the peer-review adapter, and raise the exact ceiling from 778 to 779.',
  },
  {
    label: 'deep-dive-steps',
    expected: [
      '3. Extend the ceiling history with a concise note that #1546 ships one peer-review adapter on top of the 778-entry synchronized surface.',
      '4. Change only `ENTRY_CEILING` from 778 to 779. Do not add contingency headroom.',
      '5. Re-run the focused package-boundary file and require all six cases to pass. Inspect the diff to prove that every allowlist, exclusion, exact introduction-document inventory, README-link check, and required runtime-entry assertion is byte-for-byte unchanged.',
    ].join('\n'),
    replacement: [
      '3. Extend the ceiling history with a concise note that #1546 ships one peer-review adapter on top of the 778-entry synchronized surface.',
      '4. Add `scripts/task-tracker/lib/peer-review-adapter.mjs` to the required runtime-entry list without removing or weakening any existing entry.',
      '5. Change only `ENTRY_CEILING` from 778 to 779. Do not add contingency headroom.',
      '6. Re-run the focused package-boundary file and require all six cases to pass. Inspect the diff to prove that every allowlist, exclusion, exact introduction-document inventory, README-link check, and existing required runtime-entry assertion is preserved while the adapter requirement is added.',
    ].join('\n'),
  },
  {
    label: 'acceptance-criterion',
    expected:
      '- [ ] Existing test-file, excluded-directory, introduction-document, README-link, and required-runtime-entry guards remain unchanged and green. <!-- aitm-verified vc-list="vc:1" -->',
    replacement:
      '- [ ] Existing test-file, excluded-directory, introduction-document, README-link, and required-runtime-entry guards remain green; existing required entries are preserved and the peer-review adapter is explicitly required. <!-- aitm-verified vc-list="vc:1" -->',
  },
]);

function replaceExactlyOnce(body, { label, expected, replacement }) {
  const matches = body.split(expected).length - 1;
  if (matches !== 1) throw new Error(`1578-align:${label}: expected one match, found ${matches}`);
  return body.replace(expected, replacement);
}

const result = await mutateIssueBody({
  issueNumber: 1578,
  repo: 'kburson/ai-task-manager',
  mutate: (base) => replacements.reduce(replaceExactlyOnce, base),
});

console.log(`1578-align: ${result.status} version=${result.version}`);
```

Expected: the temporary script contains five exact replacements and delegates the write to `mutateIssueBody`; it contains no complete issue-body snapshot.

- [ ] **Step 3: Apply the alignment and verify authoritative read-back**

Run:

```bash
node .scratch/gh/1578-align-body.mjs
gh issue view 1578 --repo kburson/ai-task-manager --json body --jq .body
```

Expected: the script reports `updated` with a new integer body version. Scope and Fix Direction name the required adapter, the deep-dive sequence has six steps including the adapter assertion, and the second acceptance criterion preserves existing entries while requiring the adapter. Every AITM marker and unrelated body byte remains intact.

- [ ] **Step 4: Delete the temporary alignment script**

Use `apply_patch` to delete `.scratch/gh/1578-align-body.mjs`, then run:

```bash
git status --short
```

Expected: the temporary script is absent and Git reports no change from the issue-body alignment.

- [ ] **Step 5: Record human Plan approval and enter Develop**

After the accepted plan and aligned issue body have been reviewed by the human operator, run the ordinary governed Plan-approval and one-step promotion verbs. Do not use `move-state.mjs` directly.

```bash
npx aitm plan-approve 1578
npx aitm promote 1578
npx aitm status 1578
```

Expected: #1578 carries the Plan-approval marker and enters Develop in the recorded `codex/ai-peer-review-design` worktree before Task 1 begins.

---

### Task 1: Require and Account for the Peer-Review Adapter

**Files:**

- Modify: `scripts/tests/unit/task-tracker/core/package-boundary.test.mjs:1`
- Modify: `scripts/tests/unit/task-tracker/core/package-boundary.test.mjs:116-121`
- Modify: `scripts/tests/unit/task-tracker/core/package-boundary.test.mjs:204-218`
- Test: `scripts/tests/unit/task-tracker/core/package-boundary.test.mjs`

**Interfaces:**

- Consumes: `packedFiles() -> string[]`, the actual `npm pack --dry-run --json` manifest, and #1546's existing adapter at commit `311cef526`.
- Produces: the same six-case guard with `ENTRY_CEILING = 779` and an explicit required-entry assertion for `scripts/task-tracker/lib/peer-review-adapter.mjs`.

- [ ] **Step 1: Verify the clean 779-entry implementation base**

Run:

```bash
git status --short
git merge-base --is-ancestor 311cef526 HEAD
node --version
node - <<'NODE'
const { execFileSync } = require('node:child_process');
const manifest = JSON.parse(
  execFileSync('npm', ['pack', '--dry-run', '--json'], { encoding: 'utf8' })
)[0];
const paths = manifest.files.map(({ path }) => path);
console.log(JSON.stringify({
  count: paths.length,
  adapter: paths.includes('scripts/task-tracker/lib/peer-review-adapter.mjs'),
}));
NODE
```

Expected: `git status --short` prints nothing; the ancestry command exits 0; Node reports `v25.6.0`; the manifest result is `{"count":779,"adapter":true}`. Stop if the tree is dirty, the adapter commit is absent, or the count differs.

- [ ] **Step 2: Reproduce the focused RED guard**

Run:

```bash
node --test scripts/tests/unit/task-tracker/core/package-boundary.test.mjs
```

Expected: exit nonzero; five tests pass and only `package-boundary: total entry count stays under the ceiling` fails with `packed entry count 779 exceeds ceiling 778`.

- [ ] **Step 3: Apply the four ratified guard edits**

Use `apply_patch` to change the story line to:

```js
// @story #551 #1279 #1497 #1501 #1578
```

Append this history immediately after the #1562 note and replace the ceiling:

```js
// #1578 accounts for #1546's shipped peer-review adapter. The synchronized
// branch surface was 778 before that one required runtime entry; raise by one
// and retain no contingency headroom.
const ENTRY_CEILING = 779;
```

Add this string to the existing required array without changing another entry:

```js
'scripts/task-tracker/lib/peer-review-adapter.mjs',
```

Expected: only the `@story` attribution, ceiling-history tail, ceiling value, and required array change.

- [ ] **Step 4: Verify the focused guard is GREEN**

Run:

```bash
node --test scripts/tests/unit/task-tracker/core/package-boundary.test.mjs
```

Expected: exit 0; all six tests pass, including the exact count and required runtime-entry cases.

- [ ] **Step 5: Prove the diff and packed surface are exact**

Run:

```bash
git diff --check
git diff -- scripts/tests/unit/task-tracker/core/package-boundary.test.mjs
git diff --name-only
node - <<'NODE'
const { execFileSync } = require('node:child_process');
const manifest = JSON.parse(
  execFileSync('npm', ['pack', '--dry-run', '--json'], { encoding: 'utf8' })
)[0];
const paths = manifest.files.map(({ path }) => path);
if (paths.length !== 779) throw new Error(`expected 779 entries, found ${paths.length}`);
if (!paths.includes('scripts/task-tracker/lib/peer-review-adapter.mjs')) {
  throw new Error('required peer-review adapter is absent from package');
}
console.log('package-boundary: 779 entries; adapter present');
NODE
```

Expected: whitespace check passes; `git diff --name-only` prints only the package-boundary test; the diff contains exactly the four ratified edits; the manifest check reports 779 entries and adapter presence.

- [ ] **Step 6: Run governed Develop iteration verification**

Run:

```bash
node scripts/task-tracker/verify-develop.mjs --mode iteration
```

Expected: exit 0 with no package-boundary failure.

- [ ] **Step 7: Commit the implementation boundary**

Run:

```bash
git add scripts/tests/unit/task-tracker/core/package-boundary.test.mjs
git diff --cached --check
git diff --cached --name-only
git commit -m "[#1578] test: account for peer-review adapter package entry"
```

Expected: the cached path check names only `scripts/tests/unit/task-tracker/core/package-boundary.test.mjs`; the attributed commit succeeds without amending or rewriting #1546 or #1577 history.

- [ ] **Step 8: Run clean exact-SHA Develop finalization**

Run:

```bash
git status --short
node scripts/task-tracker/verify-develop.mjs --mode final --issue 1578
git log --oneline -1
```

Expected: the worktree is clean; finalization exits 0 for the new #1578 commit; the log shows the exact attributed subject. Report `CODE_COMPLETE` with the commit SHA and RED/GREEN evidence. The orchestrator owns promotion, Test, independent review, delivery, and close.
