---
model: gpt-6-astra
effort: high
filepath: docs/superpowers/specs/2026-09-20-aitm-mcp-adapter-architecture-design.md
commit_sha: c2e33f4d0ae704900437a0659119bad6eb30dc01
uncommitted_changes: false
turn_ordinal: SAR r1
turn_description: Single Agent Review revision 1
---

# AITM MCP adapter architecture self-review

**Date:** 2026-09-20

**Artifact:** [Architecture specification](../../specs/2026-09-20-aitm-mcp-adapter-architecture-design.md)

**Reviewed baseline:** `c2e33f4d0ae704900437a0659119bad6eb30dc01`

**Reviewer:** Codex, self-review

**Status:** All four findings addressed in the specification; independent review
pending.

This record documents the requested self-review and its corrections. It is not
independent peer-review acceptance or implementation approval. A manual review
with Claude follows separately after these revisions.

## Evidence and scope

The review examined the complete specification, [ADR 0002](../../../decisions/0002-github-native-authority-records.md),
and the current [capsule-chain implementation](../../../../scripts/task-tracker/lib/github-records/capsule-chain.mjs).
ADR 0002 requires one coordinator per governed scope, epoch fencing, read-back
verification, and fail-closed conflict handling. The current chain code detects
forks and refuses normal authoritative traversal or append through a fork.

The findings concern architectural contracts. No runtime implementation or live
provider behavior has been certified by this review.

## Findings

### SR-01 — P1: Conflicting writers can execute before fork detection

**Baseline:** Governed action and recovery flow, lines 628–631.

Rereading around an append is conflict detection, not exclusive execution
authority. Two workers can read one head, append competing requests, and dispatch
incompatible external mutations. An eventual fork join cannot undo those
effects. The proposed fallback also omitted ADR 0002's coordinator and fencing
requirements.

**Required correction:** Separate journal integrity from execution ownership;
require serialized admission and fenced dispatch, or a demonstrably exclusive
coordinator without overlapping takeover. Block capabilities without a safe
execution mode. Revalidate policy against freshly hydrated authority before
dispatch. Preserve forks for explicit reconciliation without treating a join as
retroactive authorization.

**Verification requirement:** Competing workers, a paused former coordinator,
in-flight effects during takeover, and a fork must never permit conflicting
dispatch. The implementation phase must prove the adapter's claimed mode.

### SR-02 — P1: Lost responses leave retry identity undefined

**Baseline:** Governed action and recovery flow, lines 611–618.

A kernel-generated action ID does not tell a caller how to identify an earlier
request when its response was lost. Repeating a successful work-item creation
with a new action ID could create a duplicate. The request record also needs
enough durable information to recover after the initiating process disappears.

**Required correction:** Require a caller-retained request key, define its
authority and principal scope, durably map it to the action and canonical input
hash, and reject conflicting reuse. Define lookup after response loss and
fresh-process recovery, including immutable input references and stable effect
keys. An uncertain provider observation must not authorize a retry.

**Verification requirement:** Lose a successful response, retry from another
process or transport with the same key, and obtain the original action without
another external effect. Reject changed payloads under the same key.

### SR-03 — P2: Uncommon portable actions lack an MCP invocation route

**Baseline:** MCP surface, lines 318–326.

Typed tools cover common portable actions; the generic invoker covers only
namespaced adapter extensions. Other portable actions have no specified route,
despite the goal that every portable action is schema-invocable.

**Required correction:** Add a portable-action invoker using the same registry,
exact schemas, policy, approval, effect, and recovery contracts as typed tools.
Require discovery to identify the callable route. Deny orchestrator-only actions
through both generic invokers and enforce complete registry coverage.

**Verification requirement:** Exercise an uncommon portable action through MCP
and CLI; reject unknown, incorrectly routed, schema-invalid, and orchestrator-only calls.

### SR-04 — P2: Initial control-stream creation has no recovery contract

**Baseline:** Durable authority, journals, and receipts, lines 559–565.

A stream cannot record the request to create its own first storage container.
The universal append-first rule therefore needs a narrowly specified bootstrap
exception. A lost creation response or concurrent setup can otherwise produce
duplicate control records or an installation falsely marked successful.

**Required correction:** Define deterministic bootstrap identity and initial
genesis evidence, safe provisioning prerequisites, read-back verification,
ambiguous-response reconciliation, and fail-closed duplicate handling. Bind a
maintainer-provisioned container when safe automatic creation is unsupported.
Keep ordinary workflow actions disabled until the root is verified, and report
partial provisioning honestly without deleting durable evidence.

**Verification requirement:** Exercise first installation, concurrent setup,
lost creation responses, partial setup, and explicit binding recovery.

## Resolution and validation

| Finding | Disposition | Revised specification sections                                                                                               |
| ------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------- |
| SR-01   | Addressed   | Relation to ADR 0002; Governed action and recovery flow; Concurrent execution and authority fencing; acceptance criterion 15 |
| SR-02   | Addressed   | Request identity and retry; result envelope; Existing-project migration; acceptance criterion 10                             |
| SR-03   | Addressed   | Portable and extension invocation; Transport parity; acceptance criterion 5                                                  |
| SR-04   | Addressed   | First authority bootstrap; Adapter conformance kit; Existing-project migration; acceptance criterion 16                      |

The revision also fixes directly related inconsistencies: policy evaluation now
follows fresh authority reads; recovery requires durable inputs and distinct
effect keys; admission serializes the project request-key reservation even when
targets differ; and a failed migration reports durable partial effects rather
than promising an impossible external rollback. Compatibility aliases retain
their verbs but must honor the same retry-key contract; setup previews the
required changes to unattended callers.

The verification section adds adversarial implementation cases and release
gates for all four corrections. Phase 1 now requires admission, response-loss,
stale-owner, and bootstrap verification, while Phase 3 requires complete MCP
invocation coverage. No runtime code or provider state changed.

Documentation checks:

- Worktree environment and its local package self-link verified.
- Prettier check for the specification and this record, explicitly including the
  review directory normally excluded from formatting.
- CSpell check for both documents.
- Repository Markdown lint and documentation-anchor lint.
- Relative review links and embedded JSON examples checked.
- Git whitespace check and review of the complete specification diff.

These checks validate the documents, not the proposed runtime guarantees. The
phase-specific specifications must demonstrate how each provider enforces its
claimed execution and provisioning modes. Independent Claude review and all
implementation approvals remain pending.
