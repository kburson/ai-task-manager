# Exclude Draft Articles from Publisher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent explicitly draft-marked numbered articles from entering the live LinkedIn publish corpus.

**Architecture:** `listArticles()` remains the single discovery authority for whole-corpus and selector publication. It will inspect each numbered candidate's leading HTML-comment preamble, filter an explicit `DRAFT:` marker, and preserve the existing ordered descriptor interface for publishable sources.

**Tech Stack:** Node.js ESM, `node:test`, repository-local scratch helpers, Markdown source files.

## Global Constraints

- Preserve the immutable frozen test-corpus manifest and do not add authored live corpus counts.
- Do not edit Article 05 prose or generate its missing creative assets.
- Treat only an explicit `<!-- DRAFT:` comment in the leading comment preamble as draft state.
- Use repository-local `.tmp/test/` scratch space.

---

### Task 1: Filter explicit drafts at article discovery

**Files:**

- Modify: `scripts/tests/unit/articles/publish-articles.test.mjs`
- Modify: `scripts/articles/lib/publish.mjs`
- Modify: `scripts/tests/slow/articles/publish-articles-e2e.test.mjs`

**Interfaces:**

- Consumes: `listArticles(articlesDir: string): Promise<ArticleDescriptor[]>` and the existing `ARTICLE_FILE_RE` filename contract.
- Produces: the same ordered `ArticleDescriptor` objects (`file`, `slug`, `number`, `path`), with explicitly draft-marked sources absent.

- [ ] **Step 1: Write the failing discovery test**

Add an isolated async test that creates numbered publishable fixtures plus this leading preamble:

```markdown
<!-- markdownlint-disable MD034 -->
<!-- DRAFT: pending review -->

# Draft fixture
```

Call `listArticles()` and assert that only the non-draft numbered filenames are returned in lexical series order. Use `projectScratchDir('test')` and remove the fixture in the test cleanup.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test scripts/tests/unit/articles/publish-articles.test.mjs`

Expected: FAIL because the draft fixture is still present in the discovered filename list.

- [ ] **Step 3: Implement the minimal leading-preamble filter**

In `scripts/articles/lib/publish.mjs`, read each `ARTICLE_FILE_RE` candidate and identify a draft only when `<!-- DRAFT:` occurs among the sequential HTML comments before article content. Filter those candidates before mapping to the existing descriptor shape; do not infer status from filenames, positions, or missing assets.

- [ ] **Step 4: Verify GREEN in the focused unit suite**

Run: `node --test scripts/tests/unit/articles/publish-articles.test.mjs`

Expected: PASS with the new discovery test and all existing transform tests green.

- [ ] **Step 5: Remove the slow suite's mutable census**

In `scripts/tests/slow/articles/publish-articles-e2e.test.mjs`, replace `the corpus is the expected fourteen articles` and its exact length assertion with a behavioral test that asserts `05-easy-come-easy-go.md` is not present in `articles`. Keep the remaining loops discovery-driven.

- [ ] **Step 6: Verify the real publish corpus**

Run: `node --test scripts/tests/slow/articles/publish-articles-e2e.test.mjs`

Expected: PASS; every dynamically discovered publishable article produces its body, companion post, banner, and diagrams, while the explicit draft is absent.

- [ ] **Step 7: Run repository gates**

Run, in order:

```bash
npm run lint
npm run format:check
npm test
npm run test:slow
```

Expected: every command exits 0.

- [ ] **Step 8: Commit the atomic defect**

```bash
git add docs/superpowers/plans/2026-08-20-exclude-draft-articles-from-publisher.md scripts/articles/lib/publish.mjs scripts/tests/unit/articles/publish-articles.test.mjs scripts/tests/slow/articles/publish-articles-e2e.test.mjs
git commit -m "[#1355] fix: exclude draft articles from publishing"
```
