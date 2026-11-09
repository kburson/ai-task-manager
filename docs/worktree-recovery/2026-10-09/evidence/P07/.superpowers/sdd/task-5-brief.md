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

