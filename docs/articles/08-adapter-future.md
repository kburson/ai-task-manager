# The Adapter Future

<!-- markdownlint-disable MD034 -->

## Series Roadmap

| Status      | #      | Article                                                                                    | Role In Series                                |
| ----------- | ------ | ------------------------------------------------------------------------------------------ | --------------------------------------------- |
|             | 00     | [The Rise Of Technical Product Operations](00-technical-product-operations.md)             | Industry thesis: Technical Product Operations |
|             | 01     | [The Vibe Coding Hangover](01-vibe-coding-hangover.md)                                     | Failure mode: vibe slop and review debt       |
|             | 02     | [Spec-Driven Development Is Necessary But Not Sufficient](02-spec-driven-is-not-enough.md) | Why specs need execution governance           |
|             | 03     | [The Rise Of The Technical Product Owner](03-technical-product-owner.md)                   | Human operator: TPO/TPM as delivery architect |
|             | 04     | [The Backlog Becomes The Control Plane](04-backlog-as-control-plane.md)                    | Backlog as executable control surface         |
|             | 05     | [The Just-In-Time Planner](05-just-in-time-planner.md)                                     | Progressive decomposition and deep dives      |
|             | 06     | [Context Durability Is A Feature](06-context-durability.md)                                | JIT loading and post-compaction recovery      |
|             | 07     | [Evidence Beats Trust](07-evidence-beats-trust.md)                                         | Evidence gates and auditability               |
| **Current** | **08** | **[The Adapter Future](08-adapter-future.md)**                                             | Backlog and agent platform adapters           |

## Draft Thesis

The agentic software market will not be won only by the model with the best coding demo. It will be won by the platforms that let agents participate safely in real delivery systems.

That requires adapters.

## Core Argument

Software work already lives in many systems:

- GitHub Issues and Projects.
- Jira work items and boards.
- GitLab issues and boards.
- Bitbucket repositories and pull requests.
- CI systems.
- Review systems.
- Documentation and decision records.

AI agents need to operate through those systems, not around them.

The first wave of AI coding tools centered on the editor and the chat. The next wave will need deeper integration with backlog state, issue hierarchy, acceptance criteria, workflow transitions, pull requests, CI evidence, and review decisions.

The API surfaces already exist in fragments. GitHub Projects exposes project automation APIs. Jira exposes issue and transition APIs. GitLab exposes issue and board APIs. Bitbucket exposes repository and pull request APIs. The gap is not total impossibility. The gap is productized, portable workflow governance across those systems.

The vendor opportunity is not only to expose code-generation power. It is to expose enough workflow control that TPOs, TPMs, and engineering leaders can manage agent fleets using recognizable SDLC and agile patterns.

## AITM Perspective

AI Task Manager currently works through GitHub because GitHub is a practical starting point: issues, projects, sub-issues, project fields, comments, and pull requests can act as an external system of record.

But the pattern should not be GitHub-only.

The durable shape is:

- A backlog adapter for each product-management system.
- An agent adapter for each AI coding host.
- A state-machine layer that defines workflow semantics.
- An evidence layer that records verification and review.
- A context-management layer that loads detailed rules only when needed and reloads authoritative rules after compaction.
- A reporting layer that measures delivery cost, context burden, and acceleration.

That is how agentic AI becomes operationally portable.

The same role split still applies across platforms. Implementation agents operate inside bounded tasks. The TPO/TPM operates the backlog, sequence, gates, exceptions, and product intent. Engineering leaders provide architecture guardrails and technical standards.

## Vendor Signal

GitHub Copilot coding agent and Atlassian Rovo Dev already show vendors moving toward issue/work-item-centered execution. Kiro shows a spec-centered IDE workflow. These are strong signals that the market wants structured agent work.

The open question is whether platforms will expose enough control for external tools to govern agent fleets, or whether each AI host will build its own closed workflow.

## Series Link

This article closes the series by moving from AITM as a local pattern to AITM as an integration argument. Return to the [Research Synopsis](research-synopsis.md) for the evidence map and source taxonomy.

## LinkedIn Article Shape

Opening hook:

> The AI coding tool that matters most may not be the one that writes the best function. It may be the one that knows how to work a ticket.

Middle:

- Explain why delivery systems are fragmented.
- Show the existing API surfaces.
- Argue for adapter-based agentic delivery.

Close:

> The future of AI software delivery belongs to tools that can connect intent, work state, agent execution, review evidence, and business reporting across the systems teams already use.

## Bibliography

- GitHub Docs. "Using the API to manage Projects." https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-api-to-manage-projects
- GitHub Docs. "Using Copilot cloud agent on GitHub." https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/use-cloud-agent-on-github
- GitHub Blog. "Assigning and completing issues with coding agent in GitHub Copilot." https://github.blog/ai-and-ml/github-copilot/assigning-and-completing-issues-with-coding-agent-in-github-copilot/
- Atlassian Developer. "Jira Cloud platform REST API v3." https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/
- Atlassian Developer. "Jira Cloud REST API: Issues." https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/
- Atlassian. "Rovo Dev in Jira as my Spec Driven executor." https://www.atlassian.com/blog/development/rovo-dev-in-jira-as-my-spec-driven-executor
- Atlassian Support. "Check acceptance criteria in a code review." https://support.atlassian.com/rovo/docs/check-acceptance-criteria-in-a-code-review/
- GitLab Docs. "REST API resources." https://docs.gitlab.com/api/api_resources/
- GitLab Docs. "Issues API." https://docs.gitlab.com/api/issues/
- GitLab Docs. "Project issue boards API." https://docs.gitlab.com/api/boards/
- Atlassian Developer. "Bitbucket Cloud REST API." https://developer.atlassian.com/cloud/bitbucket/rest/
- Atlassian Developer. "Bitbucket Cloud REST API: Pull requests." https://developer.atlassian.com/cloud/bitbucket/rest/api-group-pullrequests/
- Kiro Docs. "Specs." https://kiro.dev/docs/specs/
