---
name: reference-deep-dive-heading-trap
description: 'Deep-dive files must NOT start with their own `##` heading — post-deep-dive.mjs adds the `## Deep-Dive Analysis (date)` wrapper, and a duplicate `##` makes the body-gates section scan read 0 chars'
metadata:
  node_type: memory
  type: reference
  originSessionId: 4907b95a-4005-4fd0-a045-ad3182c920f8
---

`post-deep-dive.mjs` wraps the file content under its own `## Deep-Dive Analysis (date)` heading. The plan→develop gate (`body-gates.mjs`, min 1800 substantive chars) locates that heading and counts characters until the next `##`-level heading. If the deep-dive file itself begins with a `## Deep-Dive Analysis` heading, the gate's section terminates immediately and reports `0 char(s); minimum 1800` even though thousands of chars were posted.

**Rule:** deep-dive scratch files (`.tmp/plan/deep-dive-<N>.md`) start directly with `###` subsections (e.g. `### Root cause`), never a top-level `##` heading.

Same section-scan family as [[reference-ac-section-subheading-trap]].
