### Task 7: Rebuild and visually verify every edition

**Files:**

- Verify: `docs/articles/assets/book/title-page.png`
- Verify: `.tmp/book/manuscript.md`
- Verify: `.tmp/book/book.html`
- Verify: `.tmp/book/book.epub`
- Verify: `.tmp/book/book.pdf`
- Modify only if verification exposes a regression: files already listed in Tasks 1-6 and their corresponding tests.

**Interfaces:**

- Consumes: the completed layout commits and installed book toolchain.
- Produces: verified Markdown, HTML, EPUB, and PDF artifacts plus a clean immutable branch checkpoint.

- [ ] **Step 1: Run the complete book/publisher unit group**

Run:

```bash
node --test scripts/tests/unit/articles/publish-articles.test.mjs scripts/tests/unit/articles/lib/book/*.test.mjs
```

Expected: every publisher/book test passes with zero failures.

- [ ] **Step 2: Build all four editions from the committed source**

Run:

```bash
npm run doctor:book
npm run book
test -s .tmp/book/manuscript.md
test -s .tmp/book/book.html
test -s .tmp/book/book.epub
test -s .tmp/book/book.pdf
cmp docs/articles/assets/book/title-page.png .tmp/book/title-page.png
```

Expected: doctor and build exit 0; every artifact is nonempty; staged title bytes equal the tracked title asset.

- [ ] **Step 3: Run structural artifact checks**

Run:

```bash
pdfinfo .tmp/book/book.pdf | rg '^(Pages|Page size|File size):'
unzip -t .tmp/book/book.epub | tail -1
rg -o 'class="chapter-title chapter-opener"' .tmp/book/book.html | wc -l
rg -o 'class="book-diagram"' .tmp/book/book.html | wc -l
rg -n 'object-fit: cover|chapter-number' .tmp/book/book.html .tmp/book/book.css
rg -n 'Overfull \\[hv]box' .tmp/book/book.log
```

Expected: nonzero PDF metadata; EPUB reports no errors; HTML reports 15 chapter openers and a nonzero Mermaid count; the final two searches produce no output.

- [ ] **Step 4: Render every PDF page for visual inspection**

Run:

```bash
mkdir -p tmp/pdfs
BOOK_LAYOUT_QA_DIR=$(mktemp -d tmp/pdfs/book-layout-qa-XXXXXX)
pdftoppm -png -r 120 .tmp/book/book.pdf "$BOOK_LAYOUT_QA_DIR/page"
find "$BOOK_LAYOUT_QA_DIR" -name 'page-*.png' -type f | sort
```

Expected: one PNG per physical PDF page. Record `BOOK_LAYOUT_QA_DIR` in the execution notes and use the PDF/image inspection tools to review every rendered page.

- [ ] **Step 5: Complete the visual acceptance pass**

Inspect all rendered pages and explicitly verify:

- the title page is unnumbered, shows the complete Chapter 7 placeholder above the enlarged title, and preserves subtitle/author hierarchy;
- every numbered front-matter page has a blank header and right footer number;
- all 15 chapter-opening images are complete, proportional, centered, and followed by title/subtitle without a repeated chapter number;
- every chapter page has `Chapter N` left in the header and its page number right in the footer;
- every page containing a Mermaid diagram keeps the full diagram inside the printable margins and clear of the footer;
- same-page footnotes, glossary, Sources, index, and chapter transitions remain readable;
- no clipped text, overlaps, blank accidental pages, black boxes, or broken glyphs appear.

If any defect appears, add one failing automated regression test, make the smallest correction in the owning file, rerun its focused tests, rebuild all editions, and repeat Steps 3-5.

- [ ] **Step 6: Inspect HTML and PDF in the in-app browser**

Use the `browser:control-in-app-browser` skill. Reuse or recreate the local read-only book server, reload the latest HTML/PDF tabs, and verify:

- HTML title banner loads before the enlarged title;
- all 15 chapter images load with zero broken images and proportional dimensions;
- all Mermaid images have `.book-diagram`, fit the content width, and have `max-height: 70vh`;
- no decorative chapter captions or removed chapter-number elements are visible;
- the current PDF tab reports the same page count as `pdfinfo`.

Mark the final HTML and PDF tabs deliverable so they remain open for the user.

- [ ] **Step 7: Run the repository-wide quality gate**

Run:

```bash
npm run quality
```

Expected: formatting, every lint/policy check, and all fast-lane test files PASS.

- [ ] **Step 8: Commit any verification-driven correction**

If Steps 3-7 required source corrections, stage only the exact corrected source/test files and commit:

```bash
git diff --check
git status --short
git add docs/articles/assets/book/book.css docs/articles/assets/book/chapter-openers.tex docs/articles/book-publishing-guide.md cspell-dictionary.txt scripts/articles/compose-book.mjs scripts/articles/lib/book/chapter-openers.mjs scripts/articles/lib/book/diagrams.mjs scripts/articles/lib/book/manuscript.mjs scripts/articles/lib/book/render.mjs scripts/articles/lib/book/toolchain.mjs scripts/tests/unit/articles/lib/book/chapter-openers.test.mjs scripts/tests/unit/articles/lib/book/corpus.test.mjs scripts/tests/unit/articles/lib/book/diagrams.test.mjs scripts/tests/unit/articles/lib/book/manuscript.test.mjs scripts/tests/unit/articles/lib/book/render.test.mjs scripts/tests/unit/articles/lib/book/toolchain.test.mjs
git commit -m "fix(book): finish layout verification"
```

If no correction was required, do not create an empty commit.

- [ ] **Step 9: Record the clean checkpoint and stop**

Stop the brainstorming companion server and move its generated session into the
ignored project scratch area so the mockups remain recoverable without dirtying
the worktree:

```bash
/Users/kpburson/.codex/skills/brainstorming/scripts/stop-server.sh .superpowers/brainstorm/21180-1787718229
mkdir -p .tmp/brainstorm-archive
test ! -e .tmp/brainstorm-archive/book-layout-polish-21180-1787718229
mv .superpowers/brainstorm/21180-1787718229 .tmp/brainstorm-archive/book-layout-polish-21180-1787718229
rmdir .superpowers/brainstorm .superpowers 2>/dev/null || true
```

Expected: the server stops; the mockups remain beneath ignored `.tmp/`; no
`.superpowers/` entry remains in `git status`.

Run:

```bash
git status --short
git rev-parse HEAD
git rev-parse origin/trunk
git merge-base origin/trunk HEAD
git rev-list --left-right --count origin/trunk...HEAD
git log --oneline --decorate -12
git diff --stat origin/trunk...HEAD
```

Expected: clean tracked source state; exact final SHA recorded; existing two-sided trunk divergence reported without changing history. Stop before any extraction, rebase, push, merge, or worktree cleanup.
