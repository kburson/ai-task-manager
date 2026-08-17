# Series Visual System

<!-- markdownlint-disable MD034 -->

## Purpose

The series should use more visual aids rather than fewer, but the visuals must explain the operating model. The diagrams should make the article easier to understand and easier to remember.

## Visual Principles

- Prefer explanatory diagrams over decorative images.
- Use one primary visual per article.
- Add one secondary diagram when the article introduces two separate concepts.
- Keep labels short and concrete.
- Use consistent terms: implementation agent, executable backlog, evidence gate, TPO/TPM.
- Avoid generic AI imagery: robots, glowing brains, vague networks, stock dashboards.
- Do not use diagrams as posters. Use them as arguments.

## Diagram Types

### Operating Model

Shows roles, control surfaces, and feedback loops. Use for articles 02 and 05.

### Failure Loop

Shows how unmanaged prompting creates review debt. Use for article 03.

### Layered Control

Shows spec -> backlog -> agents -> evidence. Use for articles 04 and 06.

### Progressive Decomposition

Shows work breakdown from product spec to atomic PBI. Use for article 07.

### Recovery Loop

Shows compaction and reload from source-of-truth files. Use for article 08.

### State Gate

Shows workflow transitions and required evidence. Use for article 09.

### Adapter Map

Shows portable architecture across backlog systems and agent hosts. Use for article 10.

### Architecture Shift

Shows a multi-stage migration of where the "heavy" part of a system lives. Use for article 01.

### Bottleneck / Ceiling

Shows parallel units converging on a shared constraint that caps throughput. Use for article 11.

### Decomposition Contrast

Shows a single shared-resource pool against an equivalent set of independent, boundaried pools. Use for article 11 (secondary).

### Fate Map

Shows a fixed set of items sorted into outcome buckets (e.g. kept, moved, lost). Use for article 12.

### Scrutiny Gradient

Shows two layers of the same pipeline receiving unequal review rigor. Use for article 13.

### Review Loop

Shows two roles exchanging revisions until neither raises a new objection. Use for article 14.

## Mermaid Conventions

- Use `flowchart TB` for hierarchy and layers.
- Use `flowchart LR` for sequences and comparison flows.
- Keep node labels under three lines.
- Use quoted labels when punctuation is present.
- Avoid custom Mermaid theme directives in article files; let the renderer handle styling.
- Use neutral names for node IDs: `Spec`, `Backlog`, `AgentA`, `Evidence`.

## Article Visual Inventory

Diagram source filenames under [assets/diagrams](assets/diagrams/) are descriptive of
content only — they are deliberately **not** prefixed with an article number, since
articles get renumbered, reordered, and added to (as happened when 01 and 11-14 joined
the series) but a diagram's subject doesn't change. The mapping below is the current
article-to-diagram assignment, not a filename convention.

| Article | Primary Visual                               | `.mmd` filename                    | Secondary Visual                  | `.mmd` filename                 |
| ------- | -------------------------------------------- | ---------------------------------- | --------------------------------- | ------------------------------- |
| 01      | Tooling weight migration (local to cloud)    | `tooling-weight-migration.mmd`     | —                                 | —                               |
| 02      | Technical Product Operations operating model | `technical-product-operations.mmd` | Syntax inversion                  | `syntax-inversion.mmd`          |
| 03      | Vibe coding vs story-governed delivery       | `vibe-coding-hangover.mmd`         | Review debt loop                  | `review-debt-loop.mmd`          |
| 04      | Spec/backlog/evidence stack                  | `spec-driven-is-not-enough.mmd`    | Spec-to-story lifecycle           | `spec-to-story-lifecycle.mmd`   |
| 05      | TPO/TPM above agent fleet                    | `technical-product-owner.mmd`      | Human/agent responsibility split  | `responsibility-split.mmd`      |
| 06      | Backlog item as contract                     | `backlog-as-control-plane.mmd`     | Board state control plane         | `board-state-control-plane.mmd` |
| 07      | Progressive WBS to atomic PBI                | `just-in-time-planner.mmd`         | Blocking-defect pivot loop        | `blocking-defect-pivot.mmd`     |
| 08      | Tiered loader and post-compaction recovery   | `context-durability.mmd`           | Context authority layers          | `context-authority-layers.mmd`  |
| 09      | Evidence-gated state machine                 | `evidence-beats-trust.mmd`         | Evidence record anatomy           | `evidence-record-anatomy.mmd`   |
| 10      | Adapter architecture                         | `adapter-future.mmd`               | Vendor API surface map            | `vendor-api-surface.mmd`        |
| 11      | Merge-gate contention                        | `merge-gate-contention.mmd`        | Decompose vs. shared-repo scaling | `decompose-vs-shared-repo.mmd`  |
| 12      | XP practice fates (mechanized/moved/broken)  | `xp-practice-fates.mmd`            | —                                 | —                               |
| 13      | Review scrutiny inversion (spec vs code)     | `review-scrutiny-inversion.mmd`    | —                                 | —                               |
| 14      | Author/reviewer review loop                  | `author-reviewer-loop.mmd`         | —                                 | —                               |

## Header Image Guidance

Updated: all nine articles now ship with a header banner (`assets/article-headers/article-0N-header.png`), so this is no longer an optional embellishment — it is the series' delivered visual identity, generated from the briefs in [assets/image-prompts](assets/image-prompts/). The banners share a consistent illustrated style: dark navy/charcoal base, electric-blue and amber accent lighting, a human operator at a control desk with branching code/data paths flowing out to a fleet of translucent, stylized agent silhouettes. It should support the article theme without replacing the in-body diagram.

Good header concepts:

- Article 0: abstract command center with backlog lanes and code traces.
- Article 1: split scene of chaotic generated output vs orderly evidence board.
- Article 3: human operator coordinating parallel workstreams.
- Article 5: blueprint layers decomposing into a precise work item.
- Article 6: compressed context stream reloading authoritative rules.
- Article 8: integration hub connecting backlog tools and agent hosts.

Avoid:

- literal/mechanical robots (chassis, joints, screens-for-faces),
- glowing brains,
- generic circuit boards as the main subject,
- random code rain,
- vendor logos unless the article specifically discusses adapters.

Revised from the original list: the delivered banners do use dramatic dark, moody lighting and translucent humanoid silhouettes to represent the agent fleet, and that reads as intentional and on-theme rather than a "war room" cliche as long as the figures stay abstract/translucent rather than literal robots. The original "avoid humanoid figures / dark war rooms" guidance undersold what actually worked well; it is superseded by the two bullets above.

## Reusable Mermaid Files

Standalone Mermaid sources live under [assets/diagrams](assets/diagrams/). Article drafts may embed these directly or link to them during editing.

## Image Prompt Files

Optional image-generation prompts live under [assets/image-prompts](assets/image-prompts/). These prompts should be treated as creative briefs, not exact final copy.
