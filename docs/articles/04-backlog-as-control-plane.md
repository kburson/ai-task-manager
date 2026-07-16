# The Backlog Becomes The Control Plane

<!-- markdownlint-disable MD034 -->

[Series](README.md) | Previous: [The Rise Of The Technical Product Owner](03-technical-product-owner.md) | Next: [The Just-In-Time Planner](05-just-in-time-planner.md)

## Draft Thesis

In agentic software delivery, the backlog is no longer just a list of work. It is the control plane for autonomous execution.

## Core Argument

Human teams can sometimes survive ambiguous tickets because humans ask questions, carry organizational memory, and infer intent from context. AI agents do not reliably do that. They need sharper boundaries.

That makes each backlog item a contract:

- What outcome is requested?
- What context is relevant?
- What files or systems are likely involved?
- What must be true before work starts?
- What must be proven before work leaves a state?
- What dependencies block this task?
- What evidence must be left behind?
- What should happen if the task uncovers a defect or pivot?

Once backlog items carry that information, the board itself becomes executable. Agents can pull work, move through states, produce evidence, pause for decisions, and report progress without burying everything in transient chat context.

The control plane also decides when detail is allowed to appear. Early epics should preserve intent, scope, priority, and dependency order. They should not pretend to know every implementation detail before earlier work changes the codebase. As items move up the stack ranking, the backlog decomposes another layer. Only the atomic product backlog item receives the full current-code deep dive.

This is why agile backlog hygiene becomes more critical with agents. A human developer may notice that a ticket is too broad and push back. An agent may simply attempt the work. The backlog has to carry more of the operating discipline up front.

## AITM Perspective

AI Task Manager uses GitHub Projects as the current control plane because GitHub is where much open-source and many enterprise engineering teams already work. The same pattern can extend to Jira, GitLab, Bitbucket, or other systems if their APIs expose enough issue, field, workflow, and comment control.

AITM's current control-plane capabilities include:

- Epics and sub-issues.
- Stack-ranked sequence waves.
- State movement.
- Entry and exit gates.
- Timing logs.
- Context-word tracking.
- Pickup directives.
- Deep-dive analysis requirements.
- Verification markers.
- Review and close gates.

The point is not GitHub specifically. The point is that agentic work needs a persistent system of record outside the chat.

That system of record lets the TPO/TPM operate at the right altitude. They do not micromanage every code edit. They manage the contracts, gates, sequence, and exceptions that keep low-level code agents from drifting away from product and architectural intent.

## Adapter Implication

The durable architecture is adapter-based:

- Backlog adapters: GitHub, Jira, GitLab, Bitbucket.
- Agent adapters: Claude Code, Codex, Copilot, Rovo Dev, future agents.
- Evidence adapters: test logs, CI checks, pull requests, review comments, deployment status.

AITM already points in this direction by separating task workflow behavior from GitHub integration concerns.

## Series Link

This article explains the backlog as the control surface. The next article, [The Just-In-Time Planner](05-just-in-time-planner.md), explains how that surface decomposes large intent into atomic work at the right time.

## LinkedIn Article Shape

Opening hook:

> If an AI agent can implement an issue, then the issue is no longer paperwork. It is runtime input.

Middle:

- Explain backlog-as-control-plane.
- Show why chat history is insufficient.
- Map the adapter future.

Close:

> The future backlog will not only describe work. It will constrain, dispatch, verify, and audit it.

## Bibliography

- GitHub Docs. "Using the API to manage Projects." https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-api-to-manage-projects
- GitHub Docs. "Projects GraphQL API." https://docs.github.com/en/graphql/guides/using-the-graphql-api-for-projects
- GitHub Docs. "Using Copilot cloud agent on GitHub." https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/use-cloud-agent-on-github
- Atlassian Developer. "Jira Cloud platform REST API v3." https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/
- Atlassian Developer. "Jira Cloud REST API: Issues." https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/
- GitLab Docs. "Issues API." https://docs.gitlab.com/api/issues/
- GitLab Docs. "Project issue boards API." https://docs.gitlab.com/api/boards/
- Atlassian Developer. "Bitbucket Cloud REST API." https://developer.atlassian.com/cloud/bitbucket/rest/
- AI Task Manager. "State Machine." ../architecture/state-machine.md
- AI Task Manager. "Agentic Development Process." ../introduction/agentic-development-process.md
- AI Task Manager. "Core Workflow." ../introduction/core-workflow.md
- AI Task Manager. "State Slug Migration History." ../migration-history.md
