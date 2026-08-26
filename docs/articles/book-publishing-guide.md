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
cross-references. Every HTML comment that is not a `book:` marker is dropped
too, so `markdownlint-disable` pragmas and editorial notes never reach the
rendered book.

Every list item under `## Bibliography` becomes a source, whatever citation
shape it uses, and a line-wrapped entry is joined onto the item it continues.
Blank-separated prose with no URL is treated as an editorial note and ignored.
An unindented line adjacent to a list item, or isolated prose containing an
`http(s)` URL, is a loud error so a malformed source cannot disappear silently.

Chapter numbering differs by target on purpose. The PDF wraps its front matter
in `\frontmatter` and switches to `\mainmatter` before chapter one, so LaTeX
numbers the chapters and leaves the introduction unnumbered. EPUB and HTML have
no such mechanism, so the composer writes the number into the heading text
(`# Chapter 3. ...`) for those targets only.

## Markers

Markers are HTML comments. The LinkedIn publisher strips every HTML comment
before it does anything else, so markers can never reach a published article.

| Marker                                          | Effect                                                   |
| ----------------------------------------------- | -------------------------------------------------------- |
| `<!-- book:part title="How We Got Here" -->`    | Opens a Part before this chapter                         |
| `<!-- book:chapter title="..." -->`             | Chapter title override; default is the article H1        |
| `<!-- book:merge-into-previous -->`             | Fold this article into the previous chapter as a section |
| `<!-- book:demote by=1 -->`                     | Shift heading levels down for the rest of the article    |
| `<!-- book:exclude -->` ... `<!-- book:end -->` | Drop a span; it may cross `##` boundaries                |
| `<!-- book:include path=fragments/name.md -->`  | Splice in book-only prose                                |
| `<!-- book:pagebreak -->`                       | Force a page break                                       |
| `<!-- book:index term="evidence gate" -->`      | Manual index entry, and an anchor for EPUB and HTML      |

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

Pandoc renders every target. LaTeX renders only the PDF, so the second half of
this list is needed only if you want a PDF.

```bash
brew install pandoc
brew install --cask basictex
sudo tlmgr update --self
sudo tlmgr install latexmk
npm run doctor:book
```

`doctor:book` always checks pandoc. It checks the LaTeX binaries and compiles a
one-line probe per LaTeX package only when the pdf target is in play, printing a
single `tlmgr install ...` line naming whatever is missing. Run it until it is
quiet. That probe includes `adjustbox`, which the image-led chapter opener uses
to preserve aspect ratio while center-cropping artwork to its printable frame.

PDF citations remain same-page footnotes: each note appears at the bottom of the
physical page containing its citation marker. HTML and EPUB keep Pandoc's linked
notes because reflowable editions have no stable physical page boundary.

On a machine that only wants EPUB or HTML, name those targets and the doctor
will not mention LaTeX at all:

```bash
npm run doctor:book -- --target epub --target html
```

## Building

```bash
npm run book                        # manuscript, pdf, epub, html
npm run book -- --target manuscript # just the reviewable markdown
npm run book -- --target pdf
```

Output lands in `.tmp/book/`. `manuscript.md` is the clean, human-readable
assembly with no LaTeX in it; the per-target manuscripts carry the markup each
format needs.
