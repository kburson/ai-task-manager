# Spec-Driven Development Is Necessary But Not Sufficient

<!-- markdownlint-disable MD034 -->

## Series Roadmap

| Status      | #      | Article                                                                                        | Role In Series                                |
| ----------- | ------ | ---------------------------------------------------------------------------------------------- | --------------------------------------------- |
|             | 00     | [The Rise Of Technical Product Operations](00-technical-product-operations.md)                 | Industry thesis: Technical Product Operations |
|             | 01     | [The Vibe Coding Hangover](01-vibe-coding-hangover.md)                                         | Failure mode: vibe slop and review debt       |
| **Current** | **02** | **[Spec-Driven Development Is Necessary But Not Sufficient](02-spec-driven-is-not-enough.md)** | Why specs need execution governance           |
|             | 03     | [The Rise Of The Technical Product Owner](03-technical-product-owner.md)                       | Human operator: TPO/TPM as delivery architect |
|             | 04     | [The Backlog Becomes The Control Plane](04-backlog-as-control-plane.md)                        | Backlog as executable control surface         |
|             | 05     | [The Just-In-Time Planner](05-just-in-time-planner.md)                                         | Progressive decomposition and deep dives      |
|             | 06     | [Context Durability Is A Feature](06-context-durability.md)                                    | JIT loading and post-compaction recovery      |
|             | 07     | [Evidence Beats Trust](07-evidence-beats-trust.md)                                             | Evidence gates and auditability               |
|             | 08     | [The Adapter Future](08-adapter-future.md)                                                     | Backlog and agent platform adapters           |

## Draft Thesis

Spec-driven development is the correct reaction to vibe coding, but a specification is not the same thing as governed execution.

Specs define what should be true. Stories prove how each piece became true.

## Core Argument

The market is already moving from prompt engineering toward specification engineering.

GitHub Spec Kit, Atlassian Rovo Dev, Kiro, and GitHub Copilot's coding agent all point in the same direction: AI works better when it receives structured intent. Requirements, designs, task lists, acceptance criteria, linked work items, and pull requests give agents a stronger frame than a single large prompt.

That is real progress. It is also incomplete.

A specification can still fail in execution when:

- The work is too large for one agent session.
- Dependencies are unclear.
- Parallel tasks collide.
- Review evidence is buried in chat logs.
- The agent drifts from the process after context grows.
- The team cannot tell which parts were tested, reviewed, paused, or pivoted.

Spec-driven development answers, "What are we trying to build?" Story-governed development answers, "Which small piece is being worked now, by whom or what, under which gates, with what evidence?"

There is a second gap: timing. A full product specification can be large enough that detailed planning everything up front becomes waste. The better pattern is progressive decomposition. Keep epics and features light until their priority and dependency position justify deeper planning. Then perform the detailed analysis at the story or task level, when the codebase is current and the agent is about to execute.

That is classic progressive elaboration applied to agentic AI. The difference is the consequence of getting it wrong: one vague spec can fan out into many confident but misaligned agents.

## AITM Perspective

AI Task Manager treats the backlog as the execution layer beneath the spec.

The spec becomes epics, sub-issues, standalone stories, dependencies, sequence waves, estimates, acceptance criteria, and pickup directives. Each item moves through a state machine:

Backlog -> On Deck -> Refinement -> Planning -> Development -> Testing -> Review -> Done.

Each state has:

- An entry gate.
- A state action.
- An exit gate.

That lets the team use specs without pretending the spec alone is enough to govern autonomous work.

The JIT planner is the bridge between the spec and implementation. It delays detailed design until the smallest useful work item reaches Plan, then requires a deep-dive analysis against the actual repository state before Development begins.

This is also where the TPO/TPM role becomes technical. They are not replacing architects or senior engineers, but they must understand enough architecture and delivery risk to decide which specifications become epics, which epics become stories, which stories can run in parallel, and which tasks need a deeper plan before any agent touches code.

## Series Link

This article explains why specs need an execution layer. The next article, [The Rise Of The Technical Product Owner](03-technical-product-owner.md), defines the role that operates that layer.

## LinkedIn Article Shape

Opening hook:

> Spec-driven development is a major step forward. But once the spec exists, someone still has to manage execution.

Middle:

- Show the vendor trend toward specs.
- Explain where specs stop.
- Introduce the story as the unit of accountability.

Close:

> The winning pattern is not prompt-first or spec-only. It is spec-to-story-to-evidence.

## Bibliography

- GitHub. "GitHub Spec Kit." https://github.com/github/spec-kit
- GitHub Blog. "Spec-driven development with AI: Get started with a new open source toolkit." https://github.blog/ai-and-ml/generative-ai/spec-driven-development-with-ai-get-started-with-a-new-open-source-toolkit/
- Atlassian. "Spec Driven Development with Rovo Dev." https://www.atlassian.com/blog/development/spec-driven-development-with-rovo-dev
- Atlassian. "Rovo Dev in Jira as my Spec Driven executor." https://www.atlassian.com/blog/development/rovo-dev-in-jira-as-my-spec-driven-executor
- Atlassian Support. "Check acceptance criteria in a code review." https://support.atlassian.com/rovo/docs/check-acceptance-criteria-in-a-code-review/
- Kiro Docs. "Specs." https://kiro.dev/docs/specs/
- Kiro Docs. "Feature Specs." https://kiro.dev/docs/specs/feature-specs/
- GitHub Blog. "Assigning and completing issues with coding agent in GitHub Copilot." https://github.blog/ai-and-ml/github-copilot/assigning-and-completing-issues-with-coding-agent-in-github-copilot/
- GitHub Docs. "Using Copilot cloud agent on GitHub." https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/use-cloud-agent-on-github
- Sayagh, Mohammed. "What Makes a GitHub Issue Ready for Copilot?" https://arxiv.org/abs/2512.21426
- Atlassian. "What is backlog refinement?" https://www.atlassian.com/agile/scrum/backlog-refinement
- Project Management Institute. "Applying work breakdown structure to the project lifecycle." https://www.pmi.org/learning/library/applying-work-breakdown-structure-project-lifecycle-6979
