### Spec Compliance

- ✅ Spec compliant: manuscript openers no longer emit the centered `Chapter N` body line, and HTML/EPUB openers no longer emit `.chapter-number` markup (`scripts/articles/lib/book/chapter-openers.mjs:34-52`). Generated Mermaid references now use the required `![](name.png){.book-diagram}` form (`scripts/articles/lib/book/diagrams.mjs:49-51`). The scoped five-file diff contains no article Markdown, Mermaid source, or PNG changes.
- ✅ Spec compliant: focused unit expectations require the exact manuscript output without the chapter-number line (`scripts/tests/unit/articles/lib/book/chapter-openers.test.mjs:36-53`), reject `chapter-number` and `>Chapter 2` in both reflowable targets (`scripts/tests/unit/articles/lib/book/chapter-openers.test.mjs:58-75`), require the diagram class (`scripts/tests/unit/articles/lib/book/diagrams.test.mjs:20-33`), and reject the class in generated EPUB and HTML corpus output (`scripts/tests/unit/articles/lib/book/corpus.test.mjs:139-154`).

### Strengths

- The production change is minimal and target-specific: PDF output remains its native `\\bookchapter` command while only manuscript, HTML, and EPUB opener semantics change (`scripts/articles/lib/book/chapter-openers.mjs:29-52`).
- The diagram transformation keeps deterministic existing naming and fence extraction intact while adding only the requested Pandoc attribute (`scripts/articles/lib/book/diagrams.mjs:41-53`).
- The implementer reports the prescribed focused suite passed with 21 tests and no failures; it was not rerun for this review.

### Issues

#### Critical (Must Fix)

- None.

#### Important (Should Fix)

- None.

#### Minor (Nice to Have)

- None.

### Assessment

**Task quality:** Approved

**Reasoning:** The diff is confined to the five requested implementation and test files, implements each required markup/output change, and provides direct regression coverage for every affected target.
