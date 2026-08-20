# Publishing The Series To LinkedIn

<!-- markdownlint-disable MD034 -->

How to take the fifteen finished articles in this folder from Markdown source to fifteen published LinkedIn long-form Articles, cross-linked, with working cover images and rendered diagrams.

## Why This Guide Exists

LinkedIn's long-form Article editor is a rich-text editor, not a Markdown renderer. It accepts headings, bold/italic, bullet and numbered lists, block images, and hyperlinks. It does **not** render Markdown syntax as text, HTML comments, Mermaid code fences, or Markdown tables. Publishing straight from these `.md` files would leave literal `#`/`|`/` ``` ` characters and unrendered diagram code in the published post. This guide is the conversion procedure that avoids that.

## Start Here: The Publisher Script

Everything this guide describes as a manual conversion is automated by `scripts/articles/publish-articles.mjs`:

```bash
npm run publish:articles
```

That reads `docs/articles/` (never writes there) and produces one self-contained folder per article under `.tmp/published/`:

```text
.tmp/published/
  _diagrams/                       every assets/diagrams/*.mmd, rendered to PNG
  diagram-drift-report.txt         in-body fences that no longer match their .mmd source
  05-just-in-time-planner/
    article.html                   open in a browser, select all, copy, paste into LinkedIn
    companion-post.txt             the feed announcement, plain text
    article-05-header.png          upload as the cover image
    05-just-in-time-planner-diagram-1.png
```

Useful flags:

- `-- --article 07` publishes one article (also accepts the full slug). Skips the shared `_diagrams/` library render.
- `-- --skip-diagrams` does every text transform but renders no images — fast, for checking prose.
- `-- --out <dir>` writes somewhere other than `.tmp/published`.
- `-- --help` prints the same summary.

The script fails loudly rather than shipping a half-converted body: an unterminated fence, a non-Mermaid fence, a Markdown table reaching the HTML renderer, a `Series Roadmap` without exactly one `Current` row, or a malformed `LinkedIn Article Shape` section all abort the run.

The sections below document the conversion rules the script implements. Read them when an article needs a judgment call the script deliberately leaves to a human — cross-linking, and visual QA of a rendered diagram.

## What To Strip From Every Article Before Publishing

Each article file carries some sections and markup that exist for repo maintenance or drafting purposes, not for the published prose. Remove these before copying content into LinkedIn:

- The `<!-- markdownlint-disable MD034 -->` comment (and any other HTML comment) at the top of the file. HTML comments are invisible in a rendered Markdown viewer but LinkedIn's editor will paste them as visible text.
- The `## Series Link` section header itself (keep the sentence content — it reads fine as a closing paragraph — but LinkedIn readers do not need a heading called "Series Link").
- The `## Series Roadmap` table. LinkedIn does not render Markdown tables; pasting one produces a wall of pipe characters. Replace it with the plain bullet list described below.
- The `## LinkedIn Article Shape` section itself, in its entirety. See the dedicated section below — this content has a real purpose, but it is not part of the article body.

Keep everything else: headings, body prose, bold/italic emphasis, bullet lists, blockquotes, and the `## Bibliography` section.

## The `## LinkedIn Article Shape` Section's Actual Purpose

Every article ends with a `## LinkedIn Article Shape` block (opening hook, three to five middle bullets, closing quote). This was never meant to appear inside the long-form article body — it is the outline for the **short native LinkedIn post** that announces the article and links to it.

When you publish long-form article N, use its `LinkedIn Article Shape` content to write the companion feed post:

- Post the opening hook quote as the first line of the post (this is what shows before "see more").
- Turn the middle bullets into two or three short sentences of context.
- End with the closing quote and a link to the newly published article.

This is also the answer to "why does every article have this section": it exists so the announcement post and the article itself don't have to be drafted separately later. Do not paste it into the article body — it duplicates the opening hook and closing line that already exist in the article prose, and it reads as an odd outline fragment to an article reader.

## Converting Mermaid Diagrams To Images

Every article embeds one or two Mermaid diagrams as fenced ` ```mermaid ` code blocks. LinkedIn's editor cannot render Mermaid, so each diagram becomes a rendered image before publishing. The publisher does this for you, with `@mermaid-js/mermaid-cli` as a devDependency:

```bash
mmdc -i <source.mmd> -o <out.png> -b transparent -s 3
```

`-b transparent` keeps the PNG from carrying a colored box across LinkedIn's white article background; `-s 3` stays sharp at LinkedIn article width.

Two renders happen per run, and the distinction matters:

- **In-body fences** are rendered from the article body itself into that article's folder as `<slug>-diagram-N.png`, numbered in document order. The body is what readers see, so the body is what gets rendered.
- **The `.mmd` library** under `docs/articles/assets/diagrams/` is rendered separately into `_diagrams/`, under each source's own name.

Where an in-body fence has no exact match in the library, the two copies have diverged; the run reports it in `diagram-drift-report.txt` but publishes anyway. Fix the drift in the source article, not in the output.

In the published article, each fence's position is marked with a visible `INSERT IMAGE HERE: <filename>` placeholder — upload that file as a block image at that point.

## Handling The `## Series Roadmap` Table

Replace the Markdown table with a plain bullet list — LinkedIn renders bullets natively and this reads fine as a closing "rest of the series" pointer:

```
This is article N of 9 in the series:

- The Rise Of Technical Product Operations
- The Vibe Coding Hangover
- Spec-Driven Development Is Necessary But Not Sufficient
- The Rise Of The Technical Product Owner
- The Backlog Becomes The Control Plane
- The Just-In-Time Planner
- Context Durability Is A Feature
- Evidence Beats Trust
- The Adapter Future
```

Bold the current article's line instead of using the table's "Current" marker. Once an article is live, replace its plain-text title with a real hyperlink (see the cross-linking procedure below) — this list is where the series navigation actually lives on LinkedIn.

## Cross-Linking And Publish Order

The Markdown files link to each other with relative paths (`02-the-backlog-governance-postulate.md`, `#aitm-and-the-backlog-manager-pattern`, etc.). None of those resolve on LinkedIn — LinkedIn articles only accept absolute URLs, and an article's URL does not exist until after it is published.

Publish in series order (02 → 10) and backfill links as each subsequent article goes live:

1. Publish article 02 with no working links back into the series (the roadmap bullet list stays plain text for now, and the `Series Link` sentence linking forward to article 03 also stays unlinked since 03 isn't live yet).
2. Publish article 03. Go back and edit article 02 (LinkedIn allows editing published articles) to hyperlink its forward reference and its roadmap bullet for article 03.
3. Repeat through article 10: after each new article goes live, revisit every already-published article's roadmap list and `Series Link` sentence and add the new article's URL.
4. After article 10 (the finale) is live, every prior article should have a fully hyperlinked roadmap list, and the whole series should be mutually cross-linked.

This is the only viable order given LinkedIn's URL-after-publish constraint — do not try to pre-link forward to articles that do not exist yet.

Internal anchor links (e.g. `02-the-backlog-governance-postulate.md#aitm-and-the-backlog-manager-pattern`, used when a later article references AITM's introduction in article 02) should become a plain link to the target article's published URL — LinkedIn articles do not expose in-page anchors, so the fragment gets dropped and the link just goes to the top of the referenced article.

## Cover Images

Each article already has a generated banner at `docs/articles/assets/article-headers/article-0N-header.png`, embedded inline at the top of the Markdown file. When creating the LinkedIn article:

- Upload that same PNG as the article's **cover image** (LinkedIn's article editor has a dedicated cover-image upload separate from the body).
- Remove the inline `![Title](assets/article-headers/article-0N-header.png)` image line from the body text you paste in — LinkedIn will already show the cover image above the title, so keeping it inline as the first body image duplicates it.

## Bibliography

Keep the `## Bibliography` section as-is. LinkedIn renders bullet lists and hyperlinks natively, so citation links work without conversion. Leave the heading as a plain `## Bibliography` or `## Sources` line.

Every citation in the section must be an absolute URL. A repo-internal citation is written as `https://github.com/kburson/ai-task-manager/blob/trunk/docs/<path>`, never as a relative path like `../introduction/core-workflow.md`. A relative path resolves against the repo checkout, which the published article is not — on LinkedIn it renders as literal text that leads a reader nowhere. `blob/trunk` rather than a commit-pinned permalink is deliberate: these citations point at living design and process docs, and a reader following one wants today's version, not a snapshot.

`npm run lint:article-citations` enforces this. It scans the `## Bibliography` section of every `NN-*.md` article and fails, naming file and line, when a citation is not an absolute `http(s)` URL. Body prose is out of scope — articles link to each other by relative filename on purpose, and those become real LinkedIn URLs during the backfill pass described under Cross-Linking And Publish Order above.

The publisher needs no special handling for any of this: `renderInline` emits an `<a href>` for every absolute URL it meets, so a bibliography that passes the lint reaches the reader as live links, and only body cross-references fall through to plain text.

## Per-Article Publish Checklist

Run `npm run publish:articles` once, then for each of the 15 articles, in series order:

1. Open that article's `article.html` in a browser. Select all, copy.
2. Paste into LinkedIn's article editor. Stripping, heading levels, emphasis, lists, blockquotes, the roadmap bullet list, and hyperlinks all survive the paste.
3. Upload `article-0N-header.png` as the article's **cover image**.
4. At each `INSERT IMAGE HERE: <filename>` placeholder, upload the named PNG as a block image and delete the placeholder line. Eyeball the rendered diagram while you are there — nothing has visually QA'd it.
5. Fix cross-article links per the publish-order procedure above. The publisher renders relative cross-article references as plain text on purpose: the target URL does not exist until that article is live. Bibliography citations need no such fix — they are absolute by rule and already hyperlinked.
6. Publish, then post `companion-post.txt` as the feed announcement, replacing `<PASTE THE PUBLISHED ARTICLE URL HERE>` with the URL LinkedIn just assigned.
7. Go back through every previously published article and backfill the new article's link into their roadmap lists and any forward references that were waiting on it.

## Open Items Not Covered By This Guide

- Visual QA of each rendered diagram is still a human step (checklist step 4). The publisher proves a valid PNG came out; it cannot tell you the layout reads well at LinkedIn's article width.
- Cross-linking (checklist step 5) stays manual by necessity — see the publish-order constraint above.
- This guide assumes publishing through LinkedIn's own web editor by hand. If publish volume ever justifies it, LinkedIn does not currently offer content APIs for authoring long-form Articles, so this remains a manual process for now.
