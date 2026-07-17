# Article Deepening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the AITM article stubs into publishable, visually supported LinkedIn-ready articles, starting with the flagship article.

**Architecture:** Treat each article as an independently reviewable editorial deliverable. The series kit under `docs/articles/series-*.md` and `docs/articles/assets/` is the shared source of terminology, argument structure, diagram inventory, and visual style.

**Tech Stack:** Markdown, Mermaid diagrams, local article assets, `markdownlint-cli2`.

## Global Constraints

- Preserve the scoped naming rule: first public mention is `@kburson/ai-task-manager`, then **AITM**.
- Use **implementation agents**, **agent fleet**, **Technical Product Operations**, **Backlog Manager Pattern**, and **story-governed delivery** consistently.
- Keep the tone direct, evidence-aware, and practitioner-oriented.
- Prefer explanatory diagrams over decorative imagery.
- Each article must keep previous/next series navigation.
- Each article must include at least one visual reference or embedded Mermaid diagram.
- Each article must include a focused bibliography.
- Run `npx markdownlint-cli2 "docs/articles/**/*.md"` after each article task.

---

### Task 1: Expand Flagship Article 00

**Files:**

- Modify: `docs/articles/00-technical-product-operations.md`
- Read: `docs/articles/series-style-guide.md`
- Read: `docs/articles/series-argument-map.md`
- Read: `docs/articles/series-visual-system.md`
- Read: `docs/articles/assets/diagrams/00-technical-product-operations.mmd`
- Read: `docs/articles/assets/diagrams/00-syntax-inversion.mmd`

**Interfaces:**

- Consumes: series terminology, flagship diagram, syntax inversion diagram.
- Produces: publishable flagship article that anchors the rest of the series.

- [ ] **Step 1: Re-read the series kit**

  Run:

  ```bash
  sed -n '1,220p' docs/articles/series-style-guide.md
  sed -n '1,180p' docs/articles/series-argument-map.md
  sed -n '1,180p' docs/articles/series-visual-system.md
  ```

  Expected: confirm terminology, argument spine, and visual rules.

- [ ] **Step 2: Expand article 00 prose**

  Rewrite `docs/articles/00-technical-product-operations.md` into a complete article with:

  - a sharper opening hook,
  - a clear definition of Technical Product Operations,
  - a more developed syntax inversion section,
  - a stronger SDLC/agile argument,
  - a clear TPO/TPM role model,
  - a concise "vibe slop" bridge,
  - the AITM and Backlog Manager Pattern section,
  - two Mermaid diagrams: operating model and syntax inversion,
  - a practical takeaway section.

- [ ] **Step 3: Verify article 00**

  Run:

  ```bash
  npx markdownlint-cli2 "docs/articles/**/*.md"
  ```

  Expected: `Summary: 0 error(s)`.

- [ ] **Step 4: Review article 00 against Definition of Done**

  Confirm:

  - standalone thesis is clear,
  - AITM naming is correct,
  - article has at least one visual,
  - TPO/TPM takeaway is explicit,
  - bibliography supports the claims.

### Task 2: Expand Article 01, Vibe Coding Hangover

**Files:**

- Modify: `docs/articles/01-vibe-coding-hangover.md`
- Read: `docs/articles/assets/diagrams/01-vibe-coding-hangover.mmd`
- Read: `docs/articles/assets/diagrams/01-review-debt-loop.mmd`

**Interfaces:**

- Consumes: article 00 thesis and "vibe slop" definition.
- Produces: publishable article explaining the unmanaged AI coding failure mode.

- [ ] **Step 1: Expand article 01**

  Add:

  - a stronger story-led opening,
  - a fair definition of vibe slop,
  - public evidence from METR, Stack Overflow, GitClear, OWASP, and vibe slop commentary,
  - the review debt loop,
  - AITM's story-governed alternative,
  - practical warning signs for TPOs/TPMs.

- [ ] **Step 2: Verify article 01**

  Run:

  ```bash
  npx markdownlint-cli2 "docs/articles/**/*.md"
  ```

  Expected: `Summary: 0 error(s)`.

### Task 3: Expand Article 03, Technical Product Owner

**Files:**

- Modify: `docs/articles/03-technical-product-owner.md`
- Read: `docs/articles/assets/diagrams/03-technical-product-owner.mmd`
- Read: `docs/articles/assets/diagrams/03-responsibility-split.mmd`

**Interfaces:**

- Consumes: flagship Technical Product Operations role model.
- Produces: detailed TPO/TPM role article for the primary audience.

- [ ] **Step 1: Expand article 03**

  Add:

  - role definition,
  - boundaries with engineering leadership,
  - responsibilities before, during, and after agent execution,
  - implications for product/project managers,
  - responsibility split diagram,
  - practical adoption checklist.

- [ ] **Step 2: Verify article 03**

  Run:

  ```bash
  npx markdownlint-cli2 "docs/articles/**/*.md"
  ```

  Expected: `Summary: 0 error(s)`.

### Task 4: Expand Article 05, Just-In-Time Planner

**Files:**

- Modify: `docs/articles/05-just-in-time-planner.md`
- Read: `docs/articles/assets/diagrams/05-just-in-time-planner.mmd`
- Read: `docs/articles/assets/diagrams/05-blocking-defect-pivot.mmd`

**Interfaces:**

- Consumes: backlog control plane and WBS terminology.
- Produces: detailed article explaining progressive decomposition and last-responsible-moment planning.

- [ ] **Step 1: Expand article 05**

  Add:

  - product spec to WBS narrative,
  - difference between early light detail and late deep detail,
  - current-code deep dive explanation,
  - defect/refactor pivot flow,
  - TPO/TPM operating implications.

- [ ] **Step 2: Verify article 05**

  Run:

  ```bash
  npx markdownlint-cli2 "docs/articles/**/*.md"
  ```

  Expected: `Summary: 0 error(s)`.

### Task 5: Expand Article 06, Context Durability

**Files:**

- Modify: `docs/articles/06-context-durability.md`
- Read: `docs/articles/assets/diagrams/06-context-durability.mmd`
- Read: `docs/articles/assets/diagrams/06-context-authority-layers.mmd`

**Interfaces:**

- Consumes: AITM context-management docs and visual system.
- Produces: detailed article explaining JIT skill loading and post-compaction recovery.

- [ ] **Step 1: Expand article 06**

  Add:

  - context-bloat opening,
  - tiered loader explanation,
  - sentinel and source reload explanation,
  - why compaction can weaken process,
  - long-running epic automation scenario,
  - practical takeaway for teams.

- [ ] **Step 2: Verify article 06**

  Run:

  ```bash
  npx markdownlint-cli2 "docs/articles/**/*.md"
  ```

  Expected: `Summary: 0 error(s)`.

### Task 6: Expand Bridge And Closing Articles

**Files:**

- Modify: `docs/articles/02-spec-driven-is-not-enough.md`
- Modify: `docs/articles/04-backlog-as-control-plane.md`
- Modify: `docs/articles/07-evidence-beats-trust.md`
- Modify: `docs/articles/08-adapter-future.md`

**Interfaces:**

- Consumes: completed core narrative from Tasks 1-5.
- Produces: complete supporting articles that connect specs, backlog control, evidence, and platform adapters.

- [ ] **Step 1: Expand article 02**

  Add spec-driven market context, why specs stop short of execution governance, and the spec-to-story lifecycle diagram.

- [ ] **Step 2: Expand article 04**

  Add backlog-as-contract detail, board-state control plane diagram, and adapter-neutral framing.

- [ ] **Step 3: Expand article 07**

  Add evidence record anatomy, gate failure examples, and practical evidence hygiene.

- [ ] **Step 4: Expand article 08**

  Add vendor/platform implications, API surface diagram, and backlog/agent adapter framing.

- [ ] **Step 5: Verify all articles**

  Run:

  ```bash
  npx markdownlint-cli2 "docs/articles/**/*.md"
  ```

  Expected: `Summary: 0 error(s)`.

## Self-Review

Spec coverage:

- Option B series kit exists and is referenced.
- Option A task order starts with article 00, then article 01, 03, 05, 06, then bridge/closing articles.
- Every article expansion task has exact files and verification command.

Placeholder scan:

- No `TBD`, `TODO`, or undefined task outputs.

Scope check:

- This plan is focused on article deepening only. It does not create development stories or code changes.
