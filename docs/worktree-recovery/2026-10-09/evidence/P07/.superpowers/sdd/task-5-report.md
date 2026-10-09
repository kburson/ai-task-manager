# Task 5 Implementation Report

Status: DONE

## Files changed

- `docs/articles/assets/book/book.css`
- `scripts/articles/lib/book/render.mjs`
- `scripts/tests/unit/articles/lib/book/render.test.mjs`

Article Markdown, Mermaid source, and tracked image assets were not modified.

## RED evidence

- `node --test scripts/tests/unit/articles/lib/book/render.test.mjs`
  - Exit 1: 18 passed, 2 failed.
  - The new stylesheet contract failed because the banner-first title block, proportional chapter image rules, bounded diagram rules, and removal of cropped image styling were absent.
  - The EPUB argument contract failed because `--epub-cover-image=title-page.png` was absent.

## GREEN evidence

- `node --test scripts/tests/unit/articles/lib/book/render.test.mjs scripts/tests/unit/articles/lib/book/diagrams.test.mjs`
  - Exit 0: 24 passed, 0 failed.
- `git diff --check`
  - Exit 0.

## Reflowable build and structural evidence

- `npm run book -- --target epub --target html`
  - Exit 0: both editions built from 15 chapters, 11 footnotes, and 8 index terms.
- `unzip -t .tmp/book/book.epub | tail -1`
  - `No errors detected in compressed data of .tmp/book/book.epub.`
- Pandoc normalizes the internal media filename, but `EPUB/content.opf` marks `media/file35.png` as `properties="cover-image"`; its SHA-1 (`8d4f64e12039e73ecf4a3c15d2095f8b4d5e0d89`) matches the staged and tracked `title-page.png` exactly.
- HTML chapter opener count: 15.
- HTML Mermaid diagram count: 20.
- The render argument includes `--epub-cover-image=title-page.png` only for EPUB.
- The stylesheet contains no `object-fit: cover`, `.chapter-number`, or print `height: 2.2in` rule.

The PDF artifact-operation marker was not run, and no PDF target was built.
No remote or worktree operations were performed.

## Commit

`b3539fbf3c230e2906a0d4f5001742112af1b4b8` — `style(book): constrain reflowable artwork`

## Concerns

No Task 5 blocker. The brief's CSS sample used a single-quoted title image URL while its required assertion matched double quotes; the stylesheet uses double quotes to satisfy the approved test without changing the generated presentation.

Tracked worktree status is clean. This report is intentionally ignored by `.superpowers/sdd/.gitignore`.

## Critical review correction: EPUB title banner

Status: DONE

### Root cause and design correction

Pandoc 3.9 generates `EPUB/text/title_page.xhtml` through its internal EPUB title-page writer. Although `--template` selects a custom EPUB3 template for normal EPUB documents, that title-page context did not receive `cover-image`; the template's `$if(cover-image)$` branch therefore emitted no banner. Supplying metadata made the branch render, but it supplied the unbundled source name and no dimensions, producing `../media/title-page.png` rather than Pandoc's manifest-resolved `media/file35.png`.

The correction keeps `--epub-cover-image=title-page.png` and, after Pandoc packages the EPUB, reads `EPUB/content.opf` for its actual `cover-image` item, reads that PNG's dimensions, inserts an SVG banner before the title in the declared title-page XHTML, and rebuilds the archive with an uncompressed first `mimetype` entry. This avoids a hard-coded `fileNN.png` path and avoids depending on a broken stylesheet URL.

### RED evidence

- Review-artifact inspection showed `EPUB/text/title_page.xhtml` contained `.titlepage` and an `h1.title`, but no banner; the shared CSS only matched `#title-block-header` and referenced an absent `title-page.png` package entry.
- Initial template-contract RED: `node --test scripts/tests/unit/articles/lib/book/render.test.mjs`
  - Exit 1: 19 passed, 3 failed because `.titlepage` coverage, the template, and the EPUB template selection were absent.
- The template source checks then passed, but a real EPUB build proved the title-page renderer did not receive `$cover-image$`; this invalidated the template hypothesis before commit.
- Manifest-driven correction RED: the same focused render test exited 1 with 20 passed and 2 failed because no banner inserter existed and the obsolete template selection remained.

### GREEN and package evidence

- `npx prettier --check docs/articles/assets/book/book.css scripts/articles/lib/book/render.mjs scripts/tests/unit/articles/lib/book/render.test.mjs`
  - Exit 0.
- `npx eslint scripts/articles/lib/book/render.mjs scripts/tests/unit/articles/lib/book/render.test.mjs`
  - Exit 0.
- `npm run lint:tmp`
  - Exit 0: 1,584 files clean.
- `node --test scripts/tests/unit/articles/lib/book/render.test.mjs scripts/tests/unit/articles/lib/book/diagrams.test.mjs`
  - Exit 0: 26 passed, 0 failed.
- `npm run book -- --target epub --target html`
  - Exit 0: both editions built from 15 chapters, 11 footnotes, and 8 index terms.
- `unzip -t .tmp/book/book.epub | tail -1`
  - `No errors detected in compressed data of .tmp/book/book.epub.`
- `EPUB/text/title_page.xhtml` contains `.title-banner` before `<h1 class="title">` and its SVG references `../media/file35.png`.
- That referenced `EPUB/media/file35.png` exists; its SHA-1 is `8d4f64e12039e73ecf4a3c15d2095f8b4d5e0d89`, exactly matching `docs/articles/assets/book/title-page.png`.
- `EPUB/content.opf` declares `media/file35.png` as `properties="cover-image"`.
- `unzip -lv` confirms `mimetype` is the first archive entry and is stored uncompressed.
- HTML retains its `#title-block-header::before` banner CSS and contains 15 chapter openers and 20 diagrams.

The PDF artifact-operation marker was not run, and no PDF target, remote action, or worktree operation was performed.

### Correction commit

`a68385141a00e8fc42d0eb736032ad32eafe833e` — `fix(book): render EPUB title banner`

### Remaining concerns

No blocker. The corrective packaging path depends on the standard `unzip` and `zip` executables already used by the build environment; malformed EPUB manifests, missing cover items, invalid PNG dimensions, or missing title headings fail loudly rather than producing a broken title page.

## Re-review hardening correction

Status: DONE

### Security and atomicity changes

- Lists and validates every ZIP entry before extraction. Absolute names, traversal segments, backslash ambiguity, empty/ambiguous segments, and paths that escape after resolution are rejected.
- Applies an independent containment check to manifest-derived title-page and cover hrefs under the extracted EPUB root before reading or writing either file.
- Creates the staging directory beside the caller-selected EPUB target; the replacement stays in that same directory and is renamed only after both ZIP phases succeed. The target therefore remains untouched on rewrite failure and finalization remains same-filesystem and atomic.
- Validates the full PNG signature and a complete 13-byte IHDR chunk plus CRC extent before reading dimensions.
- Adds `zip` and `unzip` to EPUB doctor dependencies. PDF-only dependencies remain unchanged for the later Task 6 scope.

### RED evidence

- `node --test scripts/tests/unit/articles/lib/book/render.test.mjs scripts/tests/unit/articles/lib/book/toolchain.test.mjs`
  - Exit 1: 22 passed, 5 failed.
  - The renderer had no archive/manifest containment helpers, no exported/injectable postprocessor for custom-output and failure tests, no complete-IHDR guard, and the toolchain did not export or require EPUB archive binaries.
- Complete-IHDR boundary RED: `node --test scripts/tests/unit/articles/lib/book/render.test.mjs`
  - Exit 1: 25 passed, 1 failed because a 24-byte truncated IHDR header was accepted before the parser required the complete chunk.

### GREEN and build/package evidence

- `npx prettier --check scripts/articles/lib/book/render.mjs scripts/articles/lib/book/toolchain.mjs scripts/tests/unit/articles/lib/book/render.test.mjs scripts/tests/unit/articles/lib/book/toolchain.test.mjs`
  - Exit 0.
- `npx eslint scripts/articles/lib/book/render.mjs scripts/articles/lib/book/toolchain.mjs scripts/tests/unit/articles/lib/book/render.test.mjs scripts/tests/unit/articles/lib/book/toolchain.test.mjs`
  - Exit 0.
- `npm run lint:tmp`
  - Exit 0: 1,584 files clean.
- `node --test scripts/tests/unit/articles/lib/book/render.test.mjs scripts/tests/unit/articles/lib/book/diagrams.test.mjs scripts/tests/unit/articles/lib/book/toolchain.test.mjs`
  - Exit 0: 40 passed, 0 failed.
  - Includes custom-output archive reconstruction, stored-first `mimetype`, command-failure cleanup/original-target preservation, unsafe path rejection, complete PNG/IHDR validation, and EPUB doctor coverage.
- `npm run book -- --target epub --target html`
  - Exit 0: both editions built from 15 chapters, 11 footnotes, and 8 index terms.
- `unzip -t .tmp/book/book.epub | tail -1`
  - `No errors detected in compressed data of .tmp/book/book.epub.`
- The title-page banner is before the title, its manifest-resolved packaged image exists, and both its SHA-1 and `title-page.png` SHA-1 are `8d4f64e12039e73ecf4a3c15d2095f8b4d5e0d89`.
- HTML retains 15 chapter openers and 20 diagrams. `mimetype` remains the first archive member and is stored uncompressed.

The PDF artifact-operation marker was not run, and no PDF target, remote action, or worktree operation was performed.

### Hardening commit

`2c74701a3cc4fd33bd75251434708b6c20b845d0` — `fix(book): harden EPUB postprocessing`

### Remaining concerns

No Task 5 blocker. The postprocessor now fails before extraction for unsafe archive names and fails before file access for unsafe manifest hrefs. The EPUB build explicitly declares its standard `zip`/`unzip` dependencies through the doctor.

## Unsafe-entry and PNG-CRC correction

Status: DONE

### Safety changes

- Pairs ordered `unzip -Z1` entry names with ordered `unzip -Z -l` mode metadata before extraction. The entry and mode counts must match; only regular (`-`) and directory (`d`) types are accepted. Symlinks, special/unknown modes, and mismatched metadata fail before `unzip -qq` runs.
- Defensively walks the extracted tree with `lstat` before manifest access, rejecting symlinks and every non-regular/non-directory member.
- Validates the IHDR CRC32 over the chunk type and 13-byte IHDR data, in addition to the complete signature, chunk length/type, CRC extent, and nonzero dimensions.

### RED evidence

- `node --test scripts/tests/unit/articles/lib/book/render.test.mjs`
  - Exit 1: 24 passed, 4 failed.
  - A real `zip -y` archive with an `EPUB` symlink reached the manifest phase; mode metadata and extracted-tree guards were absent, `validateZipEntries` was absent, and a corrupt IHDR CRC was accepted.
- The first CRC implementation used an incorrectly grouped bitwise/conditional expression. The valid fixture then correctly exposed the defect as `invalid IHDR CRC`; the loop was corrected before final verification.

### GREEN and build/package evidence

- `npx prettier --check scripts/articles/lib/book/render.mjs scripts/tests/unit/articles/lib/book/render.test.mjs`
  - Exit 0.
- `npx eslint scripts/articles/lib/book/render.mjs scripts/tests/unit/articles/lib/book/render.test.mjs`
  - Exit 0.
- `npm run lint:tmp`
  - Exit 0: 1,584 files clean.
- `node --test scripts/tests/unit/articles/lib/book/render.test.mjs scripts/tests/unit/articles/lib/book/diagrams.test.mjs scripts/tests/unit/articles/lib/book/toolchain.test.mjs`
  - Exit 0: 42 passed, 0 failed.
  - Includes a real ZIP-preserved symlink archive rejected before extraction/outside access, metadata-mismatch rejection, defensive extracted-tree lstat rejection, and corrupt-IHDR-CRC rejection.
- `npm run book -- --target epub --target html`
  - Exit 0: both editions built from 15 chapters, 11 footnotes, and 8 index terms.
- `unzip -t .tmp/book/book.epub | tail -1`
  - `No errors detected in compressed data of .tmp/book/book.epub.`
- The banner remains before the title; its manifest-resolved packaged media exists and shares SHA-1 `8d4f64e12039e73ecf4a3c15d2095f8b4d5e0d89` with `title-page.png`.
- HTML retains 15 chapter openers and 20 diagrams; `mimetype` remains first and stored uncompressed.

The PDF artifact-operation marker was not run, and no PDF target, remote action, or worktree operation was performed.

### Unsafe-entry commit

`ed61f9fbb40fd19d3cdb84d43f93f55503efd629` — `fix(book): reject unsafe EPUB entries`

### Remaining concerns

No Task 5 blocker. ZIP member type is now rejected both from archive metadata before extraction and from filesystem metadata after extraction; title-page PNG dimensions are read only after the IHDR checksum validates.
