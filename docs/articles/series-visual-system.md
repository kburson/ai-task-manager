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

Shows roles, control surfaces, and feedback loops. Use for articles 0 and 3.

### Failure Loop

Shows how unmanaged prompting creates review debt. Use for article 1.

### Layered Control

Shows spec -> backlog -> agents -> evidence. Use for article 2 and 4.

### Progressive Decomposition

Shows work breakdown from product spec to atomic PBI. Use for article 5.

### Recovery Loop

Shows compaction and reload from source-of-truth files. Use for article 6.

### State Gate

Shows workflow transitions and required evidence. Use for article 7.

### Adapter Map

Shows portable architecture across backlog systems and agent hosts. Use for article 8.

## Mermaid Conventions

- Use `flowchart TB` for hierarchy and layers.
- Use `flowchart LR` for sequences and comparison flows.
- Keep node labels under three lines.
- Use quoted labels when punctuation is present.
- Avoid custom Mermaid theme directives in article files; let the renderer handle styling.
- Use neutral names for node IDs: `Spec`, `Backlog`, `AgentA`, `Evidence`.

## Article Visual Inventory

| Article | Primary Visual                               | Secondary Visual                 |
| ------- | -------------------------------------------- | -------------------------------- |
| 00      | Technical Product Operations operating model | Syntax inversion                 |
| 01      | Vibe coding vs story-governed delivery       | Review debt loop                 |
| 02      | Spec/backlog/evidence stack                  | Spec-to-story lifecycle          |
| 03      | TPO/TPM above agent fleet                    | Human/agent responsibility split |
| 04      | Backlog item as contract                     | Board state control plane        |
| 05      | Progressive WBS to atomic PBI                | Blocking-defect pivot loop       |
| 06      | Tiered loader and post-compaction recovery   | Context authority layers         |
| 07      | Evidence-gated state machine                 | Evidence record anatomy          |
| 08      | Adapter architecture                         | Vendor API surface map           |

## Header Image Guidance

Header images are optional. If used, they should support the article theme without replacing the diagram.

Good header concepts:

- Article 0: abstract command center with backlog lanes and code traces.
- Article 1: split scene of chaotic generated output vs orderly evidence board.
- Article 3: human operator coordinating parallel workstreams.
- Article 5: blueprint layers decomposing into a precise work item.
- Article 6: compressed context stream reloading authoritative rules.
- Article 8: integration hub connecting backlog tools and agent hosts.

Avoid:

- humanoid robots typing,
- glowing brains,
- generic circuit boards,
- random code rain,
- dramatic dark war rooms,
- vendor logos unless the article specifically discusses adapters.

## Reusable Mermaid Files

Standalone Mermaid sources live under [assets/diagrams](assets/diagrams/). Article drafts may embed these directly or link to them during editing.

## Image Prompt Files

Optional image-generation prompts live under [assets/image-prompts](assets/image-prompts/). These prompts should be treated as creative briefs, not exact final copy.
