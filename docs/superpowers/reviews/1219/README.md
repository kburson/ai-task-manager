# Issue 1219 co-review archive

This tree preserves the complete specification and plan co-review history for
issue #1219. The accepted specification and plan remain normative; these files
record review exchanges, handoffs, protocol state, and recovery attempts.

## Tracked protocol runs

- `spec/protocol-runs/1219-continuous-agent-delivery-spec-claude/` preserves the
  original specification review run.
- `spec/protocol-runs/1219-continuous-agent-delivery-spec-only-restart/`
  preserves the accepted specification review run.
- `plan/protocol-runs/1219-continuous-agent-delivery-plan-claude/` preserves the
  original plan review run.
- `plan/protocol-runs/1219-continuous-agent-delivery-plan-only-restart/`
  preserves the accepted plan review run.
- `plan/protocol-runs/_abandoned-1219-plan-order-failure-dfcfb42d/` preserves
  the abandoned ordering-failure run for auditability.

## Rebase provenance

Pull request #1526 rebased the accepted amendment commits onto current trunk.
`git range-diff` verified the following commits as patch-identical. The
right-hand commits are the durable commits reachable from trunk.

| Artifact | Pre-rebase commit | Trunk commit |
| --- | --- | --- |
| Accepted specification | `1375edfd4b29c98e407ae428a15f992dbdff2cd6` | `c6e0ab5f21d469496ae83d85de93c3c48ba2189a` |
| Accepted plan | `7187854e13e21b357b4272afe349fc4b74f92767` | `411c441d8b53952c009f90103fb41542a55c0020` |
| Migrated portfolio WBS | `09b252efcac8d6cda9fef941cf16f5bf87cd87db` | `e3cc46bcba20769b4e6942450b1c46bce6154d29` |
| Final review formatting | `27bbe7d8c1fde48f228f48957defd0a5e1194690` | `746b141b2bd5dec3069cc214c4aa5a06e5751a91` |

The protocol state and event logs retain their original pre-rebase commit IDs
as historical evidence. Use the mapping above when resolving those IDs after
the temporary pre-rebase safety branch is removed.
