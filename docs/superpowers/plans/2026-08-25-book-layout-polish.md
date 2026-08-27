# Book Layout Polish Implementation Plan

<!-- cspell:words bfseries bookchapterheader booksubtitle dimexpr fancyfoot fancyhead fancyhdr fancyhf fancypagestyle footrulewidth headrulewidth ifdim ifnum includegraphics itshape makeatletter makeatother makebox maketitle pagestyle pandocbounded pdfinfo pdfs pdftoppm Poppler providecommand renewcommand scshape selectfont tempa tempb textheight texmf thechapter thepage titlepage tlpdb tlpkg usebox usermode usertree -->

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish every book edition with a banner-first title page, proportional uncropped chapter artwork, chapter-number headers, right-aligned footer page numbers, and bounded Mermaid diagrams.

**Architecture:** Keep article sources unchanged and extend the existing book-presentation boundary. A validated tracked title asset and semantic diagram class flow through the composer; the selected LaTeX header owns fixed-layout PDF behavior, while the shared stylesheet and Pandoc arguments own HTML/EPUB presentation.

**Tech Stack:** Node.js 22 ES modules, `node:test`, Pandoc, XeLaTeX/latexmk, `adjustbox`, `fancyhdr`, Mermaid CLI, CSS, Poppler, Prettier, ESLint, markdownlint-cli2, and CSpell.

## Global Constraints

- Work only in `/Users/kpburson/projects/Vibe-Coding/ai-task-manager/.claude/worktrees/articles-book-publication-6a7dfe` on branch `claude/articles-book-publication-6a7dfe`.
- Preserve article Markdown, citations, Mermaid source, and every original article-header PNG byte-for-byte.
- Create `docs/articles/assets/book/title-page.png` as a byte-identical copy of `docs/articles/assets/article-headers/article-07-header.png`; future replacement remains a one-file operation.
- The title page is unnumbered, places the full placeholder image above a 34-point title, and keeps the existing subtitle and author metadata.
- Numbered front matter has no chapter header and uses a right-aligned footer page number.
- Every numbered chapter page, including opener pages, has a left-aligned `Chapter N` header and a right-aligned footer page number.
- Chapter artwork and Mermaid diagrams remain uncropped and proportional.
- PDF Mermaid diagrams fit within `\linewidth` and 70 percent of `\textheight`; HTML/EPUB diagrams fit within the content width and 70 percent of viewport height.
- Do not rebase, merge, push, extract the writing studio, change remote state, or delete the linked worktree.
- Do not commit `.tmp/**`, `tmp/pdfs/**`, or `.superpowers/**`.
- Before the first PDF authoring edit, run the PDF artifact-operation marker exactly once for this implementation run.

---

## File Structure

### Create

- `docs/articles/assets/book/title-page.png` — tracked replaceable title-page artwork; initially Chapter 7's exact bytes.

### Modify

- `scripts/articles/lib/book/chapter-openers.mjs` — plan, validate, and stage the title image; retain chapter-image staging.
- `scripts/articles/compose-book.mjs` — stage the title image once with chapter images and CSS before any target renders.
- `scripts/articles/lib/book/diagrams.mjs` — emit a semantic `book-diagram` class on generated Mermaid image references.
- `scripts/articles/lib/book/chapter-openers.mjs` — remove the centered chapter-number line from rendered opener markup.
- `docs/articles/assets/book/chapter-openers.tex` — custom title page, proportional chapter artwork, page styles, and PDF body-image bounds.
- `docs/articles/assets/book/book.css` — proportional title/chapter images and bounded reflowable diagrams.
- `scripts/articles/lib/book/render.mjs` — package the title image as the EPUB cover.
- `scripts/articles/lib/book/toolchain.mjs` — probe `fancyhdr` as a PDF dependency.
- `docs/articles/book-publishing-guide.md` — document the title asset, proportional artwork, page chrome, diagram bounds, and package requirement.
- `cspell-dictionary.txt` — accept the exact new TeX vocabulary used in JavaScript and Markdown.

### Test

- `scripts/tests/unit/articles/lib/book/chapter-openers.test.mjs` — title-image validation/staging and opener semantics.
- `scripts/tests/unit/articles/lib/book/diagrams.test.mjs` — semantic Mermaid class.
- `scripts/tests/unit/articles/lib/book/render.test.mjs` — selected-header, CSS, staging, and Pandoc argument contracts.
- `scripts/tests/unit/articles/lib/book/corpus.test.mjs` — live title asset and no centered chapter-number regression.
- `scripts/tests/unit/articles/lib/book/toolchain.test.mjs` — `fancyhdr` doctor coverage.

---

### Task 1: Add and stage the replaceable title-page image

**Files:**

- Create: `docs/articles/assets/book/title-page.png`
- Modify: `scripts/articles/lib/book/chapter-openers.mjs:3-111`
- Modify: `scripts/articles/compose-book.mjs:10-77`
- Test: `scripts/tests/unit/articles/lib/book/chapter-openers.test.mjs:1-158`
- Test: `scripts/tests/unit/articles/lib/book/render.test.mjs:1-166`
- Test: `scripts/tests/unit/articles/lib/book/corpus.test.mjs:14-45`

**Interfaces:**

- Consumes: `bookDir`, `outDir`, and the tracked `bookDir/title-page.png` file.
- Produces: `planTitleImage({ bookDir, outDir }) -> Readonly<{sourcePath: string, imageName: 'title-page.png', outputPath: string}>` and `stageTitleImage(plan) -> Promise<void>`.
- Produces: a staged `outDir/title-page.png` before manuscript writing or Pandoc execution.

- [ ] **Step 1: Verify the linked worktree and mark the PDF edit operation**

Run:

```bash
pwd
git branch --show-current
git status --short
git rev-parse HEAD
node /Users/kpburson/.codex/plugins/cache/openai-primary-runtime/pdf/26.819.11345/skills/pdf/container_tools/mark_artifact_operation_started.mjs --operation-kind edit --expected-output-count 1 --output-format pdf
```

Expected: the exact worktree path and branch from Global Constraints; only `.superpowers/brainstorm/` may be untracked; the marker command succeeds once. Do not run the marker again during this implementation run.

- [ ] **Step 2: Write failing title-image planner and stager tests**

Add these tests to `chapter-openers.test.mjs`:

```js
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

test('planTitleImage stages a readable PNG under a stable replaceable name', async () => {
  const root = await mkdtemp(path.join(projectScratchDir('test'), 'title-image-'));
  const bookDir = path.join(root, 'book');
  const outDir = path.join(root, 'out');
  try {
    await mkdir(bookDir, { recursive: true });
    await writeFile(path.join(bookDir, 'title-page.png'), PNG_SIGNATURE);
    const plan = planTitleImage({ bookDir, outDir });
    assert.deepEqual(plan, {
      sourcePath: path.join(bookDir, 'title-page.png'),
      imageName: 'title-page.png',
      outputPath: path.join(outDir, 'title-page.png'),
    });
    await stageTitleImage(plan);
    assert.deepEqual(await readFile(plan.outputPath), PNG_SIGNATURE);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('stageTitleImage rejects missing or non-PNG input before copying', async () => {
  const root = await mkdtemp(path.join(projectScratchDir('test'), 'title-image-invalid-'));
  const bookDir = path.join(root, 'book');
  const outDir = path.join(root, 'out');
  try {
    await mkdir(bookDir, { recursive: true });
    assert.throws(() => planTitleImage({ bookDir, outDir }), /cannot read title image/);
    await writeFile(path.join(bookDir, 'title-page.png'), 'not a png');
    const plan = planTitleImage({ bookDir, outDir });
    await assert.rejects(stageTitleImage(plan), /invalid PNG signature/);
    assert.deepEqual(await readdir(outDir).catch(() => []), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

Import `planTitleImage` and `stageTitleImage` from `chapter-openers.mjs`.

- [ ] **Step 3: Run the tests to verify they fail for the missing exports**

Run:

```bash
node --test scripts/tests/unit/articles/lib/book/chapter-openers.test.mjs
```

Expected: FAIL because `planTitleImage` and `stageTitleImage` are not exported.

- [ ] **Step 4: Implement title-image planning and PNG-signature validation**

In `chapter-openers.mjs`, add `open` to the promise imports and add:

```js
const TITLE_IMAGE_NAME = 'title-page.png';
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function planTitleImage({ bookDir, outDir }) {
  const bookRoot = path.resolve(bookDir);
  const sourcePath = path.resolve(bookRoot, TITLE_IMAGE_NAME);
  assertContained(bookRoot, sourcePath, 'title image');
  try {
    accessSync(sourcePath, constants.R_OK);
  } catch {
    throw new Error(`cannot read title image: ${TITLE_IMAGE_NAME}`);
  }
  return Object.freeze({
    sourcePath,
    imageName: TITLE_IMAGE_NAME,
    outputPath: path.join(path.resolve(outDir), TITLE_IMAGE_NAME),
  });
}

async function assertPngSignature(sourcePath) {
  const handle = await open(sourcePath, 'r');
  try {
    const signature = Buffer.alloc(PNG_SIGNATURE.length);
    const { bytesRead } = await handle.read(signature, 0, signature.length, 0);
    if (bytesRead !== PNG_SIGNATURE.length || !signature.equals(PNG_SIGNATURE)) {
      throw new Error('title image has an invalid PNG signature');
    }
  } finally {
    await handle.close();
  }
}

export async function stageTitleImage({ sourcePath, outputPath }) {
  await access(sourcePath, constants.R_OK);
  await assertPngSignature(sourcePath);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await copyFile(sourcePath, outputPath);
}
```

Change `assertContained()`'s error text from `escapes the article root` to `escapes the approved root`, because it now protects both article and book asset roots.

- [ ] **Step 5: Wire the title image into the one-time asset stager**

Update the imports and the body of `createAssetStager()` in `compose-book.mjs`:

```js
import {
  planChapterImages,
  planTitleImage,
  stageChapterImages,
  stageTitleImage,
} from './lib/book/chapter-openers.mjs';

export function createAssetStager({ articlesDir, bookDir, outDir }) {
  let staged = null;
  return (chapterImages) => {
    if (staged === null) {
      staged = (async () => {
        const cssPath = path.join(bookDir, 'book.css');
        const imagePlan = planChapterImages({ articlesDir, chapters: chapterImages, outDir });
        const titlePlan = planTitleImage({ bookDir, outDir });
        await access(cssPath, constants.R_OK);
        await stageChapterImages(imagePlan);
        await stageTitleImage(titlePlan);
        await copyFile(cssPath, path.join(outDir, 'book.css'));
      })();
    }
    return staged;
  };
}
```

Add `mkdir`, `readFile`, and `writeFile` to the promise imports and import
`createAssetStager`. Add this integration test to `render.test.mjs`:

```js
test('createAssetStager copies chapter, title, and CSS assets once', async () => {
  const root = await mkdtemp(path.join(projectScratchDir('test'), 'book-assets-'));
  const articlesDir = path.join(root, 'articles');
  const bookDir = path.join(articlesDir, 'assets', 'book');
  const headersDir = path.join(articlesDir, 'assets', 'article-headers');
  const outDir = path.join(root, 'out');
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  try {
    await mkdir(bookDir, { recursive: true });
    await mkdir(headersDir, { recursive: true });
    await writeFile(path.join(headersDir, 'article-01-header.png'), png);
    await writeFile(path.join(bookDir, 'title-page.png'), png);
    await writeFile(path.join(bookDir, 'book.css'), '.book {}\n');
    const stage = createAssetStager({ articlesDir, bookDir, outDir });
    await stage([
      {
        chapter: 1,
        slug: '01-first',
        bannerPath: 'assets/article-headers/article-01-header.png',
      },
    ]);
    assert.deepEqual(await readFile(path.join(outDir, 'chapter-01-header.png')), png);
    assert.deepEqual(await readFile(path.join(outDir, 'title-page.png')), png);
    assert.equal(await readFile(path.join(outDir, 'book.css'), 'utf8'), '.book {}\n');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

- [ ] **Step 6: Add the tracked placeholder and live-corpus equality test**

Run:

```bash
cp docs/articles/assets/article-headers/article-07-header.png docs/articles/assets/book/title-page.png
cmp docs/articles/assets/article-headers/article-07-header.png docs/articles/assets/book/title-page.png
```

Expected: `cmp` exits 0 with no output.

Add to `corpus.test.mjs`:

```js
test('the tracked title placeholder initially matches chapter seven artwork', async () => {
  const title = await readFile(path.join(BOOK_DIR, 'title-page.png'));
  const chapterSeven = await readFile(
    path.join(ARTICLES_DIR, 'assets', 'article-headers', 'article-07-header.png')
  );
  assert.deepEqual(title, chapterSeven);
});
```

Add `readFile` to the `node:fs/promises` import.

- [ ] **Step 7: Run focused tests and commit**

Run:

```bash
node --test scripts/tests/unit/articles/lib/book/chapter-openers.test.mjs scripts/tests/unit/articles/lib/book/render.test.mjs scripts/tests/unit/articles/lib/book/corpus.test.mjs
```

Expected: all focused tests PASS.

Commit:

```bash
git add docs/articles/assets/book/title-page.png scripts/articles/lib/book/chapter-openers.mjs scripts/articles/compose-book.mjs scripts/tests/unit/articles/lib/book/chapter-openers.test.mjs scripts/tests/unit/articles/lib/book/render.test.mjs scripts/tests/unit/articles/lib/book/corpus.test.mjs
git commit -m "feat(book): stage title page placeholder"
```

---

### Task 2: Remove centered chapter numbers and classify Mermaid diagrams

**Files:**

- Modify: `scripts/articles/lib/book/chapter-openers.mjs:26-54`
- Modify: `scripts/articles/lib/book/diagrams.mjs:24-57`
- Test: `scripts/tests/unit/articles/lib/book/chapter-openers.test.mjs:33-71`
- Test: `scripts/tests/unit/articles/lib/book/diagrams.test.mjs:9-33`
- Test: `scripts/tests/unit/articles/lib/book/corpus.test.mjs:131-167`

**Interfaces:**

- Consumes: existing `chapterOpenerFor()` target contract and extracted Mermaid fences.
- Produces: opener markup without `.chapter-number` or a centered `Chapter N` body line.
- Produces: generated Mermaid references shaped as `![](name.png){.book-diagram}`.

- [ ] **Step 1: Change tests to require the new semantic output**

Update the manuscript opener expectation to:

```js
[
  '![Chapter 2 header](chapter-02-header.png)',
  '',
  '# Title',
  '',
  '<div align="center">Subtitle</div>',
  '',
];
```

In the PDF/reflowable test, replace the chapter-number assertion with:

```js
assert.doesNotMatch(markdown, /chapter-number/);
assert.doesNotMatch(markdown, />Chapter 2</);
```

Update `diagrams.test.mjs` to expect:

```js
text('![](03-slug-diagram-1.png){.book-diagram}');
```

Update the live-corpus test to assert that EPUB and HTML contain no `chapter-number` class.

- [ ] **Step 2: Run the tests to verify the old markup fails**

Run:

```bash
node --test scripts/tests/unit/articles/lib/book/chapter-openers.test.mjs scripts/tests/unit/articles/lib/book/diagrams.test.mjs scripts/tests/unit/articles/lib/book/corpus.test.mjs
```

Expected: FAIL because openers still emit centered chapter numbers and Mermaid images lack the class.

- [ ] **Step 3: Make the minimal markup changes**

In `chapterOpenerFor()`, remove these manuscript entries:

```js
`<div align="center">Chapter ${number}</div>`,
'',
```

Remove this HTML/EPUB entry:

```js
`<div class="chapter-number">Chapter ${number}</div>`,
```

In `extractBookDiagrams()`, emit:

```js
items.push({ kind: 'text', text: `![](${imageName}){.book-diagram}` });
```

- [ ] **Step 4: Run the focused tests and commit**

Run:

```bash
node --test scripts/tests/unit/articles/lib/book/chapter-openers.test.mjs scripts/tests/unit/articles/lib/book/diagrams.test.mjs scripts/tests/unit/articles/lib/book/corpus.test.mjs
```

Expected: all focused tests PASS.

Commit:

```bash
git add scripts/articles/lib/book/chapter-openers.mjs scripts/articles/lib/book/diagrams.mjs scripts/tests/unit/articles/lib/book/chapter-openers.test.mjs scripts/tests/unit/articles/lib/book/diagrams.test.mjs scripts/tests/unit/articles/lib/book/corpus.test.mjs
git commit -m "feat(book): simplify opener semantics"
```

---

### Task 3: Add PDF page chrome and proportional chapter artwork

**Files:**

- Modify: `docs/articles/assets/book/chapter-openers.tex:1-27`
- Modify: `scripts/articles/lib/book/manuscript.mjs:181-195`
- Test: `scripts/tests/unit/articles/lib/book/render.test.mjs:18-64`
- Test: `scripts/tests/unit/articles/lib/book/manuscript.test.mjs:210-227`

**Interfaces:**

- Consumes: `\bookchapter{image}{title}{subtitle}`, LaTeX chapter counter, and `plain`/normal page styles.
- Produces: left `Chapter N` header on chapter pages, right footer page number on every numbered page, and uncropped proportional opener artwork.

- [ ] **Step 1: Replace the crop regression test with page-style and proportional-image tests**

Replace `the PDF center crop trims equal overflow from opposite edges` with:

```js
test('the PDF chapter image is proportional and never clipped', () => {
  const header = readFileSync(CHAPTER_HEADER, 'utf8');
  assert.match(header, /\\begin\{adjustbox\}\{max width=\{?\\textwidth\}?,center\}/);
  assert.doesNotMatch(header, /Clip=/);
  assert.doesNotMatch(header, /min size=/);
  assert.doesNotMatch(header, /\\large\\scshape Chapter \\thechapter/);
});

test('the PDF page styles put chapter numbers left and page numbers right', () => {
  const header = readFileSync(CHAPTER_HEADER, 'utf8');
  assert.match(header, /\\usepackage\{fancyhdr\}/);
  assert.match(header, /\\fancyhead\[L\]\{\\bookchapterheader\}/);
  assert.match(header, /\\fancyfoot\[R\]\{\\thepage\}/);
  assert.match(header, /\\fancypagestyle\{plain\}/);
  assert.match(header, /\\ifnum\\value\{chapter\}>0 Chapter \\thechapter\\fi/);
  assert.match(header, /\\renewcommand\{\\headrulewidth\}\{0pt\}/);
  assert.match(header, /\\renewcommand\{\\footrulewidth\}\{0pt\}/);
});
```

Extend the copyright-page test in `manuscript.test.mjs` with:

```js
assert.match(pdf.markdown, /\\thispagestyle\{plain\}/);
assert.equal(pdf.markdown.includes('\\thispagestyle{empty}'), false);
```

- [ ] **Step 2: Run the render test to verify the old crop and page style fail**

Run:

```bash
node --test scripts/tests/unit/articles/lib/book/render.test.mjs
```

Expected: FAIL because the header still contains `Clip=` and has no `fancyhdr` page style.

- [ ] **Step 3: Implement the shared normal/plain PDF page style**

Add after the package declarations in `chapter-openers.tex`:

```tex
\usepackage{fancyhdr}

\newcommand{\bookchapterheader}{%
  \ifnum\value{chapter}>0 Chapter \thechapter\fi
}

\pagestyle{fancy}
\fancyhf{}
\fancyhead[L]{\bookchapterheader}
\fancyfoot[R]{\thepage}
\renewcommand{\headrulewidth}{0pt}
\renewcommand{\footrulewidth}{0pt}

\fancypagestyle{plain}{%
  \fancyhf{}%
  \fancyhead[L]{\bookchapterheader}%
  \fancyfoot[R]{\thepage}%
  \renewcommand{\headrulewidth}{0pt}%
  \renewcommand{\footrulewidth}{0pt}%
}
```

This leaves the front-matter header blank while `chapter == 0`, keeps Roman/Arabic numbering chosen by the book class, and makes chapter-opening `plain` pages match normal pages.

- [ ] **Step 4: Replace the cropped opener image and body chapter number**

Replace the image block and centered number in `\bookchapter` with:

```tex
  \noindent
  \begin{adjustbox}{max width=\textwidth,center}
    \includegraphics{#1}%
  \end{adjustbox}
  \par\nobreak\vspace{1.4em}
  \begin{center}
    {\huge\bfseries #2\par}
    \vspace{0.7em}
    {\large\itshape #3\par}
  \end{center}
```

In `copyrightPage()` in `manuscript.mjs`, replace:

```js
'\\thispagestyle{empty}',
```

with:

```js
'\\thispagestyle{plain}',
```

This makes the copyright page use the same blank-header/right-footer front-matter style instead of suppressing its visible page number.

- [ ] **Step 5: Run the render and opener tests and commit**

Run:

```bash
node --test scripts/tests/unit/articles/lib/book/render.test.mjs scripts/tests/unit/articles/lib/book/chapter-openers.test.mjs scripts/tests/unit/articles/lib/book/manuscript.test.mjs
```

Expected: all focused tests PASS.

Commit:

```bash
git add docs/articles/assets/book/chapter-openers.tex scripts/articles/lib/book/manuscript.mjs scripts/tests/unit/articles/lib/book/render.test.mjs scripts/tests/unit/articles/lib/book/manuscript.test.mjs
git commit -m "style(book): add page headers and footers"
```

---

### Task 4: Build the PDF title page and bound body diagrams

**Files:**

- Modify: `docs/articles/assets/book/chapter-openers.tex:1-60`
- Test: `scripts/tests/unit/articles/lib/book/render.test.mjs:44-80`

**Interfaces:**

- Consumes: Pandoc's generated `\title`, `\subtitle`, `\author`, `\maketitle`, and `\pandocbounded` calls plus staged `title-page.png`.
- Produces: unnumbered banner-first title page and centered body images bounded to `\linewidth` by `0.7\textheight`.

- [ ] **Step 1: Write failing title-page and diagram-bound tests**

Add to `render.test.mjs`:

```js
test('the PDF title page is banner-first, unnumbered, and uses a 34-point title', () => {
  const header = readFileSync(CHAPTER_HEADER, 'utf8');
  assert.match(header, /\\providecommand\{\\subtitle\}\[1\]\{\\gdef\\booksubtitle\{#1\}\}/);
  assert.match(header, /\\renewcommand\{\\maketitle\}/);
  assert.match(header, /\\thispagestyle\{empty\}/);
  assert.match(header, /\\includegraphics\{title-page\.png\}/);
  assert.match(header, /\\fontsize\{34\}\{40\}\\selectfont\\bfseries \\@title/);
  assert.match(header, /\\booksubtitle/);
  assert.match(header, /\\@author/);
});

test('the PDF body-image wrapper centers and bounds diagrams to 70 percent of text height', () => {
  const header = readFileSync(CHAPTER_HEADER, 'utf8');
  assert.match(header, /\\renewcommand\*\\pandocbounded/);
  assert.match(header, /\.7\\textheight/);
  assert.match(header, /\\linewidth/);
  assert.match(header, /\\makebox\[\\linewidth\]\[c\]/);
});
```

- [ ] **Step 2: Run the render test to verify the missing title override fails**

Run:

```bash
node --test scripts/tests/unit/articles/lib/book/render.test.mjs
```

Expected: FAIL because the selected header has neither a custom `\maketitle` nor a narrowed `\pandocbounded` definition.

- [ ] **Step 3: Add the custom subtitle storage and title page**

Add this block before `\bookchapter`:

```tex
\makeatletter
\newcommand{\booksubtitle}{}
\providecommand{\subtitle}[1]{\gdef\booksubtitle{#1}}

\renewcommand{\maketitle}{%
  \begin{titlepage}
    \thispagestyle{empty}%
    \centering
    \begin{adjustbox}{max width=\textwidth,center}
      \includegraphics{title-page.png}%
    \end{adjustbox}
    \par\vspace{2em}
    {\fontsize{34}{40}\selectfont\bfseries \@title\par}
    \vspace{1em}
    {\Large \booksubtitle\par}
    \vfill
    {\large \@author\par}
  \end{titlepage}%
}
\makeatother
```

Pandoc's later `\providecommand{\subtitle}` leaves this definition intact, so `\subtitle{...}` stores metadata separately instead of appending it to `\@title`.

- [ ] **Step 4: Override Pandoc's body-image bound without touching title/chapter images**

Add after the title-page block:

```tex
\makeatletter
\renewcommand*\pandocbounded[1]{%
  \sbox\pandoc@box{#1}%
  \Gscale@div\@tempa{.7\textheight}{\dimexpr\ht\pandoc@box+\dp\pandoc@box\relax}%
  \Gscale@div\@tempb{\linewidth}{\wd\pandoc@box}%
  \ifdim\@tempb\p@<\@tempa\p@\let\@tempa\@tempb\fi
  \makebox[\linewidth][c]{%
    \ifdim\@tempa\p@<\p@
      \scalebox{\@tempa}{\usebox\pandoc@box}%
    \else
      \usebox{\pandoc@box}%
    \fi
  }%
}
\makeatother
```

The wrapper uses Pandoc's existing `\pandoc@box`, scales by the smaller of width and height, preserves aspect ratio, and returns a centered line-width box.

- [ ] **Step 5: Run focused tests and build only the PDF**

Run:

```bash
node --test scripts/tests/unit/articles/lib/book/render.test.mjs
npm run doctor:book -- --target pdf
npm run book -- --target pdf
pdfinfo .tmp/book/book.pdf | rg '^(Pages|Page size|File size):'
```

Expected: the render test passes; the doctor is complete; PDF build exits 0; `pdfinfo` reports a nonzero letter-sized PDF.

- [ ] **Step 6: Commit the PDF title and body-image bounds**

```bash
git add docs/articles/assets/book/chapter-openers.tex scripts/tests/unit/articles/lib/book/render.test.mjs
git commit -m "style(book): polish title and diagram bounds"
```

---

### Task 5: Apply equivalent HTML and EPUB presentation

**Files:**

- Modify: `docs/articles/assets/book/book.css:1-67`
- Modify: `scripts/articles/lib/book/render.mjs:20-37`
- Test: `scripts/tests/unit/articles/lib/book/render.test.mjs:61-74`

**Interfaces:**

- Consumes: staged `title-page.png`, `.chapter-opener`, `.chapter-image`, `.chapter-title`, `.chapter-subtitle`, and `.book-diagram` markup.
- Produces: banner-first responsive title block, proportional chapter images, bounded diagrams, and EPUB cover packaging.

- [ ] **Step 1: Write failing CSS and EPUB-cover assertions**

Add to `render.test.mjs`:

```js
test('the reflowable stylesheet keeps title, chapter, and diagram images proportional', () => {
  const css = readFileSync(BOOK_CSS, 'utf8');
  assert.match(css, /#title-block-header::before\s*\{[^}]*url\("title-page\.png"\)/s);
  assert.match(css, /#title-block-header h1\.title\s*\{[^}]*font-size:\s*2\.75rem/s);
  assert.match(
    css,
    /\.chapter-opener \.chapter-image img\s*\{[^}]*max-width:\s*100%;[^}]*width:\s*auto;[^}]*height:\s*auto;[^}]*object-fit:\s*contain;/s
  );
  assert.match(
    css,
    /\.book-diagram\s*\{[^}]*max-width:\s*100%;[^}]*max-height:\s*70vh;[^}]*object-fit:\s*contain;/s
  );
  assert.doesNotMatch(css, /object-fit:\s*cover/);
});
```

Extend `pandocArgs emits epub and html directly` with:

```js
assert.ok(epub.includes('--epub-cover-image=title-page.png'));
assert.equal(html.includes('--epub-cover-image=title-page.png'), false);
```

- [ ] **Step 2: Run the render test to verify old CSS and arguments fail**

Run:

```bash
node --test scripts/tests/unit/articles/lib/book/render.test.mjs
```

Expected: FAIL because chapter images still use a fixed cropped height, title/diagram rules are absent, and EPUB has no cover argument.

- [ ] **Step 3: Replace the reflowable presentation rules**

Update `book.css` so its relevant rules are:

```css
#title-block-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

#title-block-header::before {
  content: '';
  display: block;
  order: -1;
  width: 100%;
  aspect-ratio: 1376 / 768;
  margin-bottom: 2rem;
  background: url('title-page.png') center / contain no-repeat;
}

#title-block-header h1.title {
  font-size: 2.75rem;
  line-height: 1.15;
}

.chapter-opener .chapter-image img {
  display: block;
  max-width: 100%;
  width: auto;
  height: auto;
  margin-inline: auto;
  object-fit: contain;
}

.book-diagram {
  display: block;
  max-width: 100%;
  width: auto;
  height: auto;
  max-height: 70vh;
  margin: 1.5rem auto;
  object-fit: contain;
}
```

Remove the obsolete `.chapter-number` rule and the print rule that forces chapter images to `height: 2.2in`.

- [ ] **Step 4: Add the EPUB cover argument**

Change `presentationArgs` in `render.mjs` to:

```js
const presentationArgs =
  target === 'pdf'
    ? [`--include-in-header=${path.join(bookDir, 'chapter-openers.tex')}`]
    : target === 'epub'
      ? ['--css=book.css', '--epub-cover-image=title-page.png']
      : target === 'html'
        ? ['--css=book.css']
        : [];
```

- [ ] **Step 5: Run tests and build the reflowable editions**

Run:

```bash
node --test scripts/tests/unit/articles/lib/book/render.test.mjs scripts/tests/unit/articles/lib/book/diagrams.test.mjs
npm run book -- --target epub --target html
unzip -t .tmp/book/book.epub | tail -1
rg -o 'class="chapter-title chapter-opener"' .tmp/book/book.html | wc -l
rg -o 'class="book-diagram"' .tmp/book/book.html | wc -l
```

Expected: tests PASS; EPUB reports no compressed-data errors; HTML has 15 chapter openers and a nonzero diagram count.

- [ ] **Step 6: Commit the reflowable presentation**

```bash
git add docs/articles/assets/book/book.css scripts/articles/lib/book/render.mjs scripts/tests/unit/articles/lib/book/render.test.mjs
git commit -m "style(book): constrain reflowable artwork"
```

---

### Task 6: Update toolchain checks and publishing guidance

**Files:**

- Modify: `scripts/articles/lib/book/toolchain.mjs:25-41`
- Test: `scripts/tests/unit/articles/lib/book/toolchain.test.mjs:99-114`
- Modify: `docs/articles/book-publishing-guide.md:54-105`
- Modify: `cspell-dictionary.txt`

**Interfaces:**

- Consumes: the selected header's `fancyhdr` dependency and stable title asset path.
- Produces: doctor diagnostics and author instructions that match the implemented build.

- [ ] **Step 1: Write the failing `fancyhdr` doctor assertions**

Extend the chapter-opener-package test:

```js
test('doctor names a missing page-style package in its pasteable hint', async () => {
  const result = await doctor({
    runBinary: async () => true,
    runProbe: async (pkg) => pkg !== 'fancyhdr',
  });
  assert.deepEqual(result.missingPackages, ['fancyhdr']);
  assert.equal(result.hint, 'sudo tlmgr install fancyhdr');
});
```

Add this assertion to the probe-list test:

```js
assert.ok(PROBE_PACKAGES.includes('fancyhdr'));
```

- [ ] **Step 2: Run the toolchain test to verify the missing probe fails**

Run:

```bash
node --test scripts/tests/unit/articles/lib/book/toolchain.test.mjs
```

Expected: FAIL because `PROBE_PACKAGES` does not include `fancyhdr`.

- [ ] **Step 3: Add `fancyhdr` to the PDF package probes**

Add `'fancyhdr'` immediately after `'adjustbox'` in `PROBE_PACKAGES`.

- [ ] **Step 4: Update the publishing guide with exact replacement and layout behavior**

Under Metadata, add:

```markdown
- `title-page.png` — replaceable title-page artwork. It is staged under the same
  name for every rendered target; replacing it requires no code or metadata
  change.
```

Replace the crop-specific toolchain paragraph with:

```markdown
`doctor:book` always checks pandoc. It checks the LaTeX binaries and compiles a
one-line probe per LaTeX package only when the pdf target is in play, printing a
single `tlmgr install ...` line naming whatever is missing. Run it until it is
quiet. The probe includes `adjustbox`, which keeps title and chapter artwork
complete and proportional, and `fancyhdr`, which provides the left chapter
header and right page-number footer.
```

Add immediately after that paragraph:

```markdown
The PDF renderer centers body Mermaid images and limits them to the printable
width and 70 percent of text height. HTML and EPUB apply the equivalent content
width and viewport-height bounds. These presentation rules do not change the
authoritative Mermaid source or generated PNG bytes.
```

Add `fancyhdr` to `cspell-dictionary.txt` in alphabetical order with the other
project-specific technical vocabulary.

- [ ] **Step 5: Run focused checks and the live doctor**

Run:

```bash
node --test scripts/tests/unit/articles/lib/book/toolchain.test.mjs
npm run doctor:book
npx prettier --check scripts/articles/lib/book/toolchain.mjs scripts/tests/unit/articles/lib/book/toolchain.test.mjs docs/articles/book-publishing-guide.md
npx markdownlint-cli2 docs/articles/book-publishing-guide.md
npm run lint:spell
```

Expected: all tests and documentation checks PASS; doctor reports the toolchain complete. If doctor reports only `fancyhdr` missing, run:

```bash
test -f "$HOME/texmf/tlpkg/texlive.tlpdb" || tlmgr init-usertree
tlmgr --usermode install fancyhdr
npm run doctor:book
```

Expected: the per-user installation succeeds and the repeated doctor is complete.

- [ ] **Step 6: Commit toolchain and documentation parity**

```bash
git add scripts/articles/lib/book/toolchain.mjs scripts/tests/unit/articles/lib/book/toolchain.test.mjs docs/articles/book-publishing-guide.md cspell-dictionary.txt
git commit -m "docs(book): document polished layout toolchain"
```

---

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
