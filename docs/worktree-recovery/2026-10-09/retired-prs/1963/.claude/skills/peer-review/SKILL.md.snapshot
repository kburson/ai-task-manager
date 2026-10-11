---
name: peer-review
description: Run a provider-neutral, integrity-bound AI peer review for a tracked specification or plan.
---

# AI Peer Review

Run `peer-review setup` with an explicit user or project scope, then run
`peer-review doctor` before starting or joining a review. Query
`peer-review help <command>` whenever syntax is uncertain; never guess flags or
state transitions.

Use every generated artifact, workspace, invitation, and response location as
exact absolute paths. Relay only the reviewer invitation in the default
consensus workflow. Do not copy scratch state or raw provider handles into
tracked files.

## Communication policy (v1)

Apply this policy at startup and throughout all later turns, resumes, handoffs,
and finalization, in every transport and commit mode.

Keep all peer-review chat messages terse. Put complete review analysis,
findings, dispositions, revised prose, rationale, decisions, and verification
evidence in the generated durable review documents.

Chat may contain only:

- a short operational status;
- a pointer to the relevant durable document;
- the exact next action; or
- a concise blocker requiring human action.

Read the relevant durable reviewer or author response document; do not rely on
a chat summary. Do not paste findings, dispositions, revised prose,
verification output, or other durable document content into chat unless the
human explicitly requests it.

“Terse chat” does not mean terse review evidence. Durable reviewer and author
response documents remain complete, self-contained, and authoritative.

## Roles and boundaries

The Reviewer Git boundary forbids Git commands, artifact edits, commits,
pushes, and writes outside the exact pending reviewer response and package-owned
scratch transition. The Author Git boundary permits only package-generated,
exact-path protocol commits; inspect status before every submit or finalize.
Keep author and reviewer sessions distinct.

For an ordered specification and plan review, start with `--phases spec,plan`.
After non-final acceptance and author-owned finalization, follow the exact
event-derived `peer-review advance <workspace> <artifact>` action. The command
derives the next kind and cursor, resumes the same reviewer, and resets only the
phase turn budget. Omitting `--phases` keeps the legacy single-artifact contract.

The Reviewer Git boundary excludes only
`refs/codex/turn-diffs/checkpoints/**`, which is provider-private author-session
bookkeeping. Every other ref remains sealed, as do the artifact, checked-out
`HEAD`, branch, index, and worktree. This exclusion is package-defined and must
not be widened through repository configuration, environment, command input, or
lookalike ref names.

If a review joined with 0.2.1 reports a ref-only
`APR_REVIEWER_GIT_VIOLATION`, preserve the existing review workspace and
response, upgrade, and restart under the fixed package with a distinct output
path when required. The old response is draft evidence, never
accepted authority; recreate or copy its text only into the new authorized
reviewer response before submitting from the distinct reviewer session.

If startup reports `NO-COMMIT TEST MODE`, disclose that mode and its authority
assurance in every handoff. It is test evidence, not normal acceptance evidence.

Manual transport is always available. Resume-only transport may be used only
when doctor validates the provider's official resume command and scratch-only
handle. If delivery fails, leave it pending and use the printed manual recovery
command; never improvise shell composition or an undocumented wake mechanism.

## Claude reviewer launch

For Claude, use `peer-review launch-reviewer` with the exact sealed invitation,
model, and effort. The package constructs `--permission-mode dontAsk`, exact
permissions for only its generated `join` and `submit` commands, and the one
exact response permission. An absolute Claude Edit rule requires a double
leading slash; a single leading slash is project-relative. Do not construct
Edit or Write rules by hand. Do not construct Bash rules by hand either.

Surface a `permission-blocked` result immediately with its exact response and
printed next action. Run that `--resume` command unchanged so the same recorded
Claude session, model, effort, and prior analysis continue. A provider exit is
not submission: only a new reviewer decision in protocol authority proves that
the review was submitted.

Use `automatic-required` only after `peer-review doctor --mode
automatic-required` reports every Phase 2 row healthy. Both participants must
advertise `live-wait` or an official `native-push` adapter, present a current
resident lease, use compatible adapter versions, and pass the end-to-end health
check. After submitting in live-wait mode, call `wait_for_handoff` once with the
review ID, participant role, and last observed sequence; do not poll or spend
model turns while idle. An expired lease or changed process instance requires
the recorded participant-loss intervention. If any automatic delivery remains
pending, use the exact printed manual recovery command.

When the host declares durable coordination active, run `peer-review coordinator run <workspace>`
in the host-owned foreground process (or invoke
`coordinator reconcile` from its out-of-context timer). The coordinator
validates event authority and the current resident adapter before waking the
exact participant. Under an active coordinator, do not poll or repeat wait
calls. If coordinator startup reports a capability refusal, use only the
bounded manual fallback `peer-review status <workspace> --next`; never claim
unattended progress from a manual or resume-only host.
