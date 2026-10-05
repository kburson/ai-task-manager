<!-- ai-peer-review-template version="1" digest="sha256:f81da1894a46ceb20866070833b4e99ef536ef633542b418783d29e6a981dbd8" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-e241f6ca02abf1314254c63491049e24"
role: "author"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/plans/2026-10-01-1859-reviewed-scope-evidence.md"
artifact_commit: "e9132c115bed26a7cf11547036c08a3320e91770"
artifact_blob: "60976e24ee22df9e50414481d106b83df3f3a77b"
artifact_digest: "sha256:01f793bafcb4abe733c971d5cd51f3d25b8a520340cbbfa279af1600141846a1"
agent:
  host: "codex"
  provider: "openai"
  model_id: "gpt-6-astra"
  model_display: "gpt-6-astra"
  session_fingerprint: "sha256:ec5e5f99be5aed2ba8c242c7512b5c5173677c7962b3c3eba78436fd41234fc3"
  identity_source: "runtime"
started_at: "2026-10-01T18:55:11.088Z"
submitted_at: "2026-10-01T19:01:44.093Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Accepted the reviewer observations after verifying the current guard registry,
promote filtering/normalization consumer, typed evaluator projection and cwd reads.
Revised the plan so its new evidence guard and preserved decisions follow the
actual production contracts, including labels that survive typed projection.

## Finding dispositions

The reviewer response contains seven numbered observations but its sealed
finding_ids array is empty. This response preserves generated metadata and
explicitly dispositions every numbered observation rather than inventing IDs.

1. Accepted: Task 4 now returns refusals from the guard. It distinguishes the
   registry's internal typedRefusals from public runGuards().refusals, and requires
   real-registry assertions of codes/args/status. Contract phase is evaluation,
   with the guard registered only in Test's exit slot.
2. Accepted: Task 4 adds the promote mapping test-exit-reviewed-scope to
   reviewed-scope-refused and verb-path tests proving no lower mutation/delegation.
3. Accepted: Task 5 updates Promote alongside Review and Close. The original
   normalized decision is consumed directly, including persisted=true non-ready,
   with real promote integration coverage; no second evaluation erases the cause.
4. Accepted: Task 5 selects a typed completeness code, test-scope-incomplete, with
   one string args.label per unchecked line. Existing raw blockers/reason remain
   for legacy consumers. Review renders the typed labels with existing order/count,
   timing and exit behavior. The fixture now originates from real runGuards and
   checks preservation through normalization, avoiding invented envelope internals.
5. Accepted: deriveAndRescan requires authoritative projectDir; both Git HEAD reads
   receive cwd explicitly, and all three consumers pass it.
6. Accepted: reconciled file map and Task 4 inventories, naming contract.mjs,
   legacy-refusals.json, promote, move-state, guard-registry inventory comment and
   the pinned guard-parity-mid-stages test. Added the completeness guard to Task 5.
7. Accepted: normalization and typed retry carrier retain warnings; deriveAndRescan
   exposes it without dropping existing fields. decision.warns remains separate.

## Changes made

Corrected the Task 4 guard shape and producer/phase/status contract, added Promote
mapping and consumers, chose a concrete typed completeness-label contract and
registry-based fixture, threaded explicit cwd, retained warning channels, and
completed file/test inventories. Also made the synchronous mutate closure rule
explicit: asynchronous checks belong before mutation or in validateFreshBaseAsync.

## Declined changes and rationale

None. A terminology detail is corrected against source: runGuards' public result
contains refusals; typedRefusals is internal to guard invocation. Tests target the
public result rather than require a nonexistent public property.

## Verification

Inspected guard-registry.mjs invoke/consume, contract.mjs producer/phase validation,
promote.mjs REFUSAL_ID_TO_STATUS and deriveAndRescan consumer, the completeness
guard and evaluate.mjs' projection. Targeted canonical-plan formatting/Markdown
and whitespace checks run before submission. No runtime files or implementation
tests changed or ran. Protected response frontmatter is left byte-structurally
intact rather than reformatted by Prettier.
