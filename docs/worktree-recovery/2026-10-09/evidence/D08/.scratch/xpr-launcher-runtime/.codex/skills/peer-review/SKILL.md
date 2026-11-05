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

## Roles and boundaries

The Reviewer Git boundary forbids Git commands, artifact edits, commits,
pushes, and writes outside the exact pending reviewer response and package-owned
scratch transition. The Author Git boundary permits only package-generated,
exact-path protocol commits; inspect status before every submit or finalize.
Keep author and reviewer sessions distinct.

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

Use `automatic-required` only after `peer-review doctor --mode
automatic-required` reports every Phase 2 row healthy. Both participants must
advertise `live-wait` or an official `native-push` adapter, present a current
resident lease, use compatible adapter versions, and pass the end-to-end health
check. After submitting in live-wait mode, call `wait_for_handoff` once with the
review ID, participant role, and last observed sequence; do not poll or spend
model turns while idle. An expired lease or changed process instance requires
the recorded participant-loss intervention. If any automatic delivery remains
pending, use the exact printed manual recovery command.
