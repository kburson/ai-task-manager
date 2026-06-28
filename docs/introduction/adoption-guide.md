# Adoption Guide

AI Task Manager works best when teams introduce it as a lightweight operating discipline, not as another reporting chore. Start with one project, keep the workflow visible, and expand once the timing and review habits feel normal.

## Solo Developer Rollout

For an individual developer:

1. Install and initialize AI Task Manager in one active repository.
2. Start every implementation session with `/task #N`.
3. Use `/task update` at natural checkpoints.
4. Use `/task review` before calling work complete.
5. Generate a value report after several closed issues.

The main habit is simple: if the agent is doing project work, it should be attached to an issue.

## Small Team Rollout

For a small team:

1. Agree on the GitHub Projects board and state flow.
2. Commit `.ai-task-manager/` configuration so every developer shares the same workflow IDs.
3. Review the Pickup Directive and Definition of Done templates.
4. Require estimates before work starts.
5. Keep human approval enabled while the team builds trust.
6. Use `/task fleet` when running parallel agent sessions.
7. Review the first value report together and tune estimates or reading-speed assumptions.

This keeps adoption grounded in existing engineering artifacts rather than a separate AI dashboard.

## Organization Rollout

For broader adoption:

1. Standardize the project fields required by AI Task Manager.
2. Decide which teams can use auto mode and under what conditions.
3. Document when force-close is allowed. Treat it as abandonment, not normal completion.
4. Establish review expectations for generated Deep-Dive Analysis sections.
5. Use value reports for portfolio-level learning, not individual surveillance.
6. Keep the ROI narrative tied to shipped work, quality, and review cost.

The strongest adoption story is not "agents wrote code." It is "our delivery system can show what agents shipped, what humans reviewed, and what leverage we gained."

## Recommended Defaults

Start with these defaults:

| Setting                     | Recommendation                           |
| --------------------------- | ---------------------------------------- |
| Human gates                 | Keep enabled                             |
| One active task per session | Required                                 |
| Estimates                   | Required before work starts              |
| Deep dive                   | Required before implementation           |
| Parallel fan-out            | Use only after dependencies are explicit |
| Force close                 | Abandonment only                         |
| Value reports               | Review after each meaningful milestone   |

## Team Norms To Establish

Make these expectations explicit:

- Agents do not edit code before binding to an issue.
- Agents do not skip deep dives.
- Agents do not close their own work without human approval.
- Agents record verification commands as checkboxes and run them before ticking them.
- Orchestrators stay attached to epics while workers handle child issues.
- New scope discovered during work becomes a linked issue, not hidden extra work.

These norms keep speed from turning into ambiguity.

## What To Customize

The most useful project-specific customizations are:

- `.ai-task-manager/templates/pickup-directive.md`
- `.ai-task-manager/templates/definition-of-done.md`
- Project board fields and views
- Default labels
- Idle threshold
- Reading words per minute
- Human gate settings
- Regional and role assumptions for value reporting

Customize the process language to match your team, but preserve the control points: active task, deep dive, verification, review, approval, close.

## Success Signals

Adoption is working when:

- Developers know which issue every agent session belongs to.
- Board state reflects actual work without manual cleanup.
- Issues can be resumed after context resets.
- Parallel work has fewer collisions because dependencies are explicit.
- Review discussions reference checked criteria and verification output.
- Reports use measured issue data instead of rough anecdotes.

The best outcome is not more ceremony. It is less ambiguity around agent-driven work.
