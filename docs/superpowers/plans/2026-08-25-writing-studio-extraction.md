# Writing Studio Extraction Implementation Plan

<!-- cspell:words setuid -->

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the private `kburson/writing-studio` repository from selected AITM history, make its first collection and publishing tools standalone, and verify the private remote before any AITM source is removed.

**Architecture:** Filter only writing-owned paths from the approved AITM source branch into an empty private repository, then establish `collections/agentic-delivery/` and collection-aware tools under `tools/publishing/`. Preserve the current publisher and book behavior while replacing AITM paths, scratch helpers, citation assumptions, and CI wiring with studio-owned equivalents.

**Tech Stack:** Git and `git-filter-repo`, GitHub CLI with SSH authentication, Node.js 22+ ES modules, `node:test`, Mermaid CLI/Puppeteer, Pandoc, Prettier, ESLint, markdownlint-cli2, and CSpell.

## Global Constraints

- Source repository: `git@github.com:kburson/ai-task-manager.git`.
- Source worktree: `/Users/kpburson/projects/Vibe-Coding/ai-task-manager/.claude/worktrees/articles-book-publication-6a7dfe`.
- Complete and verify `docs/superpowers/plans/2026-08-25-book-chapter-openers.md`
  in the source worktree before starting this extraction, so the selected
  history contains the approved book layout and its rendered evidence.
- Target repository: private `kburson/writing-studio` with default branch `trunk`.
- Target checkout: `/Users/kpburson/projects/Vibe-Coding/writing-studio`.
- Filter workspace: `/Users/kpburson/projects/Vibe-Coding/.tmp-writing-studio-filter`.
- Never overwrite either target path if it already exists; stop and inspect it.
- Preserve selected commit authors, timestamps, messages, and file evolution.
- Do not push until standalone local verification passes.
- Do not delete or modify AITM article sources, publishing tools, or tests in this plan.
- `package.json` in the studio must contain `"private": true` and require Node.js `>=22`.
- Collection source paths must remain inside their collection root.
- Generated output must resolve under repository-level `.tmp/<collection>/`.
- Publishing commands must never modify files under `collections/`.
- The toolchain prepares artifacts only; it must not post, upload, or release them.
- Extracted publishing software retains AGPL-3.0-or-later; collection prose and media receive no repository-wide reuse grant.

---

### Task 1: Create the private repository and selected-history checkout

**Files:**

- Create remotely: `git@github.com:kburson/writing-studio.git`
- Create locally: `/Users/kpburson/projects/Vibe-Coding/writing-studio/.git/**`
- Create temporarily: `/Users/kpburson/projects/Vibe-Coding/.tmp-writing-studio-filter/.git/**`

**Interfaces:**

- Consumes: the approved clean source branch and the authenticated `kburson` GitHub account.
- Produces: a local `writing-studio` checkout on `trunk` that has not been pushed, with `origin` set to the empty private GitHub repository and only the selected AITM history present.

- [ ] **Step 1: Reconfirm immutable source evidence and empty targets**

Run:

```bash
cd /Users/kpburson/projects/Vibe-Coding/ai-task-manager/.claude/worktrees/articles-book-publication-6a7dfe
git status --short
git remote get-url origin
git rev-parse HEAD
git merge-base HEAD origin/trunk
git filter-repo --version
gh auth status
test ! -e /Users/kpburson/projects/Vibe-Coding/writing-studio
test ! -e /Users/kpburson/projects/Vibe-Coding/.tmp-writing-studio-filter
```

Expected: clean status; AITM SSH origin; one source SHA and merge-base SHA; `git-filter-repo` installed; active `kburson` auth with `repo` scope; both `test` commands exit 0. Record the source SHA in the execution log.

- [ ] **Step 2: Create and clone the empty private repository**

Run:

```bash
gh repo create kburson/writing-studio --private --description "Private workspace for developing, testing, and publishing articles, essays, and books."
gh repo clone kburson/writing-studio /Users/kpburson/projects/Vibe-Coding/writing-studio
gh repo view kburson/writing-studio --json nameWithOwner,visibility,url,defaultBranchRef
```

Expected: `nameWithOwner` is `kburson/writing-studio`, visibility is `PRIVATE`, and the cloned repository reports that it is empty. `defaultBranchRef` may be null until the first push.

- [ ] **Step 3: Filter the approved writing-owned paths in an isolated clone**

Run exactly this path set:

```bash
git clone --no-local --single-branch --branch claude/articles-book-publication-6a7dfe /Users/kpburson/projects/Vibe-Coding/ai-task-manager/.claude/worktrees/articles-book-publication-6a7dfe /Users/kpburson/projects/Vibe-Coding/.tmp-writing-studio-filter
cd /Users/kpburson/projects/Vibe-Coding/.tmp-writing-studio-filter
git filter-repo --force \
  --path docs/articles/ \
  --path scripts/articles/ \
  --path scripts/articles/publish-articles.test.mjs \
  --path scripts/articles/tests/diagram-drift.test.mjs \
  --path scripts/articles/tests/slow/publish-articles-e2e.test.mjs \
  --path scripts/tests/unit/articles/ \
  --path scripts/tests/slow/articles/ \
  --path scripts/maintenance/lint-article-citations.mjs \
  --path scripts/maintenance/lint-book-markers.mjs \
  --path scripts/task-tracker/tests/unit/maintenance/lint-article-citations.test.mjs \
  --path scripts/tests/unit/task-tracker/maintenance/lint-article-citations.test.mjs \
  --path .github/puppeteer-ci.json \
  --path docs/superpowers/specs/2026-08-17-article-ending-sections-design.md \
  --path docs/superpowers/specs/2026-08-18-easy-come-easy-go-article-design.md \
  --path docs/superpowers/specs/2026-08-25-book-composition-path-design.md \
  --path docs/superpowers/specs/2026-08-25-book-chapter-openers-design.md \
  --path docs/superpowers/plans/2026-07-16-article-deepening.md \
  --path docs/superpowers/plans/2026-08-17-article-ending-sections.md \
  --path docs/superpowers/plans/2026-08-20-exclude-draft-articles-from-publisher.md \
  --path docs/superpowers/plans/2026-08-25-book-composition-path.md \
  --path docs/superpowers/plans/2026-08-25-book-chapter-openers.md
git branch -m trunk
```

Expected: `git-filter-repo` completes without path or commit errors and the current branch is `trunk`.

- [ ] **Step 4: Prove the filtered repository contains no unrelated current files**

Run:

```bash
cd /Users/kpburson/projects/Vibe-Coding/.tmp-writing-studio-filter
git status --short
git ls-tree -r --name-only HEAD
git log --format='%h %ad %an %s' --date=short -- docs/articles scripts/articles | head -n 20
```

Expected: clean status; the tree contains only the selected paths; the log retains original authors, dates, and article/tool commit messages. Inspect every `git ls-tree` line before proceeding.

- [ ] **Step 5: Import filtered history into the empty target clone without pushing**

Run:

```bash
cd /Users/kpburson/projects/Vibe-Coding/writing-studio
git remote add filtered /Users/kpburson/projects/Vibe-Coding/.tmp-writing-studio-filter
git fetch filtered trunk
git switch -c trunk FETCH_HEAD
git remote remove filtered
git remote -v
git status --short
git log --oneline --decorate -12
```

Expected: branch `trunk`; clean status; `origin` is the private SSH remote; selected article/book history is visible; nothing has been pushed.

---

### Task 2: Establish the standalone studio layout and package baseline

**Files:**

- Create: `tools/publishing/scratch.mjs`
- Create: `package.json`
- Create: `.gitignore`
- Create: `eslint.config.mjs`
- Create: `.prettierrc.json`
- Create: `.prettierignore`
- Create: `.markdownlint-cli2.jsonc`
- Create: `cspell.json`
- Move: `docs/articles/**` into `collections/agentic-delivery/**`
- Move: `scripts/articles/**` into `tools/publishing/{articles,books,shared}/**`
- Move: publishing lints into `tools/publishing/lint/**`
- Move: dedicated tests into `tests/{unit,e2e}/publishing/**`
- Move: nine approved specs/plans into `collections/agentic-delivery/history/**`

**Interfaces:**

- Consumes: the filtered checkout from Task 1.
- Produces: the approved studio tree, a private Node package, and a passing relocated baseline test suite before collection-aware behavior is added.

- [ ] **Step 1: Create destination directories and move collection content**

Run:

```bash
cd /Users/kpburson/projects/Vibe-Coding/writing-studio
mkdir -p collections/agentic-delivery/articles collections/agentic-delivery/research collections/agentic-delivery/editorial collections/agentic-delivery/guides collections/agentic-delivery/history/specs collections/agentic-delivery/history/plans
git mv docs/articles/[0-9][0-9]-*.md collections/agentic-delivery/articles/
git mv docs/articles/research-synopsis.md docs/articles/research-easy-come-easy-go.md collections/agentic-delivery/research/
git mv docs/articles/linkedin-publishing-guide.md docs/articles/book-publishing-guide.md collections/agentic-delivery/guides/
git mv docs/articles/article-production-plan.md docs/articles/big-bang-title-style-guide.md docs/articles/linkedin-series-editorial-review.md docs/articles/series-argument-map.md docs/articles/series-style-guide.md docs/articles/series-visual-system.md docs/articles/xp-agentic-delivery-narrative-arc.md collections/agentic-delivery/editorial/
git mv docs/articles/assets/book collections/agentic-delivery/book
git mv docs/articles/assets collections/agentic-delivery/assets
git mv docs/articles/README.md collections/agentic-delivery/README.md
```

Expected: all 16 numbered sources, both research files, both guides, seven editorial files, book sources, and media assets exist under the collection; `docs/articles` is empty.

- [ ] **Step 2: Move decision history, tools, lints, and tests**

Run:

```bash
mkdir -p tools/publishing/articles tools/publishing/books tools/publishing/shared tools/publishing/lint tests/unit/publishing/articles tests/unit/publishing/books tests/unit/publishing/lint tests/e2e/publishing
git mv docs/superpowers/specs/2026-08-17-article-ending-sections-design.md docs/superpowers/specs/2026-08-18-easy-come-easy-go-article-design.md docs/superpowers/specs/2026-08-25-book-composition-path-design.md docs/superpowers/specs/2026-08-25-book-chapter-openers-design.md collections/agentic-delivery/history/specs/
git mv docs/superpowers/plans/2026-07-16-article-deepening.md docs/superpowers/plans/2026-08-17-article-ending-sections.md docs/superpowers/plans/2026-08-20-exclude-draft-articles-from-publisher.md docs/superpowers/plans/2026-08-25-book-composition-path.md docs/superpowers/plans/2026-08-25-book-chapter-openers.md collections/agentic-delivery/history/plans/
git mv scripts/articles/publish-articles.mjs tools/publishing/articles/cli.mjs
git mv scripts/articles/compose-book.mjs tools/publishing/books/cli.mjs
git mv scripts/articles/lib/companion-post.mjs scripts/articles/lib/html-document.mjs scripts/articles/lib/markdown-to-html.mjs scripts/articles/lib/publish.mjs scripts/articles/lib/roadmap.mjs scripts/articles/lib/strip-rules.mjs tools/publishing/articles/
git mv scripts/articles/lib/book/*.mjs tools/publishing/books/
git mv scripts/articles/lib/diagrams.mjs scripts/articles/lib/parse-article.mjs tools/publishing/shared/
git mv scripts/maintenance/lint-article-citations.mjs tools/publishing/lint/article-citations.mjs
git mv scripts/maintenance/lint-book-markers.mjs tools/publishing/lint/book-markers.mjs
git mv scripts/tests/unit/articles/publish-articles.test.mjs scripts/tests/unit/articles/diagram-drift.test.mjs tests/unit/publishing/articles/
git mv scripts/tests/unit/articles/lib/book/*.test.mjs tests/unit/publishing/books/
git mv scripts/tests/unit/task-tracker/maintenance/lint-article-citations.test.mjs tests/unit/publishing/lint/
git mv scripts/tests/slow/articles/publish-articles-e2e.test.mjs tests/e2e/publishing/
```

Expected: no source remains under `scripts/articles`; no dedicated publisher test remains under `scripts/tests`.

- [ ] **Step 3: Add the private package and repository configuration**

Create `package.json` with exactly this baseline:

```json
{
  "name": "writing-studio",
  "version": "0.0.0",
  "private": true,
  "description": "Private workspace for developing, testing, and publishing articles, essays, and books.",
  "type": "module",
  "license": "SEE LICENSE IN RIGHTS.md",
  "engines": {
    "node": ">=22"
  },
  "scripts": {
    "publish:articles": "node tools/publishing/articles/cli.mjs",
    "book": "node tools/publishing/books/cli.mjs",
    "doctor:book": "node tools/publishing/books/cli.mjs --doctor",
    "lint:article-citations": "node tools/publishing/lint/article-citations.mjs",
    "lint:book-markers": "node tools/publishing/lint/book-markers.mjs",
    "test:unit": "node --test tests/unit/publishing/articles/*.test.mjs tests/unit/publishing/books/*.test.mjs tests/unit/publishing/lint/*.test.mjs",
    "test:e2e": "node --test tests/e2e/publishing/*.test.mjs",
    "test": "npm run test:unit && npm run test:e2e",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "lint:js": "eslint .",
    "lint:md": "markdownlint-cli2 \"**/*.md\"",
    "lint:spell": "cspell --no-progress \"**/*.{md,mjs,json}\"",
    "lint": "npm run lint:js && npm run lint:md && npm run lint:spell && npm run lint:article-citations && npm run lint:book-markers",
    "quality": "npm run format:check && npm run lint && npm test"
  },
  "devDependencies": {
    "@mermaid-js/mermaid-cli": "^11.16.0",
    "cspell": "^8.19.4",
    "eslint": "^9.39.4",
    "globals": "^17.6.0",
    "markdownlint-cli2": "^0.23.0",
    "prettier": "^3.8.3",
    "puppeteer": "^24.42.0"
  }
}
```

Create `.gitignore`:

```gitignore
node_modules/
.tmp/
coverage/
*.tgz
.DS_Store
```

Copy the source repository's ESLint, Prettier, Markdownlint, CSpell, and dictionary files:

```bash
cp /Users/kpburson/projects/Vibe-Coding/ai-task-manager/.claude/worktrees/articles-book-publication-6a7dfe/eslint.config.mjs .
cp /Users/kpburson/projects/Vibe-Coding/ai-task-manager/.claude/worktrees/articles-book-publication-6a7dfe/.prettierrc.json .
cp /Users/kpburson/projects/Vibe-Coding/ai-task-manager/.claude/worktrees/articles-book-publication-6a7dfe/.prettierignore .
cp /Users/kpburson/projects/Vibe-Coding/ai-task-manager/.claude/worktrees/articles-book-publication-6a7dfe/.markdownlint-cli2.jsonc .
cp /Users/kpburson/projects/Vibe-Coding/ai-task-manager/.claude/worktrees/articles-book-publication-6a7dfe/.markdownlintignore .
cp /Users/kpburson/projects/Vibe-Coding/ai-task-manager/.claude/worktrees/articles-book-publication-6a7dfe/cspell.json .
cp /Users/kpburson/projects/Vibe-Coding/ai-task-manager/.claude/worktrees/articles-book-publication-6a7dfe/cspell-dictionary.txt .
npm install
```

Expected: `package-lock.json` is created and `npm ls --depth=0` reports the seven declared development dependencies without errors.

- [ ] **Step 4: Add the minimal studio scratch helper and repair imports**

Create `tools/publishing/scratch.mjs`:

```js
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const VALID_PURPOSE_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;

export function studioScratchDir(purpose, repoRoot) {
  const slug = String(purpose || '');
  if (!VALID_PURPOSE_RE.test(slug)) {
    throw new Error(`studioScratchDir: purpose must match ${VALID_PURPOSE_RE} — got "${purpose}"`);
  }
  if (!path.isAbsolute(repoRoot)) {
    throw new Error('studioScratchDir: repoRoot must be absolute');
  }
  const dir = path.join(repoRoot, '.tmp', 'scratch', slug);
  mkdirSync(dir, { recursive: true });
  return dir;
}
```

Apply these exact import ownership changes:

- Article publisher imports shared parsing and diagrams from `../shared/`.
- Book modules import shared parsing and diagrams from `../shared/`.
- Both scratch callers import `studioScratchDir` from `../scratch.mjs` and pass their computed repository root.
- Unit tests import sources from `tools/publishing/**` and use `studioScratchDir('test', REPO_ROOT)`.
- The E2E test resolves `collections/agentic-delivery/articles` instead of `docs/articles`.

Run:

```bash
rg -n "task-tracker|projectScratchDir|scripts/articles|scripts/tests|docs/articles" tools tests
npx prettier --write tools tests package.json eslint.config.mjs
npm run test:unit
```

Expected: the search returns only intentional historical strings inside fixture text; all relocated unit tests pass.

- [ ] **Step 5: Commit the standalone layout baseline**

Run:

```bash
git add collections tools tests package.json package-lock.json .gitignore eslint.config.mjs .prettierrc.json .prettierignore .markdownlint-cli2.jsonc .markdownlintignore cspell.json cspell-dictionary.txt
git diff --cached --check
git commit -m "chore: establish standalone writing studio"
```

Expected: one migration commit containing path moves, package scaffolding, repaired imports, and no unrelated files.

---

### Task 3: Add the collection manifest and safe resolver

**Files:**

- Create: `collections/agentic-delivery/collection.json`
- Create: `tools/publishing/collections.mjs`
- Create: `tests/unit/publishing/collections.test.mjs`
- Modify: `package.json`

**Interfaces:**

- Consumes: repository root and a collection identifier.
- Produces: `loadCollection(id, { repoRoot }) -> Promise<{ id, title, root, articlesDir, researchDir, editorialDir, guidesDir, assetsDir, bookDir, outputRoot, targets }>`.
- Produces: `DEFAULT_COLLECTION = 'agentic-delivery'` and `REPO_ROOT` for both CLIs.

- [ ] **Step 1: Write resolver tests first**

Create `tests/unit/publishing/collections.test.mjs` with tests that:

```js
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { loadCollection } from '../../../tools/publishing/collections.mjs';
import { studioScratchDir } from '../../../tools/publishing/scratch.mjs';

async function writeCollection(repoRoot, id, overrides = {}) {
  const root = path.join(repoRoot, 'collections', id);
  const paths = {
    articles: 'articles',
    research: 'research',
    editorial: 'editorial',
    guides: 'guides',
    assets: 'assets',
    book: 'book',
    ...(overrides.paths || {}),
  };
  for (const relative of Object.values(paths)) {
    const absolute = path.resolve(root, relative);
    if (absolute.startsWith(`${root}${path.sep}`)) await mkdir(absolute, { recursive: true });
  }
  const manifest = {
    id,
    title: 'Sample',
    paths,
    outputNamespace: id,
    targets: { articles: true, book: ['manuscript', 'html', 'epub', 'pdf'] },
    ...overrides,
    paths,
  };
  await mkdir(root, { recursive: true });
  await writeFile(path.join(root, 'collection.json'), `${JSON.stringify(manifest)}\n`);
  return root;
}

test('resolves collection sources inside the collection and output under repository .tmp', async () => {
  const repoRoot = await mkdtemp(path.join(studioScratchDir('test', process.cwd()), 'collection-'));
  const root = await writeCollection(repoRoot, 'sample');
  const collection = await loadCollection('sample', { repoRoot });
  assert.equal(collection.articlesDir, path.join(root, 'articles'));
  assert.equal(collection.outputRoot, path.join(repoRoot, '.tmp', 'sample'));
});

test('rejects source paths that escape the collection root', async () => {
  const repoRoot = await mkdtemp(path.join(studioScratchDir('test', process.cwd()), 'collection-'));
  await writeCollection(repoRoot, 'sample', { paths: { articles: '../outside' } });
  await assert.rejects(
    () => loadCollection('sample', { repoRoot }),
    /paths.articles escapes collection root/
  );
});

test('rejects invalid ids and manifest identity mismatches', async () => {
  await assert.rejects(() => loadCollection('../sample'), /invalid collection id/);
  const repoRoot = await mkdtemp(path.join(studioScratchDir('test', process.cwd()), 'collection-'));
  await writeCollection(repoRoot, 'sample', { id: 'different' });
  await assert.rejects(() => loadCollection('sample', { repoRoot }), /collection id mismatch/);
});

test('rejects missing source directories', async () => {
  const repoRoot = await mkdtemp(path.join(studioScratchDir('test', process.cwd()), 'collection-'));
  const root = await writeCollection(repoRoot, 'sample');
  await rm(path.join(root, 'book'), { recursive: true });
  await assert.rejects(() => loadCollection('sample', { repoRoot }), /paths.book does not exist/);
});

test('rejects unsupported targets and mismatched output namespaces', async () => {
  const invalidTargetRoot = await mkdtemp(
    path.join(studioScratchDir('test', process.cwd()), 'collection-')
  );
  await writeCollection(invalidTargetRoot, 'sample', {
    targets: { articles: true, book: ['docx'] },
  });
  await assert.rejects(
    () => loadCollection('sample', { repoRoot: invalidTargetRoot }),
    /targets must enable articles/
  );

  const invalidOutputRoot = await mkdtemp(
    path.join(studioScratchDir('test', process.cwd()), 'collection-')
  );
  await writeCollection(invalidOutputRoot, 'sample', { outputNamespace: 'other' });
  await assert.rejects(
    () => loadCollection('sample', { repoRoot: invalidOutputRoot }),
    /outputNamespace must equal collection id/
  );
});
```

- [ ] **Step 2: Run the tests and verify the resolver is missing**

Run:

```bash
node --test tests/unit/publishing/collections.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `tools/publishing/collections.mjs`.

- [ ] **Step 3: Implement the resolver and initial manifest**

Create `collections/agentic-delivery/collection.json`:

```json
{
  "id": "agentic-delivery",
  "title": "Agentic Delivery",
  "paths": {
    "articles": "articles",
    "research": "research",
    "editorial": "editorial",
    "guides": "guides",
    "assets": "assets",
    "book": "book"
  },
  "outputNamespace": "agentic-delivery",
  "targets": {
    "articles": true,
    "book": ["manuscript", "html", "epub", "pdf"]
  }
}
```

Implement `tools/publishing/collections.mjs` with these rules:

```js
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_COLLECTION = 'agentic-delivery';
export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const BOOK_TARGETS = new Set(['manuscript', 'html', 'epub', 'pdf']);

function sourcePath(root, relative, label) {
  if (typeof relative !== 'string' || path.isAbsolute(relative)) {
    throw new Error(`${label} must be a relative path`);
  }
  const resolved = path.resolve(root, relative);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${label} escapes collection root`);
  }
  return resolved;
}

export async function loadCollection(id = DEFAULT_COLLECTION, { repoRoot = REPO_ROOT } = {}) {
  if (!ID_RE.test(id)) throw new Error(`invalid collection id: ${id}`);
  const root = path.join(repoRoot, 'collections', id);
  const manifest = JSON.parse(await readFile(path.join(root, 'collection.json'), 'utf8'));
  if (manifest.id !== id)
    throw new Error(`collection id mismatch: requested ${id}, found ${manifest.id}`);
  if (manifest.outputNamespace !== id) throw new Error('outputNamespace must equal collection id');
  const names = ['articles', 'research', 'editorial', 'guides', 'assets', 'book'];
  const resolved = Object.fromEntries(
    names.map((name) => [name, sourcePath(root, manifest.paths?.[name], `paths.${name}`)])
  );
  for (const [name, directory] of Object.entries(resolved)) {
    await access(directory).catch(() => {
      throw new Error(`paths.${name} does not exist: ${directory}`);
    });
  }
  const bookTargets = manifest.targets?.book;
  if (
    manifest.targets?.articles !== true ||
    !Array.isArray(bookTargets) ||
    bookTargets.some((target) => !BOOK_TARGETS.has(target))
  ) {
    throw new Error('targets must enable articles and list only manuscript, html, epub, or pdf');
  }
  return {
    id,
    title: manifest.title,
    root,
    articlesDir: resolved.articles,
    researchDir: resolved.research,
    editorialDir: resolved.editorial,
    guidesDir: resolved.guides,
    assetsDir: resolved.assets,
    bookDir: resolved.book,
    outputRoot: path.join(repoRoot, '.tmp', id),
    targets: manifest.targets,
  };
}
```

- [ ] **Step 4: Run focused and complete unit tests**

Run:

```bash
node --test tests/unit/publishing/collections.test.mjs
npm run test:unit
```

Expected: all resolver tests and all existing publisher/book unit tests pass.

Update `test:unit` in `package.json` to include the new root-level test glob:

```json
"test:unit": "node --test tests/unit/publishing/*.test.mjs tests/unit/publishing/articles/*.test.mjs tests/unit/publishing/books/*.test.mjs tests/unit/publishing/lint/*.test.mjs"
```

- [ ] **Step 5: Commit the collection contract**

Run:

```bash
git add collections/agentic-delivery/collection.json tools/publishing/collections.mjs tests/unit/publishing/collections.test.mjs package.json
git diff --cached --check
git commit -m "feat: define writing collection contract"
```

---

### Task 4: Make both publishing CLIs collection-aware

**Files:**

- Modify: `tools/publishing/articles/cli.mjs`
- Modify: `tools/publishing/books/cli.mjs`
- Modify: `tests/unit/publishing/articles/publish-articles.test.mjs`
- Modify: `tests/unit/publishing/books/render.test.mjs`
- Modify: `tests/e2e/publishing/publish-articles-e2e.test.mjs`

**Interfaces:**

- Consumes: `loadCollection(id)` from Task 3.
- Produces: repeatable `--collection <id>` parsing with default `agentic-delivery`.
- Produces: default outputs `.tmp/<collection>/articles` and `.tmp/<collection>/book`.

- [ ] **Step 1: Add failing CLI parsing tests**

Add assertions to the existing CLI test files:

```js
assert.equal(parseArticleArgs([]).collection, 'agentic-delivery');
assert.equal(parseArticleArgs(['--collection', 'sample']).collection, 'sample');
assert.throws(() => parseArticleArgs(['--collection']), /--collection requires a value/);

assert.equal(parseBookArgs([]).collection, 'agentic-delivery');
assert.equal(parseBookArgs(['--collection', 'sample']).collection, 'sample');
assert.throws(() => parseBookArgs(['--collection']), /--collection requires a value/);
```

Use aliases on imports if both tests call their entry point `parseArgs`.

- [ ] **Step 2: Run focused tests and verify they fail**

Run:

```bash
node --test tests/unit/publishing/articles/publish-articles.test.mjs tests/unit/publishing/books/render.test.mjs
```

Expected: FAIL because the returned options lack `collection` and `--collection` is unknown.

- [ ] **Step 3: Resolve the collection in each CLI**

In both parsers, initialize `collection: DEFAULT_COLLECTION`, consume
`--collection <id>`, and mention the option in `--help`. In each `main`, call:

```js
const collection = await loadCollection(options.collection);
```

The article CLI passes:

```js
articlesDir: collection.articlesDir,
outRoot: path.resolve(options.out ?? path.join(collection.outputRoot, 'articles')),
```

The book CLI passes:

```js
articlesDir: collection.articlesDir,
bookDir: collection.bookDir,
outDir: path.resolve(options.out ?? path.join(collection.outputRoot, 'book')),
```

Reject a requested book target not enabled by `collection.targets.book`. Keep `--out` as an explicit override, but reject an override that resolves inside `collection.root`.

- [ ] **Step 4: Update E2E expectations and run the publisher**

Change the E2E source-clean assertion to inspect
`collections/agentic-delivery/` and add `--collection agentic-delivery` to the
spawned command.

Run:

```bash
npm run test:unit
npm run publish:articles -- --collection agentic-delivery --skip-diagrams
npm run book -- --collection agentic-delivery --target manuscript
git status --short -- collections
```

Expected: tests pass; article folders appear under `.tmp/agentic-delivery/articles`; manuscript appears under `.tmp/agentic-delivery/book`; collection status is empty.

- [ ] **Step 5: Commit collection-aware entry points**

Run:

```bash
git add tools/publishing/articles/cli.mjs tools/publishing/books/cli.mjs tests/unit/publishing/articles tests/unit/publishing/books tests/e2e/publishing
git diff --cached --check
git commit -m "feat: publish named writing collections"
```

---

### Task 5: Decouple Mermaid and toolchain scratch behavior from AITM

**Files:**

- Modify: `tools/publishing/shared/diagrams.mjs`
- Modify: `tools/publishing/books/toolchain.mjs`
- Create: `tests/unit/publishing/scratch.test.mjs`
- Modify: `tests/unit/publishing/articles/publish-articles.test.mjs`
- Modify: `tests/unit/publishing/books/toolchain.test.mjs`
- Modify: `.github/puppeteer-ci.json`

**Interfaces:**

- Consumes: `studioScratchDir(purpose, repoRoot)` from Task 2.
- Produces: `WRITING_STUDIO_MERMAID_PUPPETEER_CONFIG` as the only environment override for Mermaid's Puppeteer config.

- [ ] **Step 1: Add failing scratch and environment tests**

Create `tests/unit/publishing/scratch.test.mjs`:

```js
import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { studioScratchDir } from '../../../tools/publishing/scratch.mjs';

test('creates purpose-scoped scratch under the supplied studio root', () => {
  const root = path.resolve('.tmp/scratch-test-root');
  assert.equal(studioScratchDir('publish', root), path.join(root, '.tmp', 'scratch', 'publish'));
});

test('rejects invalid purposes and relative roots', () => {
  assert.throws(() => studioScratchDir('../escape', process.cwd()), /purpose must match/);
  assert.throws(() => studioScratchDir('test', 'relative'), /repoRoot must be absolute/);
});
```

Add a diagram test that sets only
`WRITING_STUDIO_MERMAID_PUPPETEER_CONFIG` and proves the generated MMDC args
contain `--puppeteerConfigFile`. Assert the old `AITM_MERMAID_PUPPETEER_CONFIG`
name is absent from source.

- [ ] **Step 2: Run the focused tests and capture the old-name failure**

Run:

```bash
node --test tests/unit/publishing/scratch.test.mjs tests/unit/publishing/articles/publish-articles.test.mjs tests/unit/publishing/books/toolchain.test.mjs
rg -n "AITM_MERMAID_PUPPETEER_CONFIG|projectScratchDir|AI_TASK_MANAGER" tools tests .github
```

Expected: the new environment assertion fails until diagrams use the studio name; the search exposes every remaining AITM coupling.

- [ ] **Step 3: Replace the remaining coupling**

Use:

```js
configPath: process.env.WRITING_STUDIO_MERMAID_PUPPETEER_CONFIG,
```

Ensure Mermaid uses `studioScratchDir('publish', REPO_ROOT)` and LaTeX probes use
`studioScratchDir('book', REPO_ROOT)`. Keep `.github/puppeteer-ci.json` exactly:

```json
{
  "args": ["--no-sandbox", "--disable-setuid-sandbox"]
}
```

- [ ] **Step 4: Run focused and complete unit tests**

Run:

```bash
node --test tests/unit/publishing/scratch.test.mjs tests/unit/publishing/articles/publish-articles.test.mjs tests/unit/publishing/books/toolchain.test.mjs
rg -n "AITM_MERMAID_PUPPETEER_CONFIG|projectScratchDir|AI_TASK_MANAGER" tools tests .github
npm run test:unit
```

Expected: all tests pass and the search returns no matches.

- [ ] **Step 5: Commit the runtime decoupling**

Run:

```bash
git add tools/publishing tests/unit/publishing .github/puppeteer-ci.json
git diff --cached --check
git commit -m "refactor: remove AITM publishing dependencies"
```

---

### Task 6: Make linting collection-aware and validate local links

**Files:**

- Modify: `tools/publishing/lint/article-citations.mjs`
- Modify: `tools/publishing/lint/book-markers.mjs`
- Create: `tools/publishing/lint/local-links.mjs`
- Modify: `tests/unit/publishing/lint/lint-article-citations.test.mjs`
- Modify: `tests/unit/publishing/books/lint-book-markers.test.mjs`
- Create: `tests/unit/publishing/lint/local-links.test.mjs`
- Modify: `package.json`
- Modify: collection Markdown files with paths broken by the move

**Interfaces:**

- Consumes: `loadCollection(id)` from Task 3.
- Produces: `lintArticleCitations(articlesDir) -> string[]`.
- Produces: `lintBookMarkers({ articlesDir, bookDir }) -> Promise<Finding[]>`.
- Produces: `lintLocalLinks(collectionRoot) -> Promise<Finding[]>`.

- [ ] **Step 1: Write failing collection and local-link tests**

Create `tests/unit/publishing/lint/local-links.test.mjs`:

```js
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { lintLocalLinks } from '../../../../tools/publishing/lint/local-links.mjs';
import { studioScratchDir } from '../../../../tools/publishing/scratch.mjs';

async function fixture(markdown, extraFiles = []) {
  const root = await mkdtemp(path.join(studioScratchDir('test', process.cwd()), 'links-'));
  await mkdir(path.join(root, 'articles'), { recursive: true });
  await writeFile(path.join(root, 'articles', '01-example.md'), markdown);
  for (const relative of extraFiles) {
    const absolute = path.join(root, relative);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, '# Target\n');
  }
  return root;
}

test('accepts existing local targets and ignores external URLs and fragments', async () => {
  const root = await fixture(
    '# Article\n\n[Research](../research/note.md) [AITM](https://github.com/kburson/ai-task-manager) [Here](#article)\n',
    ['research/note.md']
  );
  assert.deepEqual(await lintLocalLinks(root), []);
});

test('reports a missing target with collection-relative file and line', async () => {
  const root = await fixture('# Article\n\n[Missing](../research/missing.md)\n');
  assert.deepEqual(await lintLocalLinks(root), [
    {
      file: 'articles/01-example.md',
      line: 3,
      target: '../research/missing.md',
      message: 'local target does not exist',
    },
  ]);
});

test('rejects a target that escapes the collection root', async () => {
  const root = await fixture('# Article\n\n[Escape](../../outside.md)\n');
  await assert.rejects(() => lintLocalLinks(root), /link target escapes collection root/);
});
```

Add this assertion to the citation-lint test file:

```js
assert.deepEqual(
  lintBibliography(
    'articles/01.md',
    '- AITM. https://github.com/kburson/ai-task-manager/blob/trunk/docs/DESIGN.md'
  ),
  []
);
```

Retain citation tests that reject relative and bare `docs/` or `scripts/` bibliography targets. Delete the old assertion that an AITM blob URL must resolve to a local checkout file.

- [ ] **Step 2: Run focused tests and verify the new linker is missing**

Run:

```bash
node --test tests/unit/publishing/lint/*.test.mjs tests/unit/publishing/books/lint-book-markers.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `local-links.mjs` and signature mismatches in the moved lints.

- [ ] **Step 3: Implement collection-aware lints**

Implement `tools/publishing/lint/local-links.mjs`:

```js
#!/usr/bin/env node
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_COLLECTION, loadCollection } from '../collections.mjs';

const LINK_RE = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;

async function markdownFiles(root, directory = root) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await markdownFiles(root, absolute)));
    else if (entry.isFile() && entry.name.endsWith('.md')) files.push(absolute);
  }
  return files.sort();
}

function lineNumber(source, offset) {
  return source.slice(0, offset).split('\n').length;
}

function localTarget(raw) {
  const target = raw.startsWith('<') && raw.endsWith('>') ? raw.slice(1, -1) : raw;
  if (/^(?:https?:|mailto:)/i.test(target) || target.startsWith('#')) return null;
  return target.split(/[?#]/, 1)[0];
}

export async function lintLocalLinks(collectionRoot) {
  const findings = [];
  for (const file of await markdownFiles(collectionRoot)) {
    const source = await readFile(file, 'utf8');
    for (const match of source.matchAll(LINK_RE)) {
      const target = localTarget(match[1]);
      if (!target) continue;
      const resolved = path.resolve(path.dirname(file), decodeURIComponent(target));
      if (resolved !== collectionRoot && !resolved.startsWith(`${collectionRoot}${path.sep}`)) {
        throw new Error(
          `${path.relative(collectionRoot, file)}:${lineNumber(source, match.index)}: link target escapes collection root: ${match[1]}`
        );
      }
      try {
        await access(resolved);
      } catch {
        findings.push({
          file: path.relative(collectionRoot, file).split(path.sep).join('/'),
          line: lineNumber(source, match.index),
          target: match[1],
          message: 'local target does not exist',
        });
      }
    }
  }
  return findings;
}

function parseArgs(argv) {
  let collection = DEFAULT_COLLECTION;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== '--collection') throw new Error(`unknown argument: ${argv[index]}`);
    collection = argv[(index += 1)];
    if (!collection) throw new Error('--collection requires a value');
  }
  return { collection };
}

async function main(argv) {
  const { collection: id } = parseArgs(argv);
  const collection = await loadCollection(id);
  const findings = await lintLocalLinks(collection.root);
  if (findings.length === 0) {
    console.log(`lint-local-links: ${id} local links resolve.`);
    return;
  }
  for (const finding of findings) {
    console.error(`${finding.file}:${finding.line}: ${finding.target}: ${finding.message}`);
  }
  process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main(process.argv.slice(2));
}
```

Both executable lint entry points parse optional `--collection <id>`, load the
collection, and report collection-relative paths. Add:

```json
"lint:local-links": "node tools/publishing/lint/local-links.mjs",
```

and append it to `lint` after the two structural publication lints.

- [ ] **Step 4: Repair links exposed by the new layout**

Repair these known moved-path links:

- `collections/agentic-delivery/README.md` links to articles, editorial files,
  guides, research, and history;
- `collections/agentic-delivery/articles/05-easy-come-easy-go.md` links to its
  research and design history;
- `collections/agentic-delivery/book/introduction.md` historical plan path;
- research and editorial links that formerly relied on all files sharing one
  `docs/articles` directory.

Then run the local-link lint and repair every additional reported path before
proceeding; do not suppress or ignore findings.

Run:

```bash
npm run lint:article-citations
npm run lint:book-markers
npm run lint:local-links
```

Expected: each command exits 0; AITM GitHub citations remain unchanged; no local link escapes or points at a missing path.

- [ ] **Step 5: Run all tests and commit lint ownership**

Run:

```bash
npm run test:unit
git add tools/publishing/lint tests/unit/publishing package.json package-lock.json collections/agentic-delivery
git diff --cached --check
git commit -m "feat: validate collection links and publication markers"
```

---

### Task 7: Add studio documentation, provenance, and rights boundaries

**Files:**

- Create: `README.md`
- Create: `docs/migration-provenance.md`
- Create: `RIGHTS.md`
- Create: `LICENSES/AGPL-3.0-or-later.txt`
- Modify: `collections/agentic-delivery/README.md`
- Modify: `collections/agentic-delivery/guides/linkedin-publishing-guide.md`
- Modify: `collections/agentic-delivery/guides/book-publishing-guide.md`

**Interfaces:**

- Consumes: the final local source SHA, filtered path set, collection commands, and current migration commit.
- Produces: an operator-facing studio guide, collection guide, rights map, and auditable source provenance.

- [ ] **Step 1: Copy the preserved software license and write the rights map**

Run:

```bash
mkdir -p LICENSES
cp /Users/kpburson/projects/Vibe-Coding/ai-task-manager/.claude/worktrees/articles-book-publication-6a7dfe/LICENSE LICENSES/AGPL-3.0-or-later.txt
```

Create `RIGHTS.md` stating:

```markdown
# Rights and licensing

The publishing software under `tools/` is available under
AGPL-3.0-or-later. See `LICENSES/AGPL-3.0-or-later.txt`.

The prose, research notes, editorial material, and media under `collections/`
are private working materials. This repository grants no general permission to
copy, redistribute, publish, or create derivative works from them.

Source citations and asset-provenance notes remain attached to their respective
collection files. A future public content license requires a separate explicit
decision.
```

- [ ] **Step 2: Write the root and collection operating guides**

The root `README.md` must document:

- the private working-studio purpose;
- the `collections/`, `tools/`, `tests/`, and `.tmp/` boundaries;
- Node.js 22 and `npm ci` setup;
- every supported npm command;
- `--collection agentic-delivery` and the current default;
- Pandoc requirements for HTML/EPUB and optional LaTeX requirements for PDF;
- the rule that generated output is disposable and source remains read-only;
- rights and provenance links.

Update both publishing guides so every command and path names the collection-aware studio layout. Do not retain instructions that say the source is `docs/articles` or the executable is under `scripts/articles`.

- [ ] **Step 3: Write concrete migration provenance**

Create `docs/migration-provenance.md` with:

- source URL `git@github.com:kburson/ai-task-manager.git`;
- the immutable source SHA recorded in Task 1;
- source branch `claude/articles-book-publication-6a7dfe`;
- the complete `git filter-repo` path set from Task 1;
- explicit exclusion of the AITM test-corpus and hosted-CI plans;
- the current studio migration commit SHA;
- local verification commands and their recorded outcomes;
- a statement that remote verification is recorded in Task 9 after CI passes.

Do not insert unresolved status labels or a fake CI URL. Before the first push,
describe remote verification as a required later migration gate rather than
completed evidence.

- [ ] **Step 4: Verify documentation and commit**

Run:

```bash
npx prettier --write README.md RIGHTS.md docs collections/agentic-delivery/guides collections/agentic-delivery/README.md
npm run lint:md
npm run lint:spell
npm run lint:local-links
git diff --check
git add README.md RIGHTS.md LICENSES docs collections/agentic-delivery
git commit -m "docs: document studio operation and provenance"
```

Expected: all documentation checks pass and the commit contains no generated output.

---

### Task 8: Add standalone CI and local publication gates

**Files:**

- Create: `.github/workflows/ci.yml`
- Modify: `.github/puppeteer-ci.json`
- Modify: `package.json`

**Interfaces:**

- Consumes: the standalone package and collection-aware commands.
- Produces: read-only GitHub Actions verification for formatting, lint, tests, a real Mermaid publish, and Pandoc manuscript/HTML/EPUB builds.

- [ ] **Step 1: Add package-level build gates**

Add these scripts:

```json
"verify:articles": "npm run publish:articles -- --collection agentic-delivery",
"verify:book": "npm run doctor:book -- --collection agentic-delivery --target html --target epub && npm run book -- --collection agentic-delivery --target manuscript --target html --target epub",
"verify": "npm run quality && npm run verify:articles && npm run verify:book"
```

The doctor must not demand LaTeX when only HTML and EPUB are selected.

- [ ] **Step 2: Write the GitHub Actions workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [trunk]
  pull_request:
  workflow_dispatch:

permissions:
  contents: read

jobs:
  verify:
    runs-on: ubuntu-latest
    env:
      WRITING_STUDIO_MERMAID_PUPPETEER_CONFIG: .github/puppeteer-ci.json
    steps:
      - uses: actions/checkout@v5
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v5
        with:
          node-version: 22
          cache: npm
      - run: sudo apt-get update
      - run: sudo apt-get install --yes pandoc
      - run: npm ci
      - run: npm run verify
      - run: git status --porcelain -- collections
```

- [ ] **Step 3: Run the complete local normal gate**

Run:

```bash
npm run verify
git status --short -- collections
git diff --check
```

Expected: formatting, all lints, unit and E2E tests, full Mermaid publishing, manuscript, HTML, and EPUB succeed; collection status is empty.

- [ ] **Step 4: Run the optional local PDF gate**

Run:

```bash
npm run doctor:book -- --collection agentic-delivery --target pdf
npm run book -- --collection agentic-delivery --target pdf
```

Expected: on the documented local LaTeX toolchain, doctor passes and `.tmp/agentic-delivery/book/book.pdf` exists and is non-empty. Inspect the rendered PDF before recording the gate as passed.

- [ ] **Step 5: Commit CI only after local gates pass**

Run:

```bash
git add .github package.json package-lock.json tools tests
git diff --cached --check
git commit -m "ci: verify studio publications independently"
git status --short
```

Expected: clean working tree after the commit.

---

### Task 9: Push, verify the private remote, and record migration evidence

**Files:**

- Modify: `docs/migration-provenance.md`

**Interfaces:**

- Consumes: a clean locally verified `trunk` and private empty `origin`.
- Produces: verified private remote history, default branch `trunk`, successful CI, and a provenance record naming the verified baseline commit and run.

- [ ] **Step 1: Show the exact pre-push evidence**

Run:

```bash
git status --short
git remote -v
git log --oneline --decorate -12
git rev-list --count trunk
gh repo view kburson/writing-studio --json nameWithOwner,visibility,url,defaultBranchRef
```

Expected: clean status; only the private target origin; selected history plus migration commits; private visibility; no unexpected remote branch.

- [ ] **Step 2: Push the verified local branch and set the default branch**

Run:

```bash
git push --set-upstream origin trunk
gh repo edit kburson/writing-studio --default-branch trunk
```

Expected: the push succeeds without force and GitHub reports `trunk` as default.

- [ ] **Step 3: Verify the pushed SHA and initial CI run**

Run:

```bash
git rev-parse HEAD
git ls-remote origin refs/heads/trunk
gh run list --repo kburson/writing-studio --branch trunk --limit 5
STUDIO_RUN_ID=$(gh run list --repo kburson/writing-studio --branch trunk --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch "$STUDIO_RUN_ID" --repo kburson/writing-studio --exit-status
```

Expected: local and remote SHAs match and the CI workflow concludes `success`. Record the run URL and verified SHA.

- [ ] **Step 4: Record the verified baseline in provenance**

Update `docs/migration-provenance.md` with the exact verified SHA, CI run URL,
local verification commands, and PDF inspection result. Then run:

```bash
npx prettier --check docs/migration-provenance.md
npx cspell --no-progress docs/migration-provenance.md
git add docs/migration-provenance.md
git commit -m "docs: record verified studio migration"
git push origin trunk
STUDIO_RUN_ID=$(gh run list --repo kburson/writing-studio --branch trunk --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch "$STUDIO_RUN_ID" --repo kburson/writing-studio --exit-status
```

Expected: the provenance commit pushes normally and its own CI run succeeds.

- [ ] **Step 5: Verify a fresh clone**

Run from a newly allocated path that does not already exist:

```bash
test ! -e /Users/kpburson/projects/Vibe-Coding/.tmp-writing-studio-fresh-clone
git clone git@github.com:kburson/writing-studio.git /Users/kpburson/projects/Vibe-Coding/.tmp-writing-studio-fresh-clone
cd /Users/kpburson/projects/Vibe-Coding/.tmp-writing-studio-fresh-clone
npm ci
npm run quality
npm run publish:articles -- --collection agentic-delivery --skip-diagrams
npm run book -- --collection agentic-delivery --target manuscript
git status --short -- collections
```

Expected: installation and checks pass, both publication commands work, and collection status is empty. Preserve this evidence until the dependent AITM cleanup is reviewed and completed.

- [ ] **Step 6: Stop at the cross-repository cleanup gate**

Report:

- private repository URL;
- final local and remote `trunk` SHA;
- successful CI run URL;
- fresh-clone verification outcomes;
- selected-history commit count;
- confirmation that AITM content remains untouched.

Do not begin AITM deletion from this plan.
