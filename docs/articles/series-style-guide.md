# Series Style Guide

<!-- markdownlint-disable MD034 -->

## Purpose

This guide keeps the article series coherent as the stubs become publishable pieces. The voice should be direct, technical, and product-aware. The articles should feel like an experienced practitioner explaining a working operating model, not like a vendor campaign.

## Series Thesis

Agentic AI changes where software delivery judgment concentrates. Implementation agents increasingly handle code construction: syntax, local structure, framework mechanics, test execution, and narrow task delivery. Humans increasingly own product fit, architecture, decomposition, sequencing, governance, review, and evidence.

Established SDLC and agile practices become more important under agentic AI because agent fleets multiply ambiguity when work is poorly specified.

## Naming Rules

- On first public mention, write `@kburson/ai-task-manager`.
- Immediately define **AITM** as the shorthand for `@kburson/ai-task-manager`.
- Avoid introducing the project as generic "AI Task Manager" before the scoped package name is established.
- Mention the generic-name collision only once when needed. Do not dwell on unrelated packages.

Preferred first-use sentence:

> In this series, **AITM** means `@kburson/ai-task-manager`: an AI skill and npm package that currently supports GitHub-backed workflows with Claude Code and Codex.

## Preferred Terms

- **Technical Product Operations:** the discipline of turning product intent, architecture guardrails, and delivery risk into an executable backlog that implementation agents can safely act on.
- **Implementation agents:** AI agents responsible for local code construction, syntax, framework mechanics, test execution, and narrow task delivery.
- **Agent fleet:** a coordinated set of implementation agents working under backlog, dependency, and evidence controls.
- **Delivery architect:** a human operator role for senior engineers, TPOs, or TPMs who own decomposition, sequencing, fit, risk, and review.
- **Story-governed delivery:** the AITM pattern where specs become stories, stories carry gates, and gates require evidence.
- **Backlog Manager Pattern:** using the backlog as a durable control plane for agentic execution.
- **Code-construction layer:** the implementation layer where agents operate.
- **Evidence gates:** transition checks that require observable proof before work advances.

## Terms To Avoid Or Handle Carefully

- Avoid "tireless implementation technicians"; it sounds like generic AI prose.
- Avoid "low-level code technicians"; it can sound dismissive.
- Avoid "AI will replace developers" as a blanket claim.
- Avoid "all code will be written by AI" as a certainty. Frame it as a pressure vector.
- Avoid "prompt engineering is dead." Say "prompting is insufficient as a delivery model."

## Tone

Use:

- direct claims,
- concrete examples,
- practical skepticism,
- evidence-aware framing,
- short sentences when making provocative points.

Avoid:

- cheerleading,
- futurist certainty,
- generic AI adjectives,
- startup pitch phrasing,
- overexplaining AITM internals before the reader understands the problem.

## Sentence-Level Voice Rules

Distilled from a line-by-line editorial pass on article 01. These are mechanical, checkable rules — apply them to every article, not just the ones that get a live read-through.

- **Don't front-load the current buzzword.** Open with a term the broadest reader already recognizes ("AI-assisted development"), not this month's trade-press label ("agent orchestration"). Buzzwords date an article and narrow the audience who'll nod along with the opening line.
- **State magnitudes precisely, and say what they count.** A raw number ("2,200+ inspections") is ambiguous between "rules the tool ships with" and "times a developer ran it." Name the unit.
- **Narrate technical evolution in the order things actually happened, causally.** Model before product before corporate context — e.g., introduce Codex before Microsoft/GitHub, not the acquisition before the model it enabled. This isn't about correcting a misconception; it's just the clean order to tell it in.
- **Cut detail immaterial to the thesis, even if factually true.** Deal-closing dates, pricing tiers — if a fact doesn't serve the argument, it's drag. When you cut a fact, cut its now-orphaned citation too.
- **Attribute cost precisely.** "Paid" and "free" apply to specific halves of a product (client vs. backend service, extension vs. API). Don't let the sentence imply the wrong half is the one being charged for.
- **Retitle a heading the moment its section's content changes.** A heading is a promise about what follows; a restructured section with a stale heading reads as sloppy even when the prose is good.
- **Never write a sentence that's really a reply to the editor.** No "is a fair description of," no meta-commentary on the text itself. Every sentence is reader-facing prose, not a note back to whoever gave feedback.
- **Mark capability evolution explicitly.** If a tool's later capability (autonomous agent) gets described in the same breath as its original capability (inline completion), say so — "X eventually evolved, moving toward Y" — so the reader doesn't read Y as day-one.
- **Keep the narrator warm, never corrective.** Don't let a sentence carry an implicit "well, actually" tone toward the reader, even as a trailing clause. If a line reads like it's scolding someone for getting a timeline wrong, cut it.
- **Every section earns its place with a "why this matters," not just a "what happened."** A run of dates and version numbers with no connective tissue back to the thesis reads as a changelog dump — cut it or fold it into a sentence that does have a why.
- **Match citation depth to what the primary audience can follow.** A niche competitive-landscape detail (a rival's product timeline three products removed from the thesis) reads as noise to a PM/TPO reader, even if it's accurate.
- **Say the object of a claim, not just the claim.** "No longer the bottleneck" needs "of what" — name the thing it's a bottleneck *in* (e.g., "getting an idea from concept to customer"). Avoid double-negative-shaped phrasing ("stopping being") even when grammatically legal — it reads wrong.
- **Prefer warm, direct address over formal series-mechanics language.** "Here's where the rest of the series picks up," not "The series proper picks up from here." Talk to the reader, don't narrate the publishing structure at them.

## Provocation Rules

A good provocation should be sharp but defensible.

Strong:

> Syntax becomes cheaper. Intent, architecture, verification, and fit become more expensive.

Strong:

> Vibe slop is not caused by AI writing code. It is caused by AI writing code outside a governed delivery system.

Too broad:

> Developers will not need to know programming languages anymore.

Better:

> Syntax fluency becomes less central when implementation agents can operate across the local project's languages and frameworks.

## Audience Assumptions

Primary audience:

- product managers,
- project managers,
- technical product owners,
- technical program/product managers.

Secondary audience:

- engineering leaders,
- principal/staff engineers,
- AI platform vendors,
- developer tooling teams.

The primary reader may not know every implementation detail, but they understand delivery pain, dependencies, acceptance criteria, blocked work, and review burden.

## Article Shape

Each polished article should include:

- a sharp opening,
- one clear thesis,
- one established SDLC/agile pattern,
- one agentic AI twist,
- one AITM mechanism,
- one visual,
- one practical takeaway,
- bibliography.

Recommended length:

- LinkedIn: 1,000-1,600 words.
- Repository longform: 1,500-2,500 words.

## Reusable Pull Quotes

- "The future software team may not be organized around who writes the most code. It may be organized around who can safely accept the most agent-produced code."
- "Syntax becomes cheaper. Intent, architecture, verification, and fit become more expensive."
- "Vibe slop is not caused by AI writing code. It is caused by AI writing code outside a governed delivery system."
- "Specs define what should be true. Stories prove how each part became true."
- "The backlog is no longer only a planning artifact. It becomes the control plane."
- "The agent is allowed to forget. The delivery system is not."
- "Trust is not the control. Evidence is the control."

## Definition Of Done For A Finished Article

- Title is specific and non-generic.
- First 150 words contain the thesis.
- AITM is defined correctly if mentioned.
- The article has at least one visual.
- The article explains one established delivery practice.
- The article explains why agentic AI raises the stakes.
- The article includes one practical takeaway for TPOs/TPMs or engineering leaders.
- The bibliography is focused and relevant.
- Markdown lint passes.
