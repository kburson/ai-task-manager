# Book Layout Polish Design

<!-- cspell:words fancyhdr pagestyle pandocbounded textheight textwidth -->

Status: approved authorial direction; ready for implementation planning after
written-spec review

## Context

The article-series book builds successfully as reviewable Markdown, PDF, EPUB,
and HTML. The first chapter-opening pass added image-led openers, but rendered
review identified four remaining layout problems:

- chapter banners are cropped instead of showing the complete artwork;
- chapter numbers appear in the opener body instead of the page header;
- page numbers do not use a consistent right-aligned footer;
- some tall Mermaid diagrams can exceed the printable page area.

The title page also needs a temporary image and a larger title. The author chose
a banner-first composition and approved Chapter 7's existing banner as the
initial placeholder artwork. The title page remains conventionally unnumbered.

## Decision

Keep article sources and original chapter artwork unchanged. Extend the existing
book-presentation layer so fixed-layout PDF behavior lives in the selected LaTeX
header and reflowable HTML/EPUB behavior lives in the shared book stylesheet.
Generated Mermaid images receive a dedicated class for reflowable styling.

Create `docs/articles/assets/book/title-page.png` as a byte-identical copy of
Chapter 7's current banner. Treat that file as the title-page authority from then
on: later artwork replacement changes only `title-page.png`, not Chapter 7, its
article metadata, or staging logic.

## Goals

- Show every chapter banner in full without cropping or stretching.
- Fit chapter banners to the available text width with proportional height.
- Move `Chapter N` to the left side of the running page header.
- Put every visible page number in the right side of the page footer.
- Leave the title page unnumbered.
- Add a banner-first title page using the Chapter 7 placeholder image.
- Increase the PDF title to 34 points and give HTML/EPUB an equivalent visual
  hierarchy.
- Constrain Mermaid diagrams to both the available width and a safe printable
  height while preserving aspect ratio.
- Preserve article prose, citations, diagrams, and original images.

## Non-goals

- Selecting final title-page artwork.
- Changing the Chapter 7 banner or any other source article image.
- Redesigning chapter titles, subtitles, body typography, citations, glossary,
  Sources, or index content.
- Adding commercial-cover bleed, crop marks, spine artwork, or back-cover copy.
- Forcing browser HTML or EPUB readers into fixed paper pagination.
- Rebasing, pushing, merging, extracting the writing studio, or changing remote
  repository state.

## Asset contract

The tracked placeholder is:

```text
docs/articles/assets/book/title-page.png
```

Its initial bytes equal:

```text
docs/articles/assets/article-headers/article-07-header.png
```

The book asset stager validates that `title-page.png` is a readable PNG beneath
the approved book-assets directory and copies it into the build directory under
the same basename. Missing, unreadable, escaping, or non-PNG input fails before
Pandoc runs. The staged file is available to PDF, HTML, and EPUB rendering.

Replacing the placeholder later is a one-file operation: overwrite the tracked
`title-page.png` with approved artwork and rebuild. The replacement keeps the
same path and does not require code or metadata changes.

## PDF title page

The selected LaTeX header provides a custom title-page composition:

1. Start an unnumbered title page.
2. Center the complete `title-page.png` above the title.
3. Reduce the image only as needed to fit `\textwidth`; never crop or stretch it.
4. Render `Agentic Agile Delivery` at 34 points with an appropriate proportional
   line height.
5. Render the existing subtitle below the title and the existing author below
   the subtitle.
6. End the title page without a visible header or footer.

The custom subtitle storage must remain compatible with Pandoc's generated
`\subtitle{...}` call. The title, subtitle, and author continue to originate in
`book.json`; the presentation layer does not duplicate their text.

## Headers and footers

Use one explicit page-style definition for normal pages and redefine LaTeX's
`plain` style to match it. This prevents chapter-opening pages from reverting to
the book class's centered page-number treatment.

- Title page: no header and no page number.
- Numbered front matter: blank header and right-aligned footer page number.
- Every numbered chapter page, including its opening page: left-aligned
  `Chapter N` header and right-aligned footer page number.
- Right header and left/center footer positions remain empty.
- Header and footer rules remain absent unless rendered review shows that a rule
  is required for legibility.

The chapter opener no longer repeats `Chapter N` in its centered body. It retains
the centered chapter title and subtitle beneath the artwork.

## Chapter artwork

PDF chapter artwork uses a maximum-width container rather than a crop viewport.
The complete image is centered, its natural aspect ratio is retained, and it is
reduced only when necessary to fit the printable text width.

HTML and EPUB use equivalent rules:

```css
max-width: 100%;
width: auto;
height: auto;
object-fit: contain;
```

The existing decorative figure caption stays visually hidden while the image's
alternative text remains available to assistive technology.

## Mermaid diagram bounds

The book composer emits generated Mermaid references with a `book-diagram`
class. HTML and EPUB center that class and constrain it to the content width and
70 percent of the viewport height, using `object-fit: contain` and proportional
sizing.

Pandoc's PDF template already wraps ordinary Markdown images in
`\pandocbounded`, but its default maximum height is the entire text block. That
can overflow when a diagram enters after preceding prose. The selected LaTeX
header narrows the maximum diagram box to 70 percent of `\textheight` while
retaining the existing width calculation and aspect ratio. TeX can then move a
diagram that does not fit the remaining space onto the next page, where the
bounded box fits inside the printable area.

The PDF bound applies to Pandoc-managed body images. Chapter artwork and the
title image use their separate presentation commands and are unaffected by the
diagram limit.

## HTML and EPUB title treatment

The shared stylesheet gives the generated title block the selected banner-first
composition and increases the title size to an equivalent visual hierarchy. The
staged `title-page.png` is presented above the title without cropping.

EPUB additionally uses `title-page.png` as its temporary cover image through
Pandoc's supported EPUB cover option. Reader-specific pagination remains outside
the design; the cover and title-block assets must package successfully and
remain proportional in conforming readers.

## Failure handling

- Fail before rendering when the tracked title image is absent, unreadable,
  outside the approved directory, or not a PNG.
- Preserve the current strict chapter-banner validation.
- Preserve Mermaid source as authoritative; sizing changes only presentation,
  not diagram content or generated pixel data.
- Treat a Pandoc, LaTeX, Mermaid, or EPUB packaging error as a failed build.
- Do not silently fall back to a cropped image or omit a missing asset.

## Test strategy

Follow test-driven development for each behavior:

1. Asset tests prove the initial title placeholder matches Chapter 7, stages
   under the stable basename, and rejects invalid input.
2. Chapter-opener tests prove the PDF command no longer requests clipping and
   the body no longer repeats the chapter number.
3. Page-style tests prove the selected header defines the conditional left
   chapter header, matched `plain` style, right footer, and empty title-page
   style.
4. Diagram tests prove generated Markdown carries the `book-diagram` class.
5. Render tests prove the PDF height bound, proportional title/chapter image
   rules, HTML/EPUB stylesheet, and EPUB cover argument are wired.
6. Corpus tests continue proving all 15 chapters compose with valid images,
   subtitles, footnotes, and diagrams.

After focused tests pass, run the complete book/publisher test group and the
repository quality gate. Rebuild all four editions and validate that:

- the EPUB archive has no integrity errors;
- HTML contains 15 working chapter images and no visible decorative captions;
- the PDF page count is readable and every expected chapter start exists;
- the title image and all chapter banners are complete and proportional;
- numbered front matter and chapter pages use right footer numbers;
- chapter pages use the left `Chapter N` header;
- no Mermaid diagram crosses the printable margins or page footer; and
- footnotes, chapter transitions, Sources, glossary, and index remain legible.

PDF visual review covers the title page, numbered front matter, multiple chapter
openers, ordinary chapter pages, and every page containing a Mermaid diagram.
The latest HTML and PDF replace the current in-app previews after verification.

## Acceptance criteria

- `title-page.png` is a tracked, replaceable copy of Chapter 7's banner.
- The title page shows the full placeholder banner above a 34-point title and
  has no visible page number.
- All 15 chapter banners show the complete image at proportional dimensions.
- `Chapter N` appears left-aligned in the header on every chapter page and no
  longer appears in the centered opener body.
- Every visible page number after the title page is right-aligned in the footer.
- Every Mermaid diagram fits within the printable PDF area and responsive
  HTML/EPUB content area without cropping or distortion.
- All four book editions build successfully.
- Focused tests, the book/publisher corpus, repository quality checks, EPUB
  integrity checks, and visual review pass.
- The linked worktree remains intact, and no extraction or remote mutation is
  performed.
