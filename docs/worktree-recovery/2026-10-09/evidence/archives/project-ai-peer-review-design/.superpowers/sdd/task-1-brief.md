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

- [ ] **Step 5: Falsify adapter presence and prove the required-entry assertion bites**

Run this trap-protected probe from the repository root:

```bash
set -e
adapter_path='scripts/task-tracker/lib/peer-review-adapter.mjs'
probe_path='.scratch/gh/1578-peer-review-adapter.falsification.mjs'
output_path='.scratch/gh/1578-required-entry-falsification.txt'

test ! -e "$probe_path"
mv -- "$adapter_path" "$probe_path"
restore_adapter() {
  if test -e "$probe_path"; then
    mv -- "$probe_path" "$adapter_path"
  fi
}
trap restore_adapter EXIT INT TERM

set +e
node --test scripts/tests/unit/task-tracker/core/package-boundary.test.mjs >"$output_path" 2>&1
probe_rc=$?
set -e

test "$probe_rc" -ne 0
rg -F '✔ package-boundary: total entry count stays under the ceiling' "$output_path"
rg -F '✖ package-boundary: runtime entry points are still shipped' "$output_path"
rg -F \
  'required runtime file missing from package: scripts/task-tracker/lib/peer-review-adapter.mjs' \
  "$output_path"

node - <<'NODE'
const { execFileSync } = require('node:child_process');
const manifest = JSON.parse(
  execFileSync('npm', ['pack', '--dry-run', '--json'], { encoding: 'utf8' })
)[0];
if (manifest.files.length !== 778) {
  throw new Error(`expected 778 entries without adapter, found ${manifest.files.length}`);
}
console.log('package-boundary falsification: count passes at 778 without adapter');
NODE

restore_adapter
trap - EXIT INT TERM
test -f "$adapter_path"
test ! -e "$probe_path"
git diff --quiet -- "$adapter_path"
rm -f -- "$output_path"
test ! -e "$output_path"
git status --short
```

Expected: the focused command exits nonzero only because the required-entry case names the missing adapter; the count case passes at 778 under the new 779 ceiling. The trap restores the adapter even on an early failure. Final checks prove the tracked adapter is byte-identical, both scratch probe files are absent, and `git status --short` names only the intentional package-boundary test modification.

- [ ] **Step 6: Prove the diff and packed surface are exact**

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

- [ ] **Step 7: Run governed Develop iteration verification**

Run:

```bash
node scripts/task-tracker/verify-develop.mjs --mode iteration
```

Expected: exit 0 with no package-boundary failure.

- [ ] **Step 8: Commit the implementation boundary**

Run:

```bash
git add scripts/tests/unit/task-tracker/core/package-boundary.test.mjs
git diff --cached --check
git diff --cached --name-only
git commit -m "[#1578] test: account for peer-review adapter package entry"
```

Expected: the cached path check names only `scripts/tests/unit/task-tracker/core/package-boundary.test.mjs`; the attributed commit succeeds without amending or rewriting #1546 or #1577 history.

- [ ] **Step 9: Run clean exact-SHA Develop finalization**

Run:

```bash
git status --short
node scripts/task-tracker/verify-develop.mjs --mode final --issue 1578
git log --oneline -1
```

Expected: the worktree is clean; finalization exits 0 for the new #1578 commit; the log shows the exact attributed subject. Report `CODE_COMPLETE` with the commit SHA and RED/GREEN evidence. The orchestrator owns promotion, Test, independent review, delivery, and close.
