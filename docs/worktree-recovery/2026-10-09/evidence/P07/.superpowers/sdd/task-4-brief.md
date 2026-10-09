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

