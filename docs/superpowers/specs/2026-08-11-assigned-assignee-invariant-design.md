# Assigned and Assignee Invariant Design

## Goal

Make `Assigned` mean that an issue has at least one GitHub assignee, while keeping every later lifecycle state independent of assignment.

## Decisions

- At least one assignee satisfies the invariant; multiple assignees are valid.
- Adding an assignee through AITM moves a Backlog issue to Assigned.
- Removing the final assignee from Assigned moves the issue to Backlog. Removal in Refine or later never changes Status.
- An illegal manual move into Assigned is repaired to Backlog, not by guessing an assignee.
- Reconcile is dry-run by default and writes only with `--apply`.
- The local default login is `config.assignee`, falling back to `@me`.
- GitHub Actions enforcement is deferred because it requires repository and Projects write permissions.

## Architecture

A single `assigned-assignee-invariant` module owns strict assignee parsing, the distinct refusal code, the Assigned entry guard, and drift classification. The guard is registered on Assigned entry, so the central move-state boundary enforces it for direct moves and every caller that reaches that boundary. Guard aggregation preserves its exit code instead of flattening it into the generic transition-refusal code.

The new `assign` verb owns local assignee mutation. Adding performs add-assignee followed by Backlog-to-Assigned through the central mover; a failed move compensates by removing only the login added by this invocation. Removing the final assignee from Assigned moves to Backlog before removal; a failed removal restores Assigned while the assignee still satisfies the entry guard. All final assignee reads are strict and fail closed.

`create-issue --assignee` creates the issue with the requested assignee, stamps the Assigned entry marker, and tethers directly to Assigned. Unassigned creation remains unchanged in Backlog.

Reconcile gains an `assigned-invariant` mode. It reports either `Assigned` without assignees or `Backlog` with assignees, performs no writes by default, and repairs with adjacent central moves only when `--apply` is present. `heal-backlog --assigned-invariant` reuses the same classifier for project-wide reporting and its existing explicit-apply blast-radius gate. Refine, Plan, Develop, Test, Review, and Done always classify as invariant-neutral.

## Error handling

The assignee adapter distinguishes transport failures from malformed payloads. Either condition refuses Assigned entry with the documented invariant exit code and includes the cause. Cross-resource assignment changes use compensation and report any compensation failure; they never claim success from a partial state. Reconcile never auto-claims an unassigned Assigned issue because that would erase the violation being audited.

## Verification

TDD covers pure policy, mover refusal/no-write behavior, command routing, assignment compensation, creation tether state, reconcile dry-run/apply, and all later-state exemptions. Focused commands are recorded on issue #1207. Completion also requires sequential fast and slow suites, lint, format check, `npm run test:all`, diff checks, commit trace, and the governed Test verb.
