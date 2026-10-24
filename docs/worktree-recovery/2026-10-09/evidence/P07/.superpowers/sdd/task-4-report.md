# Task 4 Implementation Report

Status: DONE

## Files changed

- `docs/articles/assets/book/chapter-openers.tex`
- `scripts/tests/unit/articles/lib/book/render.test.mjs`

## RED evidence

- `node --test scripts/tests/unit/articles/lib/book/render.test.mjs`
  - Exit 1: 16 passed, 2 failed.
  - The title-page test failed because subtitle storage and the custom `\maketitle` override were absent.
  - The body-image test failed because the narrowed `\pandocbounded` override was absent.

## GREEN evidence

- `node --test scripts/tests/unit/articles/lib/book/render.test.mjs`
  - Exit 0: 18 passed, 0 failed.
- `git diff --check`
  - Exit 0.

## Doctor, build, and PDF evidence

- `npm run doctor:book -- --target pdf`
  - Exit 0: `doctor:book — toolchain is complete`.
- `npm run book -- --target pdf`
  - Exit 0: Latexmk reported all targets up to date after writing the 74-page PDF.
- `pdfinfo .tmp/book/book.pdf | rg '^(Pages|Page size|File size):'`
  - `Pages: 74`
  - `Page size: 612 x 792 pts (letter)`
  - `File size: 24684916 bytes`
- Rendered all 74 pages to PNG contact sheets and inspected the complete PDF, then inspected the title page and representative tall and wide body diagrams at higher resolution.
  - The title page is banner-first, unnumbered, and preserves the full uncropped placeholder, 34-point title, subtitle, and author.
  - Body diagrams remain proportional, centered, and bounded without changing title or chapter artwork blocks.

The one-time PDF marker was not rerun.

## Commit

`5ef4c28b5bb5f2799fbefbc586e7f4faf68b8282` — `style(book): polish title and diagram bounds`

## Concerns

No Task 4 blocker. The successful doctor/build retained non-blocking existing warnings: Node's child-process shell deprecation warning, repeated `fancyhdr` head-height warnings, two duplicate page-destination warnings from `xdvipdfmx`, and one underfull paragraph box. The rendered PDF showed no clipping, overlap, or layout defect attributable to Task 4.

## Review correction: unique page anchors and explicit head height

Status: DONE

### Root-cause diagnostics

- The pre-correction XDV contained three separate `pdf:dest (page.i)` records for physical pages whose visible numbering was reset across Pandoc's title/frontmatter/mainmatter sequence.
- Running `xdvipdfmx` from `.tmp/book` reproduced exactly two `xdvipdfmx:warning: Object @page.i already defined.` warnings.
- `.tmp/book/book.log` contained 73 `Package fancyhdr Warning: \headheight is too small (12.0pt)` warnings and showed the repeated physical `[1]` sequences around the title, contents, copyright, and main-matter reset.
- `hypertexnames=false` was selected because it retains Hyperref page anchors and PDF navigation while assigning physical-page sequence names independent of visible page-number resets.
- The first integration attempt used `\hypersetup` and the focused test passed, but the PDF build correctly failed with `Undefined control sequence` because Pandoc injects this selected header before loading Hyperref. A second RED assertion required the robust pre-package form, `\PassOptionsToPackage{hypertexnames=false}{hyperref}`.

### RED and GREEN evidence

- Initial RED: `node --test scripts/tests/unit/articles/lib/book/render.test.mjs`
  - Exit 1: 17 passed, 2 failed because unique physical-page anchor configuration and an explicit 14pt `\headheight` were absent.
- Integration-hardening RED: the same command exited 1 with 18 passed and 1 failed because the incompatible `\hypersetup` form did not queue the option before Hyperref loaded.
- Final GREEN: the same command exited 0 with 19 passed and 0 failed after requiring and using `\PassOptionsToPackage`.
- `npm run doctor:book -- --target pdf`
  - Exit 0: `doctor:book — toolchain is complete`.
- `npm run book -- --target pdf`
  - Exit 0: the final PDF and all Latexmk targets completed successfully.

### Before and after warning proof

- Before:
  - Duplicate physical-page destination warnings: 2, both for `@page.i`.
  - `headheight is too small` warnings in `.tmp/book/book.log`: 73.
- After:
  - Duplicate-destination warnings in `.tmp/book/book.log`: 0.
  - Duplicate-destination warnings in captured build output: 0.
  - `headheight is too small` warnings in `.tmp/book/book.log`: 0.
  - Generated physical-page anchors: 74 total and 74 unique (`page.1` through `page.74`); `pdfinfo -dests` confirms the destinations remain present.

### PDF and visual evidence

- `pdfinfo .tmp/book/book.pdf | rg '^(Pages|Page size|File size):'`
  - `Pages: 74`
  - `Page size: 612 x 792 pts (letter)`
  - `File size: 24685026 bytes`
- Rendered and inspected physical pages 1, 3, and 5 at 150 DPI:
  - Title page: full banner, title/subtitle/author preserved, no visible page number.
  - Copyright frontmatter: blank header and roman `i` footer at right.
  - Chapter 1: `Chapter 1` header at left and arabic `1` footer at right, with opener artwork and content unchanged.

The one-time PDF marker was not rerun. No remote or worktree operations were performed.

### Correction commit

`3018481310a98d17102b1be252d6952439ef4bd3` — `fix(book): stabilize PDF page anchors`

### Remaining concerns

None for Task 4. The prior duplicate-destination and head-height concerns are resolved. The unrelated underfull paragraph and Node child-process deprecation warning remain non-blocking and outside this correction.
