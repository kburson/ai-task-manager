# Research Synopsis: Story-Governed Agentic Delivery

<!-- markdownlint-disable MD034 -->

Date: 2026-07-15

## Executive Summary

The public evidence does not support a simple "AI coding works" or "AI coding fails" narrative. It supports a more useful thesis:

> AI coding amplifies the system around it. Where work is vague, large, unverified, and unaudited, AI increases review burden and quality risk. Where work is small, well specified, sequenced, gated, and measured, AI agents become a manageable delivery fleet.

AI Task Manager fits the second path. Its strongest industry framing is not "another task tracker." It is a backlog-native operating model for agentic software delivery.

Naming note: in this series, **AITM** means `@kburson/ai-task-manager`, an AI skill and npm package that currently supports GitHub-backed workflows with Claude Code and Codex. Use the scoped npm package name on first mention to avoid confusion with unrelated projects using the generic phrase "AI task manager."

## Core Claim

The next frontier is the Technical Product Owner or Technical Product Manager as operator of an agentic delivery system:

- Converts product intent into thin, executable stories.
- Maintains dependency order and parallel work boundaries.
- Enforces entry and exit gates for each workflow state.
- Uses evidence markers, timing logs, verification output, and review decisions to govern agent work.
- Treats backlog items as durable contracts between product intent, engineering constraints, and AI execution.

This does not make SDLC and agile practices obsolete. It makes them more load-bearing. Agent fleets turn ambiguity into multiplied ambiguity. Work breakdown structures, backlog refinement, acceptance criteria, dependency sequencing, test gates, review gates, and lifecycle audit trails become the scaffolding that lets fast code-generation capacity produce accountable software.

In this model, independent agents act as implementation agents. They can inspect, modify, test, and report on narrow units of work. The TPO/TPM operates above that layer: product vision, architectural fit, sequencing, risk management, pivot decisions, and evidence review.

## Evidence Map

### Positive Signal: The Market Is Moving Toward Structured AI Delivery

GitHub, Atlassian, Kiro, and GitHub Copilot all show movement away from ad hoc prompting and toward structured issue/spec workflows.

- GitHub Spec Kit positions spec-driven development as a way to move beyond vibe coding and keep implementation aligned with specifications.
- Atlassian Rovo Dev demonstrates a Jira-centered flow where work items, acceptance criteria, and pull request review are tied together.
- Kiro formalizes requirements, design, and task files as first-class inputs to AI-assisted implementation.
- GitHub Copilot coding agent can be assigned issues, work in the background, open pull requests, run tests, and ask for review.

Interpretation: AITM is aligned with a visible market direction, but pushes farther by treating the backlog itself as the control surface.

### Negative Signal: Raw AI Productivity Is Not Guaranteed

The strongest cautionary evidence is that AI can increase overhead when teams adopt it without adequate workflow design.

- METR found experienced open-source developers took 19% longer on randomized tasks when AI tools were allowed, despite expecting speedups.
- Stack Overflow's 2025 survey found more developers distrust AI output accuracy than trust it.
- GitClear reports maintainability concerns around increased churn, copy/paste, and duplication in AI-assisted code.
- OWASP and NIST emphasize risks around prompt injection, insecure output handling, excessive agency, and AI risk management.

Interpretation: AI development needs control loops. The problem is not only model capability; it is governance, scope, verification, and review burden.

### Complicating Signal: Productivity Gains Vary By Context

Studies and enterprise reports show AI can improve delivery, but the gains are uneven and dependent on the surrounding system.

- DORA's 2025 AI-assisted software development report frames AI as an amplifier of existing strengths and weaknesses.
- Academic studies increasingly separate controlled task productivity from real-world, mature-codebase productivity.
- Enterprise adoption case studies emphasize measurement, rollout discipline, and task selection.

Interpretation: AITM should not claim universal acceleration. It should claim better observability, discipline, and conditions for trustworthy acceleration.

## Positioning Principles

### Lead With Product Governance, Not Tooling

Product and project managers do not need another developer automation tool. They need a way to understand how product intent becomes verifiable software when agents are involved.

### Avoid Overclaiming AI Replacement

The stronger claim is that syntax fluency becomes less central while specification, decomposition, dependency management, review, and verification become more central.

### Make The Technical Product Owner The Main Character

The Technical Product Owner is not a status reporter. In an agentic delivery model, the TPO manages the executable backlog: the thing that tells agents what to do, when to do it, how to prove it, and when to stop.

The stronger version of the argument is that the TPO/TPM becomes a product-facing systems engineer. They do not have to be the person writing every line of code, but they need enough architectural literacy to decide how work should be sliced, sequenced, isolated, verified, and reintegrated.

### Treat Specs As Necessary But Incomplete

Spec-driven development defines what should be true. Story-governed development proves how each part became true.

### Frame Evidence As The Trust Mechanism

Trust is not a feeling. It is the result of inspectable work products: acceptance criteria, tests, timing logs, review notes, decision records, and state-transition evidence.

## Article Series Proposal

### Article 0: The Rise Of Technical Product Operations

Purpose: Lead with the provocative thesis. Agentic AI shifts human engineering work away from syntax production and toward product fit, architecture, decomposition, governance, and evidence review.

Primary sources:

- GitHub Spec Kit and Atlassian Rovo Dev.
- DORA and METR evidence about AI outcomes depending on delivery systems.
- AITM workflow evidence from the repository docs.

### Article 1: The Vibe Coding Hangover

Purpose: Establish the problem. AI can produce code quickly, but unmanaged AI work creates review burden, quality risk, and false productivity signals.

Primary sources:

- METR productivity study.
- Stack Overflow 2025 survey.
- GitClear code quality report.
- OWASP LLM risks.

### Article 2: Spec-Driven Development Is Necessary But Not Sufficient

Purpose: Acknowledge the industry's move toward specs, then explain why specifications still need execution governance.

Primary sources:

- GitHub Spec Kit.
- Atlassian Rovo Dev.
- Kiro specs.
- GitHub Copilot coding agent.

### Article 3: The Rise Of The Technical Product Owner

Purpose: Define the emerging role for product/project managers: not managing people harder, but managing agent-executable work better.

Primary sources:

- SAFe and Product School writing on AI-enabled product ownership.
- Kiro and Atlassian examples of structured product-to-implementation flows.
- AITM workflow evidence from the repository docs.

### Article 4: The Backlog Becomes The Control Plane

Purpose: Explain AITM's unique architectural claim: backlog items become operational contracts for agent work.

Primary sources:

- AITM docs.
- GitHub Projects API.
- Jira, GitLab, and Bitbucket API docs.

### Article 5: The Just-In-Time Planner

Purpose: Explain AITM's progressive planning model: keep high-level plans light, decompose only as work rises in priority, and do current-code deep dives at the last responsible moment.

Primary sources:

- AITM README, core workflow, and migration history.
- PMI work breakdown structure and progressive elaboration references.
- Atlassian and SAFe backlog refinement references.
- Lean/agile last-responsible-moment references.

### Article 6: Context Durability Is A Feature

Purpose: Explain how AITM manages skill context bloat and post-compaction rule loss by using tiered JIT loading, sentinels, source-file reloads, session boot contracts, and durable issue state.

Primary sources:

- AITM context-management architecture.
- AITM JIT loader results.
- AITM design notes for pre-compact flush and post-compact resume.
- Worker context contract for parallel agents.

### Article 7: Evidence Beats Trust

Purpose: Show why agentic delivery needs audit trails, timing, verification, and review gates.

Primary sources:

- DORA AI-assisted software delivery report.
- OWASP LLM and agentic AI security references.
- NIST AI RMF.
- Stack Overflow trust data.

### Article 8: The Adapter Future

Purpose: Make the platform/vendor argument. Backlog systems and AI hosts should expose APIs that let governed agent fleets operate across GitHub, Jira, GitLab, and future systems.

Primary sources:

- GitHub Projects API.
- Jira Cloud REST API.
- GitLab Issues and Boards APIs.
- Bitbucket Cloud REST API.
- GitHub Copilot and Atlassian Rovo Dev examples.

## The Evolutionary Ladder (2026-08-16 addition)

Validation pass on the five-rung history used to frame articles 11+ (the
"Trust Through Review" arc): AI-as-pair → vibe coding → prompt engineering →
spec-driven development → agent orchestration / Agentic Agile Delivery. Each
rung below is checked against a citable source, not just recollection.

1. **AI-as-pair (Copilot era, 2021).** GitHub announced Copilot on June 29,
   2021, explicitly branded "your AI pair programmer" — autocomplete-grade
   suggestions inside a human-authored session, not autonomous generation.
   Confirmed, no correction needed.
2. **Vibe coding (early 2025).** The term traces to a single Andrej Karpathy
   post on February 2, 2025, describing giving in fully to an LLM's
   suggestions and "forgetting the code exists" — he later called it a
   "throwaway tweet" meant for weekend/disposable projects, not production
   work. The industry generalized it into shorthand for any loose,
   prompt-driven build. The "unshippable / costs more to fix than rebuild"
   failure mode is exactly what article 01 already documents as "vibe slop"
   (review debt, GitClear churn data, WSJ's "vibe slop crisis" framing) — no
   new sourcing needed there, article 01's existing bibliography covers it.
   One correction: Collins Dictionary named "vibe coding" its 2025 Word of
   the Year, which is worth citing as an industry-adoption data point in its
   own right.
3. **Prompt engineering (2023–2024).** Confirmed as a real, named transitional
   phase — Gartner's 2024 workforce guidance and the emergent "promptware
   engineering" academic literature both treat prompt-crafting as a distinct
   discipline that preceded spec-first tooling. Article 00 already
   pre-empts this rung with one line ("It is not prompt engineering with a
   better title") and article 02 already states "Specification engineering
   is replacing prompt engineering as the entry point" — so the ladder's
   rung 3 is already asserted in the existing series, just never laid out
   as its own numbered step. No new claim, just make the connective tissue
   explicit rather than repeating the case for it.
4. **Spec-driven development.** Already extensively sourced in this document
   and in article 02's bibliography (GitHub Spec Kit, Atlassian Rovo Dev,
   Kiro, Copilot coding agent). The "loses the forest for the trees" failure
   mode at scale — local task correctness not summing to whole-system
   intent — is a real, live research finding, not just an AITM-specific
   observation: independent 2025–2026 work on multi-agent code generation
   found that once total token budget is held constant, decomposed
   multi-agent output is internally consistent per-contribution but
   inconsistent across the whole (naming, ergonomics, pattern fit), and
   uncoordinated agent swarms can silently burn budget without converging.
   Confirmed, new citations added below.
5. **Agent orchestration / Agentic Agile Delivery.** "Agent orchestration" is
   confirmed as the live 2026 industry term for the rung past SDD —
   Forrester frames it explicitly as "orchestrated SDLC agents," Devoteam's
   2026 retrospective frames SDD itself as transitional ("the end of code as
   the center of development?"), and a June 2026 arXiv taxonomy paper
   ("From Prompt to Process") independently surveys six SDD-and-beyond
   frameworks and finds the same convergence AITM bets on: persistent
   artifacts, work contracts, traceability, and human review as the
   mechanisms that reduce ambiguity once teams move past the isolated
   prompt. None of the sources found use "Agentic Agile Delivery" or "Agile
   Agentic Delivery" — that framing is the author's own branding for this
   rung, not a term already in industry use. Keep it presented that way in
   prose (own branding, not a borrowed term).

**Context-window / hallucination-under-scope claim** (used to justify the
prompt-engineering → SDD transition): confirmed by Chroma Research's July
2025 "Context Rot" study — accuracy degrades non-uniformly as input length
grows, well before a model's documented context limit, across all 18
frontier models tested. This is the strongest available citation for
"agents hallucinate under scope pressure" and is new to this document —
added to the bibliography below.

**Codex ADR-sidecar claim**: confirmed as a real, documented pattern —
Codex CLI tooling and third-party write-ups describe drafting/maintaining
Architecture Decision Records in a sidecar directory (`docs/adrs/`) that
agents are told to consult via `AGENTS.md`, with enforcement ranging from
"advisory" (in-context, probabilistic compliance) to "enforced" (a
deterministic pre-change check). This is a fair, sourced contrast to AITM's
issue-backlog-as-metadata-store bet, not a strawman.

### What NOT to claim

- Do not call "agent orchestration" and "Agentic Agile Delivery" synonyms in
  prose — one is an observed industry term, the other is the author's own
  coinage for AITM's specific agile-disciplined flavor of it.
  "Agentic Agile Delivery" vs. "Agile Agentic Delivery" word order is still
  undecided (see [narrative arc](xp-agentic-delivery-narrative-arc.md)).
- Do not present the five-rung ladder as a universally agreed-upon industry
  taxonomy — no single source lays out these exact five stages in this
  exact order. It is a reasonable synthesis across several independently
  confirmed claims, and articles should keep the "this is how I've watched
  it play out" framing they already use elsewhere in the series, not cite
  it as settled canon.

## Open Research Questions

- What issue/body fields are essential for agent-ready work across GitHub, Jira, GitLab, and Bitbucket?
- Which evidence markers should be portable between backlog systems?
- How should agent-generated documentation be summarized so it remains auditable without overwhelming humans?
- How much detail should be generated at each WBS layer before the work is close enough for JIT deep-dive planning?
- Which workflow rules must be reloaded after compaction, and which can safely stay out of context until a verb needs them?
- What public term best describes AI agents as the code-construction layer without sounding dismissive or inflated?
- What metrics best represent human supervision burden: active minutes, context words, review pauses, defect fallout, or all of them?
- How much workflow autonomy should agents have before a human gate is required?
- Can product managers operate this system alone, or does the durable role require a technical product owner with engineering literacy?

## Bibliography

- Atlassian. "Rovo Dev in Jira as my Spec Driven executor." https://www.atlassian.com/blog/development/rovo-dev-in-jira-as-my-spec-driven-executor
- Atlassian. "Spec Driven Development with Rovo Dev." https://www.atlassian.com/blog/development/spec-driven-development-with-rovo-dev
- Atlassian. "What is backlog refinement?" https://www.atlassian.com/agile/scrum/backlog-refinement
- Atlassian Developer. "Jira Cloud platform REST API v3." https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/
- Atlassian Developer. "Bitbucket Cloud REST API." https://developer.atlassian.com/cloud/bitbucket/rest/
- DORA. "State of AI-assisted Software Development 2025." https://dora.dev/dora-report-2025/
- GitClear. "AI Assistant Code Quality 2025." https://www.gitclear.com/ai_assistant_code_quality_2025_research
- GitHub. "GitHub Spec Kit." https://github.com/github/spec-kit
- GitHub Blog. "Spec-driven development with AI." https://github.blog/ai-and-ml/generative-ai/spec-driven-development-with-ai-get-started-with-a-new-open-source-toolkit/
- GitHub Blog. "Assigning and completing issues with coding agent in GitHub Copilot." https://github.blog/ai-and-ml/github-copilot/assigning-and-completing-issues-with-coding-agent-in-github-copilot/
- GitHub Docs. "Using the API to manage Projects." https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-api-to-manage-projects
- GitHub Docs. "Using Copilot cloud agent on GitHub." https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/use-cloud-agent-on-github
- GitLab Docs. "Issues API." https://docs.gitlab.com/api/issues/
- GitLab Docs. "Project issue boards API." https://docs.gitlab.com/api/boards/
- Kiro Docs. "Specs." https://kiro.dev/docs/specs/
- Kiro Docs. "Feature Specs." https://kiro.dev/docs/specs/feature-specs/
- METR. "Measuring the Impact of Early-2025 AI on Experienced Open-Source Developer Productivity." https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/
- NIST. "AI Risk Management Framework." https://www.nist.gov/itl/ai-risk-management-framework
- OWASP. "Top 10 for Large Language Model Applications." https://owasp.org/www-project-top-10-for-large-language-model-applications/
- OWASP. "Agentic AI - Threats and Mitigations." https://genai.owasp.org/resource/agentic-ai-threats-and-mitigations/
- Project Management Institute. "Applying work breakdown structure to the project lifecycle." https://www.pmi.org/learning/library/applying-work-breakdown-structure-project-lifecycle-6979
- Scaled Agile. "Enterprise Backlog Structure and Management." https://framework.scaledagile.com/enterprise-backlog-structure-and-management
- Sayagh, Mohammed. "What Makes a GitHub Issue Ready for Copilot?" https://arxiv.org/abs/2512.21426
- Stack Overflow. "2025 Developer Survey: AI." https://survey.stackoverflow.co/2025/ai
- AI Task Manager. "How AI Task Manager Keeps Agent Context Small and Rules Fresh." ../introduction/context-management-skill-architecture.md
- AI Task Manager. "Cutting Context Bloat With the Just-In-Time Skill Loader." ../jit-loader-results.md
- AI Task Manager. "Worker Context Contract." ../guides/worker-context-contract.md

### Ladder & Agent Orchestration Sources (added 2026-08-16)

- GitHub Blog. "Introducing GitHub Copilot: your AI pair programmer." https://github.blog/news-insights/product-news/introducing-github-copilot-ai-pair-programmer/
- The Register. "GitHub Copilot is AI pair programming where you, the human, still have to do most of the work." https://www.theregister.com/2021/06/30/github_ai_copilot/
- CodeRabbit. "A semantic history of vibe coding: Tweet, meme and workflow." https://www.coderabbit.ai/blog/a-semantic-history-how-the-term-vibe-coding-went-from-a-tweet-to-prod
- Collins Dictionary. "'Vibe Coding' Named Collins Dictionary's Word of the Year 2025." https://www.newsonair.gov.in/vibe-coding-named-collins-dictionarys-word-of-the-year-2025/
- Gartner. 2024 guidance on generative AI upskilling for engineering workforces (cited via secondary summary; primary Gartner report is paywalled — treat as directional, not a direct quote source).
- Chroma Research (Hong, Kelly; Troynikov, Anton; Huber, Jeff). "Context Rot: How Increasing Input Tokens Impacts LLM Performance." https://www.trychroma.com/research/context-rot
- Augment Code. "Multi-Agent Orchestration: A Practical Architecture Without the Buzzwords." https://www.augmentcode.com/guides/multi-agent-orchestration-architecture-guide
- Galileo. "Are Your Multi-Agent Systems Failing for These 7 Reasons?" https://galileo.ai/blog/why-multi-agent-systems-fail
- Forrester. "Agentic Software Development Takes The Lead: From Code Assistants To Orchestrated SDLC Agents." https://www.forrester.com/blogs/agentic-software-development-takes-the-lead-from-code-assistants-to-orchestrated-sdlc-agents/
- Devoteam. "Spec-Driven Development in 2026: The end of code as the center of development?" https://www.devoteam.com/expert-view/spec-driven-development-2026/
- Zylos Research. "Agent-Orchestrated Software Development: From Issue to Deployment." https://zylos.ai/research/2026-06-25-agent-orchestrated-software-development-issue-to-deployment/
- arXiv (2606.04967). "From Prompt to Process: a Process Taxonomy and Comparative Assessment of Frameworks Supporting AI Software Development Agents." https://arxiv.org/abs/2606.04967
- Codex Knowledge Base (Vaughan, Daniel). "Architecture Decision Records with Codex CLI: Automated ADR Generation, Governance, and the Agent-Architecture Gap." https://codex.danielvaughan.com/2026/04/28/codex-cli-architecture-decision-records-adr-automated-governance/
- Mneme HQ. "How AI Coding Agents Use ADRs (Architecture Decision Records)." https://mnemehq.com/insights/how-ai-coding-agents-use-adrs/
