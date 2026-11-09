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

