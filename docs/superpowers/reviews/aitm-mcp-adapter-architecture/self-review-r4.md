---
model: gpt-6-astra
effort: high
filepath: docs/superpowers/specs/2026-09-20-aitm-mcp-adapter-architecture-design.md
commit_sha: 21778cf5535b055ad9a42131df9b9d471b428f6e
uncommitted_changes: false
reviewed_file_sha256: b73141a8f5e9cd4d76d8837fbf09e83716ece4f524e8d0e1ccae3a0bcab57caa
turn_ordinal: SAR r4
turn_description: Single Agent Review revision 4
---

# AITM MCP adapter architecture self-review, round 4

**Date:** 2026-09-20

**Artifact:** [Architecture specification](../../specs/2026-09-20-aitm-mcp-adapter-architecture-design.md)

**Reviewer:** Codex, self-review

**Status:** Both findings addressed in the specification; next SAR pending.

This round reviewed the complete committed specification after rounds 1–3.
It is not independent acceptance or implementation approval.

## Findings

### SR4-01 — P1: A single-predecessor envelope cannot represent the promised join

The Append-only integrity section specifies a predecessor hash, while Concurrent
execution and authority fencing promises an authorized record joining forked
branches. Appending a record to one branch does not remove the original fork or
authenticate the other branch. The current
[capsule-chain reader](../../../../scripts/task-tracker/lib/github-records/capsule-chain.mjs)
rejects forks even when a record's type is `conflict-resolution`; the current
[envelope](../../../../scripts/task-tracker/lib/github-records/record-envelope.mjs)
has one predecessor. Merely adding a new event name cannot make replay resume.

**Correction:** Require a versioned multi-parent join representation with hashed
references to every joined head, explicit effect and evidence dispositions, and
deterministic replay. Reject incomplete joins and newly discovered branches.
Readers unable to interpret that schema remain blocked. Phase 1 must prove the
new reader/writer contract before enabling join-based recovery.

**Verification:** Cover valid joins, omitted or tampered parents, competing
joins, unresolved effects, a late branch, and legacy-reader refusal. Rebuild the
same authoritative state without deleting any branch.

### SR4-02 — P1: Local Git effects have no complete binding and recovery boundary

The `repository` port includes branches, commits, and worktrees, but no provider
target supplies that port. The execution and observation contracts discuss
provider effects without distinguishing effects that exist only in one clone.
After an interrupted local commit or worktree creation, another clone cannot
infer absence by inspecting its own filesystem. Treating the caller's current
directory as the target can mutate the wrong checkout. The existing
[worktree binding](../../../../scripts/task-tracker/lib/worktree-binding.mjs)
already records the checkout root and branch; that boundary
must survive the new transport architecture.

The strict-mode text additionally isolates credentials specifically to the MCP
process, despite a first-class CLI transport, and does not expressly cover local
Git writes that need no remote credential.

**Correction:** Supply a built-in local Git adapter through the public contract.
Bind effects to canonical repository, clone, and worktree identities with
expected refs; keep runtime path resolution separate from portable config.
Local artifacts remain original user data, not disposable AITM caches. An
inaccessible original checkout requires intervention or an explicitly verified
transfer, never absence-based replay elsewhere. Host assurance covers local
mutation channels and the isolated kernel boundary used by either transport.

**Verification:** Interrupt local effects, recover from a different clone,
resolve a missing or relocated checkout, and attempt raw local Git writes at
each assurance level. Preserve uncommitted data and require explicit authority
for any transfer or additional publication effect.

## Resolution and validation

SR4-01 is addressed by the versioned join and replay contract in Append-only
integrity, adversarial fork cases, Phase 1 requirements, a release gate, and
acceptance criterion 20. SR4-02 is addressed by Local repository binding, the
transport-neutral host enforcement boundary, local recovery and assurance tests,
Phase 1 requirements, a release gate, and acceptance criterion 21.

Documentation validation covers formatting, spelling, Markdown lint,
documentation anchors, YAML provenance, local links, JSON examples, and
whitespace. The specification diff was inspected against the committed baseline.
These are document checks, not runtime certification of the proposed protocols.
No implementation or provider state changed. A subsequent SAR will review the
committed corrections before the self-review loop concludes.
