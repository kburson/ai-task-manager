# Publishing The Series To LinkedIn

<!-- markdownlint-disable MD034 -->

How to take the nine finished articles in this folder from Markdown source to nine published LinkedIn long-form Articles, cross-linked, with working cover images and rendered diagrams.

## Why This Guide Exists

LinkedIn's long-form Article editor is a rich-text editor, not a Markdown renderer. It accepts headings, bold/italic, bullet and numbered lists, block images, and hyperlinks. It does **not** render Markdown syntax as text, HTML comments, Mermaid code fences, or Markdown tables. Publishing straight from these `.md` files would leave literal `#`/`|`/` ``` ` characters and unrendered diagram code in the published post. This guide is the conversion procedure that avoids that.

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

Every article embeds one or two Mermaid diagrams as fenced ` ```mermaid ` code blocks. LinkedIn's editor cannot render Mermaid, so each diagram needs to become a rendered image before publishing. The `.mmd` source files already exist under `docs/articles/assets/diagrams/`, but none are rendered to images yet — that rendering step has to happen as part of the publish pass for each article.

Render with the Mermaid CLI (no install needed, runs via `npx`):

```bash
npx @mermaid-js/mermaid-cli -i docs/articles/assets/diagrams/00-syntax-inversion.mmd \
  -o docs/articles/assets/diagrams/00-syntax-inversion.png \
  -b transparent -s 3
```

Repeat per `.mmd` file (18 total, two per article except where an article shares one). Use `-b transparent` so the rendered PNG matches LinkedIn's white article background without a colored box around it, and `-s 3` for a resolution that stays sharp at LinkedIn's article width. In the published article, replace each ` ```mermaid ` code block with the corresponding rendered PNG inserted as a block image, keeping the same in-article position.

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

The Markdown files link to each other with relative paths (`00-technical-product-operations.md`, `#aitm-and-the-backlog-manager-pattern`, etc.). None of those resolve on LinkedIn — LinkedIn articles only accept absolute URLs, and an article's URL does not exist until after it is published.

Publish in series order (00 → 08) and backfill links as each subsequent article goes live:

1. Publish article 00 with no working links back into the series (the roadmap bullet list stays plain text for now, and the `Series Link` sentence linking forward to article 01 also stays unlinked since 01 isn't live yet).
2. Publish article 01. Go back and edit article 00 (LinkedIn allows editing published articles) to hyperlink its forward reference and its roadmap bullet for article 01.
3. Repeat through article 08: after each new article goes live, revisit every already-published article's roadmap list and `Series Link` sentence and add the new article's URL.
4. After article 08 (the finale) is live, every prior article should have a fully hyperlinked roadmap list, and the whole series should be mutually cross-linked.

This is the only viable order given LinkedIn's URL-after-publish constraint — do not try to pre-link forward to articles that do not exist yet.

Internal anchor links (e.g. `00-technical-product-operations.md#aitm-and-the-backlog-manager-pattern`, used when a later article references AITM's introduction in article 00) should become a plain link to the target article's published URL — LinkedIn articles do not expose in-page anchors, so the fragment gets dropped and the link just goes to the top of the referenced article.

## Cover Images

Each article already has a generated banner at `docs/articles/assets/article-headers/article-0N-header.png`, embedded inline at the top of the Markdown file. When creating the LinkedIn article:

- Upload that same PNG as the article's **cover image** (LinkedIn's article editor has a dedicated cover-image upload separate from the body).
- Remove the inline `![Title](assets/article-headers/article-0N-header.png)` image line from the body text you paste in — LinkedIn will already show the cover image above the title, so keeping it inline as the first body image duplicates it.

## Bibliography

Keep the `## Bibliography` section as-is. LinkedIn renders bullet lists and hyperlinks natively, so citation links work without conversion. Leave the heading as a plain `## Bibliography` or `## Sources` line.

## Per-Article Publish Checklist

For each of the 9 articles, in series order:

1. Render that article's Mermaid diagram(s) to PNG (see command above) if not already rendered.
2. Copy the article body into LinkedIn's editor, in order: title, then everything from the opening line through the `## Bibliography` section.
3. Delete the top `<!-- markdownlint-disable MD034 -->` comment and the inline banner image line.
4. Delete the `## LinkedIn Article Shape` section entirely; save its content for the companion feed post instead.
5. Replace each Mermaid code fence with its rendered PNG, inserted as a block image at the same point in the body.
6. Replace the `## Series Roadmap` table with the plain bullet list, bolding the current article.
7. Fix cross-article links per the publish-order procedure above (leave forward references to unpublished articles as plain text for now).
8. Upload the banner PNG as the cover image.
9. Publish, then post the companion feed announcement built from the `LinkedIn Article Shape` content, linking to the new article.
10. Go back through every previously published article and backfill the new article's link into their roadmap lists and any forward references that were waiting on it.

## Open Items Not Covered By This Guide

- Mermaid rendering (step 1 above) has not been run yet for any of the 18 diagram source files — this guide documents the command, but the actual PNG generation and visual QA of each rendered diagram is a separate pass to do at publish time, per article.
- This guide assumes publishing through LinkedIn's own web editor by hand. If publish volume ever justifies it, LinkedIn does not currently offer content APIs for authoring long-form Articles, so this remains a manual process for now.
