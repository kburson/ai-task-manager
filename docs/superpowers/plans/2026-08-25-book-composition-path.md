# Book Composition Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a second publishing path that composes the existing LinkedIn article series into a book — manuscript, PDF, EPUB, HTML — driven entirely by hidden `book:` markers in the articles plus a small metadata folder, without changing the LinkedIn output.

**Architecture:** Filename order is the book's spine. Articles stay LinkedIn-canonical; HTML comments prefixed `book:` carry composition hints and are already invisible to the LinkedIn publisher. A composer resolves markers, applies book-side strip rules, converts inline citations to footnotes, records index hits, and assembles one `manuscript.md`. Pandoc renders that to PDF (via xelatex/latexmk), EPUB, and HTML.

**Tech Stack:** Node.js v22+ ES modules, `node --test`, pandoc (system), BasicTeX/xelatex/latexmk/makeindex (system), existing `scripts/articles/lib/` modules.

**Spec:** [docs/superpowers/specs/2026-08-25-book-composition-path-design.md](../specs/2026-08-25-book-composition-path-design.md)

## Global Constraints

- Node.js v22+, ES modules only. No new npm dependencies — metadata is JSON and markdown precisely so no YAML parser is needed.
- `scripts/articles/**` is already excluded from the published npm package by `package.json` `files`. Nothing in this plan ships to consumers.
- The LinkedIn path must not change. `scripts/tests/unit/articles/publish-articles.test.mjs` is the regression guard and must pass unmodified at every commit.
- Every new test file's first line must be `// @chore`. Task 0 teaches `scripts/task-tracker/lib/story-tag-header.mjs` to accept that form; `scripts/tests/tools/audit-story-tags.mjs` fails closed on an untagged file.
- New test files live at `scripts/tests/unit/articles/book/<name>.test.mjs`. `audit-test-layout.mjs` requires a subdirectory under the lane's area, which `articles/book/` satisfies.
- Test files are capped at 800 code lines (`audit-line-cap.mjs`); feature files above 400 draw a soft warning.
- Commit subjects are plain conventional commits. This chore has no issue, so no `[#N]` token — that token belongs to `/task`-workflow commits.
- Fail loud. A marker mistake, an unresolvable link, or a missing fragment is an error naming the file — never a silently dropped section.
- Book output root is `.tmp/book/`. `.tmp/` is already gitignored.

---

### Task 0: Chore tag support and scaffolding

`scripts/tests/tools/audit-story-tags.mjs` fails closed on any test file that does not open with `// @story #NNN`. This chore has no AITM issue, and inventing one purely to satisfy a lint gate puts a phantom entry on the board forever. Teach the gate that a chore is a legitimate provenance instead.

**Files:**

- Modify: `scripts/task-tracker/lib/story-tag-header.mjs`
- Modify: `docs/guides/test-authoring.md:53`
- Modify: `package.json` (scripts block)
- Create: `scripts/tests/unit/task-tracker/lib/story-tag-header.test.mjs`
- Create: `docs/articles/assets/book/.gitkeep`
- Create: `docs/articles/assets/book/fragments/.gitkeep`

**Interfaces:**

- Consumes: nothing
- Produces: `hasPermittedStoryTag(content)` additionally accepts a leading `// @chore` line; npm scripts `book`, `doctor:book`, `lint:book-markers`

- [ ] **Step 1: Write the failing test**

Create `scripts/tests/unit/task-tracker/lib/story-tag-header.test.mjs`:

```javascript
// @chore
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  hasPermittedStoryTag,
  moveMalformedStoryTag,
} from '../../../../task-tracker/lib/story-tag-header.mjs';

test('a story tag on line one is permitted', () => {
  assert.equal(hasPermittedStoryTag('// @story #876\n\nimport x;\n'), true);
});

test('a story tag after a shebang is permitted', () => {
  assert.equal(hasPermittedStoryTag('#!/usr/bin/env node\n// @story #876\n'), true);
});

test('a cspell preamble may follow the tag', () => {
  assert.equal(hasPermittedStoryTag('// @story #876\n// cspell:ignore foo\nimport x;\n'), true);
});

test('an untagged file is refused', () => {
  assert.equal(hasPermittedStoryTag('import x;\n'), false);
});

test('a chore tag on line one is permitted', () => {
  assert.equal(hasPermittedStoryTag('// @chore\n\nimport x;\n'), true);
});

test('a chore tag after a shebang is permitted', () => {
  assert.equal(hasPermittedStoryTag('#!/usr/bin/env node\n// @chore\n'), true);
});

test('a cspell preamble may follow a chore tag', () => {
  assert.equal(hasPermittedStoryTag('// @chore\n// cspell:ignore foo\nimport x;\n'), true);
});

test('a chore tag with trailing prose is permitted', () => {
  assert.equal(hasPermittedStoryTag('// @chore book composition path\n'), true);
});

test('a bare @chore without the comment marker is refused', () => {
  assert.equal(hasPermittedStoryTag('@chore\n'), false);
});

test('a chore tag below the first line is refused', () => {
  assert.equal(hasPermittedStoryTag('import x;\n// @chore\n'), false);
});

test('a shebang after a chore tag is still refused', () => {
  assert.equal(hasPermittedStoryTag('// @chore\n#!/usr/bin/env node\n'), false);
});

test('moveMalformedStoryTag leaves an already-valid chore tag alone', () => {
  assert.equal(moveMalformedStoryTag('// @chore\nimport x;\n'), null);
});

test('moveMalformedStoryTag still repairs a out-of-order story tag', () => {
  assert.equal(
    moveMalformedStoryTag('// cspell:ignore foo\n// @story #876\nimport x;\n'),
    '// @story #876\n// cspell:ignore foo\nimport x;\n'
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/tests/unit/task-tracker/lib/story-tag-header.test.mjs`
Expected: the four `@chore` acceptance tests FAIL (`Expected values to be strictly equal: false !== true`); the `@story` tests pass, which confirms the fixtures are right before the change.

- [ ] **Step 3: Write the implementation**

In `scripts/task-tracker/lib/story-tag-header.mjs`, add the chore pattern beside the story pattern:

```javascript
const STORY_TAG_LINE_RE = /^\/\/ @story #\d+(?:\s|$)/;
const CHORE_TAG_LINE_RE = /^\/\/ @chore(?:\s|$)/;
```

Add a predicate beside `isStoryTag`:

```javascript
function isChoreTag(line) {
  return CHORE_TAG_LINE_RE.test(normalizedLine(line));
}

// A test's provenance is either a story or a deliberate chore. Both are real
// provenance; only an unmarked file is a gap.
function isProvenanceTag(line) {
  return isStoryTag(line) || isChoreTag(line);
}
```

Then change the two `isStoryTag` calls inside `hasPermittedStoryTag` — and only those — to `isProvenanceTag`:

```javascript
export function hasPermittedStoryTag(content) {
  const lines = String(content).split('\n');
  if (isProvenanceTag(lines[0])) {
    for (let index = 1; index < lines.length; index += 1) {
      if (isShebang(lines[index])) return false;
      if (!isCspellPreamble(lines[index])) break;
    }
    return true;
  }
  return isShebang(lines[0]) && isProvenanceTag(lines[1]);
}
```

Leave `moveMalformedStoryTag` untouched. It repairs out-of-order _story_ tags by hoisting them above a cspell preamble; a chore tag has no id to hoist, and `hasPermittedStoryTag` already returns early for a well-formed one.

- [ ] **Step 4: Run the new test and the gate's own test**

Run: `node --test scripts/tests/unit/task-tracker/lib/story-tag-header.test.mjs scripts/tests/unit/meta/audit-story-tags.test.mjs`
Expected: PASS, 13 + 3 tests. The audit test must be green and unmodified — the gate still refuses untagged files.

Then confirm the live corpus is unaffected:

Run: `npm run lint:story-tags`
Expected: `audit-story-tags: all <N> test files carry a @story tag.`

- [ ] **Step 5: Document the chore form**

In `docs/guides/test-authoring.md`, replace the paragraph beginning "Every test has `// @story #NNN`" with:

```markdown
Every test declares its provenance on line 1, or on line 2 immediately after a
shebang: `// @story #NNN` for work tracked by an issue, or `// @chore` for
deliberate chore work that has no issue and should not get a phantom one. A
`// cspell:ignore ...` preamble follows the provenance tag; it never precedes
it. Run `npm run lint:test-layout`, `npm run lint:story-tags`, and
`npm run lint:line-cap` before the relevant lane.
```

- [ ] **Step 6: Add the npm scripts and the metadata folder**

In `package.json`, add to `scripts`:

```json
"book": "node scripts/articles/compose-book.mjs",
"doctor:book": "node scripts/articles/compose-book.mjs --doctor",
"lint:book-markers": "node scripts/maintenance/lint-book-markers.mjs"
```

Do **not** append `lint:book-markers` to the `lint` chain yet — its script does not exist until Task 13, and adding it now breaks `npm run lint` for every task in between. Task 13 wires it into the chain.

The book toolchain vocabulary (`xelatex`, `latexmk`, `tlmgr`, and the rest) is already in `cspell-dictionary.txt`; confirm rather than re-add.

```bash
mkdir -p docs/articles/assets/book/fragments
touch docs/articles/assets/book/.gitkeep docs/articles/assets/book/fragments/.gitkeep
```

- [ ] **Step 7: Verify and commit**

Run: `npm run lint:md && npm run lint:spell && npm run lint:story-tags`
Expected: all three pass.

```bash
git add scripts/task-tracker/lib/story-tag-header.mjs scripts/tests/unit/task-tracker/lib/story-tag-header.test.mjs docs/guides/test-authoring.md package.json docs/articles/assets/book
git commit -m "chore(tests): accept @chore provenance tags and scaffold the book path"
```

---

### Task 1: Spine discovery

An article belongs to the book if and only if it contains a `## Series Link` section. Every drafted article has one; the `16-*` outline does not. This keeps half-written articles out without anyone remembering to exclude them.

**Files:**

- Create: `scripts/articles/lib/book/spine.mjs`
- Test: `scripts/tests/unit/articles/book/spine.test.mjs`

**Interfaces:**

- Consumes: nothing
- Produces: `listSpine(articlesDir) -> Promise<Array<{file: string, slug: string, number: number, source: string}>>` sorted by filename; `isOnSpine(source) -> boolean`; `ARTICLE_FILE_RE`

- [ ] **Step 1: Write the failing test**

Create `scripts/tests/unit/articles/book/spine.test.mjs`:

```javascript
// @chore
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { isOnSpine, listSpine } from '../../../../articles/lib/book/spine.mjs';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';

test('isOnSpine requires a Series Link section', () => {
  assert.equal(isOnSpine('# T\n\n## Series Link\n\nnext.\n'), true);
  assert.equal(isOnSpine('# T\n\n## Drafting Notes\n\nstub.\n'), false);
  assert.equal(isOnSpine('# T\n\nprose about the Series Link idea.\n'), false);
});

test('listSpine returns drafted articles in filename order', async () => {
  const dir = await mkdtemp(path.join(projectScratchDir('test'), 'spine-'));
  try {
    await writeFile(path.join(dir, '02-second.md'), '# Second\n\n## Series Link\n\nx\n');
    await writeFile(path.join(dir, '01-first.md'), '# First\n\n## Series Link\n\nx\n');
    await writeFile(path.join(dir, '16-outline.md'), '# Outline\n\n## Drafting Notes\n\nx\n');
    await writeFile(path.join(dir, 'README.md'), '# Readme\n\n## Series Link\n\nx\n');

    const spine = await listSpine(dir);
    assert.deepEqual(
      spine.map((a) => a.slug),
      ['01-first', '02-second']
    );
    assert.deepEqual(
      spine.map((a) => a.number),
      [1, 2]
    );
    assert.match(spine[0].source, /^# First/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/tests/unit/articles/book/spine.test.mjs`
Expected: FAIL — `Cannot find module '.../book/spine.mjs'`

- [ ] **Step 3: Write the implementation**

Create `scripts/articles/lib/book/spine.mjs`:

```javascript
// The book's spine: which articles compose, and in what order.
//
// Order is filename order, because the series was written to be read in that
// order. Membership is the `## Series Link` section, which every drafted
// article carries and no outline does.

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export const ARTICLE_FILE_RE = /^(\d{2})-(.+)\.md$/;

const SERIES_LINK_RE = /^## Series Link\s*$/m;

/** @param {string} source raw Markdown of one article file */
export function isOnSpine(source) {
  return SERIES_LINK_RE.test(source);
}

/**
 * @param {string} articlesDir
 * @returns {Promise<Array<{file: string, slug: string, number: number, source: string}>>}
 */
export async function listSpine(articlesDir) {
  const names = (await readdir(articlesDir)).filter((name) => ARTICLE_FILE_RE.test(name)).sort();
  const spine = [];
  for (const file of names) {
    const source = await readFile(path.join(articlesDir, file), 'utf8');
    if (!isOnSpine(source)) continue;
    const match = file.match(ARTICLE_FILE_RE);
    spine.push({
      file,
      slug: file.replace(/\.md$/, ''),
      number: Number(match[1]),
      source,
    });
  }
  return spine;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/tests/unit/articles/book/spine.test.mjs`
Expected: PASS, 2 tests

- [ ] **Step 5: Commit**

```bash
git add scripts/articles/lib/book/spine.mjs scripts/tests/unit/articles/book/spine.test.mjs
git commit -m "feat(book): discover the book spine from drafted articles"
```

---

### Task 2: Comment-preserving article parse

`parseArticle` strips every HTML comment before any other transform. That is what makes `book:` markers invisible to LinkedIn — and it is also why the book path cannot use the function as-is. Add an option; default behaviour is unchanged.

**Files:**

- Modify: `scripts/articles/lib/parse-article.mjs:24-27`
- Test: `scripts/tests/unit/articles/book/parse-keep-comments.test.mjs`

**Interfaces:**

- Consumes: nothing
- Produces: `parseArticle(source, { keepComments = false })` — same return shape as before

- [ ] **Step 1: Write the failing test**

Create `scripts/tests/unit/articles/book/parse-keep-comments.test.mjs`:

```javascript
// @chore
import assert from 'node:assert/strict';
import test from 'node:test';

import { parseArticle } from '../../../../articles/lib/parse-article.mjs';

const SOURCE = `# Title

<!-- book:part title="One" -->

Intro line.

## First

<!-- book:pagebreak -->

Body line.
`;

test('comments are stripped by default', () => {
  const article = parseArticle(SOURCE);
  const all = article.sections.flatMap((s) => s.lines).join('\n');
  assert.equal(all.includes('book:part'), false);
  assert.equal(all.includes('book:pagebreak'), false);
});

test('keepComments preserves marker lines in place', () => {
  const article = parseArticle(SOURCE, { keepComments: true });
  assert.equal(article.title, 'Title');
  assert.deepEqual(article.sections[0].lines, [
    '<!-- book:part title="One" -->',
    '',
    'Intro line.',
  ]);
  assert.equal(article.sections[1].heading, 'First');
  assert.deepEqual(article.sections[1].lines, ['<!-- book:pagebreak -->', '', 'Body line.']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/tests/unit/articles/book/parse-keep-comments.test.mjs`
Expected: FAIL — the second test's `deepEqual` reports `['Intro line.']`, comments gone

- [ ] **Step 3: Write the implementation**

In `scripts/articles/lib/parse-article.mjs`, change the signature and first line of `parseArticle`. Replace:

```javascript
export function parseArticle(source) {
  const lines = source.replace(HTML_COMMENT_RE, '').split('\n');
```

with:

```javascript
export function parseArticle(source, { keepComments = false } = {}) {
  const lines = (keepComments ? source : source.replace(HTML_COMMENT_RE, '')).split('\n');
```

Also extend the JSDoc above it:

```javascript
/**
 * @param {string} source raw Markdown of one article file
 * @param {{keepComments?: boolean}} [options] the book composer needs the
 *   `book:` marker comments preserved; the LinkedIn publisher never does.
 * @returns {{title: string, bannerPath: string|null, sections: Array<{heading: string|null, lines: string[]}>}}
 */
```

- [ ] **Step 4: Run both the new test and the LinkedIn regression guard**

Run: `node --test scripts/tests/unit/articles/book/parse-keep-comments.test.mjs scripts/tests/unit/articles/publish-articles.test.mjs`
Expected: PASS — the publisher test must be untouched and green

- [ ] **Step 5: Commit**

```bash
git add scripts/articles/lib/parse-article.mjs scripts/tests/unit/articles/book/parse-keep-comments.test.mjs
git commit -m "feat(book): let parseArticle preserve HTML comments on request"
```

---

### Task 3: Marker parsing and validation

**Files:**

- Create: `scripts/articles/lib/book/markers.mjs`
- Test: `scripts/tests/unit/articles/book/markers.test.mjs`

**Interfaces:**

- Consumes: nothing
- Produces:
  - `MarkerError` (extends `Error`, has `.file`)
  - `VERBS: Set<string>`
  - `parseMarkerLine(line, file) -> {verb: string, attrs: object} | null` (throws `MarkerError` on unknown verb or malformed attrs; returns `null` for a non-marker line)
  - `scanSections(sections, file) -> Array<{heading: string|null, items: Array<{kind: 'text', text: string} | {kind: 'marker', verb: string, attrs: object}>}>`
  - `validateArticle(scanned, {file, isFirst}) -> void` (throws `MarkerError`)

- [ ] **Step 1: Write the failing test**

Create `scripts/tests/unit/articles/book/markers.test.mjs`:

````javascript
// @chore
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MarkerError,
  parseMarkerLine,
  scanSections,
  validateArticle,
} from '../../../../articles/lib/book/markers.mjs';

test('parseMarkerLine reads verbs and quoted attributes', () => {
  assert.deepEqual(parseMarkerLine('<!-- book:pagebreak -->', 'f.md'), {
    verb: 'pagebreak',
    attrs: {},
  });
  assert.deepEqual(parseMarkerLine('<!-- book:part title="How We Got Here" -->', 'f.md'), {
    verb: 'part',
    attrs: { title: 'How We Got Here' },
  });
  assert.deepEqual(parseMarkerLine('<!-- book:include path=fragments/a.md -->', 'f.md'), {
    verb: 'include',
    attrs: { path: 'fragments/a.md' },
  });
  assert.equal(parseMarkerLine('<!-- markdownlint-disable MD034 -->', 'f.md'), null);
  assert.equal(parseMarkerLine('ordinary prose', 'f.md'), null);
});

test('parseMarkerLine rejects unknown verbs and inline markers', () => {
  assert.throws(() => parseMarkerLine('<!-- book:chaptr title="x" -->', 'f.md'), MarkerError);
  assert.throws(() => parseMarkerLine('prose <!-- book:pagebreak --> more', 'f.md'), MarkerError);
});

test('scanSections splits text from markers and ignores fenced code', () => {
  const sections = [
    { heading: null, lines: ['<!-- book:chapter title="Ch" -->', 'prose'] },
    { heading: 'Body', lines: ['```', '<!-- book:pagebreak -->', '```', 'after'] },
  ];
  const scanned = scanSections(sections, 'f.md');
  assert.deepEqual(scanned[0].items, [
    { kind: 'marker', verb: 'chapter', attrs: { title: 'Ch' } },
    { kind: 'text', text: 'prose' },
  ]);
  assert.deepEqual(
    scanned[1].items.map((i) => i.kind),
    ['text', 'text', 'text', 'text']
  );
});

test('validateArticle rejects structural mistakes', () => {
  const withMarker = (heading, verb, attrs = {}) => [
    { heading: null, items: [{ kind: 'text', text: 'x' }] },
    { heading, items: [{ kind: 'marker', verb, attrs }] },
  ];

  assert.throws(
    () =>
      validateArticle(withMarker('Body', 'part', { title: 'P' }), { file: 'f.md', isFirst: false }),
    /preamble/
  );
  assert.throws(
    () =>
      validateArticle(
        [{ heading: null, items: [{ kind: 'marker', verb: 'merge-into-previous', attrs: {} }] }],
        {
          file: 'f.md',
          isFirst: true,
        }
      ),
    /first article/
  );
  assert.throws(
    () =>
      validateArticle(
        [{ heading: null, items: [{ kind: 'marker', verb: 'exclude', attrs: {} }] }],
        {
          file: 'f.md',
          isFirst: false,
        }
      ),
    /unclosed/
  );
  assert.throws(
    () =>
      validateArticle([{ heading: null, items: [{ kind: 'marker', verb: 'end', attrs: {} }] }], {
        file: 'f.md',
        isFirst: false,
      }),
    /without a matching/
  );
  assert.throws(
    () =>
      validateArticle([{ heading: null, items: [{ kind: 'marker', verb: 'demote', attrs: {} }] }], {
        file: 'f.md',
        isFirst: false,
      }),
    /integer/
  );
});

test('validateArticle accepts a well-formed article', () => {
  const scanned = [
    {
      heading: null,
      items: [
        { kind: 'marker', verb: 'part', attrs: { title: 'One' } },
        { kind: 'text', text: 'prose' },
      ],
    },
    {
      heading: 'Body',
      items: [
        { kind: 'marker', verb: 'exclude', attrs: {} },
        { kind: 'text', text: 'dropped' },
        { kind: 'marker', verb: 'end', attrs: {} },
      ],
    },
  ];
  assert.doesNotThrow(() => validateArticle(scanned, { file: 'f.md', isFirst: true }));
});
````

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/tests/unit/articles/book/markers.test.mjs`
Expected: FAIL — `Cannot find module '.../book/markers.mjs'`

- [ ] **Step 3: Write the implementation**

Create `scripts/articles/lib/book/markers.mjs`:

````javascript
// `book:` markers — the composition hints the author leaves inside articles.
//
// They are HTML comments, so `parse-article.mjs` strips them for the LinkedIn
// path without anyone doing anything. The book path parses them instead.
//
// Every failure here is loud. A typo'd verb that silently did nothing would
// drop a section out of the book with no signal at all.

const MARKER_LINE_RE = /^<!--\s*book:([a-z][a-z-]*)\s*(.*?)\s*-->$/;
const MARKER_ANYWHERE_RE = /<!--\s*book:/;
const ATTR_RE = /([a-z][a-z-]*)=(?:"([^"]*)"|(\S+))/g;
const FENCE_RE = /^```/;

export const VERBS = new Set([
  'part',
  'chapter',
  'merge-into-previous',
  'demote',
  'exclude',
  'end',
  'include',
  'pagebreak',
  'index',
]);

export class MarkerError extends Error {
  constructor(message, file) {
    super(`${file}: ${message}`);
    this.name = 'MarkerError';
    this.file = file;
  }
}

/**
 * @returns {{verb: string, attrs: Record<string, string>}|null} null when the
 *   line is not a `book:` marker at all.
 */
export function parseMarkerLine(line, file) {
  const trimmed = line.trim();
  const match = trimmed.match(MARKER_LINE_RE);
  if (!match) {
    if (MARKER_ANYWHERE_RE.test(trimmed)) {
      throw new MarkerError(`marker must be alone on its line: ${trimmed}`, file);
    }
    return null;
  }
  const [, verb, rest] = match;
  if (!VERBS.has(verb)) {
    throw new MarkerError(`unknown marker verb "book:${verb}": ${trimmed}`, file);
  }
  const attrs = {};
  let consumed = 0;
  for (const attr of rest.matchAll(ATTR_RE)) {
    attrs[attr[1]] = attr[2] ?? attr[3];
    consumed += attr[0].length;
  }
  if (rest.replace(/\s+/g, '').length > 0 && consumed === 0) {
    throw new MarkerError(`malformed marker attributes: ${trimmed}`, file);
  }
  return { verb, attrs };
}

/**
 * Turn `parseArticle` sections into ordered item streams where markers are
 * first-class rather than lines of text. Fenced code is left alone; a marker
 * inside a fence is prose about markers, not a marker.
 */
export function scanSections(sections, file) {
  return sections.map((section) => {
    const items = [];
    let inFence = false;
    for (const text of section.lines) {
      if (FENCE_RE.test(text)) {
        inFence = !inFence;
        items.push({ kind: 'text', text });
        continue;
      }
      const marker = inFence ? null : parseMarkerLine(text, file);
      items.push(marker ? { kind: 'marker', ...marker } : { kind: 'text', text });
    }
    return { heading: section.heading, items };
  });
}

export function validateArticle(scanned, { file, isFirst }) {
  let open = 0;
  scanned.forEach((section, sectionIndex) => {
    for (const item of section.items) {
      if (item.kind !== 'marker') continue;
      const { verb, attrs } = item;

      if ((verb === 'part' || verb === 'chapter') && sectionIndex !== 0) {
        throw new MarkerError(`book:${verb} must appear in the article preamble`, file);
      }
      if (verb === 'chapter' && !attrs.title) {
        throw new MarkerError('book:chapter requires title="..."', file);
      }
      if (verb === 'part' && !attrs.title) {
        throw new MarkerError('book:part requires title="..."', file);
      }
      if (verb === 'merge-into-previous' && isFirst) {
        throw new MarkerError('book:merge-into-previous cannot be on the first article', file);
      }
      if (verb === 'demote' && !/^\d+$/.test(attrs.by ?? '')) {
        throw new MarkerError('book:demote requires by=<integer>', file);
      }
      if (verb === 'include' && !attrs.path) {
        throw new MarkerError('book:include requires path=<fragment path>', file);
      }
      if (verb === 'index' && !attrs.term) {
        throw new MarkerError('book:index requires term="..."', file);
      }
      if (verb === 'exclude') open += 1;
      if (verb === 'end') {
        open -= 1;
        if (open < 0) throw new MarkerError('book:end without a matching book:exclude', file);
      }
    }
  });
  if (open > 0) throw new MarkerError('unclosed book:exclude span', file);
}
````

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/tests/unit/articles/book/markers.test.mjs`
Expected: PASS, 5 tests

- [ ] **Step 5: Commit**

```bash
git add scripts/articles/lib/book/markers.mjs scripts/tests/unit/articles/book/markers.test.mjs
git commit -m "feat(book): parse and validate book composition markers"
```

---

### Task 4: Book-side strip rules

**Files:**

- Create: `scripts/articles/lib/book/strip.mjs`
- Test: `scripts/tests/unit/articles/book/strip.test.mjs`

**Interfaces:**

- Consumes: `scanSections` output shape from Task 3
- Produces: `BOOK_STRIP_HEADINGS: Set<string>`; `applyBookStrip(scanned) -> {sections: Array<{heading, items}>, bibliographyLines: string[]}`

- [ ] **Step 1: Write the failing test**

Create `scripts/tests/unit/articles/book/strip.test.mjs`:

```javascript
// @chore
import assert from 'node:assert/strict';
import test from 'node:test';

import { applyBookStrip } from '../../../../articles/lib/book/strip.mjs';

const text = (t) => ({ kind: 'text', text: t });
const marker = (verb, attrs = {}) => ({ kind: 'marker', verb, attrs });

test('applyBookStrip removes channel sections and lifts the bibliography', () => {
  const scanned = [
    { heading: null, items: [text('_Part 3 of a series of articles on X_'), text('Opening.')] },
    { heading: 'Body', items: [text('Prose.')] },
    { heading: 'Series Link', items: [text('The next article...')] },
    { heading: 'Series Roadmap', items: [text('| a | b |')] },
    { heading: 'LinkedIn Article Shape', items: [text('hook')] },
    { heading: 'Bibliography', items: [text('- Pub. "T." https://e.com/a')] },
  ];

  const { sections, bibliographyLines } = applyBookStrip(scanned);

  assert.deepEqual(
    sections.map((s) => s.heading),
    [null, 'Body']
  );
  assert.deepEqual(sections[0].items, [text('Opening.')]);
  assert.deepEqual(bibliographyLines, ['- Pub. "T." https://e.com/a']);
});

test('applyBookStrip drops exclude spans and their markers', () => {
  const scanned = [
    {
      heading: 'Body',
      items: [
        text('keep one'),
        marker('exclude'),
        text('drop me'),
        marker('end'),
        text('keep two'),
      ],
    },
  ];
  const { sections } = applyBookStrip(scanned);
  assert.deepEqual(sections[0].items, [text('keep one'), text('keep two')]);
});

test('applyBookStrip drops a section that becomes empty', () => {
  const scanned = [
    { heading: null, items: [text('intro')] },
    { heading: 'Gone', items: [marker('exclude'), text('all of it'), marker('end')] },
  ];
  const { sections } = applyBookStrip(scanned);
  assert.deepEqual(
    sections.map((s) => s.heading),
    [null]
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/tests/unit/articles/book/strip.test.mjs`
Expected: FAIL — `Cannot find module '.../book/strip.mjs'`

- [ ] **Step 3: Write the implementation**

Create `scripts/articles/lib/book/strip.mjs`:

```javascript
// Book-side default strip rules — the mirror image of the LinkedIn publisher's
// `strip-rules.mjs`. Where that one keeps the series scaffolding and drops the
// outline, this one drops all of the scaffolding: a book has no "next article".
//
// The banner image is already gone: `parseArticle` lifts it into a field.

export const BOOK_STRIP_HEADINGS = new Set([
  'Series Link',
  'Series Roadmap',
  'LinkedIn Article Shape',
  'Bibliography',
]);

const PART_CAPTION_RE = /^_Part \d+ of a series.*_$/;

/**
 * @param {Array<{heading: string|null, items: Array<object>}>} scanned
 * @returns {{sections: Array<{heading: string|null, items: Array<object>}>, bibliographyLines: string[]}}
 */
export function applyBookStrip(scanned) {
  const sections = [];
  const bibliographyLines = [];

  for (const section of scanned) {
    if (section.heading === 'Bibliography') {
      for (const item of section.items) {
        if (item.kind === 'text' && item.text.trim() !== '') bibliographyLines.push(item.text);
      }
      continue;
    }
    if (BOOK_STRIP_HEADINGS.has(section.heading)) continue;

    const items = [];
    let excluding = 0;
    for (const item of section.items) {
      if (item.kind === 'marker' && item.verb === 'exclude') {
        excluding += 1;
        continue;
      }
      if (item.kind === 'marker' && item.verb === 'end') {
        excluding -= 1;
        continue;
      }
      if (excluding > 0) continue;
      if (item.kind === 'text' && PART_CAPTION_RE.test(item.text.trim())) continue;
      items.push(item);
    }

    const meaningful = items.some((item) => item.kind !== 'text' || item.text.trim() !== '');
    if (!meaningful) continue;
    sections.push({ heading: section.heading, items });
  }

  return { sections, bibliographyLines };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/tests/unit/articles/book/strip.test.mjs`
Expected: PASS, 3 tests

- [ ] **Step 5: Commit**

```bash
git add scripts/articles/lib/book/strip.mjs scripts/tests/unit/articles/book/strip.test.mjs
git commit -m "feat(book): strip series scaffolding from book chapters"
```

---

### Task 5: Heading algebra and chapter planning

**Files:**

- Create: `scripts/articles/lib/book/headings.mjs`
- Test: `scripts/tests/unit/articles/book/headings.test.mjs`

**Interfaces:**

- Consumes: nothing at runtime; operates on plain data
- Produces:
  - `shiftHeading(line, by) -> string` (throws `RangeError` past level 6)
  - `planChapters(articles) -> Array<{number: number, title: string, part: string|null, members: Array<{article: object, shift: number}>}>` where `articles` is `Array<{slug, title, chapterTitle: string|null, part: string|null, mergeIntoPrevious: boolean, sections: Array<object>}>`

- [ ] **Step 1: Write the failing test**

Create `scripts/tests/unit/articles/book/headings.test.mjs`:

```javascript
// @chore
import assert from 'node:assert/strict';
import test from 'node:test';

import { planChapters, shiftHeading } from '../../../../articles/lib/book/headings.mjs';

test('shiftHeading moves only heading lines', () => {
  assert.equal(shiftHeading('## Body', 1), '### Body');
  assert.equal(shiftHeading('### Deep', 2), '##### Deep');
  assert.equal(shiftHeading('## Body', 0), '## Body');
  assert.equal(shiftHeading('not a heading', 2), 'not a heading');
  assert.equal(shiftHeading('#hashtag', 1), '#hashtag');
  assert.throws(() => shiftHeading('##### Deep', 2), RangeError);
});

const article = (slug, over = {}) => ({
  slug,
  title: `Title ${slug}`,
  chapterTitle: null,
  part: null,
  mergeIntoPrevious: false,
  sections: [],
  ...over,
});

test('planChapters gives each article its own chapter by default', () => {
  const chapters = planChapters([article('01'), article('02')]);
  assert.deepEqual(
    chapters.map((c) => [c.number, c.title, c.members.length]),
    [
      [1, 'Title 01', 1],
      [2, 'Title 02', 1],
    ]
  );
  assert.equal(chapters[0].members[0].shift, 0);
});

test('planChapters folds merged articles into the previous chapter', () => {
  const chapters = planChapters([article('01'), article('02', { mergeIntoPrevious: true })]);
  assert.equal(chapters.length, 1);
  assert.equal(chapters[0].members.length, 2);
  assert.equal(chapters[0].members[0].shift, 0);
  assert.equal(chapters[0].members[1].shift, 1);
});

test('planChapters honours chapter title overrides and part boundaries', () => {
  const chapters = planChapters([
    article('01', { part: 'How We Got Here' }),
    article('02', { chapterTitle: 'Custom' }),
  ]);
  assert.equal(chapters[0].part, 'How We Got Here');
  assert.equal(chapters[1].part, null);
  assert.equal(chapters[1].title, 'Custom');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/tests/unit/articles/book/headings.test.mjs`
Expected: FAIL — `Cannot find module '.../book/headings.mjs'`

- [ ] **Step 3: Write the implementation**

Create `scripts/articles/lib/book/headings.mjs`:

```javascript
// Heading level algebra and chapter grouping.
//
// Default: one article is one chapter. Its H1 is the chapter title (lifted out
// by `parseArticle`), its `##` headings stay `##`.
//
// Under `book:merge-into-previous`: the article's title becomes a `##` inside
// the previous chapter and everything below it shifts one level down.

const HEADING_RE = /^(#{1,6}) (.*)$/;

/**
 * @param {string} line
 * @param {number} by levels to shift down
 * @returns {string}
 */
export function shiftHeading(line, by) {
  if (by === 0) return line;
  const match = line.match(HEADING_RE);
  if (!match) return line;
  const level = match[1].length + by;
  if (level > 6) {
    throw new RangeError(`heading shift would exceed level 6: ${line}`);
  }
  return `${'#'.repeat(level)} ${match[2]}`;
}

/**
 * @param {Array<{slug: string, title: string, chapterTitle: string|null, part: string|null, mergeIntoPrevious: boolean, sections: Array<object>}>} articles
 * @returns {Array<{number: number, title: string, part: string|null, members: Array<{article: object, shift: number}>}>}
 */
export function planChapters(articles) {
  const chapters = [];
  for (const article of articles) {
    if (article.mergeIntoPrevious) {
      chapters[chapters.length - 1].members.push({ article, shift: 1 });
      continue;
    }
    chapters.push({
      number: chapters.length + 1,
      title: article.chapterTitle ?? article.title,
      part: article.part,
      members: [{ article, shift: 0 }],
    });
  }
  return chapters;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/tests/unit/articles/book/headings.test.mjs`
Expected: PASS, 4 tests

- [ ] **Step 5: Commit**

```bash
git add scripts/articles/lib/book/headings.mjs scripts/tests/unit/articles/book/headings.test.mjs
git commit -m "feat(book): plan chapters and shift heading levels"
```

---

### Task 6: Citations to footnotes

**Files:**

- Create: `scripts/articles/lib/book/footnotes.mjs`
- Test: `scripts/tests/unit/articles/book/footnotes.test.mjs`

**Interfaces:**

- Consumes: nothing
- Produces:
  - `parseBibliography(lines) -> Array<{publisher: string, title: string, url: string, raw: string}>`
  - `convertLine(line, ctx) -> string` where `ctx = {bibByUrl: Map<string, object>, chapterBySlug: Map<string, number>, footnotes: Array<{id: string, text: string}>, idPrefix: string, file: string}`
  - `CitationError` (extends `Error`)

- [ ] **Step 1: Write the failing test**

Create `scripts/tests/unit/articles/book/footnotes.test.mjs`:

```javascript
// @chore
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CitationError,
  convertLine,
  parseBibliography,
} from '../../../../articles/lib/book/footnotes.mjs';

test('parseBibliography reads publisher, title, and url', () => {
  const entries = parseBibliography([
    '- DORA. "State of AI-assisted Software Development 2025." https://dora.dev/dora-report-2025/',
    '',
    '- METR. "Measuring the Impact." https://metr.org/blog/x/',
  ]);
  assert.equal(entries.length, 2);
  assert.deepEqual(entries[0], {
    publisher: 'DORA',
    title: 'State of AI-assisted Software Development 2025',
    url: 'https://dora.dev/dora-report-2025/',
    raw: '- DORA. "State of AI-assisted Software Development 2025." https://dora.dev/dora-report-2025/',
  });
});

const makeCtx = (over = {}) => ({
  bibByUrl: new Map([
    ['https://dora.dev/x/', { publisher: 'DORA', title: 'A Report', url: 'https://dora.dev/x/' }],
  ]),
  chapterBySlug: new Map([['05-easy-come-easy-go', 5]]),
  footnotes: [],
  idPrefix: 'c03',
  file: '03-x.md',
  ...over,
});

test('external links become footnotes sourced from the bibliography', () => {
  const ctx = makeCtx();
  const out = convertLine('As shown ([DORA report](https://dora.dev/x/)).', ctx);
  assert.equal(out, 'As shown (DORA report[^c03-1]).');
  assert.deepEqual(ctx.footnotes, [
    { id: 'c03-1', text: 'DORA. "A Report." <https://dora.dev/x/>' },
  ]);
});

test('an external link with no bibliography entry falls back to its label', () => {
  const ctx = makeCtx();
  convertLine('See [Some Page](https://example.com/z).', ctx);
  assert.deepEqual(ctx.footnotes, [{ id: 'c03-1', text: 'Some Page. <https://example.com/z>' }]);
});

test('sibling article links become chapter cross-references', () => {
  const ctx = makeCtx();
  const out = convertLine('see [Easy Come](05-easy-come-easy-go.md) for more.', ctx);
  assert.equal(out, 'see Easy Come (Chapter 5) for more.');
  assert.deepEqual(ctx.footnotes, []);
});

test('images are left alone', () => {
  const ctx = makeCtx();
  assert.equal(convertLine('![alt](assets/x.png)', ctx), '![alt](assets/x.png)');
  assert.deepEqual(ctx.footnotes, []);
});

test('a link that resolves to neither is a loud failure', () => {
  const ctx = makeCtx();
  assert.throws(() => convertLine('[gone](99-not-on-spine.md)', ctx), CitationError);
  assert.throws(() => convertLine('[gone](../guides/workflow.md)', ctx), CitationError);
});

test('footnote numbering continues across calls within a chapter', () => {
  const ctx = makeCtx();
  convertLine('[a](https://example.com/a)', ctx);
  convertLine('[b](https://example.com/b)', ctx);
  assert.deepEqual(
    ctx.footnotes.map((f) => f.id),
    ['c03-1', 'c03-2']
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/tests/unit/articles/book/footnotes.test.mjs`
Expected: FAIL — `Cannot find module '.../book/footnotes.mjs'`

- [ ] **Step 3: Write the implementation**

Create `scripts/articles/lib/book/footnotes.mjs`:

```javascript
// Citations, converted for print.
//
// On LinkedIn each article is standalone and carries its own `## Bibliography`.
// In the book the inline links become footnotes and the bibliographies are
// hoisted into one deduped appendix.
//
// Sibling-article links are the interesting case: `[Label](05-slug.md)` is a
// real relative path on LinkedIn, rewritten to a live URL during the backfill
// pass. In the book it must become "Label (Chapter 5)" — a path would be a dead
// link on paper.

const LINK_RE = /(!?)\[([^\]]+)\]\(([^)\s]+)\)/g;
const BIB_LINE_RE = /^-\s+(.+?)\.\s+"(.+?)\."\s+(\S+)\s*$/;
const ARTICLE_TARGET_RE = /^(\d{2}-.+)\.md$/;

export class CitationError extends Error {
  constructor(message, file) {
    super(`${file}: ${message}`);
    this.name = 'CitationError';
    this.file = file;
  }
}

/**
 * @param {string[]} lines the `## Bibliography` section's lines
 * @returns {Array<{publisher: string, title: string, url: string, raw: string}>}
 */
export function parseBibliography(lines) {
  const entries = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    const match = trimmed.match(BIB_LINE_RE);
    if (!match) continue;
    entries.push({ publisher: match[1], title: match[2], url: match[3], raw: trimmed });
  }
  return entries;
}

/**
 * @param {string} line
 * @param {{bibByUrl: Map<string, object>, chapterBySlug: Map<string, number>, footnotes: Array<{id: string, text: string}>, idPrefix: string, file: string}} ctx
 * @returns {string}
 */
export function convertLine(line, ctx) {
  return line.replace(LINK_RE, (whole, bang, label, target) => {
    if (bang === '!') return whole;

    if (/^https?:\/\//.test(target)) {
      const entry = ctx.bibByUrl.get(target);
      const text = entry
        ? `${entry.publisher}. "${entry.title}." <${entry.url}>`
        : `${label}. <${target}>`;
      const id = `${ctx.idPrefix}-${ctx.footnotes.length + 1}`;
      ctx.footnotes.push({ id, text });
      return `${label}[^${id}]`;
    }

    const article = target.match(ARTICLE_TARGET_RE);
    if (article) {
      const chapter = ctx.chapterBySlug.get(article[1]);
      if (chapter === undefined) {
        throw new CitationError(`link to "${target}" which is not on the book spine`, ctx.file);
      }
      return `${label} (Chapter ${chapter})`;
    }

    throw new CitationError(
      `link target "${target}" is neither an absolute URL nor a spine article`,
      ctx.file
    );
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/tests/unit/articles/book/footnotes.test.mjs`
Expected: PASS, 7 tests

- [ ] **Step 5: Commit**

```bash
git add scripts/articles/lib/book/footnotes.mjs scripts/tests/unit/articles/book/footnotes.test.mjs
git commit -m "feat(book): convert inline citations to footnotes"
```

---

### Task 7: Sources appendix

**Files:**

- Create: `scripts/articles/lib/book/sources.mjs`
- Test: `scripts/tests/unit/articles/book/sources.test.mjs`

**Interfaces:**

- Consumes: `parseBibliography` entry shape from Task 6
- Produces: `dedupeSources(entryLists) -> Array<entry>`; `renderSources(entries) -> string[]`

- [ ] **Step 1: Write the failing test**

Create `scripts/tests/unit/articles/book/sources.test.mjs`:

```javascript
// @chore
import assert from 'node:assert/strict';
import test from 'node:test';

import { dedupeSources, renderSources } from '../../../../articles/lib/book/sources.mjs';

const entry = (publisher, title, url) => ({ publisher, title, url, raw: '' });

test('dedupeSources drops repeat URLs and sorts by publisher then title', () => {
  const merged = dedupeSources([
    [entry('Zed', 'Later', 'https://z.example/1'), entry('Acme', 'Beta', 'https://a.example/2')],
    [entry('Acme', 'Alpha', 'https://a.example/1'), entry('Zed', 'Later', 'https://z.example/1')],
  ]);
  assert.deepEqual(
    merged.map((e) => e.url),
    ['https://a.example/1', 'https://a.example/2', 'https://z.example/1']
  );
});

test('dedupeSources sorts case-insensitively', () => {
  const merged = dedupeSources([
    [entry('beta', 'x', 'https://b/'), entry('Alpha', 'x', 'https://a/')],
  ]);
  assert.deepEqual(
    merged.map((e) => e.publisher),
    ['Alpha', 'beta']
  );
});

test('renderSources emits one bullet per entry', () => {
  const lines = renderSources([entry('Acme', 'Alpha', 'https://a.example/1')]);
  assert.deepEqual(lines, ['- Acme. "Alpha." <https://a.example/1>']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/tests/unit/articles/book/sources.test.mjs`
Expected: FAIL — `Cannot find module '.../book/sources.mjs'`

- [ ] **Step 3: Write the implementation**

Create `scripts/articles/lib/book/sources.mjs`:

```javascript
// The Sources appendix: every chapter's bibliography, merged.
//
// Dedupe is by URL, because the same report is cited by several articles and a
// book that lists it four times looks careless. Footnote markers still repeat
// freely on each citation — that is normal.

/**
 * @param {Array<Array<{publisher: string, title: string, url: string}>>} entryLists
 * @returns {Array<{publisher: string, title: string, url: string}>}
 */
export function dedupeSources(entryLists) {
  const byUrl = new Map();
  for (const list of entryLists) {
    for (const entry of list) {
      if (!byUrl.has(entry.url)) byUrl.set(entry.url, entry);
    }
  }
  const collator = new Intl.Collator('en', { sensitivity: 'base' });
  return [...byUrl.values()].sort(
    (a, b) => collator.compare(a.publisher, b.publisher) || collator.compare(a.title, b.title)
  );
}

/** @param {Array<{publisher: string, title: string, url: string}>} entries */
export function renderSources(entries) {
  return entries.map((entry) => `- ${entry.publisher}. "${entry.title}." <${entry.url}>`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/tests/unit/articles/book/sources.test.mjs`
Expected: PASS, 3 tests

- [ ] **Step 5: Commit**

```bash
git add scripts/articles/lib/book/sources.mjs scripts/tests/unit/articles/book/sources.test.mjs
git commit -m "feat(book): merge chapter bibliographies into a sources appendix"
```

---

### Task 8: Glossary parsing and the glossary file

**Files:**

- Create: `scripts/articles/lib/book/glossary.mjs`
- Create: `docs/articles/assets/book/glossary.md`
- Test: `scripts/tests/unit/articles/book/glossary.test.mjs`

**Interfaces:**

- Consumes: nothing
- Produces: `parseGlossary(source) -> Array<{term: string, aliases: string[], seeAlso: string[], definition: string}>`; `renderGlossary(terms) -> string[]`

- [ ] **Step 1: Write the failing test**

Create `scripts/tests/unit/articles/book/glossary.test.mjs`:

```javascript
// @chore
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { parseGlossary, renderGlossary } from '../../../../articles/lib/book/glossary.mjs';

const SOURCE = `# Glossary

## Evidence gate

_Aliases:_ evidence gates, evidence-gated
_See also:_ Story-governed delivery

A transition check that requires observable proof before work advances.

## Agent fleet

A coordinated set of implementation agents.
`;

test('parseGlossary reads terms, aliases, see-also, and definition', () => {
  const terms = parseGlossary(SOURCE);
  assert.equal(terms.length, 2);
  assert.deepEqual(terms[0], {
    term: 'Evidence gate',
    aliases: ['evidence gates', 'evidence-gated'],
    seeAlso: ['Story-governed delivery'],
    definition: 'A transition check that requires observable proof before work advances.',
  });
  assert.deepEqual(terms[1].aliases, []);
  assert.deepEqual(terms[1].seeAlso, []);
});

test('renderGlossary emits definition-list markdown sorted alphabetically', () => {
  const lines = renderGlossary(parseGlossary(SOURCE));
  assert.equal(lines[0], '**Agent fleet**');
  assert.ok(lines.join('\n').includes('_See also: Story-governed delivery._'));
});

test('the live glossary file parses', async () => {
  const file = path.resolve(
    import.meta.dirname,
    '../../../../../docs/articles/assets/book/glossary.md'
  );
  const terms = parseGlossary(await readFile(file, 'utf8'));
  assert.ok(terms.length >= 8, `expected the seeded glossary, got ${terms.length} terms`);
  assert.ok(terms.every((t) => t.definition.length > 0));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/tests/unit/articles/book/glossary.test.mjs`
Expected: FAIL — `Cannot find module '.../book/glossary.mjs'`

- [ ] **Step 3: Write the implementation and seed the glossary**

Create `scripts/articles/lib/book/glossary.mjs`:

```javascript
// The glossary is markdown, not a data file, because the definitions are prose
// the author edits by hand. As markdown they get prettier, markdownlint, and
// cspell coverage that a YAML block scalar would not.

const TERM_RE = /^## (.+)$/;
const ALIASES_RE = /^_Aliases:_\s*(.+)$/;
const SEE_ALSO_RE = /^_See also:_\s*(.+)$/;

const splitList = (text) =>
  text
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

/**
 * @param {string} source contents of `docs/articles/assets/book/glossary.md`
 * @returns {Array<{term: string, aliases: string[], seeAlso: string[], definition: string}>}
 */
export function parseGlossary(source) {
  const terms = [];
  let current = null;
  const definition = [];

  const flush = () => {
    if (current === null) return;
    current.definition = definition.join(' ').replace(/\s+/g, ' ').trim();
    terms.push(current);
    definition.length = 0;
  };

  for (const raw of source.split('\n')) {
    const line = raw.trim();
    const heading = line.match(TERM_RE);
    if (heading) {
      flush();
      current = { term: heading[1].trim(), aliases: [], seeAlso: [], definition: '' };
      continue;
    }
    if (current === null) continue;
    const aliases = line.match(ALIASES_RE);
    if (aliases) {
      current.aliases = splitList(aliases[1]);
      continue;
    }
    const seeAlso = line.match(SEE_ALSO_RE);
    if (seeAlso) {
      current.seeAlso = splitList(seeAlso[1]);
      continue;
    }
    if (line !== '') definition.push(line);
  }
  flush();
  return terms;
}

/** @param {Array<{term: string, seeAlso: string[], definition: string}>} terms */
export function renderGlossary(terms) {
  const collator = new Intl.Collator('en', { sensitivity: 'base' });
  const sorted = [...terms].sort((a, b) => collator.compare(a.term, b.term));
  const lines = [];
  for (const term of sorted) {
    lines.push(`**${term.term}**`, '');
    lines.push(term.definition, '');
    if (term.seeAlso.length > 0) {
      lines.push(`_See also: ${term.seeAlso.join(', ')}._`, '');
    }
  }
  return lines;
}
```

Create `docs/articles/assets/book/glossary.md`, seeded from the `## Preferred Terms` list in `docs/articles/series-style-guide.md`:

```markdown
# Glossary

<!-- Definitions seeded from docs/articles/series-style-guide.md `## Preferred Terms`. -->

## Agent fleet

_Aliases:_ agent fleets

A coordinated set of implementation agents working under backlog, dependency, and evidence controls.

## AITM

_Aliases:_ @kburson/ai-task-manager

An AI skill and npm package that supports GitHub-backed task workflows with Claude Code and Codex.

## Backlog Manager Pattern

Using the backlog as a durable control plane for agentic execution.

## Code-construction layer

The implementation layer where agents operate: syntax, local structure, framework mechanics.

## Delivery architect

_Aliases:_ delivery architects

A human operator role for senior engineers, technical product owners, or technical product managers who own decomposition, sequencing, fit, risk, and review.

## Evidence gate

_Aliases:_ evidence gates, evidence-gated
_See also:_ Story-governed delivery

A transition check that requires observable proof before work advances.

## Implementation agent

_Aliases:_ implementation agents
_See also:_ Agent fleet

An AI agent responsible for local code construction, syntax, framework mechanics, test execution, and narrow task delivery.

## Story-governed delivery

_See also:_ Evidence gate

The AITM pattern where specs become stories, stories carry gates, and gates require evidence.

## Technical Product Operations

The discipline of turning product intent, architecture guardrails, and delivery risk into an executable backlog that implementation agents can safely act on.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/tests/unit/articles/book/glossary.test.mjs`
Expected: PASS, 3 tests

- [ ] **Step 5: Commit**

```bash
git add scripts/articles/lib/book/glossary.mjs docs/articles/assets/book/glossary.md scripts/tests/unit/articles/book/glossary.test.mjs
git commit -m "feat(book): parse the glossary and seed it from the style guide"
```

---

### Task 9: Index hit recording

**Files:**

- Create: `scripts/articles/lib/book/index-terms.mjs`
- Test: `scripts/tests/unit/articles/book/index-terms.test.mjs`

**Interfaces:**

- Consumes: glossary term shape from Task 8
- Produces:
  - `buildMatcher(terms) -> Array<{term: string, re: RegExp}>`
  - `annotateLines(lines, matcher, {target, location, hits, seen}) -> string[]` where `target` is `'pdf' | 'anchor' | 'none'`, `location` is `{chapter: number, section: string}`, `hits` is `Map<string, Array<location>>`, `seen` is a `Set<string>` scoped to one section
  - `renderLinkedIndex(hits) -> string[]`

- [ ] **Step 1: Write the failing test**

Create `scripts/tests/unit/articles/book/index-terms.test.mjs`:

````javascript
// @chore
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  annotateLines,
  buildMatcher,
  renderLinkedIndex,
} from '../../../../articles/lib/book/index-terms.mjs';

const TERMS = [
  { term: 'Evidence gate', aliases: ['evidence gates'], seeAlso: [], definition: 'x' },
  { term: 'Agent fleet', aliases: [], seeAlso: [], definition: 'y' },
];

const location = { chapter: 3, section: 'Body' };

test('annotateLines injects one latex index entry per term per section', () => {
  const matcher = buildMatcher(TERMS);
  const hits = new Map();
  const seen = new Set();
  const out = annotateLines(
    ['An evidence gate is a check.', 'Another evidence gate appears.', 'The agent fleet runs.'],
    matcher,
    { target: 'pdf', location, hits, seen }
  );
  assert.equal(out[0], 'An evidence gate is a check.\\index{Evidence gate}');
  assert.equal(out[1], 'Another evidence gate appears.');
  assert.equal(out[2], 'The agent fleet runs.\\index{Agent fleet}');
  assert.deepEqual([...hits.keys()], ['Evidence gate', 'Agent fleet']);
});

test('a fresh section seen-set allows the same term to be indexed again', () => {
  const matcher = buildMatcher(TERMS);
  const hits = new Map();
  annotateLines(['an evidence gate'], matcher, { target: 'pdf', location, hits, seen: new Set() });
  annotateLines(['an evidence gate'], matcher, {
    target: 'pdf',
    location: { chapter: 4, section: 'Other' },
    hits,
    seen: new Set(),
  });
  assert.equal(hits.get('Evidence gate').length, 2);
});

test('anchor target emits html anchors instead of latex', () => {
  const matcher = buildMatcher(TERMS);
  const out = annotateLines(['an evidence gate'], matcher, {
    target: 'anchor',
    location,
    hits: new Map(),
    seen: new Set(),
  });
  assert.equal(out[0], 'an evidence gate<a id="ix-evidence-gate-3-1"></a>');
});

test('none target records hits without touching the prose', () => {
  const matcher = buildMatcher(TERMS);
  const hits = new Map();
  const out = annotateLines(['an evidence gate'], matcher, {
    target: 'none',
    location,
    hits,
    seen: new Set(),
  });
  assert.equal(out[0], 'an evidence gate');
  assert.equal(hits.get('Evidence gate').length, 1);
});

test('matching skips fenced code and existing links', () => {
  const matcher = buildMatcher(TERMS);
  const hits = new Map();
  const out = annotateLines(['```', 'an evidence gate', '```'], matcher, {
    target: 'pdf',
    location,
    hits,
    seen: new Set(),
  });
  assert.deepEqual(out, ['```', 'an evidence gate', '```']);
  assert.equal(hits.size, 0);
});

test('renderLinkedIndex lists terms alphabetically with chapter and section', () => {
  const hits = new Map([
    ['Evidence gate', [{ chapter: 3, section: 'Body' }]],
    ['Agent fleet', [{ chapter: 1, section: 'Intro' }]],
  ]);
  const lines = renderLinkedIndex(hits);
  assert.equal(lines[0], '- **Agent fleet** — Chapter 1 (Intro)');
  assert.equal(lines[1], '- **Evidence gate** — Chapter 3 (Body)');
});
````

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/tests/unit/articles/book/index-terms.test.mjs`
Expected: FAIL — `Cannot find module '.../book/index-terms.mjs'`

- [ ] **Step 3: Write the implementation**

Create `scripts/articles/lib/book/index-terms.mjs`:

````javascript
// Index hits.
//
// One entry per term per `##` section, never per match. Indexing every
// occurrence of "evidence gate" in a book about evidence gates produces an
// index entry per paragraph, which is the same as having no index.
//
// The same pass serves all targets: `\index{}` for LaTeX, an anchor for
// reflowable formats, nothing at all for the clean reviewable manuscript.

const FENCE_RE = /^```/;
const LINK_TARGET_RE = /\]\([^)]*\)/g;

const slugify = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Longest phrase first, so "evidence gate" wins over a shorter overlapping
 * alias when both could match the same span.
 *
 * @param {Array<{term: string, aliases: string[]}>} terms
 */
export function buildMatcher(terms) {
  const entries = [];
  for (const term of terms) {
    for (const phrase of [term.term, ...term.aliases]) {
      entries.push({
        term: term.term,
        phrase,
        re: new RegExp(`\\b${escapeRegExp(phrase)}\\b`, 'i'),
      });
    }
  }
  return entries.sort((a, b) => b.phrase.length - a.phrase.length);
}

/**
 * @param {string[]} lines
 * @param {ReturnType<typeof buildMatcher>} matcher
 * @param {{target: 'pdf'|'anchor'|'none', location: {chapter: number, section: string}, hits: Map<string, Array<object>>, seen: Set<string>}} options
 * @returns {string[]}
 */
export function annotateLines(lines, matcher, { target, location, hits, seen }) {
  let inFence = false;
  return lines.map((line) => {
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      return line;
    }
    if (inFence || line.trim() === '' || line.startsWith('#')) return line;

    const searchable = line.replace(LINK_TARGET_RE, ']()');
    let annotated = line;
    for (const entry of matcher) {
      if (seen.has(entry.term)) continue;
      if (!entry.re.test(searchable)) continue;
      seen.add(entry.term);
      const list = hits.get(entry.term) ?? [];
      list.push(location);
      hits.set(entry.term, list);
      if (target === 'pdf') {
        annotated += `\\index{${entry.term}}`;
      } else if (target === 'anchor') {
        annotated += `<a id="ix-${slugify(entry.term)}-${location.chapter}-${list.length}"></a>`;
      }
    }
    return annotated;
  });
}

/** @param {Map<string, Array<{chapter: number, section: string}>>} hits */
export function renderLinkedIndex(hits) {
  const collator = new Intl.Collator('en', { sensitivity: 'base' });
  return [...hits.entries()]
    .sort((a, b) => collator.compare(a[0], b[0]))
    .map(
      ([term, locations]) =>
        `- **${term}** — ${locations.map((l) => `Chapter ${l.chapter} (${l.section})`).join(', ')}`
    );
}
````

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/tests/unit/articles/book/index-terms.test.mjs`
Expected: PASS, 6 tests

- [ ] **Step 5: Commit**

```bash
git add scripts/articles/lib/book/index-terms.mjs scripts/tests/unit/articles/book/index-terms.test.mjs
git commit -m "feat(book): record index hits once per term per section"
```

---

### Task 10: Manuscript assembly

This is the task that wires Tasks 1 through 9 together and produces the single markdown file every render target consumes.

**Files:**

- Create: `scripts/articles/lib/book/manuscript.mjs`
- Create: `docs/articles/assets/book/book.json`
- Create: `docs/articles/assets/book/introduction.md`
- Test: `scripts/tests/unit/articles/book/manuscript.test.mjs`

**Interfaces:**

- Consumes: `listSpine` (Task 1), `parseArticle` with `keepComments` (Task 2), `scanSections`/`validateArticle` (Task 3), `applyBookStrip` (Task 4), `planChapters`/`shiftHeading` (Task 5), `parseBibliography`/`convertLine` (Task 6), `dedupeSources`/`renderSources` (Task 7), `parseGlossary`/`renderGlossary` (Task 8), `buildMatcher`/`annotateLines`/`renderLinkedIndex` (Task 9)
- Produces: `buildManuscript({articlesDir, bookDir, target}) -> Promise<{markdown: string, chapters: number, footnotes: number, indexTerms: number}>` where `target` is `'pdf' | 'epub' | 'html' | 'manuscript'`

- [ ] **Step 1: Write the failing test**

Create `scripts/tests/unit/articles/book/manuscript.test.mjs`:

```javascript
// @chore
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { buildManuscript } from '../../../../articles/lib/book/manuscript.mjs';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';

const ARTICLE_ONE = `# First Chapter

<!-- book:part title="Beginnings" -->

![First Chapter](assets/article-headers/article-01-header.png)
_Part 1 of a series of articles on Agentic Agile Delivery_

Opening prose about an evidence gate and a [report](https://dora.dev/x/).

## Body One

More prose, see [Second](02-second.md).

## Series Link

The next article continues.

## Bibliography

- DORA. "A Report." https://dora.dev/x/
`;

const ARTICLE_TWO = `# Second Chapter

<!-- book:merge-into-previous -->

![Second Chapter](assets/article-headers/article-02-header.png)
_Part 2 of a series of articles on Agentic Agile Delivery_

<!-- book:include path=fragments/bridge.md -->

Second prose citing the same [report](https://dora.dev/x/).

## Body Two

Deeper text.

## Series Link

Done.

## Bibliography

- DORA. "A Report." https://dora.dev/x/
`;

const GLOSSARY = `# Glossary

## Evidence gate

_Aliases:_ evidence gates

A transition check that requires observable proof before work advances.
`;

async function fixture() {
  const root = await mkdtemp(path.join(projectScratchDir('test'), 'manuscript-'));
  const articlesDir = path.join(root, 'articles');
  const bookDir = path.join(articlesDir, 'assets', 'book');
  await mkdir(path.join(bookDir, 'fragments'), { recursive: true });
  await writeFile(path.join(articlesDir, '01-first.md'), ARTICLE_ONE);
  await writeFile(path.join(articlesDir, '02-second.md'), ARTICLE_TWO);
  await writeFile(path.join(bookDir, 'glossary.md'), GLOSSARY);
  await writeFile(path.join(bookDir, 'introduction.md'), '# Introduction\n\nWhy this book.\n');
  await writeFile(
    path.join(bookDir, 'book.json'),
    JSON.stringify({ title: 'The Book', author: ['A. Author'] })
  );
  await writeFile(path.join(bookDir, 'fragments', 'bridge.md'), 'A bridging paragraph.\n');
  return { root, articlesDir, bookDir };
}

test('buildManuscript composes chapters, front matter, and appendices', async () => {
  const { root, articlesDir, bookDir } = await fixture();
  try {
    const result = await buildManuscript({ articlesDir, bookDir, target: 'pdf' });
    const md = result.markdown;

    assert.equal(result.chapters, 1, 'merge-into-previous folds article 02 into chapter 1');
    assert.match(md, /^# First Chapter$/m);
    assert.match(md, /^## Second Chapter$/m, 'merged article title demotes to a section');
    assert.match(md, /^### Body Two$/m, 'merged article sections shift one level');
    assert.match(md, /^## Body One$/m);

    assert.equal(md.includes('_Part 1 of a series'), false);
    assert.equal(md.includes('article-01-header.png'), false);
    assert.equal(md.includes('The next article continues.'), false);
    assert.equal(md.includes('book:'), false, 'no marker survives into the manuscript');

    assert.match(md, /\\part\{Beginnings\}/);
    assert.match(md, /A bridging paragraph\./);
    assert.match(md, /Second \(Chapter 1\)/);
    assert.match(md, /\[\^c01-1\]/);
    assert.match(md, /\[\^c01-1\]: DORA\. "A Report\." <https:\/\/dora\.dev\/x\/>/);
    assert.match(md, /\\index\{Evidence gate\}/);
    assert.match(md, /^# Introduction$/m);
    assert.match(md, /^# Glossary$/m);
    assert.match(md, /^# Sources$/m);
    assert.match(md, /^# Index$/m);
    assert.match(md, /\\printindex/);

    const sources = md.slice(md.indexOf('# Sources'));
    assert.equal(sources.split('https://dora.dev/x/').length - 1, 1, 'sources are deduped');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('the manuscript target emits no latex and no index markup', async () => {
  const { root, articlesDir, bookDir } = await fixture();
  try {
    const { markdown } = await buildManuscript({ articlesDir, bookDir, target: 'manuscript' });
    assert.equal(markdown.includes('\\index{'), false);
    assert.equal(markdown.includes('\\part{'), false);
    assert.equal(markdown.includes('\\printindex'), false);
    assert.match(markdown, /^# Beginnings$/m, 'parts become plain headings');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a missing include fragment fails loudly', async () => {
  const { root, articlesDir, bookDir } = await fixture();
  try {
    await rm(path.join(bookDir, 'fragments', 'bridge.md'));
    await assert.rejects(
      () => buildManuscript({ articlesDir, bookDir, target: 'pdf' }),
      /bridge\.md/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/tests/unit/articles/book/manuscript.test.mjs`
Expected: FAIL — `Cannot find module '.../book/manuscript.mjs'`

- [ ] **Step 3: Write the implementation and the metadata files**

Create `scripts/articles/lib/book/manuscript.mjs`:

```javascript
// Assemble the whole book into one markdown file.
//
// Target matters here rather than in a post-processing pass, because Part
// dividers, index entries, and the appendix switch all need different markup
// per target and rewriting LaTeX out of a string afterwards is guesswork.

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { parseArticle } from '../parse-article.mjs';
import { convertLine, parseBibliography } from './footnotes.mjs';
import { parseGlossary, renderGlossary } from './glossary.mjs';
import { planChapters, shiftHeading } from './headings.mjs';
import { annotateLines, buildMatcher, renderLinkedIndex } from './index-terms.mjs';
import { MarkerError, scanSections, validateArticle } from './markers.mjs';
import { listSpine } from './spine.mjs';
import { applyBookStrip } from './strip.mjs';
import { dedupeSources, renderSources } from './sources.mjs';

const indexTargetFor = (target) =>
  target === 'pdf' ? 'pdf' : target === 'manuscript' ? 'none' : 'anchor';

async function loadArticle(entry, { isFirst }) {
  const parsed = parseArticle(entry.source, { keepComments: true });
  const scanned = scanSections(parsed.sections, entry.file);
  validateArticle(scanned, { file: entry.file, isFirst });

  const preamble = scanned[0]?.heading === null ? scanned[0].items : [];
  const markerOf = (verb) =>
    preamble.find((item) => item.kind === 'marker' && item.verb === verb) ?? null;

  const { sections, bibliographyLines } = applyBookStrip(scanned);

  return {
    slug: entry.slug,
    file: entry.file,
    title: parsed.title,
    chapterTitle: markerOf('chapter')?.attrs.title ?? null,
    part: markerOf('part')?.attrs.title ?? null,
    mergeIntoPrevious: markerOf('merge-into-previous') !== null,
    sections,
    bibliography: parseBibliography(bibliographyLines),
  };
}

async function resolveIncludes(items, { bookDir, file, indexTarget }) {
  const lines = [];
  let demote = 0;
  for (const item of items) {
    if (item.kind === 'text') {
      lines.push({ text: item.text, demote });
      continue;
    }
    if (item.verb === 'demote') {
      demote += Number(item.attrs.by);
      continue;
    }
    // `pagebreak` and `index` are LaTeX-only instructions. Emitting them
    // unconditionally would leak raw markup into EPUB, HTML, and the clean
    // reviewable manuscript, which is exactly what the target parameter exists
    // to prevent.
    if (item.verb === 'pagebreak') {
      if (indexTarget === 'pdf') lines.push({ text: '\\newpage', demote, raw: true });
      continue;
    }
    if (item.verb === 'index') {
      if (indexTarget === 'pdf') {
        lines.push({ text: `\\index{${item.attrs.term}}`, demote, raw: true });
      } else if (indexTarget === 'anchor') {
        lines.push({
          text: `<a id="ix-manual-${lines.length}"></a>`,
          demote,
          raw: true,
        });
      }
      continue;
    }
    if (item.verb === 'include') {
      const target = path.join(bookDir, item.attrs.path);
      let fragment;
      try {
        fragment = await readFile(target, 'utf8');
      } catch {
        throw new MarkerError(`book:include cannot read ${item.attrs.path}`, file);
      }
      for (const text of fragment.replace(/\n+$/, '').split('\n')) {
        lines.push({ text, demote });
      }
      continue;
    }
  }
  return lines;
}

/**
 * @param {{articlesDir: string, bookDir: string, target: 'pdf'|'epub'|'html'|'manuscript'}} options
 * @returns {Promise<{markdown: string, chapters: number, footnotes: number, indexTerms: number}>}
 */
export async function buildManuscript({ articlesDir, bookDir, target }) {
  const spine = await listSpine(articlesDir);
  const articles = [];
  for (const [i, entry] of spine.entries()) {
    articles.push(await loadArticle(entry, { isFirst: i === 0 }));
  }

  const chapters = planChapters(articles);
  const chapterBySlug = new Map();
  for (const chapter of chapters) {
    for (const member of chapter.members) chapterBySlug.set(member.article.slug, chapter.number);
  }

  const glossaryTerms = parseGlossary(await readFile(path.join(bookDir, 'glossary.md'), 'utf8'));
  const matcher = buildMatcher(glossaryTerms);
  const indexTarget = indexTargetFor(target);
  const isPdf = target === 'pdf';

  const hits = new Map();
  const footnotes = [];
  const body = [];

  for (const chapter of chapters) {
    if (chapter.part) {
      body.push(isPdf ? `\\part{${chapter.part}}` : `# ${chapter.part}`, '');
    }
    body.push(`# ${chapter.title}`, '');

    for (const member of chapter.members) {
      const { article, shift } = member;
      const ctx = {
        bibByUrl: new Map(article.bibliography.map((e) => [e.url, e])),
        chapterBySlug,
        footnotes,
        idPrefix: `c${String(chapter.number).padStart(2, '0')}`,
        file: article.file,
      };

      if (shift > 0) body.push(`## ${article.title}`, '');

      for (const section of article.sections) {
        const sectionName = section.heading ?? chapter.title;
        if (section.heading) {
          body.push(shiftHeading(`## ${section.heading}`, shift), '');
        }
        const resolved = await resolveIncludes(section.items, {
          bookDir,
          file: article.file,
          indexTarget,
        });
        const converted = resolved.map((line) =>
          line.raw ? line.text : shiftHeading(convertLine(line.text, ctx), shift + line.demote)
        );
        const annotated = annotateLines(converted, matcher, {
          target: indexTarget,
          location: { chapter: chapter.number, section: sectionName },
          hits,
          seen: new Set(),
        });
        body.push(...annotated, '');
      }
    }
  }

  const introduction = await readFile(path.join(bookDir, 'introduction.md'), 'utf8');
  const sources = dedupeSources(articles.map((a) => a.bibliography));

  const out = [introduction.replace(/\n+$/, ''), ''];
  out.push(...body);
  if (isPdf) out.push('\\appendix', '');
  out.push('# Glossary', '', ...renderGlossary(glossaryTerms));
  out.push('# Sources', '', ...renderSources(sources), '');
  out.push('# Index', '');
  out.push(...(isPdf ? ['\\printindex', ''] : [...renderLinkedIndex(hits), '']));
  if (footnotes.length > 0) {
    out.push(...footnotes.map((f) => `[^${f.id}]: ${f.text}`), '');
  }

  return {
    markdown: `${out
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()}\n`,
    chapters: chapters.length,
    footnotes: footnotes.length,
    indexTerms: hits.size,
  };
}
```

Create `docs/articles/assets/book/book.json`. Fill `title`, `subtitle`, and `author` with the author's own values before the first real render; the placeholders below are deliberate and marked as such in Task 13:

```json
{
  "title": "Agentic Agile Delivery",
  "subtitle": "Governing AI Implementation Agents With A Backlog",
  "author": ["Kendrick Burson"],
  "rights": "Copyright 2026 Kendrick Burson. All rights reserved.",
  "lang": "en-US",
  "documentclass": "book",
  "classoption": ["oneside"],
  "papersize": "letter",
  "fontsize": "11pt",
  "mainfont": "Palatino",
  "geometry": ["margin=1in"],
  "linkcolor": "black",
  "header-includes": ["\\usepackage{makeidx}", "\\makeindex"]
}
```

Create `docs/articles/assets/book/introduction.md`:

```markdown
# Introduction

<!-- STUB: replace with the book's introduction. See Phase 2 in
docs/superpowers/plans/2026-08-25-book-composition-path.md — this is the
author's voice and is deliberately not written by the toolchain. -->

This book collects a series of articles about running software delivery when
implementation agents write most of the code.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/tests/unit/articles/book/manuscript.test.mjs`
Expected: PASS, 3 tests

- [ ] **Step 5: Commit**

```bash
git add scripts/articles/lib/book/manuscript.mjs docs/articles/assets/book/book.json docs/articles/assets/book/introduction.md scripts/tests/unit/articles/book/manuscript.test.mjs
git commit -m "feat(book): assemble the manuscript from the article spine"
```

---

### Task 11: Toolchain doctor

**Files:**

- Create: `scripts/articles/lib/book/toolchain.mjs`
- Test: `scripts/tests/unit/articles/book/toolchain.test.mjs`

**Interfaces:**

- Consumes: nothing
- Produces:
  - `REQUIRED_BINARIES: string[]`, `PROBE_PACKAGES: string[]`
  - `probeDocument(pkg) -> string`
  - `doctor({runBinary, runProbe}) -> Promise<{ok: boolean, missingBinaries: string[], missingPackages: string[], hint: string|null}>` where both injected functions return a `Promise<boolean>`
  - `tlmgrHint(missingPackages) -> string|null`

- [ ] **Step 1: Write the failing test**

Create `scripts/tests/unit/articles/book/toolchain.test.mjs`:

```javascript
// @chore
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  doctor,
  PROBE_PACKAGES,
  probeDocument,
  REQUIRED_BINARIES,
  tlmgrHint,
} from '../../../../articles/lib/book/toolchain.mjs';

test('probeDocument compiles a single package', () => {
  const tex = probeDocument('makeidx');
  assert.match(tex, /\\usepackage\{makeidx\}/);
  assert.match(tex, /\\begin\{document\}/);
  assert.match(tex, /\\end\{document\}/);
});

test('tlmgrHint names every missing package in one command', () => {
  assert.equal(tlmgrHint([]), null);
  assert.equal(tlmgrHint(['makeidx', 'xurl']), 'sudo tlmgr install makeidx xurl');
});

test('doctor reports a clean toolchain', async () => {
  const result = await doctor({
    runBinary: async () => true,
    runProbe: async () => true,
  });
  assert.deepEqual(result, { ok: true, missingBinaries: [], missingPackages: [], hint: null });
});

test('doctor reports missing binaries and skips probing', async () => {
  let probed = 0;
  const result = await doctor({
    runBinary: async (name) => name !== 'latexmk',
    runProbe: async () => {
      probed += 1;
      return true;
    },
  });
  assert.deepEqual(result.missingBinaries, ['latexmk']);
  assert.equal(result.ok, false);
  assert.equal(probed, 0, 'probing a missing engine would only produce noise');
});

test('doctor reports missing packages with a tlmgr hint', async () => {
  const result = await doctor({
    runBinary: async () => true,
    runProbe: async (pkg) => pkg !== 'makeidx',
  });
  assert.deepEqual(result.missingPackages, ['makeidx']);
  assert.equal(result.hint, 'sudo tlmgr install makeidx');
  assert.equal(result.ok, false);
});

test('the probe list covers what the pandoc book template needs', () => {
  for (const required of ['fontspec', 'unicode-math', 'hyperref', 'geometry', 'makeidx']) {
    assert.ok(PROBE_PACKAGES.includes(required), `missing ${required}`);
  }
  assert.deepEqual(REQUIRED_BINARIES, ['pandoc', 'xelatex', 'latexmk', 'makeindex']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/tests/unit/articles/book/toolchain.test.mjs`
Expected: FAIL — `Cannot find module '.../book/toolchain.mjs'`

- [ ] **Step 3: Write the implementation**

Create `scripts/articles/lib/book/toolchain.mjs`:

```javascript
// Toolchain doctor.
//
// LaTeX is a system prerequisite: no usable engine exists on npm. Rather than
// hard-coding a package list that drifts as pandoc's template evolves, the
// doctor compiles a one-line probe per package and reports exactly which ones
// this machine is missing, as a command the author can paste.

import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { projectScratchDir } from '../../../task-tracker/lib/scratch-dir.mjs';

export const REQUIRED_BINARIES = ['pandoc', 'xelatex', 'latexmk', 'makeindex'];

export const PROBE_PACKAGES = [
  'fontspec',
  'unicode-math',
  'xcolor',
  'geometry',
  'hyperref',
  'booktabs',
  'etoolbox',
  'footnotehyper',
  'upquote',
  'fancyvrb',
  'parskip',
  'xurl',
  'bookmark',
  'makeidx',
];

export function probeDocument(pkg) {
  return `\\documentclass{book}\n\\usepackage{${pkg}}\n\\begin{document}probe\\end{document}\n`;
}

export function tlmgrHint(missingPackages) {
  if (missingPackages.length === 0) return null;
  return `sudo tlmgr install ${missingPackages.join(' ')}`;
}

function run(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: 'ignore', ...options });
    child.on('error', () => resolve(false));
    child.on('close', (code) => resolve(code === 0));
  });
}

/** Default probe: compile a throwaway document that loads exactly one package. */
export async function compileProbe(pkg) {
  const dir = await mkdtemp(path.join(projectScratchDir('book'), 'texprobe-'));
  try {
    const file = path.join(dir, 'probe.tex');
    await writeFile(file, probeDocument(pkg));
    return await run('xelatex', ['-interaction=nonstopmode', '-halt-on-error', 'probe.tex'], {
      cwd: dir,
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * @param {{runBinary?: (name: string) => Promise<boolean>, runProbe?: (pkg: string) => Promise<boolean>}} [injected]
 * @returns {Promise<{ok: boolean, missingBinaries: string[], missingPackages: string[], hint: string|null}>}
 */
export async function doctor({
  runBinary = (name) => run('command', ['-v', name], { shell: true }),
  runProbe = compileProbe,
} = {}) {
  const missingBinaries = [];
  for (const name of REQUIRED_BINARIES) {
    if (!(await runBinary(name))) missingBinaries.push(name);
  }
  if (missingBinaries.length > 0) {
    return { ok: false, missingBinaries, missingPackages: [], hint: null };
  }

  const missingPackages = [];
  for (const pkg of PROBE_PACKAGES) {
    if (!(await runProbe(pkg))) missingPackages.push(pkg);
  }
  return {
    ok: missingPackages.length === 0,
    missingBinaries,
    missingPackages,
    hint: tlmgrHint(missingPackages),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/tests/unit/articles/book/toolchain.test.mjs`
Expected: PASS, 6 tests

- [ ] **Step 5: Commit**

```bash
git add scripts/articles/lib/book/toolchain.mjs scripts/tests/unit/articles/book/toolchain.test.mjs
git commit -m "feat(book): check the latex toolchain and name missing packages"
```

---

### Task 12: Render targets and the CLI

**Files:**

- Create: `scripts/articles/lib/book/render.mjs`
- Create: `scripts/articles/compose-book.mjs`
- Test: `scripts/tests/unit/articles/book/render.test.mjs`

**Interfaces:**

- Consumes: `buildManuscript` (Task 10), `doctor` (Task 11)
- Produces:
  - `pandocArgs({manuscriptPath, bookDir, target, outDir}) -> string[]`
  - `latexmkArgs({texPath, outDir}) -> string[]`
  - `parseArgs(argv) -> {targets: string[], out: string, doctor: boolean, help: boolean}`
  - `TARGETS: string[]`

- [ ] **Step 1: Write the failing test**

Create `scripts/tests/unit/articles/book/render.test.mjs`:

```javascript
// @chore
import assert from 'node:assert/strict';
import test from 'node:test';

import { parseArgs } from '../../../../articles/compose-book.mjs';
import { latexmkArgs, pandocArgs, TARGETS } from '../../../../articles/lib/book/render.mjs';

test('pandocArgs maps top-level headings to chapters and loads the metadata file', () => {
  const args = pandocArgs({
    manuscriptPath: '/tmp/book/manuscript.md',
    bookDir: '/repo/docs/articles/assets/book',
    target: 'pdf',
    outDir: '/tmp/book',
  });
  assert.ok(args.includes('--top-level-division=chapter'));
  assert.ok(args.includes('--metadata-file=/repo/docs/articles/assets/book/book.json'));
  assert.ok(args.includes('--toc'));
  assert.ok(args.includes('--standalone'));
  assert.deepEqual(args.slice(-2), ['-o', '/tmp/book/book.tex']);
});

test('pandocArgs emits epub and html directly', () => {
  const base = { manuscriptPath: '/m.md', bookDir: '/b', outDir: '/o' };
  assert.deepEqual(pandocArgs({ ...base, target: 'epub' }).slice(-2), ['-o', '/o/book.epub']);
  assert.deepEqual(pandocArgs({ ...base, target: 'html' }).slice(-2), ['-o', '/o/book.html']);
});

test('latexmkArgs drives xelatex with an output directory', () => {
  const args = latexmkArgs({ texPath: '/o/book.tex', outDir: '/o' });
  assert.ok(args.includes('-xelatex'));
  assert.ok(args.includes('-interaction=nonstopmode'));
  assert.ok(args.includes('-outdir=/o'));
  assert.equal(args.at(-1), '/o/book.tex');
});

test('parseArgs defaults to every target', () => {
  const options = parseArgs([]);
  assert.deepEqual(options.targets, TARGETS);
  assert.equal(options.doctor, false);
});

test('parseArgs accepts a single target and a doctor flag', () => {
  assert.deepEqual(parseArgs(['--target', 'epub']).targets, ['epub']);
  assert.equal(parseArgs(['--doctor']).doctor, true);
  assert.equal(parseArgs(['--out', '/x']).out, '/x');
});

test('parseArgs rejects unknown targets and unknown flags', () => {
  assert.throws(() => parseArgs(['--target', 'mobi']), /unknown target/);
  assert.throws(() => parseArgs(['--nope']), /unknown argument/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/tests/unit/articles/book/render.test.mjs`
Expected: FAIL — `Cannot find module '.../book/render.mjs'`

- [ ] **Step 3: Write the implementation**

Create `scripts/articles/lib/book/render.mjs`:

```javascript
// Rendering. Pandoc for every target; latexmk on top of it for PDF, because a
// table of contents and a makeindex index both need multiple passes and pandoc
// runs the engine exactly once.

import { spawn } from 'node:child_process';
import path from 'node:path';

export const TARGETS = ['manuscript', 'pdf', 'epub', 'html'];

const OUTPUT_NAME = { pdf: 'book.tex', epub: 'book.epub', html: 'book.html' };

export function pandocArgs({ manuscriptPath, bookDir, target, outDir }) {
  return [
    manuscriptPath,
    `--metadata-file=${path.join(bookDir, 'book.json')}`,
    '--top-level-division=chapter',
    '--toc',
    '--toc-depth=2',
    '--standalone',
    '-o',
    path.join(outDir, OUTPUT_NAME[target]),
  ];
}

export function latexmkArgs({ texPath, outDir }) {
  return ['-xelatex', '-interaction=nonstopmode', '-halt-on-error', `-outdir=${outDir}`, texPath];
}

export function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`))
    );
  });
}

export async function renderTarget({ manuscriptPath, bookDir, outDir, target }) {
  await runCommand('pandoc', pandocArgs({ manuscriptPath, bookDir, target, outDir }));
  if (target !== 'pdf') return;
  const texPath = path.join(outDir, 'book.tex');
  await runCommand('latexmk', latexmkArgs({ texPath, outDir }));
}
```

Create `scripts/articles/compose-book.mjs`:

```javascript
#!/usr/bin/env node
// Compose the article series into a book.
//
// Usage:
//   node scripts/articles/compose-book.mjs [--target manuscript|pdf|epub|html]
//                                          [--out <dir>] [--doctor] [--help]
//
// Reads docs/articles/ and never writes there.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildManuscript } from './lib/book/manuscript.mjs';
import { renderTarget, TARGETS } from './lib/book/render.mjs';
import { doctor } from './lib/book/toolchain.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const ARTICLES_DIR = path.join(REPO_ROOT, 'docs', 'articles');
const BOOK_DIR = path.join(ARTICLES_DIR, 'assets', 'book');
const DEFAULT_OUT = path.join(REPO_ROOT, '.tmp', 'book');

const HELP = `compose-book — article series -> book manuscript and rendered targets

Usage
  node scripts/articles/compose-book.mjs [options]
  npm run book -- [options]

Options
  --target <name>   One of ${TARGETS.join(', ')}. Repeatable. Default: all.
  --out <dir>       Output root (default .tmp/book).
  --doctor          Check the LaTeX toolchain and exit.
  --help            Show this message.
`;

export function parseArgs(argv) {
  const options = { targets: [], out: DEFAULT_OUT, doctor: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--doctor') options.doctor = true;
    else if (arg === '--out') {
      options.out = argv[(i += 1)];
      if (!options.out) throw new Error('--out requires a value');
    } else if (arg === '--target') {
      const value = argv[(i += 1)];
      if (!TARGETS.includes(value)) throw new Error(`unknown target: ${value}`);
      options.targets.push(value);
    } else throw new Error(`unknown argument: ${arg}`);
  }
  if (options.targets.length === 0) options.targets = [...TARGETS];
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(HELP);
    return;
  }

  if (options.doctor) {
    const report = await doctor();
    if (report.missingBinaries.length > 0) {
      console.error(`missing on PATH: ${report.missingBinaries.join(', ')}`);
      console.error('install pandoc with `brew install pandoc`');
      console.error(
        'install LaTeX with `brew install --cask basictex`, then `sudo tlmgr install latexmk`'
      );
    }
    if (report.hint) console.error(report.hint);
    if (report.ok) console.log('doctor:book — toolchain is complete');
    process.exitCode = report.ok ? 0 : 1;
    return;
  }

  await mkdir(options.out, { recursive: true });

  for (const target of options.targets) {
    const built = await buildManuscript({ articlesDir: ARTICLES_DIR, bookDir: BOOK_DIR, target });
    const name = target === 'manuscript' ? 'manuscript.md' : `manuscript-${target}.md`;
    const manuscriptPath = path.join(options.out, name);
    await writeFile(manuscriptPath, built.markdown);
    console.log(
      `${target}: ${built.chapters} chapters, ${built.footnotes} footnotes, ${built.indexTerms} index terms -> ${manuscriptPath}`
    );
    if (target === 'manuscript') continue;
    await renderTarget({ manuscriptPath, bookDir: BOOK_DIR, outDir: options.out, target });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/tests/unit/articles/book/render.test.mjs`
Expected: PASS, 6 tests

- [ ] **Step 5: Commit**

```bash
git add scripts/articles/lib/book/render.mjs scripts/articles/compose-book.mjs scripts/tests/unit/articles/book/render.test.mjs
git commit -m "feat(book): render the manuscript to pdf, epub, and html"
```

---

### Task 13: Marker lint

The composer already fails on bad markers, but it fails at build time and without line numbers, because `parseArticle` discards them. A dedicated lint reads the raw files and reports file and line — and it runs in the normal `npm run lint` sweep, so mistakes surface long before anyone renders a book.

**Files:**

- Create: `scripts/maintenance/lint-book-markers.mjs`
- Test: `scripts/tests/unit/articles/book/lint-book-markers.test.mjs`

**Interfaces:**

- Consumes: `parseMarkerLine` (Task 3), `ARTICLE_FILE_RE`/`isOnSpine` (Task 1)
- Produces: `lintBookMarkers(root) -> Promise<Array<{file: string, line: number, message: string}>>`

- [ ] **Step 1: Write the failing test**

Create `scripts/tests/unit/articles/book/lint-book-markers.test.mjs`:

```javascript
// @chore
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { lintBookMarkers } from '../../../../maintenance/lint-book-markers.mjs';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';

async function repo(files) {
  const root = await mkdtemp(path.join(projectScratchDir('test'), 'markerlint-'));
  const dir = path.join(root, 'docs', 'articles', 'assets', 'book', 'fragments');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'known.md'), 'bridge\n');
  for (const [name, body] of Object.entries(files)) {
    await writeFile(path.join(root, 'docs', 'articles', name), body);
  }
  return root;
}

test('a clean corpus reports nothing', async () => {
  const root = await repo({
    '01-a.md': '# A\n\n<!-- book:part title="P" -->\n\n## Series Link\n\nx\n',
  });
  try {
    assert.deepEqual(await lintBookMarkers(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('an unknown verb is reported with file and line', async () => {
  const root = await repo({
    '01-a.md': '# A\n\n<!-- book:chaptr title="x" -->\n\n## Series Link\n\ny\n',
  });
  try {
    const findings = await lintBookMarkers(root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].file, '01-a.md');
    assert.equal(findings[0].line, 3);
    assert.match(findings[0].message, /unknown marker verb/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('an unclosed exclude span is reported', async () => {
  const root = await repo({
    '01-a.md': '# A\n\n<!-- book:exclude -->\n\ndropped\n\n## Series Link\n\ny\n',
  });
  try {
    const findings = await lintBookMarkers(root);
    assert.match(findings[0].message, /unclosed/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('an include pointing at a missing fragment is reported', async () => {
  const root = await repo({
    '01-a.md': '# A\n\n<!-- book:include path=fragments/gone.md -->\n\n## Series Link\n\ny\n',
  });
  try {
    const findings = await lintBookMarkers(root);
    assert.match(findings[0].message, /fragments\/gone\.md/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('articles off the spine are not linted', async () => {
  const root = await repo({
    '16-outline.md': '# O\n\n<!-- book:chaptr -->\n\n## Drafting Notes\n\nx\n',
  });
  try {
    assert.deepEqual(await lintBookMarkers(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/tests/unit/articles/book/lint-book-markers.test.mjs`
Expected: FAIL — `Cannot find module '.../maintenance/lint-book-markers.mjs'`

- [ ] **Step 3: Write the implementation**

Create `scripts/maintenance/lint-book-markers.mjs`:

````javascript
#!/usr/bin/env node
// Lint guard: every `book:` marker in a spine article must parse, balance, and
// point at a fragment that exists.
//
// The composer enforces the same rules, but it runs at build time and reports
// no line numbers, because `parseArticle` discards them. This lint reads raw
// files, so it can say exactly where the mistake is — and it runs in the normal
// lint sweep, long before anyone renders a book.

import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ARTICLE_FILE_RE, isOnSpine } from '../articles/lib/book/spine.mjs';
import { parseMarkerLine } from '../articles/lib/book/markers.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, '..', '..');

const FENCE_RE = /^```/;

/**
 * @param {string} root repository root
 * @returns {Promise<Array<{file: string, line: number, message: string}>>}
 */
export async function lintBookMarkers(root) {
  const articlesDir = path.join(root, 'docs', 'articles');
  const bookDir = path.join(articlesDir, 'assets', 'book');
  const findings = [];

  const names = (await readdir(articlesDir)).filter((name) => ARTICLE_FILE_RE.test(name)).sort();
  for (const file of names) {
    const source = await readFile(path.join(articlesDir, file), 'utf8');
    if (!isOnSpine(source)) continue;

    const lines = source.split('\n');
    let inFence = false;
    let open = 0;
    let openLine = 0;

    for (const [index, text] of lines.entries()) {
      const line = index + 1;
      if (FENCE_RE.test(text)) {
        inFence = !inFence;
        continue;
      }
      if (inFence) continue;

      let marker;
      try {
        marker = parseMarkerLine(text, file);
      } catch (error) {
        findings.push({ file, line, message: error.message.replace(`${file}: `, '') });
        continue;
      }
      if (marker === null) continue;

      if (marker.verb === 'exclude') {
        open += 1;
        openLine = line;
      }
      if (marker.verb === 'end') {
        open -= 1;
        if (open < 0) {
          findings.push({ file, line, message: 'book:end without a matching book:exclude' });
          open = 0;
        }
      }
      if (marker.verb === 'include') {
        try {
          await access(path.join(bookDir, marker.attrs.path));
        } catch {
          findings.push({
            file,
            line,
            message: `book:include points at ${marker.attrs.path}, which does not exist`,
          });
        }
      }
    }

    if (open > 0) {
      findings.push({ file, line: openLine, message: 'unclosed book:exclude span' });
    }
  }

  return findings;
}

async function main() {
  const findings = await lintBookMarkers(REPO_ROOT);
  if (findings.length === 0) {
    console.log('lint-book-markers: every book marker parses and resolves.');
    return;
  }
  console.error(`lint-book-markers: ${findings.length} problem(s):`);
  for (const finding of findings) {
    console.error(`  docs/articles/${finding.file}:${finding.line}: ${finding.message}`);
  }
  process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
````

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/tests/unit/articles/book/lint-book-markers.test.mjs`
Expected: PASS, 5 tests

- [ ] **Step 5: Wire the lint into the chain**

Task 0 deliberately left `lint:book-markers` out of the `lint` chain, because its script did not exist yet. It does now. In `package.json`, append `&& npm run lint:book-markers` to the end of the existing `lint` script value.

Run: `npm run lint`
Expected: PASS, ending with `lint-book-markers: every book marker parses and resolves.`

- [ ] **Step 6: Commit**

```bash
git add scripts/maintenance/lint-book-markers.mjs scripts/tests/unit/articles/book/lint-book-markers.test.mjs package.json
git commit -m "feat(book): lint book markers with file and line reporting"
```

---

### Task 14: Mermaid diagrams

Articles carry in-body ```mermaid fences, and `lib/diagrams.mjs` already treats the body fence — not the matching `.mmd` file — as authoritative, because the two have drifted. Left alone, a fence reaches LaTeX as a literal code block. The book replaces each fence with an image reference and renders the PNGs at print resolution.

**Files:**

- Create: `scripts/articles/lib/book/diagrams.mjs`
- Modify: `scripts/articles/lib/book/manuscript.mjs`
- Modify: `scripts/articles/compose-book.mjs`
- Test: `scripts/tests/unit/articles/book/diagrams.test.mjs`

**Interfaces:**

- Consumes: `renderMermaidSource`, `runPool` from `scripts/articles/lib/diagrams.mjs`; `buildManuscript` (Task 10)
- Produces:
  - `extractBookDiagrams(sections, slug) -> {sections: Array<{heading, items}>, diagrams: Array<{code: string, imageName: string}>}`
  - `renderBookDiagrams(diagrams, outDir) -> Promise<void>`
  - `buildManuscript` return value gains `diagrams: Array<{code, imageName}>`

- [ ] **Step 1: Write the failing test**

Create `scripts/tests/unit/articles/book/diagrams.test.mjs`:

````javascript
// @chore
import assert from 'node:assert/strict';
import test from 'node:test';

import { extractBookDiagrams } from '../../../../articles/lib/book/diagrams.mjs';

const text = (t) => ({ kind: 'text', text: t });

test('extractBookDiagrams replaces fences with image references', () => {
  const sections = [
    {
      heading: 'Body',
      items: [
        text('Before.'),
        text('```mermaid'),
        text('flowchart LR'),
        text('  A --> B'),
        text('```'),
        text('After.'),
      ],
    },
  ];
  const { sections: out, diagrams } = extractBookDiagrams(sections, '03-slug');

  assert.deepEqual(diagrams, [
    { code: 'flowchart LR\n  A --> B', imageName: '03-slug-diagram-1.png' },
  ]);
  assert.deepEqual(out[0].items, [
    text('Before.'),
    text('![](03-slug-diagram-1.png)'),
    text('After.'),
  ]);
});

test('extractBookDiagrams numbers diagrams across sections in document order', () => {
  const fence = () => [text('```mermaid'), text('graph TD'), text('```')];
  const { diagrams } = extractBookDiagrams(
    [
      { heading: 'One', items: fence() },
      { heading: 'Two', items: fence() },
    ],
    '04-slug'
  );
  assert.deepEqual(
    diagrams.map((d) => d.imageName),
    ['04-slug-diagram-1.png', '04-slug-diagram-2.png']
  );
});

test('extractBookDiagrams leaves non-mermaid fences alone', () => {
  const items = [text('```json'), text('{}'), text('```')];
  const { sections, diagrams } = extractBookDiagrams([{ heading: 'B', items }], '05-slug');
  assert.deepEqual(sections[0].items, items);
  assert.deepEqual(diagrams, []);
});

test('an unterminated mermaid fence is a loud failure', () => {
  assert.throws(
    () =>
      extractBookDiagrams(
        [{ heading: 'B', items: [text('```mermaid'), text('graph TD')] }],
        '06-s'
      ),
    /unterminated/
  );
});
````

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/tests/unit/articles/book/diagrams.test.mjs`
Expected: FAIL — `Cannot find module '.../book/diagrams.mjs'`

- [ ] **Step 3: Write the implementation and wire it in**

Create `scripts/articles/lib/book/diagrams.mjs`:

````javascript
// In-body Mermaid fences, turned into images for print.
//
// The body fence is authoritative, not the matching file under
// assets/diagrams/ — those two have drifted, and the body is what a reader
// actually sees. That is the same call `lib/diagrams.mjs` makes for LinkedIn.
//
// Rendering is at a higher scale than the screen path uses: a 1x PNG that looks
// fine in a browser is visibly soft at 300 dpi on paper.

import path from 'node:path';

import { renderMermaidSource, runPool } from '../diagrams.mjs';

export const PRINT_SCALE = 3;

/**
 * @param {Array<{heading: string|null, items: Array<object>}>} sections
 * @param {string} slug
 * @returns {{sections: Array<{heading: string|null, items: Array<object>}>, diagrams: Array<{code: string, imageName: string}>}}
 */
export function extractBookDiagrams(sections, slug) {
  const diagrams = [];

  const out = sections.map((section) => {
    const items = [];
    let i = 0;
    while (i < section.items.length) {
      const item = section.items[i];
      const isFence = item.kind === 'text' && item.text.trim().replace(/\s+$/, '') === '```mermaid';
      if (!isFence) {
        items.push(item);
        i += 1;
        continue;
      }
      const code = [];
      let j = i + 1;
      while (j < section.items.length) {
        const line = section.items[j];
        if (line.kind === 'text' && line.text.trim() === '```') break;
        code.push(line.kind === 'text' ? line.text : '');
        j += 1;
      }
      if (j >= section.items.length) {
        throw new Error(`${slug}: unterminated \`\`\`mermaid fence`);
      }
      const imageName = `${slug}-diagram-${diagrams.length + 1}.png`;
      diagrams.push({ code: code.join('\n'), imageName });
      items.push({ kind: 'text', text: `![](${imageName})` });
      i = j + 1;
    }
    return { heading: section.heading, items };
  });

  return { sections: out, diagrams };
}

/**
 * @param {Array<{code: string, imageName: string}>} diagrams
 * @param {string} outDir
 */
export async function renderBookDiagrams(diagrams, outDir) {
  await runPool(
    diagrams.map(
      (diagram) => () =>
        renderMermaidSource(diagram.code, path.join(outDir, diagram.imageName), {
          scale: PRINT_SCALE,
        })
    )
  );
}
````

Before writing `renderBookDiagrams`, read `scripts/articles/lib/diagrams.mjs` and confirm the exact signatures of `renderMermaidSource` and `runPool`. If `renderMermaidSource` takes no options argument, add a `scale` option to it there rather than duplicating the `mmdc` spawn — and re-run `node --test scripts/tests/unit/articles/publish-articles.test.mjs` to confirm the LinkedIn path is unaffected.

In `scripts/articles/lib/book/manuscript.mjs`, import the extractor:

```javascript
import { extractBookDiagrams } from './diagrams.mjs';
```

In `loadArticle`, replace the strip line:

```javascript
const { sections, bibliographyLines } = applyBookStrip(scanned);
```

with:

```javascript
const stripped = applyBookStrip(scanned);
const { sections, diagrams } = extractBookDiagrams(stripped.sections, entry.slug);
const bibliographyLines = stripped.bibliographyLines;
```

Add `diagrams` to the object `loadArticle` returns. Then in `buildManuscript`, collect them and include them in the result:

```javascript
return {
  markdown: `${out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()}\n`,
  chapters: chapters.length,
  footnotes: footnotes.length,
  indexTerms: hits.size,
  diagrams: articles.flatMap((a) => a.diagrams),
};
```

In `scripts/articles/compose-book.mjs`, import the renderer:

```javascript
import { renderBookDiagrams } from './lib/book/diagrams.mjs';
```

and render before each non-manuscript target, immediately after the `console.log` line:

```javascript
    if (target === 'manuscript') continue;
    await renderBookDiagrams(built.diagrams, options.out);
    await renderTarget({ manuscriptPath, bookDir: BOOK_DIR, outDir: options.out, target });
```

- [ ] **Step 4: Run the diagram tests and the manuscript regression**

Run: `node --test scripts/tests/unit/articles/book/diagrams.test.mjs scripts/tests/unit/articles/book/manuscript.test.mjs scripts/tests/unit/articles/publish-articles.test.mjs`
Expected: PASS. The manuscript test's fixture has no Mermaid, so it must be unchanged and green.

- [ ] **Step 5: Commit**

```bash
git add scripts/articles/lib/book/diagrams.mjs scripts/articles/lib/book/manuscript.mjs scripts/articles/compose-book.mjs scripts/tests/unit/articles/book/diagrams.test.mjs
git commit -m "feat(book): render in-body mermaid fences as print images"
```

---

### Task 15: Live corpus verification and documentation

**Files:**

- Create: `scripts/tests/unit/articles/book/corpus.test.mjs`
- Create: `docs/articles/book-publishing-guide.md`
- Modify: `docs/articles/README.md`

**Interfaces:**

- Consumes: `buildManuscript` (Task 10)
- Produces: nothing consumed by later tasks

- [ ] **Step 1: Write the failing test**

Create `scripts/tests/unit/articles/book/corpus.test.mjs`:

```javascript
// @chore
import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { buildManuscript } from '../../../../articles/lib/book/manuscript.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../../..');
const ARTICLES_DIR = path.join(REPO_ROOT, 'docs', 'articles');
const BOOK_DIR = path.join(ARTICLES_DIR, 'assets', 'book');

test('the live corpus composes into a manuscript', async () => {
  const built = await buildManuscript({
    articlesDir: ARTICLES_DIR,
    bookDir: BOOK_DIR,
    target: 'manuscript',
  });

  assert.ok(built.chapters >= 15, `expected the drafted series, got ${built.chapters} chapters`);
  assert.ok(built.footnotes > 0, 'the series cites sources; footnotes must exist');
  assert.ok(built.indexTerms > 0, 'the glossary terms should appear somewhere in the prose');
});

test('the composed manuscript leaks no markers, captions, or relative paths', async () => {
  const { markdown } = await buildManuscript({
    articlesDir: ARTICLES_DIR,
    bookDir: BOOK_DIR,
    target: 'manuscript',
  });

  assert.equal(markdown.includes('book:'), false, 'a marker survived into the manuscript');
  assert.equal(/_Part \d+ of a series/.test(markdown), false, 'a series caption survived');
  assert.equal(markdown.includes('## Series Link'), false);
  assert.equal(markdown.includes('## Series Roadmap'), false);
  assert.equal(markdown.includes('## LinkedIn Article Shape'), false);
  assert.equal(
    /\]\((?!https?:|#)[^)]+\)/.test(markdown.replace(/^!\[.*$/gm, '')),
    false,
    'a relative link survived and would be dead on paper'
  );
});
```

- [ ] **Step 2: Run test to see whether the live corpus already passes**

Run: `node --test scripts/tests/unit/articles/book/corpus.test.mjs`
Expected: this is the one test that may legitimately fail on first run against real prose. Two failure modes and their fixes:

- `CitationError: ... link target "X" is neither an absolute URL nor a spine article` — a body link points at a repo doc rather than an article or a URL. Fix the article: either make it an absolute URL, or wrap it in `<!-- book:exclude -->` / `<!-- book:end -->` if the sentence is LinkedIn-only.
- A leaked relative link in the second test — same cause, same fix.

Do not weaken the assertions to make them pass. The point of this test is that a dead link on paper is caught here.

- [ ] **Step 3: Write the book publishing guide**

Create `docs/articles/book-publishing-guide.md`:

````markdown
# Book Publishing Guide

The article series publishes twice: as standalone LinkedIn articles
([linkedin-publishing-guide.md](linkedin-publishing-guide.md)) and as a book.
Both read the same `NN-*.md` files. Nothing is duplicated.

## How the book is composed

Filename order is the spine. An article is in the book if it has a
`## Series Link` section, which every drafted article carries and no outline
does.

The composer drops the series scaffolding — header image, `_Part N of a series_`
caption, `## Series Link`, `## Series Roadmap`, `## LinkedIn Article Shape` —
and hoists each `## Bibliography` into one deduped Sources appendix. Inline
citations become footnotes; links to sibling articles become `(Chapter N)`
cross-references.

## Markers

Markers are HTML comments. The LinkedIn publisher strips every HTML comment
before it does anything else, so markers can never reach a published article.

| Marker                                          | Effect                                                   |
| ----------------------------------------------- | -------------------------------------------------------- |
| `<!-- book:part title="How We Got Here" -->`    | Opens a Part before this chapter                         |
| `<!-- book:chapter title="..." -->`             | Chapter title override; default is the article H1        |
| `<!-- book:merge-into-previous -->`             | Fold this article into the previous chapter as a section |
| `<!-- book:demote by=1 -->`                     | Shift the remaining heading levels down                  |
| `<!-- book:exclude -->` ... `<!-- book:end -->` | Drop a span                                              |
| `<!-- book:include path=fragments/name.md -->`  | Splice in book-only prose                                |
| `<!-- book:pagebreak -->`                       | Force a page break                                       |
| `<!-- book:index term="evidence gate" -->`      | Manual index anchor                                      |

`part` and `chapter` must sit in the article preamble, before the first `##`.

Run `npm run lint:book-markers` to check markers without rendering anything. It
also runs as part of `npm run lint`.

## Metadata

Everything the articles do not contain lives in `assets/book/`:

- `book.json` — title, author, copyright, paper size, fonts, margins. Pandoc
  reads it directly as a metadata file.
- `introduction.md` — the book's introduction.
- `glossary.md` — one `## ` per term, optional `_Aliases:_` and `_See also:_`
  lines, then the definition. Renders as Appendix A and drives the index.
- `fragments/` — book-only prose spliced in by `book:include`.

## Toolchain

```bash
brew install pandoc
brew install --cask basictex
sudo tlmgr update --self
sudo tlmgr install latexmk
npm run doctor:book
```
````

`doctor:book` compiles a one-line probe per LaTeX package and prints a single
`sudo tlmgr install ...` line naming whatever is missing. Run it until it is
quiet.

## Building

```bash
npm run book                        # manuscript, pdf, epub, html
npm run book -- --target manuscript # just the reviewable markdown
npm run book -- --target pdf
```

Output lands in `.tmp/book/`. `manuscript.md` is the clean, human-readable
assembly with no LaTeX in it; the per-target manuscripts carry the markup each
format needs.

````

- [ ] **Step 4: Link the guide from the series README**

In `docs/articles/README.md`, add this section immediately before the `## Research Base` section:

```markdown
## Book Edition

The same articles compose into a book — chapters, glossary, sources appendix,
page-numbered index — via hidden `book:` markers and the metadata in
[assets/book](assets/book/). See
[book-publishing-guide.md](book-publishing-guide.md).
````

- [ ] **Step 5: Run the full gate and commit**

Run: `npm run lint && npm run test:unit`
Expected: PASS. This is the first run of the full gate over the finished path.

```bash
git add scripts/tests/unit/articles/book/corpus.test.mjs docs/articles/book-publishing-guide.md docs/articles/README.md
git commit -m "feat(book): verify the live corpus composes and document the path"
```

---

## Phase 2 — author's work, not the toolchain's

These are deliberately left as stubs. They are voice decisions.

- `docs/articles/assets/book/introduction.md` ships as a marked STUB.
- No `book:part` markers are placed. Add them to the first article of each Part
  once the groupings are decided; `series-argument-map.md` and
  `xp-agentic-delivery-narrative-arc.md` are the starting material.
- No `book:merge-into-previous` markers are placed. Every article is its own
  chapter until the author decides otherwise.
- No bridge fragments exist. Where a chapter now ends abruptly because its
  "the next article argues..." paragraph was stripped, write a fragment into
  `assets/book/fragments/` and splice it with `book:include`.
- `book.json` ships with a working title and subtitle. Replace them.
- The copyright page. `rights` in `book.json` reaches EPUB metadata, but LaTeX
  renders no copyright page from it. Add an `include-before` entry to
  `book.json` when the front matter is finalized.

The book generates end-to-end without any of this. It reads better with it.
