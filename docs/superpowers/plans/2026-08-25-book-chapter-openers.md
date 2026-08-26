# Book Chapter Openers Implementation Plan

<!-- cspell:words addcontentsline adjustbox bookchapter graphicx markboth paperheight pasteable pdftotext pdfinfo phantomsection readlink refstepcounter textwidth -->

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render every book chapter on a fresh image-led page with centered
chapter metadata and preserve same-page PDF citation footnotes.

**Architecture:** Extend the shared article parser with non-destructive subtitle
metadata, then keep all book-only opener behavior in a focused
`chapter-openers.mjs` module. Manuscript assembly emits semantic HTML/EPUB and
reviewable Markdown openers, while PDF uses a small native LaTeX macro; the CLI
validates and stages images before invoking Pandoc.

**Tech Stack:** Node.js 22 ESM, `node:test`, Pandoc, XeLaTeX/latexmk,
`graphicx`, `adjustbox`, CSS, Markdown, Prettier, ESLint, CSpell,
markdownlint-cli2.

## Global Constraints

- Work only in
  `/Users/kpburson/projects/Vibe-Coding/ai-task-manager/.claude/worktrees/articles-book-publication-6a7dfe`.
- This is a chore: do not create or bind a GitHub issue and do not add story IDs
  to commit subjects.
- Seed the worktree and verify `node_modules/ai-task-manager -> ..` before tests.
- Do not alter article prose, titles, subtitles, or citations.
- Preserve LinkedIn publisher behavior; `parseArticle().sections` must retain
  the subtitle line.
- Keep source files immutable during publication; generated assets belong under
  `.tmp/book/` or an explicit `--out` directory.
- Header images fill `\textwidth` and 20% of physical page height, preserve
  aspect ratio, and center-crop overflow.
- PDF footnotes remain at the bottom of the page containing their citation.
- Chapter 5 uses a documented copy of Chapter 6's image until the author
  replaces `article-05-header.png`.
- Add no npm dependencies.
- Every new test begins with `// @chore` and receives a deterministic
  post-snapshot membership record.
- Run the focused test after every red/green step and commit each completed
  task separately.
- Finish this plan before executing
  `docs/superpowers/plans/2026-08-25-writing-studio-extraction.md`.

---

### Task 1: Capture subtitles without changing article publication

**Files:**

- Modify: `scripts/articles/lib/parse-article.mjs`
- Modify: `scripts/tests/unit/articles/publish-articles.test.mjs`
- Modify: `docs/articles/05-easy-come-easy-go.md`
- Create: `docs/articles/assets/article-headers/article-05-header.png`

**Interfaces:**

- Consumes: an article H1, optional `assets/article-headers/*.png` banner, and
  preamble lines.
- Produces: `parseArticle(source, options) -> {title, subtitle, bannerPath,
sections}` while retaining the subtitle line inside `sections`.

- [ ] **Step 1: Seed and verify the worktree**

Run:

```bash
node scripts/dev-env/seed-worktree.mjs
node scripts/dev-env/verify-local-worktree.mjs
test "$(readlink node_modules/ai-task-manager)" = ".."
git status --short
```

Expected: verification passes, the self-link is `..`, and status contains only
the already approved documentation changes.

- [ ] **Step 2: Add failing subtitle-parser tests**

In `scripts/tests/unit/articles/publish-articles.test.mjs`, extend the existing
parser test with:

```js
assert.equal(parsed.subtitle, 'A Strong Subtitle');
assert.ok(
  parsed.sections[0].lines.includes('**A Strong Subtitle**'),
  'shared parsing leaves the subtitle available to LinkedIn publication'
);
```

Ensure its fixture contains `**A Strong Subtitle**` in the preamble. Add:

```js
test('parseArticle rejects multiple preamble subtitles', () => {
  assert.throws(
    () => parseArticle('# T\n\n**First**\n\n**Second**\n\n## Body\n\nText.\n'),
    /more than one preamble subtitle/
  );
});

test('bold prose after the first H2 is not chapter subtitle metadata', () => {
  const parsed = parseArticle('# T\n\n## Body\n\n**Bold prose.**\n');
  assert.equal(parsed.subtitle, null);
});
```

- [ ] **Step 3: Run the parser tests and verify red**

Run:

```bash
node --test scripts/tests/unit/articles/publish-articles.test.mjs
```

Expected: FAIL because `subtitle` is missing and duplicate preamble subtitles
are not rejected.

- [ ] **Step 4: Implement non-destructive subtitle capture**

In `parse-article.mjs`, add:

```js
const SUBTITLE_RE = /^\*\*(.+)\*\*$/;
```

Track `subtitle = null`. While outside a fence and before the first `##`, match
standalone bold lines. On a second match throw:

```js
throw new Error('article has more than one preamble subtitle');
```

Assign the trimmed capture to `subtitle` but continue pushing the original line
into the current section. Return `subtitle` beside `title` and `bannerPath`, and
update the JSDoc return type.

- [ ] **Step 5: Add the approved Chapter 5 placeholder**

Run:

```bash
cp docs/articles/assets/article-headers/article-06-header.png docs/articles/assets/article-headers/article-05-header.png
cmp docs/articles/assets/article-headers/article-05-header.png docs/articles/assets/article-headers/article-06-header.png
```

In `05-easy-come-easy-go.md`, replace the obsolete no-artwork comment with:

```markdown
<!-- TEMPORARY ARTWORK: article-05-header.png intentionally duplicates article-06-header.png. Replace that one file when final Chapter 5 artwork is ready. -->
```

Add beneath the subtitle:

```markdown
![Regeneration Is Cheap. Hardening Isn't. Guess Which One Gets Skipped.](assets/article-headers/article-05-header.png)
```

- [ ] **Step 6: Verify parser and publisher behavior**

Run:

```bash
node --test scripts/tests/unit/articles/publish-articles.test.mjs
npm run publish:articles -- --skip-diagrams
git diff --exit-code -- docs/articles ':!docs/articles/05-easy-come-easy-go.md' ':!docs/articles/assets/article-headers/article-05-header.png'
```

Expected: tests pass; publication succeeds; no source article other than the
approved Chapter 5 placeholder change is modified.

- [ ] **Step 7: Commit**

```bash
git add scripts/articles/lib/parse-article.mjs scripts/tests/unit/articles/publish-articles.test.mjs docs/articles/05-easy-come-easy-go.md docs/articles/assets/article-headers/article-05-header.png
git commit -m "feat(book): capture chapter opener metadata"
```

---

### Task 2: Build and validate chapter-opener metadata

**Files:**

- Create: `scripts/articles/lib/book/chapter-openers.mjs`
- Create: `scripts/tests/unit/articles/lib/book/chapter-openers.test.mjs`
- Create: `scripts/tests/fixtures/test-corpus-post-snapshot/unit/articles/lib/book/chapter-openers.test.mjs.json`

**Interfaces:**

- Consumes: `articlesDir`, planned chapters whose first member exposes
  `{slug, title, subtitle, bannerPath}`, and `outDir`.
- Produces:
  `planChapterImages({articlesDir, chapters, outDir}) -> StagedImage[]`,
  `stageChapterImages(plan) -> Promise<void>`,
  `escapeLatex(value) -> string`, and
  `chapterOpenerFor({target, chapter, imageName, subtitle}) -> string[]`.

- [ ] **Step 1: Write failing pure-unit tests**

Create the test with `// @chore` on line 1. Cover:

```js
assert.equal(escapeLatex('A & B_1'), 'A \\& B\\_1');

assert.deepEqual(
  chapterOpenerFor({
    target: 'manuscript',
    chapter: { number: 2, title: 'Title' },
    imageName: 'chapter-02-header.png',
    subtitle: 'Subtitle',
  }),
  [
    '![Chapter 2 header](chapter-02-header.png)',
    '',
    '<div align="center">Chapter 2</div>',
    '',
    '# Title',
    '',
    '<div align="center">Subtitle</div>',
    '',
  ]
);
```

Assert the PDF form contains exactly one `\\bookchapter{...}` line, HTML/EPUB
forms contain one `.chapter-opener` fenced division, and a two-member merged
chapter produces only the first member's image plan.

Use an isolated fixture to assert:

- `article-01-header.png` maps to `chapter-01-header.png`;
- missing, non-PNG, absolute, and `../` banner paths throw;
- no files are copied when any planned input is invalid; and
- staging the validated plan copies byte-identical images.

- [ ] **Step 2: Add the membership receipt and verify red**

Create:

```json
{
  "schema": 1,
  "path": "scripts/tests/unit/articles/lib/book/chapter-openers.test.mjs"
}
```

Run:

```bash
node --test scripts/tests/unit/articles/lib/book/chapter-openers.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `chapter-openers.mjs`.

- [ ] **Step 3: Implement the focused module**

Use `path.resolve()` plus `path.relative()` containment checks. Require source
paths to match:

```js
const BOOK_BANNER_RE = /^assets\/article-headers\/[^/]+\.png$/;
```

Return one immutable plan item per chapter:

```js
{
  chapter: chapter.number,
  sourcePath: absoluteSource,
  imageName: `chapter-${String(chapter.number).padStart(2, '0')}-header.png`,
  outputPath: path.join(outDir, imageName),
}
```

Validate every item and duplicate output name before `stageChapterImages()`
calls `copyFile`. Escape LaTeX special characters with a fixed character map;
do not invoke shell escaping.

For HTML/EPUB, emit a fenced `chapter-opener` division with DOM order H1,
image, number, subtitle and class names that CSS can reorder. For PDF emit only
the native macro. For manuscript emit the reviewable visual order shown in the
test.

- [ ] **Step 4: Run focused tests and registry guard**

```bash
node --test scripts/tests/unit/articles/lib/book/chapter-openers.test.mjs scripts/tests/unit/meta/test-corpus-membership.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/articles/lib/book/chapter-openers.mjs scripts/tests/unit/articles/lib/book/chapter-openers.test.mjs scripts/tests/fixtures/test-corpus-post-snapshot/unit/articles/lib/book/chapter-openers.test.mjs.json
git commit -m "feat(book): define chapter opener component"
```

---

### Task 3: Integrate openers into manuscript assembly

**Files:**

- Modify: `scripts/articles/lib/book/manuscript.mjs`
- Modify: `scripts/tests/unit/articles/lib/book/manuscript.test.mjs`
- Modify: `scripts/tests/unit/articles/lib/book/corpus.test.mjs`

**Interfaces:**

- Consumes: Task 1 parser metadata and Task 2 opener functions.
- Produces: `buildManuscript()` result with `chapterImages` and exactly one
  target-specific opener per planned chapter.

- [ ] **Step 1: Write failing manuscript assertions**

Update both article fixtures to carry explicit subtitles. Assert that a
merged two-article fixture:

- has one opener, not two;
- uses the first article's banner and subtitle;
- does not repeat either subtitle in prose;
- returns one `chapterImages` plan description; and
- preserves existing chapter counts, footnotes, sources, and index terms.

For each target assert:

```js
assert.equal((markdown.match(/bookchapter/g) || []).length, target === 'pdf' ? 1 : 0);
assert.equal(
  (markdown.match(/chapter-opener/g) || []).length,
  ['html', 'epub'].includes(target) ? 1 : 0
);
```

The corpus test must assert 15 openers and 15 image descriptions.

- [ ] **Step 2: Run manuscript tests and verify red**

```bash
node --test scripts/tests/unit/articles/lib/book/manuscript.test.mjs scripts/tests/unit/articles/lib/book/corpus.test.mjs
```

Expected: FAIL because opener metadata is not integrated.

- [ ] **Step 3: Integrate opener metadata**

In `loadArticle()`, retain `subtitle` and `bannerPath`. Fail with the article
filename when either is missing. Remove only the captured subtitle line from
the book preamble after `applyBookStrip()`; do not modify parsed sections before
the LinkedIn path sees them.

Before each chapter body, call `chapterOpenerFor()` using its first member. Do
not push the previous H1 separately. Return `chapterImages` beside `diagrams`.
Reset the per-article demotion state exactly where it is reset today.

- [ ] **Step 4: Run focused book tests**

```bash
node --test scripts/tests/unit/articles/lib/book/chapter-openers.test.mjs scripts/tests/unit/articles/lib/book/manuscript.test.mjs scripts/tests/unit/articles/lib/book/corpus.test.mjs
```

Expected: PASS with 15 live-corpus openers.

- [ ] **Step 5: Commit**

```bash
git add scripts/articles/lib/book/manuscript.mjs scripts/tests/unit/articles/lib/book/manuscript.test.mjs scripts/tests/unit/articles/lib/book/corpus.test.mjs
git commit -m "feat(book): compose image-led chapter openers"
```

---

### Task 4: Stage opener assets atomically from the CLI

**Files:**

- Modify: `scripts/articles/compose-book.mjs`
- Modify: `scripts/tests/unit/articles/lib/book/chapter-openers.test.mjs`
- Modify: `scripts/tests/unit/articles/lib/book/render.test.mjs`

**Interfaces:**

- Consumes: `buildManuscript().chapterImages` and the selected output root.
- Produces: deterministic staged PNGs and `book.css` beside each target
  manuscript before Pandoc resolves them.

- [ ] **Step 1: Add a failing CLI-level staging test**

Extract a testable `composeTarget(options)` function if needed. Inject or
fixture the build and assert staging occurs before render. Assert `manuscript`
also stages its images so the generated Markdown has working relative links.

- [ ] **Step 2: Run the focused test and verify red**

```bash
node --test scripts/tests/unit/articles/lib/book/chapter-openers.test.mjs scripts/tests/unit/articles/lib/book/render.test.mjs
```

Expected: FAIL because the CLI does not stage chapter images.

- [ ] **Step 3: Stage the validated batch**

Import `planChapterImages` and `stageChapterImages`. Build and validate the full
plan before writing the target manuscript. Stage images once per CLI run, even
when multiple targets are requested. Copy
`docs/articles/assets/book/book.css` to `book.css` inside the selected output
directory after validating its source and before Pandoc runs. Leave diagram
staging unchanged.

- [ ] **Step 4: Verify generated Markdown assets**

```bash
rm -rf .tmp/book-opener-check
npm run book -- --target manuscript --out .tmp/book-opener-check
test "$(find .tmp/book-opener-check -maxdepth 1 -name 'chapter-*-header.png' | wc -l | tr -d ' ')" = 15
test -s .tmp/book-opener-check/manuscript.md
test -s .tmp/book-opener-check/book.css
```

Expected: 15 staged images and a non-empty manuscript.

- [ ] **Step 5: Commit**

```bash
git add scripts/articles/compose-book.mjs scripts/tests/unit/articles/lib/book/chapter-openers.test.mjs scripts/tests/unit/articles/lib/book/render.test.mjs
git commit -m "feat(book): stage chapter opener assets"
```

---

### Task 5: Add PDF and reflowable-edition presentation assets

**Files:**

- Create: `docs/articles/assets/book/chapter-openers.tex`
- Create: `docs/articles/assets/book/book.css`
- Modify: `scripts/articles/lib/book/render.mjs`
- Modify: `scripts/tests/unit/articles/lib/book/render.test.mjs`

**Interfaces:**

- Consumes: PDF `\bookchapter{image}{title}{subtitle}` lines and
  HTML/EPUB `.chapter-opener` markup.
- Produces: Pandoc invocations that include the LaTeX partial for PDF and the
  stylesheet for HTML/EPUB.

- [ ] **Step 1: Add failing render-argument tests**

Assert PDF args contain:

```text
--include-in-header=/repo/docs/articles/assets/book/chapter-openers.tex
```

Assert HTML and EPUB args contain:

```text
--css=book.css
```

Assert the manuscript target never invokes Pandoc.

- [ ] **Step 2: Run render tests and verify red**

```bash
node --test scripts/tests/unit/articles/lib/book/render.test.mjs
```

Expected: FAIL because the presentation assets are not wired.

- [ ] **Step 3: Create the LaTeX chapter command**

The partial must load `adjustbox` and define one `\bookchapter` command. Its
body must use `\clearpage`, `\refstepcounter{chapter}`, `\phantomsection`,
`\addcontentsline`, `\markboth`, and `\thispagestyle{plain}`. Render the image
with an `adjustbox` minimum-size/clip container that preserves aspect ratio,
fills `\textwidth` by `0.2\paperheight`, and centers overflow. Center Chapter
number, title, and italic subtitle, then restore normal paragraph flow.

- [ ] **Step 4: Create the HTML/EPUB stylesheet**

Define `.chapter-opener` as a vertical flex container with print page-break
properties. Assign explicit `order` values so the image is visually first even
though the semantic H1 remains first in document order. Use:

```css
.chapter-opener .chapter-image img {
  display: block;
  width: 100%;
  height: 20vh;
  object-fit: cover;
  object-position: center;
}
```

Under `@media print`, use a `2.2in` image height for letter paper, prevent
breaks inside the opener, and keep prose in normal flow. Center number, H1, and
subtitle; do not style body paragraphs globally.

- [ ] **Step 5: Wire render arguments and verify**

Add the target-specific arguments in `pandocArgs()`. Run:

```bash
node --test scripts/tests/unit/articles/lib/book/render.test.mjs
npx prettier --check docs/articles/assets/book/book.css scripts/articles/lib/book/render.mjs scripts/tests/unit/articles/lib/book/render.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add docs/articles/assets/book/chapter-openers.tex docs/articles/assets/book/book.css scripts/articles/lib/book/render.mjs scripts/tests/unit/articles/lib/book/render.test.mjs
git commit -m "feat(book): style chapter opening pages"
```

---

### Task 6: Extend PDF diagnostics for the opener dependency

**Files:**

- Modify: `scripts/articles/lib/book/toolchain.mjs`
- Modify: `scripts/tests/unit/articles/lib/book/toolchain.test.mjs`
- Modify: `docs/articles/book-publishing-guide.md`

**Interfaces:**

- Consumes: the existing package-probe list.
- Produces: a doctor report that names `adjustbox` in its pasteable `tlmgr`
  command when missing.

- [ ] **Step 1: Add the failing package-probe assertion**

```js
assert.ok(PROBE_PACKAGES.includes('adjustbox'));
```

Also assert a failed injected probe yields:

```text
sudo tlmgr install adjustbox
```

- [ ] **Step 2: Verify red, implement, and verify green**

```bash
node --test scripts/tests/unit/articles/lib/book/toolchain.test.mjs
```

Add `adjustbox` to `PROBE_PACKAGES`, rerun the test, then run:

```bash
npm run doctor:book
```

If the doctor reports it missing, run the exact printed `sudo tlmgr install ...`
command in the user's Terminal and rerun until complete. Do not guess package
names.

- [ ] **Step 3: Document the layout-specific dependency**

Update the guide to state that `doctor:book` checks the chapter-opener package
and that PDF citations are same-page footnotes. Keep HTML/EPUB instructions
unchanged.

- [ ] **Step 4: Commit**

```bash
git add scripts/articles/lib/book/toolchain.mjs scripts/tests/unit/articles/lib/book/toolchain.test.mjs docs/articles/book-publishing-guide.md
git commit -m "docs(book): verify chapter opener toolchain"
```

---

### Task 7: Prove live-corpus and LinkedIn compatibility

**Files:**

- Modify: `scripts/tests/unit/articles/lib/book/corpus.test.mjs`
- Modify: `scripts/tests/unit/articles/publish-articles.test.mjs`
- Modify: `scripts/tests/unit/articles/lib/book/footnotes.test.mjs`

**Interfaces:**

- Consumes: all 15 live spine articles and both publication paths.
- Produces: regression evidence for complete opener metadata and unchanged note
  conversion.

- [ ] **Step 1: Add live-corpus invariants**

For every spine entry, assert `parseArticle(...).subtitle` is non-empty,
`bannerPath` matches the header path contract, and the resolved file exists.
Assert the four manuscript targets each report 15 chapters and 15 opener image
descriptions.

- [ ] **Step 2: Add note and publisher invariants**

Retain the existing assertion that images are not converted to footnotes. Add a
fixture proving the captured subtitle still appears in LinkedIn output exactly
once and a PDF manuscript retains its citation footnote definition after a
native chapter opener.

- [ ] **Step 3: Run focused and full book tests**

```bash
node --test scripts/tests/unit/articles/publish-articles.test.mjs scripts/tests/unit/articles/lib/book/*.test.mjs
```

Expected: all publisher and book unit tests pass.

- [ ] **Step 4: Commit**

```bash
git add scripts/tests/unit/articles/lib/book/corpus.test.mjs scripts/tests/unit/articles/publish-articles.test.mjs scripts/tests/unit/articles/lib/book/footnotes.test.mjs
git commit -m "test(book): prove chapter opener corpus"
```

---

### Task 8: Build and inspect every edition

**Files:**

- Generated only: `.tmp/book/**`
- Modify only if verification reveals a defect: files owned by Tasks 1-7

**Interfaces:**

- Consumes: the completed implementation and installed Pandoc/LaTeX toolchain.
- Produces: verified Markdown, HTML, EPUB, and PDF plus visual inspection
  evidence.

- [ ] **Step 1: Run formatting and focused verification**

```bash
npx prettier --write scripts/articles scripts/tests/unit/articles docs/articles/05-easy-come-easy-go.md docs/articles/book-publishing-guide.md docs/articles/assets/book/book.css
npm run lint:book-markers
node --test scripts/tests/unit/articles/publish-articles.test.mjs scripts/tests/unit/articles/lib/book/*.test.mjs
git diff --check
```

Expected: all checks pass.

- [ ] **Step 2: Build all targets from a clean output directory**

```bash
rm -rf .tmp/book
npm run doctor:book
npm run book
test -s .tmp/book/manuscript.md
test -s .tmp/book/book.html
test -s .tmp/book/book.epub
test -s .tmp/book/book.pdf
unzip -t .tmp/book/book.epub
```

Expected: four targets build, EPUB integrity passes, and 15 staged chapter
images exist.

- [ ] **Step 3: Verify document structure**

```bash
pdfinfo .tmp/book/book.pdf
pdftotext -layout .tmp/book/book.pdf .tmp/book/book.txt
rg -n "Chapter 1|Chapter 5|Chapter 15" .tmp/book/book.txt
rg -n "chapter-opener|chapter-01-header|chapter-15-header" .tmp/book/book.html
```

Expected: all chapters and opener assets are represented; the PDF has no
missing-page or extraction failure.

- [ ] **Step 4: Perform PDF visual QA**

Use the PDF skill. Render the title page, Chapters 1, 5, and 15 openers, a page
with multiple footnotes, and both sides of at least one chapter transition.
Inspect the PNGs for centered crop, full printable width, 20% image height,
centered metadata, readable wrapping, prose flow, same-page footnotes, running
heads, page numbers, blank pages, clipping, and overlaps.

Expected: zero visual defects. If a defect appears, add the narrowest failing
test, fix it, rerun all of Task 8, and reinspect.

- [ ] **Step 5: Inspect HTML and EPUB behavior**

Open `.tmp/book/book.html` in the in-app browser and inspect Chapters 1, 5, and
15 at desktop width and print preview. Open the EPUB in an available reader or
inspect its XHTML spine entries to confirm each chapter's image remains in the
same spine document as its heading.

- [ ] **Step 6: Run the repository quality gate**

```bash
npm run quality
git status --short
```

Expected: quality passes; only intended source and documentation changes are
tracked; generated `.tmp/book/**` remains ignored.

- [ ] **Step 7: Commit any verification-driven corrections**

If Task 8 required source corrections:

Inspect `git status --short`, then run `git add --` separately for each corrected
file, limited to the explicit Task 1-7 file lists. Verify the staged names with
`git diff --cached --name-only`, then run:

```bash
git commit -m "fix(book): polish chapter opening pages"
```

Otherwise do not create an empty commit.

---

### Task 9: Hand off to writing-studio extraction

**Files:**

- Verify: `docs/superpowers/specs/2026-08-25-writing-studio-extraction-design.md`
- Verify: `docs/superpowers/plans/2026-08-25-writing-studio-extraction.md`

**Interfaces:**

- Consumes: a clean, fully verified book-formatting branch.
- Produces: immutable source SHA and evidence for the extraction session.

- [ ] **Step 1: Record the exact source state**

```bash
git status --short
git rev-parse HEAD
git log --oneline --decorate -12
git diff origin/trunk...HEAD --stat
```

Expected: clean status and all chapter-opener commits visible.

- [ ] **Step 2: Confirm extraction coverage**

Verify the extraction plan filters and moves both:

```text
docs/superpowers/specs/2026-08-25-book-chapter-openers-design.md
docs/superpowers/plans/2026-08-25-book-chapter-openers.md
```

Confirm all implementation files are beneath already selected
`docs/articles/**`, `scripts/articles/**`, or dedicated book-test paths.

- [ ] **Step 3: Stop and report**

Report the PDF path, page count, representative visual-QA results, final source
SHA, and confirmation that the writing-studio extraction is the next plan. Do
not start extraction from this session unless the user explicitly asks.
