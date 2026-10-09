---
name: peer-review
description: Run a provider-neutral, integrity-bound AI peer review for a tracked specification or plan.
---

# AI Peer Review

Run `peer-review setup` with an explicit user or project scope, then run
`peer-review doctor --mode installation` to check package health. Run
`peer-review doctor` from the active agent session to check current-session
readiness before a review. Setup installs Codex and Claude provider hooks that
capture the current model for each CLI invocation; model and effort may change at
any time in the same session, so never pin them in project configuration.
Codex hooks cover direct shell calls and `functions.exec` calls that use
`tools.exec_command`; let the installed hook supply the model for the pending
command. Do not add `CODEX_MODEL_ID` or a hook token yourself.
In a Codex linked worktree, the host may load project hooks from the primary
clone rather than this physical worktree. If `doctor` or a current review command
reports `APR_IDENTITY_REQUIRED` while `doctor --mode installation` is healthy,
the active host hook did not supply current-operation model evidence. Inspect
the host's active hook source, update that source with `setup --update` if
needed, trust or reload the hook, and rerun `doctor` in the actual agent session.
Do not fill the gap with a model declaration or a prior-turn model. Existing
review records remain intact while this is repaired.
After a package upgrade, run `peer-review setup --update --dry-run` then `peer-review setup
--update` in the affected project, or add `--scope user` for a user-scope
installation. Update discovers all hosts recorded by the prior setup;
setup backs up the prior bytes. `setup --remove` is an idempotent teardown. If a
review command reports `APR_SETUP_VERSION_MISMATCH`, run `peer-review explain
APR_SETUP_VERSION_MISMATCH` and `peer-review help setup`, then refresh each
previously installed host in the same scope.
Query
`peer-review help <command>` whenever syntax is uncertain; never guess flags or
state transitions.
Before starting any new SPR or XPR, identify the tracked issue number and pass
`--issue <N>` to `peer-review start`. The CLI refuses a missing issue with
`APR_ISSUE_REQUIRED`; run `peer-review explain APR_ISSUE_REQUIRED` for recovery.
The issue ID is sealed at startup and prefixes package-generated revision and
finalization commits as `[#N]`. Do not infer it from the branch or artifact name.

If `start` or `broker` reports `APR_BROKER_ACCESS_DENIED`, invoke
`peer-review explain APR_BROKER_ACCESS_DENIED` and use an approved host tool
execution path that can reach the authenticated project broker socket. Run the
command from the actual author or reviewer session so its identity is genuine.
Do not copy a child agent's session ID into a parent shell, loosen sandbox
isolation, relocate the broker socket, or replay an uncertain reviewer launch.
Read `peer-review broker status --json` before the exact reported recovery
action; status alone never starts the broker.
Offline status lists verified pinned-runtime candidates in advisory order and
retains unverifiable records. `peer-review broker reconcile <workspace>` starts
the selected pinned image and authenticates its broker; a different image may
inspect an older review only in recovery mode. Preserve the old review and
its provider evidence if a candidate fails, then check broker ownership before
trying another candidate.

For an unjoined review, `peer-review abandon <workspace> --reason <text>`
requires a durable fence and complete evidence that no broker, wake, or manual
Claude launch reached the provider. An absent reviewer join, a hook denial,
missing legacy launch history, or a generic provider failure is insufficient.
An independent fresh XPR can use a distinct `--reviews-root` or
`--review-path-template`; verify its new review ID, invitation, and outputs.
Changing only `--record-id` does not guarantee a new review ID, and the old
uncertain attempt remains unresolved. `peer-review supersede` needs exact
lineage authority and cannot replace abandonment when a lineage receipt is
missing.

## Package installation and migration

Install the scoped registry package while continuing to invoke the local `peer-review` binary:

```bash
npm install --save-dev @kburson/ai-peer-review
npx --no-install ai-peer-review --help
```

Existing consumers migrate without changing binary, configuration, or runtime paths:

```bash
npm uninstall ai-peer-review
npm install --save-dev @kburson/ai-peer-review
```

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

The sealed reviewer boundary checks the artifact, checked-out `HEAD`, branch,
index, and this worktree. Shared Git refs are diagnostic only: parallel worktrees
may commit, fetch, and create refs without invalidating this review. Reviewers
still must not run Git commands or push. If an older package reports a ref-only
`APR_REVIEWER_GIT_VIOLATION`, preserve the review workspace and response, use a
compatible updated package, and retry the same authorized submission.

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

Start from the invoking author session with an explicit reviewer provider and
model; print the resolved effort even when it defaults to medium. Preserve the
user's exact model and effort identifiers instead of choosing from a
package-owned availability list. If the provider explicitly rejects either
selection, report `APR_REVIEWER_SELECTION_REFUSED` and its provider code.
For conversational requests, identify which named app is the reviewer; the
invoking session is the author. Treat names such as a model family or a version
nickname as hints, not exact IDs. Use the installed provider app's current
model and effort choices when available, and ask for the exact reviewer model
ID if the hint has more than one plausible match. An omitted effort means
`medium`; never infer a model or effort from a nickname suffix. Show the
resolved provider, exact model ID, and effort before starting, then pass those
values unchanged into the sealed review intent. Do not add a package-owned
alias or availability table.
Treat generic process failures and missing output as uncertain launch outcomes
that require reconciliation. Human
sponsorship is not participant identity. Use `peer-review help start`,
`peer-review help spr`, and `peer-review help xpr` for offline guidance. Native
SPR needs a same-provider second-session capability. New XPR, including manual
transport, requires the project-local broker; broker failure never triggers an
automatic fallback to a different reviewer or runtime.

For broker recovery, inspect `peer-review broker status --json`, preserve
receipts, then use `peer-review broker reconcile <absolute-workspace> --json`
only when the reported evidence calls for it. `broker suspend` fences one
review; `broker stop` refuses runnable or unreconciled work. Under an active
broker, yield after a handoff rather than polling or repeating wait calls.
Existing manual reviews may use the bounded `peer-review status
<absolute-workspace> --next` recovery path.
