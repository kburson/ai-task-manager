# AI Task Manager Article Series

<!-- markdownlint-disable MD034 -->

This folder contains draft LinkedIn article collateral for explaining AI Task Manager as a research project and industry pattern. Use [article-production-plan.md](article-production-plan.md) to expand these stubs into publishable prose, diagrams, and supporting assets.

## Naming Note

In this series, **AITM** means `@kburson/ai-task-manager`: an AI skill and npm package that currently supports GitHub-backed task workflows with Claude Code and Codex.

"AI task manager" is also a generic phrase, and unrelated packages/projects use similar names. The articles should use `@kburson/ai-task-manager` on first mention in public-facing prose, then use AITM after the abbreviation is established.

## Working Thesis

AI-assisted software delivery is moving from prompt craft toward governed, story-level execution. The durable opportunity is not bigger prompts or fully autonomous coding demos. It is a backlog-native operating model where technical product owners shape work into small, sequenced, auditable stories that agent fleets can execute under evidence-based supervision.

The series treats established SDLC and agile practices as more important, not less important, in agentic development. Independent AI agents become implementation agents: the code-construction layer that manages syntax, framework details, local structure, and mechanical execution inside narrow boundaries. The Technical Product Owner or Technical Product Manager becomes the higher-level engineering operator who converts vision into executable backlog structure and keeps the agent fleet aligned.

## Draft Sequence

Each title below is "riff title" — _working title_ (see
[Big Bang title style guide](big-bang-title-style-guide.md) for the naming
convention behind the riff titles; the linked article's H1/caption pair is
the source of truth if this list ever drifts out of sync).

1. [The Refactoring Bloat Precursor](01-the-refactoring-bloat-precursor.md) — _Before Agents Lived In The Clouds: A Brief History Of AI-Assisted Coding_
2. [The Backlog Governance Postulate](02-the-backlog-governance-postulate.md) — _The Rise Of Technical Product Operations_
3. [The Vibe Coding Deficiency](03-the-vibe-coding-deficiency.md) — _The Vibe Coding Hangover_
4. [The Spec-Driven Insufficiency](04-the-spec-driven-insufficiency.md) — _Spec-Driven Development Is Necessary But Not Sufficient_
5. [Easy Come, Easy Go](05-easy-come-easy-go.md) — _Regeneration Is Cheap. Hardening Isn't. Guess Which One Gets Skipped._ (working title, series placement provisional; see [design doc](../superpowers/specs/2026-08-18-easy-come-easy-go-article-design.md))
6. [The Product Owner Escalation](06-the-product-owner-escalation.md) — _The Rise Of The Technical Product Owner_
7. [The Backlog Control-Plane Conjecture](07-the-backlog-control-plane-conjecture.md) — _The Backlog Becomes The Control Plane_
8. [The Just-In-Time Planning Paradox](08-the-just-in-time-planning-paradox.md) — _The Just-In-Time Planner_
9. [The Context Durability Corollary](09-the-context-durability-corollary.md) — _Context Durability Is A Feature_
10. [The Evidence-Over-Trust Theorem](10-the-evidence-over-trust-theorem.md) — _Evidence Beats Trust_
11. [The Adapter Convergence](11-the-adapter-convergence.md) — _The Adapter Future_
12. [The Agentic Concurrency Deficiency](12-the-agentic-concurrency-deficiency.md) — _Agentic Concurrency Isn't Free — And "50 Parallel Agents" Is Hyperbole_
13. [The XP Survival Anomaly](13-the-xp-survival-anomaly.md) — _XP's Practices Survived. Their Reasons Did Not._
14. [The Diff Displacement](14-the-diff-displacement.md) — _The Diff Isn't Where Your Judgment Lives Anymore_
15. [The Second Reviewer Corollary](15-the-second-reviewer-corollary.md) — _It's All About Perspective_

## Header Images

Article header banners in [assets/article-headers](assets/article-headers/) were generated with Google Gemini, from the briefs in [assets/image-prompts](assets/image-prompts/). Confirmed via the C2PA content-credentials metadata embedded in the PNGs ("Created by Google Generative AI", SynthID watermark) — no prompt/tool record was kept in the repo at generation time.

## Book Edition

The same articles compose into a book — chapters, glossary, sources appendix,
page-numbered index — via hidden `book:` markers and the metadata in
[assets/book](assets/book/). See
[book-publishing-guide.md](book-publishing-guide.md).

## Research Base

Start with [research-synopsis.md](research-synopsis.md) for the evidence map, source taxonomy, and article angles.

## Production Plan

Use [article-production-plan.md](article-production-plan.md) for the voice guide, terminology, visual inventory, expansion template, and recommended production order.
