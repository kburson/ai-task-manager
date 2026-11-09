# Book Layout Polish Execution

Plan: `docs/superpowers/plans/2026-08-25-book-layout-polish.md`

Baseline: `14ce7fe390660a2f5da0dffdf331906bed228d4d`

- [x] Task 1: Add and stage the replaceable title-page image — approved at `5f2235066b290ae248f74dc55d1a670aef711f7d`
- [x] Task 2: Simplify chapter opener semantics and classify Mermaid diagrams — approved at `8b7ba7f1a7ab6beec5b03ec175da5419ea05666e`
- [x] Task 3: Add PDF chapter headers, right-aligned footers, and proportional opener artwork — approved at `76f15e42e546c19030b2bce9fc3b82e13864ed40`
- [x] Task 4: Build the larger PDF title page and constrain PDF diagrams — approved at `3018481310a98d17102b1be252d6952439ef4bd3`
- [x] Task 5: Apply equivalent HTML and EPUB image constraints — approved at `ed61f9fbb40fd19d3cdb84d43f93f55503efd629`
- [x] Task 6: Update toolchain checks and book documentation — approved at `5d316639d7fd453ae78b502eb693c7f4a791e464`
- [x] Task 7: Run complete structural, visual, browser, and repository verification — approved at `5d316639d7fd453ae78b502eb693c7f4a791e464` (verification-only; no commit)

Baseline verification: `npm test` passed all 926 fast-test files.

Task 1 review: approved with no Critical or Important findings; one Minor test-strengthening suggestion was recorded.

Task 2 review: approved with no findings.

Task 3 review: approved after one Important stale-test finding was fixed and re-reviewed; prescribed suite passed 37/37.

Task 4 review: approved after duplicate page destinations and headheight warnings were eliminated and re-reviewed; 74/74 PDF destinations are unique.

Task 5 review: approved after EPUB title rendering, archive safety, atomic replacement, declared dependencies, symlink rejection, and PNG CRC findings were fixed and re-reviewed; focused suite passed 42/42.

Task 6 review: approved after the required spelling gate was fixed and re-reviewed; CSpell passed 2,084 files with zero issues.

Task 7 review: approved with no findings; all 158 focused tests and full quality passed, all 74 PDF pages were inspected, and no correction commit was needed.

---

# Test Corpus Baseline Reset Execution

Plan: `docs/superpowers/plans/2026-08-27-test-corpus-baseline-reset.md`

Baseline: `5404a68d846671f3d5fac69da84934741b4ebcd3`

- [x] Task 1: Replace historical corpus checks with current-state guards
- [x] Task 2: Delete the obsolete authority and remove all live wiring
- [x] Task 3: Run complete verification and prepare corrective delivery

Task 1: complete (commits 5404a68d..fc74eac3, review clean). Focused suite
passed 12/12; full quality exposed a separate Prettier violation in the newly
committed implementation plan.

Task 2: complete (commits 59f412e7..40997ebb, review clean). Full quality
passed all 773 fast test files; final live baseline is 773 unit, 138
integration, and 52 slow tests.

Task 3: complete (verification-only at 40997ebb, review clean). Fast 773/773
and slow 52/52 passed; package audit found 695 files and zero forbidden paths.
User approved complete file totals plus observable minimum runtime checks as
the evidence standard because 190 passing custom harnesses emit no numeric
assertion total.

Final whole-branch review: approved at fdd6de74 after removing the orphaned
AC6/#949 history-enforcement cluster. No Critical, Important, or Minor findings.
Post-fix verification: 39/39 focused, 771/771 fast, 52/52 slow, package 693
files with zero forbidden paths.
