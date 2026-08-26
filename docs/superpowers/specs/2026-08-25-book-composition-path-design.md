# Book Composition Path — Design

Status: proposed
Date: 2026-08-25
Scope: chore (no AITM issue; not part of the `@kburson/ai-task-manager` package deliverable)

## Problem

`docs/articles/` holds a 15-article series drafted for LinkedIn, plus one
undrafted outline (`16-*`). `scripts/articles/publish-articles.mjs` turns those
files into paste-ready LinkedIn folders under `.tmp/published/`.

The same prose should also publish as a book — title page, table of contents,
introduction, chapters, a glossary appendix, a deduped sources appendix, and a
page-numbered index. Today there is no second path, and the naive one
(concatenate the files) produces an anthology: every article opens with a
"Part N of a series" caption, ends with a `## Series Link` paragraph pointing at
the next article, and carries its own `## Bibliography`.

## Goals

- One canonical source per article. The `NN-*.md` files stay LinkedIn-shaped and
  remain the only place the prose lives.
- A book build that needs no duplicate copy of the prose and no ordering
  manifest.
- Composition hints carried in-file, invisible to every published article format.
- PDF as the primary book target, with EPUB and HTML from the same manuscript.
- All book metadata tracked in git under `docs/articles/assets/`.

## Non-goals

- Changing the LinkedIn output. `publish-articles.mjs` behaviour must stay
  byte-identical; its existing tests are the regression guard.
- Shipping any of this in the npm package. The book toolchain is author-local.
- Authoring the book's voice-bearing prose. See Phasing.

## Model

Filename order is the spine. Drafted articles compose in `NN-` order, because
they were written to be read in that order. There is no chapter manifest — a
manifest that restates filename order is ceremony.

An article is on the spine if and only if it contains a `## Series Link`
section. Every drafted article has one; the `16-*` outline does not. The rule is
mechanical, needs no marker, and keeps a half-written article out of the book
without anyone remembering to exclude it.

Three inputs feed the composer:

1. **The article spine** — `docs/articles/NN-*.md`, unmodified in substance.
2. **`book:` markers** — HTML comments inside those articles. `parse-article.mjs`
   strips every HTML comment with a global regex before any other transform, so
   markers are inherently invisible to the LinkedIn path.

   The book path needs them preserved, so `parseArticle` gains an options
   argument: `parseArticle(source, { keepComments = false })`. The default is
   the current behaviour, so the LinkedIn path and its tests are untouched.

3. **`docs/articles/assets/book/`** — the things that exist in no article:
   title-page metadata, the introduction, the glossary, and book-only bridge
   fragments.

Output is `.tmp/book/manuscript.md` — a single reviewable, hand-editable
markdown file — which pandoc then renders to PDF, EPUB, and HTML.

## Metadata layout

```
docs/articles/assets/book/
  book.json            title, subtitle, author, copyright, edition, date,
                       paper size, base font, margins, pandoc/LaTeX variables
  introduction.md      book-only front matter
  glossary.md          term -> definition, aliases, see-also
  fragments/           book-only prose spliced in by `book:include`
    <name>.md
```

`book.json` carries no chapter list and no ordering. It is a variables file.
JSON rather than YAML because pandoc's `--metadata-file` accepts either and the
repo has no YAML parser; adding a dependency for author-local tooling is not
worth it.

`glossary.md` rather than a data file because definitions are prose the author
edits by hand. As markdown they inherit prettier, markdownlint, and cspell
coverage that a YAML block scalar would not get. Format is strict and parsed:

```markdown
## Evidence gate

_Aliases:_ evidence gates, evidence-gated
_See also:_ Story-governed delivery

A transition check that requires observable proof before work advances.
```

## Default strip rules

The composer drops these without any marker, mirroring the LinkedIn publisher's
`strip-rules.mjs` inverted:

- the header image line (`![...](assets/article-headers/...)`)
- the `_Part N of a series..._` caption line that follows it
- `## Series Link`
- `## Series Roadmap`
- `## LinkedIn Article Shape`
- `## Bibliography` (its entries are hoisted; see Footnotes)

These five rules alone produce a contiguous, if unstructured, book.

## Marker vocabulary

All markers are optional. All are HTML comments prefixed `book:` to avoid
colliding with the `markdownlint-disable` comments already in the corpus.

| Marker                                           | Effect                                                                             |
| ------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `<!-- book:part title="How We Got Here" -->`     | Opens a new Part immediately before this chapter                                   |
| `<!-- book:chapter title="..." -->`              | Chapter title override; default is the article H1                                  |
| `<!-- book:merge-into-previous -->`              | This article becomes a section of the previous chapter rather than its own chapter |
| `<!-- book:demote N -->`                         | Shift heading levels by N for the remainder of the article                         |
| `<!-- book:exclude -->` ... `<!-- book:end -->`  | Drop a span the default rules do not catch                                         |
| `<!-- book:include path=fragments/<name>.md -->` | Splice a book-only fragment in at this point                                       |
| `<!-- book:pagebreak -->`                        | Force a page break                                                                 |
| `<!-- book:index term="evidence gate" -->`       | Manual index anchor where wording does not match a glossary alias                  |

Parsing rules:

- A marker must occupy its own line. Inline markers are a parse error.
- `part` and `chapter` markers must appear in the article's preamble — the span
  before the first `##` heading. `parse-article.mjs` lifts the H1 out into a
  field, so "before the H1" is not observable after parsing; "in the preamble"
  is, and is practically the same constraint.
- `book:end` closes the nearest open `book:exclude`. An unmatched
  `book:exclude` or `book:end` is a parse error.
- An unknown `book:` verb is a parse error, not a silent skip. A typo must not
  quietly drop a section.

## Heading level algebra

Default, article as its own chapter:

- article H1 -> chapter (`#` in the manuscript, `\chapter` under LaTeX)
- article `##` -> `##`
- article `###` -> `###`

Under `book:merge-into-previous`:

- article H1 -> `##` inside the previous chapter
- every deeper heading shifts down one level to match

Pandoc runs with `--top-level-division=chapter`, so manuscript `#` maps to
`\chapter`. Part dividers cannot also be `#` under that mapping, so `book:part`
emits raw `\part{Title}` for the PDF target and a `#`-level heading for EPUB and
HTML. The target-specific emission is a parameter of manuscript assembly, not a
post-processing step.

`book:demote N` applies an additional shift, for the case where an article's
internal structure needs flattening that the merge rule does not express.

## Footnotes and the Sources appendix

Each article is standalone on LinkedIn and keeps its `## Bibliography`. The book
converts citations to footnotes:

- **Body inline link to an external URL** — `[Label](https://...)` becomes a
  footnote marker. Footnote text is the matching `## Bibliography` entry, located
  by URL. When no entry matches, the footnote falls back to `Label. URL`.
- **Body link to a sibling article** — `[...](05-easy-come-easy-go.md)` is _not_
  a footnote. It becomes a `see Chapter N` cross-reference, resolved from the
  spine, so no relative path leaks into the book as a dead link.
- **Repeat citations** get their own footnote number on each occurrence, which is
  standard trade-book practice.
- **Appendix B, Sources** — every bibliography entry across all chapters, deduped
  by URL, sorted by publisher then title.

Every Markdown list item becomes a source even when its citation shape cannot be
structured; the raw text is the lossless fallback. Indented lines continue the
preceding item. Blank-separated, URL-free prose is an editorial note and is
ignored because the entire bibliography section is stripped from the chapter.
An unindented line adjacent to an item, or isolated prose containing an
`http(s)` URL, is a parse error so a malformed source cannot disappear silently.

`npm run lint:article-citations` enforces URL absoluteness where URLs are present.
The bibliography parser, rather than that lint, owns entry-shape preservation.

## Glossary and index

`glossary.md` format is given under Metadata layout above. Each `##` heading is
a term; an optional `_Aliases:_` line and `_See also:_` line follow; the
remaining prose is the definition.

Terms seed from the `## Preferred Terms` list already in
`docs/articles/series-style-guide.md`.

**Appendix A, Glossary** renders from this file directly, sorted alphabetically.

**Index** is built from one pass over the assembled manuscript. For each term,
the composer records the first alias match within each `##`-level section — not
every match, which would produce an index entry per paragraph and be useless.
`book:index` markers add manual anchors.

The recorded hits emit differently per target:

- **PDF** — raw `\index{Term}` at each recorded position; `makeindex` produces
  the page-numbered index, emitted by `\printindex`. `makeidx` and `\makeindex`
  come from `header-includes` in `book.json`.
- **EPUB and HTML** — anchors at each recorded position and a generated index
  page linking to them by chapter and section. There are no page numbers in a
  reflowable format, and inventing them would be a lie.
- **`--target manuscript`** — neither. The reviewable markdown stays clean.

Manuscript assembly therefore takes the target as a parameter rather than
emitting one canonical string. Appendices are preceded by raw `\appendix` for
the PDF target only.

## Document order

Front matter: title page, copyright page, table of contents, introduction.
Body: Parts and chapters from the spine.
Back matter: Appendix A (Glossary), Appendix B (Sources), Index.

## Diagrams

`lib/diagrams.mjs` already treats in-body ```mermaid fences as authoritative and
renders them through `mmdc`. The book reuses it, rendering at print resolution
rather than the screen scale the LinkedIn path uses. The `.mmd` library under
`assets/diagrams/` and its drift report are unchanged and out of scope.

## Toolchain

LaTeX is a system prerequisite, not an npm dependency. No usable LaTeX engine
exists on npm: `texlive` is an abandoned asm.js port, `node-latex` is a wrapper
around an already-installed binary, `typst-cli` is a 223-byte third-party stub,
and `latex.js` implements a subset. Since only the author ever runs this build,
an out-of-band prerequisite is acceptable.

Install:

```
brew install --cask basictex
sudo tlmgr update --self
sudo tlmgr install latexmk <packages named by the doctor>
```

`npm run doctor:book` checks for `xelatex`, `latexmk`, and `makeindex` on PATH,
then compiles a minimal probe document that `\usepackage`s everything the
pandoc book template needs. Missing packages surface as a concrete
`sudo tlmgr install ...` line built from the probe's own error output, so the
package list is discovered rather than guessed, and stays correct as pandoc's
template evolves.

Render chain: `manuscript.md` -> pandoc -> `book.tex` -> `latexmk -xelatex`.
`latexmk` drives the multi-pass run that a table of contents and a `makeindex`
index both require; pandoc alone cannot.

EPUB and HTML render directly from `manuscript.md` with pandoc, no LaTeX
involved.

## Module layout

```
scripts/articles/
  compose-book.mjs           CLI: --target pdf|epub|html|manuscript|all, --out
  lib/book/
    markers.mjs              parse and validate `book:` markers
    strip.mjs                book-side default strip rules
    headings.mjs             heading level algebra
    footnotes.mjs            inline link -> footnote, sibling link -> chapter ref
    sources.mjs              bibliography collection, dedupe, sort
    spine.mjs                discover on-spine articles in filename order
    glossary.mjs             glossary.md parsing
    index-terms.mjs          index hit recording, one per term per section
    manuscript.mjs           assemble the single markdown file
    render.mjs               pandoc and latexmk invocation
    toolchain.mjs            doctor checks
```

Output root `.tmp/book/`, matching the existing `.tmp/published/` convention.
`.tmp/` is already gitignored.

## Error handling

Fail loud, never silently drop prose:

- unknown `book:` verb, inline marker, or unbalanced span -> error naming file
  and line
- `book:include` path that does not exist -> error
- `book:merge-into-previous` on the first article -> error
- sibling-article link whose target is not on the spine -> error
- `book:part` or `book:chapter` after the H1 -> error

`npm run lint:book-markers` runs these checks alone, without a render, so marker
mistakes surface in the normal lint sweep rather than at build time.

## Testing

Unit tests under `scripts/tests/unit/articles/book/`, following the existing
layout that `lint:test-layout` and `lint:test-reach` enforce. Each lib module
gets a fixture-driven test: marker parsing including every error case, heading
algebra across merge and demote, footnote conversion for external, sibling, and
unmatched-URL links, source dedupe and sort, index hit recording at
one-per-section.

A corpus test asserts that composing the live articles produces a manuscript
with no unresolved markers and no relative-path links.

The existing `publish-articles.test.mjs` is the guard that the LinkedIn path did
not move.

## Phasing

**Phase 1 — machinery.** Everything above: markers, composer, toolchain, doctor,
lints, tests. Glossary populated mechanically from `series-style-guide.md`'s
`## Preferred Terms`.

**Phase 2 — authorial, by the author.** Part groupings, chapter merges, the
introduction, and the bridge fragments that replace the deleted "next article"
paragraphs. Phase 1 ships these as clearly-marked stubs. They are voice
decisions, and an introduction written in a borrowed voice is exactly where a
reader notices the seam.

The book generates end-to-end after Phase 1. It reads better after Phase 2.

## Deferred

- `assets/linkedin/published-urls.yaml`, a slug -> live LinkedIn URL map that
  would make the cross-link backfill pass in `linkedin-publishing-guide.md`
  scriptable. It is LinkedIn metadata, not book metadata, and automating that
  backfill would change LinkedIn output — which this chore explicitly does not
  do. Worth a separate chore.
- Article `16-*` is an outline, not prose. The `## Series Link` spine rule keeps
  it out until it is drafted, so it needs no special handling.
