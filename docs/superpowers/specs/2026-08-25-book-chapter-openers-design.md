# Book Chapter Openers and Page Footnotes Design

<!-- cspell:words adjustbox graphicx paperheight pasteable textwidth -->

Status: approved authorial direction; implementation architecture recorded for
fresh-session execution

## Context

The article-series book now composes end to end as Markdown, HTML, EPUB, and a
73-page PDF. The current composer deliberately drops each LinkedIn header image
and lets Pandoc render an ordinary chapter heading. The result is structurally
sound but does not yet have the intended book design.

Every drafted chapter already carries three pieces of opener content in its
source article:

- the article H1, used as the chapter title;
- one bold standalone line, used as the subtitle; and
- one image under `assets/article-headers/`, used as the chapter artwork.

Chapter 5, `05-easy-come-easy-go.md`, is the only current exception: it has a
title and subtitle but no header image. The author approved a temporary copy of
Chapter 6's image at `article-05-header.png` and will replace that one file later.

## Decision

Each unmerged chapter receives a target-specific chapter opener:

```text
full printable width header image, center-cropped to the top 20% of the page

                         Chapter N
                         Chapter Title
                         Subtitle

Prose begins below the opener.
```

Every chapter starts on a new page in PDF and printed HTML. EPUB starts each
chapter in a new spine document so compatible readers present a chapter break.
Normal scrolling HTML uses strong chapter separation while remaining a normal
accessible web document.

PDF citations remain ordinary same-page footnotes: a citation marker in prose
renders its citation at the bottom of the physical page containing the marker.
Pages without citations have no empty footnote block. HTML and EPUB retain
Pandoc's native linked-note behavior because reflowable editions have no stable
physical page boundary.

## Goals

- Give all 15 current chapters a consistent image-led opening page.
- Put the image before the centered chapter number, title, and subtitle.
- Preserve image aspect ratio and center-crop rather than stretch.
- Keep the image within the printable text width; do not require edge-to-edge
  commercial bleed.
- Start every PDF and printed-HTML chapter on a new page.
- Preserve EPUB chapter splitting and navigation.
- Preserve same-page PDF footnotes and the existing Sources appendix.
- Keep LinkedIn article publication byte-for-byte equivalent apart from the
  deliberate Chapter 5 placeholder source addition.
- Keep author replacement of the Chapter 5 placeholder to a one-file operation.

## Non-goals

- Redesigning the cover, copyright page, introduction, glossary, Sources, or
  index.
- Choosing final Chapter 5 artwork.
- Adding Part divisions, merged chapters, or bridge prose.
- Producing printer bleed, crop marks, or a commercial press-ready cover wrap.
- Paginating normal browser HTML or forcing EPUB readers to preserve a fixed
  paper layout.
- Converting citations to endnotes.
- Changing article prose, titles, subtitles, or citation wording.

## Source contract

`parseArticle()` continues returning the existing `title`, `bannerPath`, and
`sections` fields and adds `subtitle`.

The subtitle is the first standalone bold line in the article preamble:

```markdown
**The Rise Of Technical Product Operations**
```

The parser validates that at most one such preamble subtitle exists. The line
remains in `sections` so the LinkedIn publisher's existing output does not
change. The book composer removes that exact preamble line only after capturing
it for the opener.

Every article selected onto the book spine must have:

- a non-empty title;
- exactly one subtitle;
- one `assets/article-headers/*.png` banner path; and
- an existing banner file beneath the collection's article root.

A missing subtitle, missing image, escaping path, or unreadable image fails the
book build before Pandoc runs. The Chapter 5 placeholder satisfies this contract
without weakening it.

When `book:merge-into-previous` is used later, only the first member of the
resulting chapter supplies the chapter opener. A merged member remains a section
inside that chapter and does not create a second page or opener.

## Placeholder artwork

The first implementation copies:

```text
docs/articles/assets/article-headers/article-06-header.png
```

to:

```text
docs/articles/assets/article-headers/article-05-header.png
```

The Chapter 5 article receives the normal image line pointing at the new path.
Its existing editorial comment changes from “no header image exists” to a
clear placeholder notice naming the duplicate source and the one-file
replacement path.

The composer does not contain placeholder-specific logic. Once the author
replaces `article-05-header.png`, every output automatically uses the new image.

## Chapter-opener component

Add `scripts/articles/lib/book/chapter-openers.mjs` as the single owner of
chapter-opener behavior. It provides:

```js
chapterOpenerFor({ target, chapter, imageName, subtitle }) -> string[]
planChapterImages({ articlesDir, images, outDir }) -> StagedImage[]
stageChapterImages(plan) -> Promise<void>
escapeLatex(value) -> string
```

`chapterOpenerFor()` emits target-specific manuscript lines. It does not read
or write files. `planChapterImages()` validates source containment for the
complete set. `stageChapterImages()` copies the validated first-member banners
into the output directory under deterministic names:

```text
chapter-01-header.png
chapter-02-header.png
...
chapter-15-header.png
```

The staged name is independent of the source filename so merged or reordered
chapters cannot collide. The function validates the entire image set before it
copies anything, then stages the complete set. It never writes under
`docs/articles/`.

`buildManuscript()` returns a `chapterImages` description with its existing
chapter, footnote, index, source, and diagram results. The CLI stages chapter
images and diagram images before invoking Pandoc.

## PDF rendering

PDF gets a native LaTeX chapter command defined in:

```text
docs/articles/assets/book/chapter-openers.tex
```

The command accepts staged image, chapter title, and subtitle. It:

1. clears to a new page;
2. advances and anchors the chapter counter;
3. adds the numbered title to the table of contents and PDF navigation;
4. sets the running chapter mark;
5. renders the image at full `\textwidth` and `0.2\paperheight`;
6. scales proportionally until the box is filled, then clips equally from the
   overflow around the center;
7. centers `Chapter N`, title, and subtitle beneath it; and
8. returns to normal left-aligned prose.

The macro uses `graphicx`, `adjustbox`, and the already configured hyperlink
support. `toolchain.mjs` adds `adjustbox` to its package probes so a missing
package produces the same pasteable `tlmgr` diagnostic as every other PDF
dependency.

For the PDF target, manuscript assembly emits the native command instead of a
Markdown H1 for each body chapter. Appendices continue using the ordinary
Pandoc/LaTeX chapter path after `\appendix`.

The existing Markdown footnote definitions stay unchanged. Pandoc and LaTeX
therefore continue placing citation text at the bottom of the page where each
reference occurs. The chapter macro must not redefine footnote counters,
footnote layout, or page output routines.

## HTML and EPUB rendering

HTML and EPUB use semantic Pandoc Markdown wrapped in a `chapter-opener` fenced
division. The H1 remains first in document order so Pandoc keeps correct table
of contents and EPUB spine behavior. CSS reorders the visible opener so the
image appears before the number, title, and subtitle.

Add:

```text
docs/articles/assets/book/book.css
```

The stylesheet:

- makes the opener a vertical flex container;
- displays the staged image first with `width: 100%`, a 20%-page-equivalent
  height, and `object-fit: cover; object-position: center`;
- centers the chapter number, H1, and subtitle;
- adds `break-before: page` and the legacy `page-break-before: always` fallback;
- gives scrolling HTML a clear chapter boundary without pretending the browser
  has fixed pages;
- prevents opener elements from being split during printed HTML; and
- leaves prose, diagrams, notes, appendices, and navigation under Pandoc's
  normal flow.

Pandoc receives the staged stylesheet through `--css=book.css`. EPUB embeds it.
Standalone HTML links it beside the generated book, so the CLI stages the
stylesheet into the output directory with the images.

The clean `manuscript` target uses portable Markdown plus minimal centered HTML
paragraphs in visual order—image, chapter number, title, subtitle, prose. It
contains no LaTeX or target-only CSS classes and remains directly reviewable
even though it does not attempt physical pagination.

## Data flow

```text
article source
  -> parse title + subtitle + banner path
  -> strip LinkedIn-only scaffolding from book body
  -> plan chapters and select first-member opener metadata
  -> validate all opener assets
  -> emit target-specific opener manuscript
  -> stage deterministic chapter images and CSS in .tmp/book
  -> Pandoc / LaTeX render
  -> PDF, HTML, EPUB, or reviewable Markdown
```

LinkedIn publication continues using the shared parser but ignores the new
`subtitle` field. No chapter-opener module participates in article publication.

## Error handling

The book build fails before rendering when:

- a spine article has no subtitle or has multiple preamble subtitles;
- a spine article has no banner;
- a banner path is absolute, escapes the article root, is outside
  `assets/article-headers/`, or is not a PNG;
- a banner file is missing or unreadable;
- two planned chapters resolve to the same staged output name;
- the LaTeX opener partial or CSS file is missing; or
- the selected PDF toolchain lacks `adjustbox`.

Asset staging validates the full batch before copying. A validation failure
does not leave a partially updated set of chapter images. Rendering continues
to write only beneath the selected output directory.

## Testing and visual verification

Focused tests prove:

- subtitle extraction without changing LinkedIn section content;
- strict missing/multiple subtitle diagnostics;
- book-only removal of the subtitle from prose;
- deterministic staged image names and source-containment checks;
- one opener per planned chapter and none for merged members;
- target-specific opener syntax for manuscript, HTML, EPUB, and PDF;
- LaTeX escaping for titles and subtitles;
- PDF render arguments include the opener partial;
- HTML/EPUB render arguments include the stylesheet;
- the toolchain probes `adjustbox`;
- the live 15-chapter corpus has a valid subtitle and image for every chapter;
- LinkedIn publication output remains unchanged; and
- PDF footnote definitions and same-page rendering remain intact.

End-to-end verification builds all four targets. PDF verification renders at
least:

- the title page;
- Chapter 1's opener;
- Chapter 5's placeholder opener;
- a later chapter opener;
- a prose page with multiple citation footnotes; and
- a chapter boundary following a nearly full preceding page.

Visual review checks image cropping, centering, title wrapping, subtitle
spacing, prose start, footnote placement, running heads, page numbers, and the
absence of blank pages or clipped text. HTML is checked both on screen and in
print preview. EPUB is validated as a ZIP and inspected in a reader where
available.

## Sequencing and repository extraction

Implement this design in the existing
`claude/articles-book-publication-6a7dfe` worktree before executing the
`writing-studio` extraction plan. The extraction's selected history then
preserves the chapter-opener implementation, assets, tests, specification, and
plan without a second port.

The writing-studio extraction design and plan add this specification and its
implementation plan to the writing-owned history set, increasing that set from
seven documents to nine.

## Acceptance criteria

- Every one of the 15 current chapters starts with the requested image, number,
  title, subtitle, and prose hierarchy.
- Chapter 5 uses a documented placeholder at `article-05-header.png` that the
  author can replace without code changes.
- Every PDF chapter starts on a fresh page.
- Header images fill the printable width and top 20% of the page without
  distortion, using centered cropping.
- Chapter number, title, and subtitle are centered and remain legible when they
  wrap.
- PDF citations render as same-page footnotes; pages without citations do not
  reserve an empty note area.
- Printed HTML starts each chapter on a new page; scrolling HTML has strong
  chapter separation.
- EPUB preserves chapter-level spine and navigation behavior.
- LinkedIn publication output is unchanged except for the approved Chapter 5
  placeholder image becoming available.
- Missing or malformed opener metadata fails before Pandoc renders.
- Markdown, HTML, EPUB, and PDF builds succeed and their representative visual
  checks pass.
- The implementation lands before writing-studio extraction and is included in
  the selected writing history.
