# Writing Studio Extraction — Design

Status: approved in discussion; pending review of this written specification

## Context

AI Task Manager currently contains a complete writing body of work under
`docs/articles/`, its LinkedIn publisher and book composer under
`scripts/articles/`, and their tests. The subject matter grew out of the
experience of building AITM, but the publication system is not part of the AITM
package. The repository already excludes `scripts/articles/` from its published
npm package.

The writing collection now includes research notes, experience-based points of
view, article drafts, editorial guidance, diagrams and header art, LinkedIn-ready
publication tooling, and a book-composition path. Future writing may not be
about AITM or presented as research. Its durable home should therefore be a
private, general-purpose working studio rather than an AITM documentation
subtree or a repository framed only as research papers.

## Decision

Create a private repository named `kburson/writing-studio`. It will be the sole
current authority for writing, editorial decisions, publication assets, and the
publication toolchain. The AITM article series will become its first collection,
named `agentic-delivery`.

Populate the repository through a selected-history extraction. Preserve the
history of writing-owned content and tooling without importing unrelated AITM
framework history. Reorganize the extracted paths and remove residual AITM
runtime assumptions in one explicit migration commit.

Do not remove anything from AITM until a fresh clone of `writing-studio` has
passed all migration gates. AITM cleanup is a separate, final phase.

## Goals

- Give research-backed, experience-led, and point-of-view writing one private
  working home.
- Keep prose, research, editorial context, visual assets, publishing tools, and
  directly related decision history together.
- Preserve relevant commit authorship, timestamps, messages, and file evolution.
- Make the publisher and book composer independent of AITM.
- Support additional writing collections without prematurely building a plugin
  framework.
- Prove the extracted repository works independently before changing AITM.
- Establish an unambiguous single source of truth after migration.

## Non-goals

- Publishing directly to LinkedIn or another external platform.
- Building a content-management service or hosted authoring application.
- Designing a generic plugin ecosystem for arbitrary publication formats.
- Publishing `writing-studio` as an npm package.
- Making the repository or its drafts public.
- Mirroring writable copies of the articles in both repositories.
- Rewriting completed AITM historical plans that merely mention the former
  publisher.

## Repository settings

- **Owner:** `kburson`
- **Repository:** `writing-studio`
- **Visibility:** private
- **Default branch:** `trunk`
- **Description:** Private workspace for developing, testing, and publishing
  articles, essays, and books.
- **Package status:** root `package.json` has `"private": true`
- **Initial integrations:** no Pages site, public releases, packages,
  collaborators, deployment secrets, or AITM dependency
- **GitHub Actions:** read-only permissions except where a future workflow has
  an explicitly documented need for more

GitHub Issues remain available for future editorial tracking but require no
AITM installation or workflow integration.

## Repository layout

```text
writing-studio/
├── collections/
│   └── agentic-delivery/
│       ├── collection.json
│       ├── articles/
│       ├── research/
│       ├── editorial/
│       ├── guides/
│       ├── book/
│       ├── assets/
│       └── history/
│           ├── specs/
│           └── plans/
├── tools/
│   └── publishing/
│       ├── articles/
│       └── books/
├── tests/
├── docs/
├── package.json
└── README.md
```

### Collection ownership

`collections/agentic-delivery/` owns:

- numbered article sources and explicit drafts;
- the research synopsis and topic-specific research notes;
- series argument, voice, terminology, title, visual, and editorial guidance;
- LinkedIn and book publishing guides;
- diagrams, header images, prompts, and other source assets;
- book metadata, introduction, glossary, and book-only fragments; and
- completed specifications and implementation plans directly about this
  writing collection or its publication tools.

The existing `docs/articles/` subtree is classified into these focused
directories during the migration commit. Files are not duplicated between
categories.

### Shared tool ownership

`tools/publishing/` owns the LinkedIn preparation path, shared parsing and
diagram modules, the book composer, and their command-line entry points. Tests
mirror this source structure under `tests/`.

Generated artifacts are always outside `collections/` and ignored under
`.tmp/<collection>/<target>/` unless a later design explicitly establishes
versioned release artifacts.

## Collection contract

Each collection has one `collection.json`. The initial contract provides:

- a stable collection identifier and display title;
- the article-source directory;
- research, editorial, guide, and asset directories;
- the book metadata directory;
- the generated-output root; and
- the publication targets enabled for that collection.

A shared resolver reads the manifest, resolves every path against the
collection root, and passes resolved paths into publishing modules. Modules do
not hardcode `docs/articles`, the repository root, or an AITM helper.

The command line accepts `--collection <id>`. `agentic-delivery` is the default
only while it is the sole collection. Adding a second collection requires an
explicit choice or a separately designed default; the tools must not silently
publish multiple collections.

## Publication data flow

```text
collection.json
      ↓
source articles and collection assets
      ↓
validation and transformation
      ├── LinkedIn-ready HTML, companion copy, and images
      └── book manuscript, HTML, EPUB, and PDF
      ↓
.tmp/<collection>/<target>/
```

Initial commands remain familiar:

```bash
npm run publish:articles -- --collection agentic-delivery
npm run book -- --collection agentic-delivery
npm run doctor:book
npm run lint
npm test
```

The migration preserves existing behavior for article selection, explicit draft
exclusion, diagram rendering, publication strip rules, book markers, citation
conversion, the Sources appendix, glossary and index generation, and Pandoc
render targets.

The tools prepare publication artifacts but do not post, upload, distribute, or
release them.

## Selected-history extraction

The extraction includes the history of:

- `docs/articles/**`;
- `scripts/articles/**`;
- unit and slow tests dedicated to the article publisher and book composer;
- the article-citation checker and its dedicated tests; and
- the seven writing-owned design and implementation documents listed below.

Writing-owned specifications:

- `docs/superpowers/specs/2026-08-17-article-ending-sections-design.md`
- `docs/superpowers/specs/2026-08-18-easy-come-easy-go-article-design.md`
- `docs/superpowers/specs/2026-08-25-book-composition-path-design.md`

Writing-owned implementation plans:

- `docs/superpowers/plans/2026-07-16-article-deepening.md`
- `docs/superpowers/plans/2026-08-17-article-ending-sections.md`
- `docs/superpowers/plans/2026-08-20-exclude-draft-articles-from-publisher.md`
- `docs/superpowers/plans/2026-08-25-book-composition-path.md`

Completed specifications and plans move to
`collections/agentic-delivery/history/`. They remain decision provenance rather
than current operating instructions. Internal article links to them are repaired
to their new paths.

The extraction excludes AITM framework code, issue workflow machinery, package
boundary tests, and framework-specific CI history. In particular, these remain
AITM historical records:

- `docs/superpowers/plans/2026-08-13-centralize-package-test-corpus.md`
- `docs/superpowers/plans/2026-08-23-1388-hosted-ci-mermaid-sandbox.md`

The ignored `.tmp/handoff/book-composition-handoff.md` is a session handoff, not
canonical product documentation, and is not migrated as a current studio file.

The extraction preserves source commit authors, timestamps, messages, and file
evolution. One later migration commit establishes the studio layout, adds the
new root configuration, updates links, and removes AITM coupling.

`docs/migration-provenance.md` records:

- the source repository URL;
- source branch and immutable source commit;
- the extraction path set;
- excluded AITM-owned documents;
- the migration commit; and
- the date and verification result of the migration.

## AITM decoupling

The migration removes the following runtime assumptions:

- Replace AITM's `projectScratchDir` import with a repository-local studio
  scratch-path helper.
- Rename `AITM_MERMAID_PUPPETEER_CONFIG` to a writing-studio-specific variable
  and update CI and tests together.
- Replace hardcoded `docs/articles` paths with resolved collection paths.
- Make citation validation distinguish local collection links from external
  evidence URLs.
- Treat links to public AITM files as external citations rather than requiring
  the cited file to exist in the studio checkout.
- Move article-only scripts, development dependencies, lint rules, and CI wiring
  into the new repository.

External links that cite AITM as evidence remain intact unless they are broken
or point to content that the AITM cleanup will remove.

## Error handling

The tools continue to fail before producing a partial publication when they
encounter:

- a missing or invalid collection manifest;
- a path that escapes its collection root;
- missing source or required asset files;
- malformed article structure or book markers;
- invalid or broken local Markdown links;
- malformed citations that could disappear from a publication;
- unsupported fenced content or unresolved diagram inputs; or
- unavailable tools required for the selected render target.

Diagnostics use collection-relative file paths and line numbers where a source
location exists. Failures must not modify source files under `collections/`.

External network-link availability is not a default correctness gate. External
citations are validated structurally; a later, separately designed link-audit
workflow may check remote availability without making normal authoring dependent
on the network.

## Testing and CI

The standalone repository provides these verification layers:

- unit tests for parsing, transformations, path resolution, manifest
  validation, markers, citations, diagrams, book assembly, and render arguments;
- collection corpus tests proving that every non-draft article can be published
  and composed;
- an end-to-end publisher test that renders real Mermaid diagrams and proves
  source files remain unchanged;
- manuscript, HTML, and EPUB book checks in normal CI;
- local or manually triggered PDF verification using the full LaTeX toolchain;
- local-link validation within each collection; and
- formatting, spelling, Markdown, and collection structural checks.

Normal CI runs on Node.js 22 and installs dependencies from the studio lockfile.
The hosted Mermaid configuration is owned and tested by `writing-studio`. The
normal lane does not require the comparatively heavy LaTeX installation used for
PDF output.

## Migration gates

AITM remains unchanged until all of the following succeed:

1. Create and clone the empty private `kburson/writing-studio` repository.
2. Complete the selected-history extraction and migration commit.
3. Install dependencies in a fresh clone of `writing-studio`.
4. Run its complete normal test and lint suite.
5. Generate the LinkedIn-ready corpus.
6. Generate the book manuscript, HTML, and EPUB.
7. Generate and inspect the PDF where the local toolchain permits.
8. Confirm publishing modifies nothing under `collections/`.
9. Verify the private remote, default branch, selected history, pushed commit,
   and GitHub Actions result.
10. Confirm the migration provenance record identifies the verified commit.

Failure at any gate leaves AITM as the current authority and does not trigger
source cleanup.

## AITM cleanup

After the migration gates pass, a separate AITM cleanup removes:

- `docs/articles/**`;
- `scripts/articles/**`;
- dedicated publisher and book-composer tests;
- the article-citation checker and dedicated tests if it has no other caller;
- article-only package commands and dependencies;
- article-specific test-corpus registration and hosted Mermaid CI wiring;
- the seven writing-owned specifications and plans after their presence in
  `writing-studio` is verified; and
- stale package-boundary and installation-document references to
  `scripts/articles`.

The cleanup preserves the AITM-owned test-corpus and hosted-CI plans as
historical records even though they mention the former publisher. It does not
rewrite old commits.

Because `writing-studio` is private, public AITM documentation does not present
an inaccessible repository URL as user documentation. If current AITM context
requires an explanation, it receives a brief historical note stating that the
editorial collateral moved to a separate authoring workspace.

After cleanup, `writing-studio` is the only current writable authority for the
collection and publication tools.

## Privacy and rights boundary

The source AITM package declares `AGPL-3.0-or-later`. The migration preserves
that license for extracted publishing software rather than silently relicensing
it.

The studio includes a rights notice that distinguishes:

- publishing software under `tools/`, which retains AGPL-3.0-or-later; and
- prose, research notes, editorial material, and media under `collections/`, for
  which the private repository grants no general reuse permission.

Existing source citations and image-generation provenance remain with the
collection. No repository-wide license will imply that unfinished prose or
media is reusable. Any future public content license requires a separate,
explicit decision.

## Acceptance criteria

- `kburson/writing-studio` exists as a private repository with `trunk` as its
  default branch.
- Its selected history contains only writing-owned content, tooling, tests, and
  direct decision records.
- The `agentic-delivery` collection contains every current article, research
  note, editorial document, publishing guide, required asset, and book source.
- The seven directly related specifications and plans are preserved under the
  collection's history.
- The studio installs and verifies independently of AITM.
- Publisher and book commands consume collection configuration rather than
  hardcoded AITM paths.
- All normal tests, lint checks, corpus checks, LinkedIn preparation, and
  manuscript/HTML/EPUB builds pass in a fresh clone.
- Local PDF generation succeeds where the documented LaTeX toolchain is
  installed.
- Source files remain unchanged by publication commands.
- The private remote, pushed commit, selected history, and CI result are
  recorded and verified.
- AITM cleanup begins only after those gates pass and leaves no second writable
  copy of the migrated work.
