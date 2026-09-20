---
model: gpt-6-astra
effort: high
filepath: docs/superpowers/specs/2026-09-20-aitm-mcp-adapter-architecture-design.md
commit_sha: 3d61deb4e5bb0d65258cfd0116fdfd4e541682cb
uncommitted_changes: true
reviewed_file_sha256: 280c17ebfa63d8343aa90d37cf22fdba84b1a859bc154492ac3ab7e2e8a58307
turn_ordinal: SAR r3
turn_description: Single Agent Review revision 3
---

# AITM MCP adapter architecture self-review, round 3

**Date:** 2026-09-20

**Artifact:** [Architecture specification](../../../specs/2026-09-20-aitm-mcp-adapter-architecture-design.md)

**Reviewed baseline:** The working-tree specification after round 2, based on
commit `3d61deb4e5bb0d65258cfd0116fdfd4e541682cb` with uncommitted round-2 changes.

**Baseline specification SHA-256:** `280c17ebfa63d8343aa90d37cf22fdba84b1a859bc154492ac3ab7e2e8a58307`

**Reviewer:** Codex, self-review

**Status:** Both findings addressed in the specification; independent review
pending.

This is an author self-review. It does not constitute independent peer-review
acceptance or implementation approval. The manual Claude review remains pending.

## Evidence and scope

The review examined the complete updated specification and the corrections in
[round 1](self-review-r1.md) and [round 2](self-review-r2.md). It checked the current
[story approval binding guard](../../../../../scripts/task-tracker/lib/story-approval-binding-guard.mjs),
[Plan transition authority](../../../../../scripts/task-tracker/lib/plan-transition-authority.mjs),
[human reviewer audit](../../../../../scripts/task-tracker/lib/human-reviewer-audit.mjs),
and [delivery provider action](../../../../../scripts/task-tracker/lib/delivery-provider-action.mjs).

The existing code rejects stale story or intent approval bindings, distinguishes
human and automated approval evidence, and binds delivery to a repository, PR,
and expected commit. Those are preservation constraints for the new architecture,
not proof that the proposed multi-provider contracts already exist.

## Findings

### SR3-01 — P1: Approval provenance and subject binding are underspecified

**Baseline:** Capability-specific ports; Portable and extension invocation;
Governed action and recovery flow; Host enforcement and Full-Auto.

The specification requires authenticated caller identity and current approvals
but does not distinguish the initiating actor, provider credential principal,
and human approver. An agent and a human can use the same provider account.
Possession of that account's write credentials or a caller-supplied approver name
cannot establish that a human approved a workflow decision. Likewise, a host
permission to call a generic tool is not approval of a particular plan or commit.

The architecture also leaves approval-to-subject binding implicit. The current
story approval guard rejects changed story and intent digests; an adapter
migration must not reduce that guarantee to the presence of an approval record.

**Required correction:** Define verified initiator, execution principal, and
approval provenance separately. Bind each approval to its governed requirement,
scope, and exact subject revision or digest; distinguish human decisions,
authorized automation, and workflow exceptions. Recheck validity before effects.
Caller assertions and tool permission alone cannot satisfy a human gate. Preserve
legacy provenance honestly and block a gate when the required proof is absent.

**Verification requirement:** Exercise a shared human/agent provider credential,
a forged approver field, a generic-tool permission without workflow approval,
changed approved content, revoked approval, and automated approval presented as
human. Apply the same policy through CLI and MCP.

### SR3-02 — P1: Recovery can resolve a pending action through new bindings

**Baseline:** Open plugin discovery; Installation staleness; Request identity
and retry.

Port bindings are replaceable and setup can legitimately update their locked
configuration. Request records retain canonical inputs and effect keys, but the
specification does not explicitly retain the resolved port targets and adapter
recovery contract. After a lost forge-creation response, setup could replace the
forge binding while keeping the same backlog. Recovery using the current binding
would search the wrong provider and could repeat the operation there. The
original work-item target and stable request key do not identify an implicitly
selected forge destination.

An adapter upgrade can also change how old effect keys are interpreted. Passing
the new setup staleness check does not prove compatibility with pending actions.
The current delivery action's explicit repository, PR, and expected commit
demonstrate the target binding that must survive adapter extraction.

**Required correction:** Persist the non-secret resolved execution context with
the request: port bindings, provider instances and targets, configuration
generation, adapter identity and recovery contract, and expected revisions.
Recovery observes the original targets, keeps their effect identities, and
uses a certified compatible implementation. Reconfiguration must account for
pending actions and fence retired dispatch paths. Missing compatibility requires
intervention, not silent redirection or automatic import of historical code.
Validate the active configuration generation for both transports before each
mutation admission and bind dispatch to that generation.

**Verification requirement:** Change a forge binding after response loss,
upgrade or remove its adapter, and recover from another process. Verify that
the original destination is observed, no effect is redirected, and incompatible
recovery is blocked. Change configuration after a long-lived server's first
action and verify that the old generation cannot authorize another dispatch.

## Resolution and validation

| Finding | Disposition | Revised specification sections                                                                                                                                         |
| ------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SR3-01  | Addressed   | Capability-specific ports; Approval authority and provenance; core, transport, and host verification; Phase 1; acceptance criterion 18                                 |
| SR3-02  | Addressed   | Installation staleness; Request identity and retry; Recovery across configuration changes; adapter and transport verification; Phases 1 and 4; acceptance criterion 19 |

The revised release gates require approval provenance and subject bindings, and
pending-action recovery that preserves targets with certified adapter
compatibility. Per-admission configuration checks now apply to both CLI and MCP,
including long-lived processes. The prior two review records remain unchanged.

Documentation verification covers:

- the worktree environment and local package self-link;
- Prettier and CSpell for the specification and this review record;
- repository Markdown lint and documentation-anchor lint;
- local Markdown links and embedded JSON examples;
- whitespace checks, including this newly created file; and
- inspection of the round-3 diff against the exact hashed round-2 baseline.

These are documentation checks. The new adversarial cases are requirements for
future implementation and have not been executed against a runtime adapter.
No runtime code or live provider state changed. Manual Claude review and
implementation approval remain pending.
