# Final Whole-Branch Review Correction Report

## Status and scope

- Status: **DONE**
- Exact worktree:
  `/Users/kpburson/projects/Vibe-Coding/ai-task-manager/.claude/worktrees/articles-book-publication-6a7dfe`
- Supplied base SHA: `5d316639d7fd453ae78b502eb693c7f4a791e464`
- Final commit SHA: `04d2b05edc7a12f618bfe880c4a02da11357f5bd`
- Commit message: `fix(book): harden publication source boundaries`
- Tracked status after commit: clean
- Remote/task mutation, rebase, push, merge, extraction, worktree cleanup, and
  PDF operation marker: not run

## Files committed

- `scripts/articles/lib/book/include-fragment.mjs`
- `scripts/articles/lib/book/manuscript.mjs`
- `scripts/articles/lib/book/markers.mjs`
- `scripts/maintenance/lint-book-markers.mjs`
- `scripts/tests/unit/articles/lib/book/book-markers.test.mjs`
- `scripts/tests/unit/articles/lib/book/lint-book-markers.test.mjs`
- `scripts/tests/unit/articles/lib/book/manuscript.test.mjs`
- `scripts/tests/unit/articles/lib/book/render.test.mjs`

No file beneath `docs/articles/` changed. Article Markdown, Mermaid source,
layout assets, and original image bytes remain outside the correction diff.

## RED evidence

The untouched focused baseline passed 88 tests before new regressions were
added.

After adding the publication-boundary tests and before production changes, the
focused command reported 50 passed and 12 failed. The expected failures proved:

- trailing marker garbage was silently accepted;
- inline and multiline editorial comments remained in article composition;
- marker lint reported only 1 of 7 unsafe/non-regular include cases;
- real traversal, backslash-named file, sibling file, dot-segment, symlink, and
  directory includes were accepted by composition;
- the absolute-path case failed only as an unreadable joined path rather than
  at the declared include boundary; and
- all-target fixture composition leaked the private article comment and
  stripped fenced example comments in raw book prose.

A second minimal RED cycle added the case where an ordinary multiline comment
closes before an inline `book:` marker on the same line. The marker test then
reported 7 passed and 1 failed because the inline marker was swallowed.

The strengthened asset-stager regression was already green against the
existing correct production cache. It now calls the stager twice before either
promise is awaited, asserts strict promise identity, changes all three source
assets after staging, awaits the second promise, and proves the staged bytes
were not copied again.

## GREEN evidence

- Affected marker/manuscript/lint/render tests: 62 passed, 0 failed.
- Focused marker, manuscript, lint-marker, render, corpus, and publisher group:
  100 passed, 0 failed.
- Complete book/publisher unit group:
  `node --test scripts/tests/unit/articles/publish-articles.test.mjs scripts/tests/unit/articles/lib/book/*.test.mjs`
  reported 170 passed, 0 failed.
- Final focused manuscript rerun after the lint-only regex correction: 21
  passed, 0 failed.
- `git diff --check`: passed before staging, on the staged correction, and for
  the committed base-to-final range.

## Security and parser cases

The shared resolver accepts only normalized relative lowercase `.md` paths
beneath `bookDir/fragments/`. It checks every path component with `lstat`
before the caller reads the returned path. Both composition and marker lint use
this resolver.

Real fixture coverage rejects:

- `fragments/../../outside.md` with a readable traversal target;
- an absolute path to a readable file;
- `fragments\\bridge.md` with a readable POSIX backslash-named file;
- `glossary.md`, a readable sibling file beneath `bookDir`;
- `fragments/./bridge.md`;
- `fragments/link.md`, a symlink to a readable external file; and
- `fragments/directory.md`, an existing non-regular target.

The marker parser now consumes attributes positionally and rejects unconsumed
garbage, duplicate keys, globally unknown keys, and keys outside each verb's
schema. Existing valid quoted and unquoted marker syntax remains covered.

The comment scanner removes every non-marker HTML comment span outside fences,
including inline and multiline spans that begin or end beside public prose. It
preserves the surrounding prose and fenced example bytes, preserves standalone
book markers until scanning, and rejects inline book markers even after an
ordinary multiline comment closes.

## Doctor, build, and structural evidence

- `npm run doctor:book`: exit 0, `doctor:book — toolchain is complete`.
  Node emitted the existing non-failing `DEP0190` child-process warning.
- `npm run book`: exit 0; all four targets reported 15 chapters, 11 footnotes,
  and 8 index terms.
- Manuscript, HTML, EPUB, and PDF artifacts are nonempty.
- The staged title asset is byte-identical to the tracked title image.
- PDF: 74 pages, letter size, 24,685,026 bytes.
- EPUB: `unzip -t` reported no errors.
- HTML: 15 chapter openers and 20 Mermaid diagrams.
- No `object-fit: cover`, removed `chapter-number` markup, overfull TeX box, or
  HTML comment was found in the checked final artifacts/manuscripts.

## Task 7 hash comparison

| Artifact | Task 7 SHA-256 | Correction rebuild SHA-256 | Result |
| --- | --- | --- | --- |
| tracked title | `c22d217529a519d0ea5adbcb0a4f1aa5207be82f380d7589f01a68fe8267e303` | same | unchanged |
| staged title | `c22d217529a519d0ea5adbcb0a4f1aa5207be82f380d7589f01a68fe8267e303` | same | unchanged |
| manuscript | `71cb563377c8b1a1fc5b780c69af0d55f371bf159ee3bb224ebe6391c08ebe93` | same | unchanged |
| HTML | `4344fcfdba6ea574a050c559d04b1b9035074b65497150d6a051bd624daa225f` | same | unchanged |
| PDF | `c91c884397736ea1af1aee5ce2c99538b7d58fdb11237f7358366d6b304ef80f` | same | unchanged |
| EPUB | `3e635e5d0769a40c1bfa7af39e77f7c498ebdea4895dade0be9a118ab31c2d47` | final verification build `55101ea8c70e6d1eaa79dae9f1ee788b7829c87b86d99269c5b7c635e859c055` | expected generated-metadata drift |

The EPUB variance was isolated with two consecutive EPUB-only rebuilds. All
archive entries except `EPUB/content.opf` and `EPUB/toc.ncx` were byte-identical.
The OPF differences were Pandoc's newly generated UUID, `dc:date`, and
`dcterms:modified`; the NCX difference was the matching generated UUID. This
explains both the Task 7 hash difference and consecutive-build hash changes;
archive integrity and publication payload remained valid.

## Repository quality

The first quality attempt stopped in ESLint because three new test regexes used
two literal spaces. They were changed to the repository-required `{2}` form;
the focused manuscript test and ESLint then passed.

The complete fresh `npm run quality` rerun exited 0:

- Prettier passed.
- ESLint, Markdownlint, CSpell, temporary-path policy, fleet isolation, test
  layout, story tags, line cap, test reach, documentation anchors, article
  citations, and live book-marker lint all passed.
- The fast lane passed all 926 test files.
- Fast-lane bounded sections: pooled 318.7 seconds, subprocess 142.0 seconds,
  serial 159.4 seconds, aggregate 620.1 seconds.

## Final verification and concerns

- `node scripts/dev-env/verify-local-worktree.mjs` passed after commit with Node
  25.6.0 and the self-link verified.
- Final tracked status is clean.
- Final commit subject and SHA were read back exactly.

No blocking concerns. The only non-blocking observations are the existing
doctor `DEP0190` warning and Pandoc's expected nondeterministic EPUB UUID/date
metadata described above.

---

# Orphaned AC6 History-Enforcement Removal

## Scope

Removed the obsolete current-HEAD history-enforcement cluster without adding a
replacement: the two helper modules, their two dedicated unit tests, both CI
full-history checkout settings, and stale #949/#868 explanation. Both #745
`Materialize local trunk ref for real-git tests (#745)` steps and their exact
`git fetch --no-tags origin trunk:trunk` command remain intact.

## RED and GREEN residue evidence

- RED targeted residue audit found the two helper modules and their dedicated
  tests, both `fetch-depth: 0` blocks, workflow commentary, and the stale
  #949/#868 comment in `ci-745-trunk-ref.test.mjs`.
- Read-only independent-caller audit found no current runtime or test importer
  outside the four deleted artifacts for `auditCheckoutHistory`,
  `provenanceVerdict`, or `isShallowRepository`.
- After deletion and before baseline refresh, the current-tree layout guard
  failed exactly as intended: its unit baseline named only
  `ci-workflow-history.test.mjs` and `git-provenance.test.mjs` as missing.
- GREEN targeted residue and independent-caller audits printed no live match.

## Exact files

- Modified `.github/workflows/ci.yml`.
- Deleted `scripts/task-tracker/lib/ci-workflow-history.mjs`.
- Deleted `scripts/task-tracker/lib/git-provenance.mjs`.
- Modified `scripts/tests/integration/meta/test-tree-layout.baseline.json`.
- Deleted `scripts/tests/unit/meta/ci-workflow-history.test.mjs`.
- Modified `scripts/tests/unit/task-tracker/core/ci-745-trunk-ref.test.mjs`.
- Deleted `scripts/tests/unit/task-tracker/lib/git-provenance.test.mjs`.

## Verification

- Focused command passed 39 tests across the current-tree layout, package
  corpus, impact selector, #745 CI contract, and CI lane wiring suites.
- `npm run lint:test-layout`, `npm run lint:story-tags`,
  `npm run lint:line-cap`, and `npm run lint:test-reach` passed.
- First `npm run quality` reached the fast lane but had one unrelated timeout:
  `generate-value-report-order.test.mjs` could not spawn `/bin/sh` for
  `git rev-parse --show-toplevel` while three duplicate quality runners from
  earlier command retries contended for resources. Process inspection recorded
  four simultaneous quality trees; the three stale duplicate trees were
  terminated. The isolated covering test then passed 10/10 in 156.8 ms, with
  no source change.
- One uncontended rerun of `npm run quality` passed: formatting and all lint
  stages passed, and all 771 fast-lane test files passed. Bounded sections:
  pooled 256.3s, subprocess 62.2s, serial 48.8s, aggregate 367.3s.

## Final counts, staged self-review, and concerns

The regenerated deterministic `laneManifest()` baseline records 771 unit, 138
integration, and 52 slow tests (961 total). Staged review contains exactly the
seven files above: five insertions and 378 deletions. `git diff --check` and
the staged equivalent pass. No product concern remains; the initial complete
quality failure was verified as local runner contention and the clean rerun is
green. Commit: `fdd6de743ac07ca075111f119aea3aa72964863f`
(`chore: remove obsolete test-history CI enforcement`).

---

# CI Docs-Only Merge-Base Follow-Up

## Root cause and minimal scope

PR #1423 failed in `Classify docs-only pull request` because the Fast job's
default depth-1 checkout left its detached PR merge commit shallow. The #745
local `trunk` fetch supplied the ref but not the merge commit's parents, so
`git diff --name-only trunk...HEAD` had no merge base. A disposable GitHub-PR
merge topology reproduced the boundary: depth 1 had no merge base after the
local-trunk fetch; depth 2 had one. The correction changes only the Fast
checkout to `fetch-depth: 2`; Slow remains at its default depth 1. This is
current diff-classification topology, not historical provenance.

## RED and GREEN evidence

- RED: the new focused AC3 workflow contract failed with the expected `0 !== 1`
  because Fast declared no `fetch-depth: 2`; AC1, AC2, and AC4 passed.
- GREEN: after the Fast-only setting, the CI contract passed 4/4. It proves
  exactly one Fast depth-2 checkout, no depth-0 checkout, the unchanged
  `git diff --name-only trunk...HEAD` classifier, default-depth Slow job, and
  both exact #745 local-trunk fetch steps.

## Verification

- Current-tree, package-corpus, and TIA focused suites passed 32/32.
- `npm run format:check`, `npm run lint:test-layout`, `npm run lint:story-tags`,
  `npm run lint:line-cap`, and `npm run lint:test-reach` passed.
- Process inspection found no stale `npm run quality` or fast-lane runner
  before the one complete quality invocation.
- That uncontended `npm run quality` passed formatting, all lint stages, and
  all 771 fast-lane test files. Bounded sections: pooled 248.2s,
  subprocess 60.7s, serial 48.7s, aggregate 357.6s.

## Final scope and concerns

The staged self-review contains exactly `.github/workflows/ci.yml` and
`scripts/tests/unit/task-tracker/core/ci-745-trunk-ref.test.mjs`; it adds one
Fast checkout setting and its focused contract, with no baseline or history
tooling change. `git diff --check` and the staged equivalent pass. No concern
remains. Commit: `31cc05a453096f298e911e017e66ad4bb6bdae97`
(`fix(ci): retain PR merge base without full history`).
