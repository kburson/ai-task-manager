# Book Publishing Guide

The article series publishes twice: as standalone LinkedIn articles
([linkedin-publishing-guide.md](linkedin-publishing-guide.md)) and as a book.
Both read the same `NN-*.md` files. Nothing is duplicated.

## How the book is composed

Filename order is the spine. An article is in the book if it has a
`## Series Link` section, which every drafted article carries and no outline
does.

The composer drops the series scaffolding — header image, `_Part N of a series_`
caption, `## Series Link`, `## Series Roadmap`, `## LinkedIn Article Shape` —
and hoists each `## Bibliography` into one deduped Sources appendix. Inline
citations become footnotes; links to sibling articles become `(Chapter N)`
cross-references.

## Markers

Markers are HTML comments. The LinkedIn publisher strips every HTML comment
before it does anything else, so markers can never reach a published article.

| Marker                                          | Effect                                                   |
| ----------------------------------------------- | -------------------------------------------------------- |
| `<!-- book:part title="How We Got Here" -->`    | Opens a Part before this chapter                         |
| `<!-- book:chapter title="..." -->`             | Chapter title override; default is the article H1        |
| `<!-- book:merge-into-previous -->`             | Fold this article into the previous chapter as a section |
| `<!-- book:demote by=1 -->`                     | Shift the remaining heading levels down                  |
| `<!-- book:exclude -->` ... `<!-- book:end -->` | Drop a span                                              |
| `<!-- book:include path=fragments/name.md -->`  | Splice in book-only prose                                |
| `<!-- book:pagebreak -->`                       | Force a page break                                       |
| `<!-- book:index term="evidence gate" -->`      | Manual index anchor                                      |

`part` and `chapter` must sit in the article preamble, before the first `##`.

Run `npm run lint:book-markers` to check markers without rendering anything. It
also runs as part of `npm run lint`.

## Metadata

Everything the articles do not contain lives in `assets/book/`:

- `book.json` — title, author, copyright, paper size, fonts, margins. Pandoc
  reads it directly as a metadata file.
- `introduction.md` — the book's introduction.
- `glossary.md` — one `##` per term, optional `_Aliases:_` and `_See also:_`
  lines, then the definition. Renders as Appendix A and drives the index.
- `fragments/` — book-only prose spliced in by `book:include`.

## Toolchain

```bash
brew install pandoc
brew install --cask basictex
sudo tlmgr update --self
sudo tlmgr install latexmk
npm run doctor:book
```

`doctor:book` compiles a one-line probe per LaTeX package and prints a single
`sudo tlmgr install ...` line naming whatever is missing. Run it until it is
quiet.

## Building

```bash
npm run book                        # manuscript, pdf, epub, html
npm run book -- --target manuscript # just the reviewable markdown
npm run book -- --target pdf
```

Output lands in `.tmp/book/`. `manuscript.md` is the clean, human-readable
assembly with no LaTeX in it; the per-target manuscripts carry the markup each
format needs.
