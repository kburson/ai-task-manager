# Research Synopsis: Story-Governed Agentic Delivery

<!-- markdownlint-disable MD034 -->

Date: 2026-07-15

## Executive Summary

The public evidence does not support a simple "AI coding works" or "AI coding fails" narrative. It supports a more useful thesis:

> AI coding amplifies the system around it. Where work is vague, large, unverified, and unaudited, AI increases review burden and quality risk. Where work is small, well specified, sequenced, gated, and measured, AI agents become a manageable delivery fleet.

AI Task Manager fits the second path. Its strongest industry framing is not "another task tracker." It is a backlog-native operating model for agentic software delivery.

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
