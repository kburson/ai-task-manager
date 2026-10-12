# Task 1 report — current-state corpus guards

## What changed

- Replaced the layout guard's pre-move basename/history/retirement machinery with a schema-1 current-state baseline guard.
- Recorded the live corpus as canonical, sorted repository-relative paths: 773 unit, 141 integration, and 52 slow tests.
- Kept the requested layout fixtures, semantic-owner check, AC1, AC2, and lane partition check.
- Replaced package-corpus history assertions with current-package test exclusion plus required runtime asset checks.
- Left the obsolete registry, receipt, and graduation files untouched for Task 2.

## Files changed

- `scripts/tests/integration/meta/test-tree-layout.test.mjs`
- `scripts/tests/integration/meta/test-tree-layout.baseline.json`
- `scripts/tests/integration/meta/package-test-corpus.test.mjs`

## RED

Command:

```sh
node --test scripts/tests/integration/meta/test-tree-layout.test.mjs scripts/tests/integration/meta/package-test-corpus.test.mjs
```

Result: exit 1, as expected before the baseline rewrite. The package checks passed. The new layout tests failed because the old baseline had `schema === undefined` rather than `1`, and because its basename-only entries did not match the live canonical full paths.

## GREEN

Commands:

```sh
node --test scripts/tests/integration/meta/test-tree-layout.test.mjs scripts/tests/integration/meta/package-test-corpus.test.mjs
npm run lint:test-layout
npm run lint:story-tags
npm run lint:line-cap
```

Result: all passed. The focused Node suite reported 12 passing tests and no failures. The layout and story-tag audits each covered all 966 test files; the line-cap audit passed with existing soft-cap review notices.

The floor was also exercised directly: temporarily removing `scripts/tests/unit/gh/create-issue.test.mjs` from discovery made the guard fail with `unit lane lost 1 baseline test(s): scripts/tests/unit/gh/create-issue.test.mjs`; the file was restored before the final checks and commit.

## Full quality

Command:

```sh
npm run quality
```

Result: exit 1 before lint or tests, because Prettier reports an existing formatting violation in `docs/superpowers/plans/2026-08-27-test-corpus-baseline-reset.md`. That file is outside Task 1 scope, marked `skip-worktree`, and its working-tree hash equals `HEAD`; running Prettier against the committed bytes reproduces the same violation. It was not changed.

## Commit

`fc74eac3 test: reset corpus guards to current state`

## Self-review

- Confirmed the commit contains only the three requested files and `git diff --cached --check` was clean before commit.
- Confirmed the baseline has exactly `schema`, `_comment`, `counts`, and `lanes`; counts equal each lane array length; all paths are canonical full paths in their recorded lane and sorted.
- Confirmed the retained layout checks remain, and migration/provenance/retirement membership dependencies and AC6 history check are removed from the retained guard tests.

## Concerns

- Full `npm run quality` remains red only on the unrelated, committed Prettier violation described above. Focused Task 1 verification is green.

## Follow-up formatting correction

Command:

```sh
npx prettier --write docs/superpowers/plans/2026-08-27-test-corpus-baseline-reset.md
npx prettier --check docs/superpowers/plans/2026-08-27-test-corpus-baseline-reset.md
```

Result: Prettier changed only the requested plan document and the exact-file check passed with `All matched files use Prettier code style!`.

Commit: `59f412e7 docs: format baseline reset plan`

Status: the exact Prettier blocker from the original quality run is resolved; no implementation files changed in this follow-up.
