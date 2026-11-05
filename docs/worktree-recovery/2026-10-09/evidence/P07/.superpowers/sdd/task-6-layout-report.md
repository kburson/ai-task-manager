# Task 6 Layout Report

## Scope and commit

- Base SHA: `ed61f9fbb40fd19d3cdb84d43f93f55503efd629`
- Task 6 commit: `36abf605c2c0c26cc1217385dbefe03b822a646a`
- Commit message: `docs(book): document polished layout toolchain`
- Tracked files changed: `scripts/articles/lib/book/toolchain.mjs`,
  `scripts/tests/unit/articles/lib/book/toolchain.test.mjs`,
  `docs/articles/book-publishing-guide.md`, and `cspell-dictionary.txt`.

## RED evidence

`node --test scripts/tests/unit/articles/lib/book/toolchain.test.mjs` failed as
expected after adding the `fancyhdr` assertions and before implementation: 8
passed and 2 failed. The page-style doctor test received `[]` instead of
`['fancyhdr']`, and the probe-list assertion found that `fancyhdr` was absent.

## GREEN evidence

After adding `fancyhdr` immediately after `adjustbox` in `PROBE_PACKAGES`, the
same focused test command passed: 10 tests passed, 0 failed.

## Doctor evidence

`npm run doctor:book` reported `doctor:book — toolchain is complete`. The
doctor did not report a missing `fancyhdr`, so no `tlmgr` installation or PDF
marker command was run.

## Documentation evidence

- `npx prettier --check scripts/articles/lib/book/toolchain.mjs scripts/tests/unit/articles/lib/book/toolchain.test.mjs docs/articles/book-publishing-guide.md` passed.
- `npx markdownlint-cli2 docs/articles/book-publishing-guide.md` passed with 0 issues.
- The guide now documents the stable `title-page.png` asset, both package
  responsibilities, and the equivalent PDF/HTML/EPUB Mermaid sizing behavior.
- `fancyhdr` was added alphabetically between `etoolbox` and `fancyvrb` in the
  spelling dictionary.

## Concerns

`npm run lint:spell` was run but exits 1 with 48 unknown TeX-token findings in
the unchanged `scripts/articles/lib/book/render.mjs` and
`scripts/tests/unit/articles/lib/book/render.test.mjs` files (for example,
`IHDR`, `xlink`, `titlepage`, and LaTeX macro names). `fancyhdr` is recognized;
it is not among the reported unknown words. No unrelated dictionary expansion
was made in this Task 6-only change.

`doctor:book` also emitted Node's existing `DEP0190` warning about shell
arguments while still reporting a complete toolchain.

## Worktree status

The tracked worktree status was clean after the Task 6 commit. This report is
intentionally in the ignored `.superpowers/sdd/` evidence directory.

## Review correction

- Correction commit: `5d316639d7fd453ae78b502eb693c7f4a791e464`
- Commit message: `chore(book): register layout vocabulary`
- The correction registers only semantic project TeX, EPUB/XML, PNG, and
  renderer vocabulary from the review findings in alphabetical dictionary
  positions. The regular-expression character-class fragment `dlcbps` remains
  out of the dictionary and is covered by one local `cspell:ignore` directive
  beside that expression.

### Correction verification

- `node --test scripts/tests/unit/articles/lib/book/toolchain.test.mjs`: 10
  passed, 0 failed.
- `npm run doctor:book`: `doctor:book — toolchain is complete`.
- Prescribed Prettier check: passed.
- `npx markdownlint-cli2 docs/articles/book-publishing-guide.md`: passed with
  0 issues.
- `npm run lint:spell`: passed with 0 issues in 2,084 files.
- `git diff --check`: passed.

No PDF marker, `tlmgr` installation, remote operation, or worktree operation
was run for this correction. The tracked worktree status was clean after the
correction commit.
