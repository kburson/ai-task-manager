---
model: "gpt-5.6-sol"
effort: "medium"
filepath: "docs/superpowers/specs/2026-09-20-aitm-mcp-adapter-architecture-design.md"
commit_sha: "e83599d8450faba1bebc813c4c4e514c05518ee7"
reviewed_file_sha256: "1912963ac7bfa0f7565e3cb1758a0dc27c0695712db1b22612ffb8207ece8c1e"
turn_ordinal: "SPR r1"
turn_description: "Same Provider Review revision 1"
role: "reviewer"
source_file: "docs/superpowers/reviews/aitm-mcp-adapter-architecture/XPR-first/SPR/spec/2026-09-20-2026-09-20-aitm-mcp-adapter-architecture-design-review-d25ab35478c17f6f87b2b8bc4c67190a/review-d25ab35478c17f6f87b2b8bc4c67190a-reviewer-response-1.md"
source_sha256: "bd7a3d7a9af8c3c61e28db5474a569f08498776c110157e7231262fb298fbba1"
submitted_at: "2026-09-20T22:23:29.253Z"
---

Mode: `normal`

## Summary

The architecture is coherent on kernel/transport separation, provider-owned
identifiers, authority storage, non-CAS coordination, observability classes,
installation drift, and phased compatibility. It also retains the substantive
mitigations required by ADR 0002 rather than treating provider neutrality as a
reason to weaken coordination.

One blocking gap remains in the invocation contract. The design creates the
mutation instance identity inside AITM, but does not give a caller a stable
identity to reuse after a transport-level unknown outcome. That leaves a new
invocation able to create a second mutation while the first invocation is still
an unmatched request.

Isolation disclosure: while locating repository implementation evidence, two
intentionally broad `rg` commands automatically returned excerpts from unrelated
specification and plan files under `docs/`. I did not intentionally open those
files. The output included unrelated delivered designs/plans and unrelated plan
variants whose filenames contained `replacement`, `r2`, or `r3`; those snippets
entered context and may qualify as unrelated correction collateral. I did not use
their content in the finding or decision below. The cited basis is limited to the
reviewed artifact, ADR 0002, and current `create-issue.mjs` implementation. Review
paths were excluded from both searches, and no prior review findings, XPR reports,
SPR experiment log, reviewer or author responses, or corrected version of the
MCP-adapter artifact was exposed. No memory files, other worktrees, historical
diffs, `origin/trunk`, agent histories, or coordinator history were read.

## Findings

1. **F1 — A caller cannot safely retry an invocation whose response was lost.**
   The generic MCP request carries the registered action ID, schema version,
   capability fingerprint, and payload (artifact lines 353–370). The typed-tool
   request contract likewise does not define a mutation-instance key. AITM then
   creates a stable `actionId` and idempotency key only inside the governed flow
   immediately before mutation (lines 729–731), and returns `actionId` only in
   the result envelope (lines 808–812). If the provider effect and
   `action.requested` exist but the CLI/MCP response is lost, the caller does not
   know that generated identity. Reissuing the same apparent command can
   therefore create a new `actionId` and a second request instead of resuming or
   reconciling the first. Searching for an unmatched request helps a recovery
   operation after the original identity is known, but it does not define how a
   fresh transport retry is bound to that request without conflating distinct
   intentional repetitions of the same payload.

   This is a concrete brownfield hazard, especially for `work-item.create`, which
   the design explicitly routes through the generic tool and project control
   stream (lines 353–355 and 652–655). The current GitHub creation path already
   recognizes this failure shape: after detecting that an issue may have been
   created despite command failure, `scripts/gh/create-issue.mjs` lines 250–263
   tells the operator to repair the returned issue rather than retry and create a
   duplicate. ADR 0002 requires append-first mutation, fail-closed conflict
   handling, and crash testing; a transport retry that silently starts a new
   mutation instance does not preserve those properties end to end.

## Required changes

1. Define a transport-independent invocation identity contract for every
   mutation before Phase 1 freezes the action schemas. A caller must be able to
   create or obtain a stable invocation key before the first attempt and reuse
   it through CLI and every MCP route. Specify its uniqueness scope, durable
   binding to canonical action/payload/authority/actor data, and collision
   behavior. Reuse with identical bound input must return, resume, or reconcile
   the original action; reuse with different bound input must fail closed.
2. Define lookup/recovery behavior for response loss before and after each
   durable boundary: before `action.requested`, after that append but before the
   provider call, after an ambiguous provider call, after outcome append, and
   after projection update. The client must not need a result that may have been
   lost to discover the original invocation.
3. Add the contract to the canonical request/result/error schemas, CLI/MCP parity
   criteria, adapter conformance tests, and acceptance criteria. Include at least
   `work-item.create` and a state-only mutation, exact-key replay, mismatched-key
   rejection, concurrent duplicate submission, and lost-response recovery. Use
   distinct terms for the registered action identifier and the mutation-instance
   identifier so `action ID` cannot denote both.

## Optional suggestions

1. In the later plugin/setup specification, make the lifecycle-script trust
   boundary explicit for packages that are named but not installed yet. The
   current architecture correctly treats executable import as a code-trust
   decision; the bounded specification should also state how metadata and
   lifecycle scripts are inspected before dependency installation can execute
   package code.

## Decision

revisions-requested
