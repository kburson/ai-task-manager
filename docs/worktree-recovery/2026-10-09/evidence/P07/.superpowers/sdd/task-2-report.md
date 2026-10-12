# Task 2 report — retire historical test corpus scaffolding

## Changed and deleted files

Commit `40997ebb chore: retire historical test corpus scaffolding` contains 74 files changed: six current-wiring/baseline files modified and 68 approved obsolete paths deleted (11,942 deleted lines).

Modified:

- `package.json` — removed `graduate:frozen-tests`.
- `scripts/task-tracker/test-impact-manifest.json` — replaced the three migration-era rules with the one current test-tree rule.
- `scripts/tests/integration/meta/test-tree-layout.baseline.json` — regenerated after the three retired dedicated tests disappeared; counts are 773 unit, 138 integration, and 52 slow.
- `scripts/tests/integration/task-tracker/lib/test-impact-selector.test.mjs` — retained literal-manifest drift coverage and rewrote corpus selection for the current tree and current baseline.
- `scripts/tests/slow/task-tracker/core/maintenance-scripts-strict-argv.test.mjs` — removed the retired maintenance command from `APPLY_SCRIPTS`.
- `scripts/tests/unit/task-tracker/core/residue-audit-scope.test.mjs` — retains the generated-looking-file coverage with `scripts/tests/fixtures/generated.json`.

Deleted exactly as approved:

- the graduation workflow, command, temporary-retirement evidence, pre-move manifest, two loaders, and three dedicated tests;
- four frozen-retirement receipts;
- all 55 post-snapshot records.

No historical `docs/superpowers` or `docs/research` path was staged as deleted.

## RED

Command:

```sh
node --test scripts/tests/integration/task-tracker/lib/test-impact-selector.test.mjs
```

Result: exit 1 as expected before manifest changes. Sixteen tests passed and four current-tree cases failed. The three test-path cases threw `test-impact: matched rule ... matched no tests` because the checked-in manifest still selected the soon-to-be-deleted membership guard; the baseline case selected no tests because no current-baseline rule existed.

## GREEN

After replacing the three migration-era manifest rules with the single current rule, the same selector command passed: 20 tests, 0 failures.

After the authorized script deletion, the targeted remaining-current-code checks passed:

```sh
node --test scripts/tests/unit/task-tracker/core/residue-audit-scope.test.mjs
node --test scripts/tests/slow/task-tracker/core/maintenance-scripts-strict-argv.test.mjs
```

Results: residue audit 5/5; strict-argv 22/22, including the live `--apply` entry-point drift guard.

The current guard suite also passed:

```sh
node --test \
  scripts/tests/integration/meta/test-tree-layout.test.mjs \
  scripts/tests/integration/meta/package-test-corpus.test.mjs \
  scripts/tests/integration/task-tracker/lib/test-impact-selector.test.mjs \
  scripts/tests/unit/task-tracker/core/residue-audit-scope.test.mjs
```

Result: 37 tests, 0 failures.

## Residue and guard results

All seven explicit absence checks passed for the pre-move manifest, both fixture roots, both loaders, graduation command, and graduation workflow. The prescribed live-residue search printed no matches. The following checks also passed:

```sh
npm run lint:test-layout
npm run lint:story-tags
npm run lint:line-cap
npm run lint:test-reach
```

The layout and story-tag audits covered 963 live test files. Line-cap and test-reach emitted only their pre-existing informational baseline/soft-cap notices.

## Full quality

Command:

```sh
npm run quality
```

Final result: exit 0. Prettier, ESLint, Markdownlint, CSpell, all remaining lint gates, and the fast suite passed. The fast suite reported `All 773 test files passed.`

The first full-quality attempt found a formatting issue in the edited residue-audit test; applying Prettier only to that file resolved it. A duplicate quality process from the initial output-truncated run was identified by its separate process group and stopped; the retained tracked run completed successfully.

## Commit

`40997ebb chore: retire historical test corpus scaffolding`

## Self-review

- `git diff --cached --check` passed before commit.
- The staged summary contained exactly 68 deletions and six approved modified files.
- Deletion counts matched the brief: 55 post-snapshot records and four frozen-retirement receipts.
- The final baseline removes only the three retired dedicated integration tests and records the live 773/138/52 lane counts.
- The manifest selects `scripts/tests/integration/meta/test-tree-layout.test.mjs` for live test or baseline changes with reason `current test tree authority change`.
- The branch remains the required linked-worktree branch; no worktree, branch, issue, main checkout, push, or PR was changed.

## Concerns

No delivery blocker remains. The brief's Step 4 expectation that the strict-argv drift test would pass before Step 5 is order-inconsistent: removing the command from `APPLY_SCRIPTS` while the command file still exists correctly causes the drift guard to fail. It passed immediately after the authorized Step 5 deletion. This sequencing evidence is retained above.
