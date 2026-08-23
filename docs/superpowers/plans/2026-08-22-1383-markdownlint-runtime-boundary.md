# Local Superpowers Runtime Quality Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exclude local `.superpowers/**` runtime evidence from repository Markdown lint and formatting while repairing the one tracked #939 prose line that independently violates both tools.

**Architecture:** Keep the existing repository-wide quality commands and rules unchanged, but add the local runtime tree to each tool's canonical ignore boundary. A focused real-CLI regression test runs Markdownlint and Prettier in an isolated fixture copied from the repository configs, proving runtime violations are excluded while an ordinary governed Markdown violation remains visible.

**Tech Stack:** Node.js test runner, `markdownlint-cli2`, Prettier, JSONC configuration, Git ignore semantics.

## Global Constraints

- Preserve every existing byte and path under `.superpowers/sdd`; the implementation may inspect or hash those files but must not format, move, delete, stage, or commit them.
- Keep `npm run lint:md`, `npm run format:check`, and all existing non-runtime ignore boundaries unchanged.
- Add only `.superpowers/**` to Markdownlint and `.superpowers/` to Prettier; do not weaken any lint or formatting rule.
- Change the tracked review prose from `#939` to `issue #939` without altering its meaning.
- Use issue #1383 in the plan filename and every implementation commit subject.

---

## File Structure

- Create `scripts/tests/unit/maintenance/markdownlint-runtime-ignore.test.mjs`: real-tool regression for the shared local-runtime quality boundary.
- Create `scripts/tests/fixtures/test-corpus-post-snapshot/unit/maintenance/markdownlint-runtime-ignore.test.mjs.json`: canonical test-corpus membership record for the new regression.
- Modify `.markdownlint-cli2.jsonc`: exclude `.superpowers/**` from Markdownlint discovery.
- Modify `.prettierignore`: exclude `.superpowers/` from repository-wide Prettier discovery.
- Modify `docs/superpowers/reviews/939/spec/2026-08-21-939-governed-pr-delivery-design-r3-reviewer-claude-review.md`: make the tracked issue reference unambiguous prose rather than a malformed ATX heading.

### Task 1: Lock and repair the local runtime quality boundary

**Files:**

- Create: `scripts/tests/unit/maintenance/markdownlint-runtime-ignore.test.mjs`
- Create: `scripts/tests/fixtures/test-corpus-post-snapshot/unit/maintenance/markdownlint-runtime-ignore.test.mjs.json`
- Modify: `.markdownlint-cli2.jsonc`
- Modify: `.prettierignore`
- Modify: `docs/superpowers/reviews/939/spec/2026-08-21-939-governed-pr-delivery-design-r3-reviewer-claude-review.md:84`

**Interfaces:**

- Consumes: the repository's `.markdownlint-cli2.jsonc`, `.prettierrc.json`, and `.prettierignore` files plus the installed `markdownlint-cli2` and `prettier` executables.
- Produces: one regression that fails whenever either quality tool re-admits `.superpowers/**`, while continuing to require an ordinary `docs/**` Markdown violation to be reported.

- [ ] **Step 1: Record the immutable runtime baseline**

Run:

```bash
git status --ignored --short .superpowers/sdd
find .superpowers/sdd -type f -print0 | sort -z | xargs -0 shasum -a 256
```

Expected: local runtime entries are ignored except any intentionally force-added evidence already tracked; the checksum list becomes the before-state for the final byte-preservation comparison.

- [ ] **Step 2: Write the failing real-tool regression**

Create `scripts/tests/unit/maintenance/markdownlint-runtime-ignore.test.mjs` with an isolated fixture that copies the three canonical quality config files, writes the same invalid Markdown to `.superpowers/sdd/runtime.md` and `docs/governed.md`, invokes each installed CLI with `spawnSync`, and asserts:

```js
assert.equal(markdownlint.status, 1);
assert.match(markdownlintOutput, /docs\/governed\.md/);
assert.doesNotMatch(markdownlintOutput, /\.superpowers/);

assert.equal(prettier.status, 1);
assert.match(prettierOutput, /docs\/governed\.md/);
assert.doesNotMatch(prettierOutput, /\.superpowers/);
```

The fixture must be removed in `finally`, and the test must use the real binaries from `node_modules/.bin` rather than mocks.

Add the membership record:

```json
{
  "schema": 1,
  "path": "scripts/tests/unit/maintenance/markdownlint-runtime-ignore.test.mjs"
}
```

- [ ] **Step 3: Run the regression to verify RED**

Run:

```bash
node --test scripts/tests/unit/maintenance/markdownlint-runtime-ignore.test.mjs
```

Expected: FAIL because the current Markdownlint and Prettier outputs both include `.superpowers/sdd/runtime.md`.

- [ ] **Step 4: Add the minimal ignore entries**

Append the tool-native entries without changing any existing boundary:

```text
.markdownlint-cli2.jsonc ignores: ".superpowers/**"
.prettierignore: .superpowers/
```

- [ ] **Step 5: Repair the tracked #939 prose**

Change only the beginning of line 84:

```diff
-#939, and the design correctly declines the weaker reorder-in-`close` and
+issue #939, and the design correctly declines the weaker reorder-in-`close` and
```

- [ ] **Step 6: Run focused verification to verify GREEN**

Run:

```bash
node --test scripts/tests/unit/maintenance/markdownlint-runtime-ignore.test.mjs scripts/tests/unit/meta/test-corpus-membership.test.mjs
npm run lint:md
npm run format:check
```

Expected: both tests pass; Markdownlint reports zero issues; Prettier reports all matched governed files formatted; neither command lists `.superpowers/**`.

- [ ] **Step 7: Prove ignored runtime bytes were preserved**

Run the same checksum command from Step 1 and compare every path/hash pair. Also run:

```bash
git status --short .superpowers/sdd
git diff -- .superpowers/sdd
```

Expected: hashes are byte-identical, no ignored runtime file appears in tracked status, and the tracked diff is empty for `.superpowers/sdd`.

- [ ] **Step 8: Commit the defect fix**

```bash
git add .markdownlint-cli2.jsonc .prettierignore \
  docs/superpowers/reviews/939/spec/2026-08-21-939-governed-pr-delivery-design-r3-reviewer-claude-review.md \
  scripts/tests/unit/maintenance/markdownlint-runtime-ignore.test.mjs \
  scripts/tests/fixtures/test-corpus-post-snapshot/unit/maintenance/markdownlint-runtime-ignore.test.mjs.json
git commit -m "[#1383] fix: exclude local Superpowers runtime from quality checks"
```

### Task 2: Verify repository compatibility and prepare governed Test

**Files:**

- Verify only: all Task 1 files and the full repository test corpus.

**Interfaces:**

- Consumes: the committed Task 1 exact head.
- Produces: green fast, slow, lint, formatting, and commit evidence suitable for `/task test #1383`.

- [ ] **Step 1: Run the issue-specific and quality checks**

```bash
node --test scripts/tests/unit/maintenance/markdownlint-runtime-ignore.test.mjs
npm run lint:md
npm run lint
npm run format:check
git diff --check
```

Expected: every command exits 0 with no warnings attributable to `.superpowers/**`.

- [ ] **Step 2: Run the full test lanes**

```bash
npm test
npm run test:slow
```

Expected: both lanes exit 0.

- [ ] **Step 3: Refresh traceability and inspect the final head**

```bash
npx aitm commit-trace 1383
git status --short
git log --oneline -1
```

Expected: #1383's commit trace names the exact implementation commit, the tracked worktree is clean, and HEAD contains `[#1383]`.

## Self-Review

- Spec coverage: the plan covers Markdownlint exclusion, the newly confirmed matching Prettier boundary, tracked #939 prose repair, focused real-tool regression, runtime byte preservation, and full verification.
- Placeholder scan: no implementation placeholder remains; every file, command, expected failure, and expected success is explicit.
- Type consistency: the test uses `spawnSync` result `status`, `stdout`, and `stderr` consistently for both CLIs; the corpus record path exactly matches the created test path.
