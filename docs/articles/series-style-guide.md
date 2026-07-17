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
