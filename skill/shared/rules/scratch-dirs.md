<!-- aitm-skill-version: 1.0.0 -->

# rules/scratch-dirs.md

Tier-2. Loaded JIT when you're about to write a transient file (sandbox, issue
body draft, plan scratch, heal scratch, ad-hoc inspect script). On first read,
emit:

```text
aitm-skill-loaded:rules/scratch-dirs:1.0.0
```

## The rule

Never write to the system `/tmp/` (or `os.tmpdir()`). All scratch space lives
under `<projectRoot>/.tmp/<purpose>/` — a gitignored, repo-local tree.

Reasons:

- `/tmp/` is shared with every other process on the machine; the bash guard
  refuses writes there (`bash-guard-tmp-contract`).
- `/tmp/claude-…` directories get reaped between sessions, losing scratch.
- Multiple parallel agents collide on `/tmp/foo.tmp` style names; project-local
  `.tmp/` survives the worktree boundary.
- Scratch co-located with the repo is reviewable after the fact.

## Canonical buckets

```text
.tmp/test/      → test sandboxes (every node:test mkdtemp goes here)
.tmp/gh/        → GitHub issue body drafts / preflight artifacts
.tmp/plan/      → scope.md, ac.md, plan-meta, deep-dive scratch
.tmp/heal/      → heal-* and migrate-* scripts' transient state
.tmp/inspect/   → ad-hoc analysis scripts, one-off greps, debug spikes
```

Use a custom slug (`[a-z0-9][a-z0-9-]{0,31}`) only if none of the canonical
buckets fit.

## How to write code that obeys this

For `.mjs` / `.js` under `scripts/`, import from
`scripts/task-tracker/lib/scratch-dir.mjs`:

```js
import {
  projectScratchDir,
  mkdtempProjectIsolated,
  mkdtempOutsideRepo,
} from '<rel>/scripts/task-tracker/lib/scratch-dir.mjs';

// Simple scratch dir (creates `.tmp/<purpose>/` if missing, returns the path):
const dir = projectScratchDir('gh');
writeFileSync(path.join(dir, `issue-${n}-body.md`), body);

// Test sandbox that needs its own git boundary (anything that calls
// `git rev-parse --show-toplevel`, `findMainWorktreePath`, etc.):
const sandbox = mkdtempProjectIsolated('my-test-');

// Last-resort escape hatch — tests that explicitly verify the
// "outside any git repo" code path:
const nonRepo = mkdtempOutsideRepo('no-git-');
```

For shell/bash scripts: prefer `mktemp -d "$REPO_ROOT/.tmp/<purpose>/XXXXXX"`.

## Behavioral triggers

When you are about to:

- write scratch to `/tmp/...` from any script,
- call `tmpdir()` / `os.tmpdir()`,
- pass `tmpdir()` to `mkdtempSync`,
- author a new test that creates a sandbox,

STOP. Route through the helpers above.

## Guard

`npm run lint:tmp` (`scripts/maintenance/lint-no-system-tmp.mjs`) refuses:

- any `tmpdir()` / `os.tmpdir()` reference outside `lib/scratch-dir.mjs` and
  the guard itself (checked in production and test code),
- any literal `'/tmp/...'` / `'/private/tmp/...'` string in **non-test**
  scripts (test fixtures may contain such literals as parser/classifier
  input — see `gh-edit-guard.test.mjs`, `activity-policy.test.mjs`, etc.).

The guard is part of `npm run lint`. CI rejects the diff if you skip the
helper.

## Allowlisted exceptions

- `scripts/task-tracker/lib/scratch-dir.mjs` — defines the escape hatch.
- `scripts/maintenance/lint-no-system-tmp.mjs` — the guard itself.
- `scripts/tests/integration/task-tracker/core/bash-guard-tmp-contract.test.mjs` — verifies the
  bash guard rejects writes to `/tmp/` (the literal string is the contract).
