# Writing Studio extraction and temporary test-retirement evidence

The publishing subsystem was extracted to the private repository
`kburson/writing-studio`. This document records the cross-repository cleanup
gate without presenting that private repository as public user documentation.

## Verified studio authority

- Extracted from AITM branch `claude/articles-book-publication-6a7dfe` at source
  commit `04d2b05edc7a12f618bfe880c4a02da11357f5bd`.
- Migration provenance baseline:
  `1f954a4fd7737a2d7fc6180408d99e1958becf5a`.
- Reverified private studio `trunk`:
  `fb3bbe9e8b45c4cff067d3eb35bab6a8c8cf816b`.
- Successful GitHub Actions run:
  `https://github.com/kburson/writing-studio/actions/runs/33033015223`.
- The AITM cleanup branch was rebased onto
  `1e93ead1eed93a0e72e86eca5964f16bcce518ec` before this removal.

The independently cloned studio was fetched and verified with `git status
--short --branch`, `git rev-parse HEAD`, `git rev-parse origin/trunk`, `git
ls-remote origin refs/heads/trunk`, `gh repo view`, and `gh run list`. The local,
remote, and GitHub Actions SHAs matched; the repository was private, used
`trunk`, and was clean.

`npm ci` succeeded. `npm run quality` passed formatting, linting, 214 unit tests,
and 21 end-to-end tests. HTML-only article preparation and the manuscript, HTML,
and EPUB book builds succeeded. `git status --short -- collections` remained
empty. The existing lockfile audit reported four high-severity findings; this
cleanup did not alter the studio dependency graph.

## Removed AITM-owned duplicate paths

The cleanup removes these migrated path groups from current AITM content:

- `docs/articles/**`
- `scripts/articles/**`
- `scripts/tests/unit/articles/**`
- `scripts/tests/slow/articles/**`
- `scripts/tests/integration/task-tracker/maintenance/lint-article-citations.test.mjs`
- `scripts/maintenance/lint-article-citations.mjs`
- `scripts/maintenance/lint-book-markers.mjs`
- `.github/puppeteer-ci.json`
- article-only package commands, Mermaid dependency, CI wiring, and current
  package/install references

These nine writing-history documents are present at the verified studio SHA and
are removed from AITM:

- `docs/superpowers/specs/2026-08-17-article-ending-sections-design.md`
- `docs/superpowers/specs/2026-08-18-easy-come-easy-go-article-design.md`
- `docs/superpowers/specs/2026-08-25-book-composition-path-design.md`
- `docs/superpowers/specs/2026-08-25-book-chapter-openers-design.md`
- `docs/superpowers/plans/2026-07-16-article-deepening.md`
- `docs/superpowers/plans/2026-08-17-article-ending-sections.md`
- `docs/superpowers/plans/2026-08-20-exclude-draft-articles-from-publisher.md`
- `docs/superpowers/plans/2026-08-25-book-composition-path.md`
- `docs/superpowers/plans/2026-08-25-book-chapter-openers.md`

The paired post-snapshot record group removed with its book tests is
`scripts/tests/fixtures/test-corpus-post-snapshot/unit/articles/lib/book/**`.
It contains records for book markers, chapter openers, corpus, diagrams,
footnotes, glossary, headings, index terms, marker lint, manuscript,
comment-preserving parsing, rendering, sources, spine, stripping, and the
toolchain. Each paired test and record is deleted together.

## Frozen-test retirement receipts

Exactly four pre-move frozen tests are retired through active receipts:

- `scripts/tests/unit/articles/publish-articles.test.mjs` —
  `0ff6b1ab19a902af5f575dd666a4737cef6d88d2ca696c80e133757ab4e99180`
- `scripts/tests/unit/articles/diagram-drift.test.mjs` —
  `9c6401c9c24e4916a31bedc0c38713bbba82503676c3c141e6cd0b035e571dea`
- `scripts/tests/slow/articles/publish-articles-e2e.test.mjs` —
  `2aa009c996ea91e84f6ce4fc8e525451ad51779df1ba97387cad68944f398ffa`
- `scripts/tests/integration/task-tracker/maintenance/lint-article-citations.test.mjs`
  — `1455189f1bf827d733b1bd4adc8334034793bf588284d8f7d110134987e55b5b`

The receipt and evidence time to live ends only after this deletion reaches
canonical AITM history and the weekly graduation workflow opens a reviewable
pull request. That pull request may remove delivered receipts and this
now-unreferenced evidence; it may not push to `trunk` or merge automatically.
