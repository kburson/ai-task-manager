<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-cb2d52eb0bf6d07a76faee7525245b87"
role: "reviewer"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-11-05-2161-first-child-epic-convergence-design.md"
artifact_commit: "a462ad41ed3e472528d58af0e6d51155026909d2"
artifact_blob: "c689ac95335af4a935c0748f9753d7eaae6087f6"
artifact_digest: "sha256:3fd342824c2b2db5e59a9d3dfa7b6cbf4a967f460e426587a26a18fb762ac380"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5-5"
  model_display: "claude-opus-5-5"
  session_fingerprint: "sha256:3f165d8f1034d2545c4bd50ca079bf13239ba58c1216848c6e46566b01d6d3d0"
  identity_source: "runtime"
started_at: "2026-11-05T15:40:08.384Z"
submitted_at: "2026-11-05T15:42:04.386Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

The diagnosis is correct and I reproduced it from source. `reconcileEpicMetadata` (`scripts/gh/lib/epic-metadata.mjs:125`) calls `assertGovernedDecompositionRecovery`, which goes through `evaluateIssueDecomposition` to `collectHookDecompositionSnapshot`. That collector throws `non-epic child presence` at `scripts/task-tracker/lib/decomposition-hook-authority.mjs:172-176` whenever the actual body kind is non-epic and any child is present. So the intermediate post-link state that the first-child chain itself creates can never converge. A scoped, process-local, non-serializable capability is a sound shape for the fix. It keeps the general guard and avoids a bypass flag, and the spec rules out a fake source body and an `allowNonEpicChildren` switch. That part of the design is good.

The spec is not ready for planning yet. It misses one existing gate that will still block the exact positive cases it promises. It places the new parent-authority refusal after the side effect it is meant to prevent. It leaves out one production call site of the first-child path. And it puts the child census in a layer that discards children for non-epic kinds. Each gap is grounded in current source below.

## Findings

1. **The plan-availability gate still blocks pre-plan positive cases (high).** `assertGovernedDecompositionRecovery` defaults to `requirePlan = true` (`decomposition-plan-exit-guard.mjs:117`). It throws `decomposition:recovery-source-unavailable` unless `input.plan.availability === 'available'` (lines 127-133). The public `kind` verb passes `requirePlan: false` for its own precheck (`verbs/kind.mjs:76`). The canonical reconciler, however, calls the guard three times without that option: pre-read (`epic-metadata.mjs:125`), fresh-base validation (`:132`) and the pre-visible-write check (`:137`). All three require a plan. For a body with no linked plan, `selectedPlan` returns `NONE`/absent (`decomposition-authority.mjs:137`). The spec says positive cases cover "OPEN matching pre-implementation and later nonterminal states", and its admitted-state list includes Backlog, Refine and Ready for Planning. Issues in those states commonly have no plan, so they will still refuse after the non-epic guard is lifted. The `kind` route the spec moves "before that incompatible ordinary precheck" also loses the `requirePlan:false` semantics, unless the canonical operation takes them over. Worse, the `:137` check runs after the body write. In the normal first-child path it can leave a converted body with no title or label, which is a self-inflicted partial state. The spec never mentions plan availability.

2. **Parent-authority refusal happens after the child is linked, so it creates the anomaly (high).** In `project-tether.mjs:134-160`, `linkSubIssue` runs `addSubIssue` first and only then calls `ensureParentEpicTitle` → `reconcileEpicMetadata`. The spec requires that "the actual native bound parent must own the operation", and that the operation "refuse before metadata effects and preserve any relationship already created". Two ordinary paths fail that rule: `/task new --parent N`, or `create-issue --parent N` while the operator is bound to a different issue, against a parent that is still non-epic. In both cases the new design creates the child, links it, then refuses. The result is the same anomalous non-epic-with-children source that #2161 exists to repair, and it can only be recovered by a separate bound `kind N epic`. Because the refusal is post-link, the design produces the anomaly through routine use instead of only containing it. "Every pre-effect failure has zero metadata writes" is true for metadata, but the child creation and link are effects too.

3. **The `ensure-wave-parent` first-child call site is not addressed (medium).** `scripts/gh/ensure-wave-parent.mjs:313-331` links children (`addSubIssue`) to a wave parent and then calls `ensureParentEpicTitle`. When it creates the parent itself (`createParentIssue`, lines 138-177), the parent has a synthetic `--internal` body with no epic kind marker, and it is deliberately left unassigned (#793). It is also not the bound issue. Under the proposed rule (bound parent, live sole-assignee/current-user ownership, open timer), this path is guaranteed to refuse and leave a non-epic parent with children. Today it also fails, on `non-epic child presence`. The spec's "Normal first-child creation" claim and its routing section name only the project-tether path, so wave parents remain broken without any acknowledgement. The spec has to either bring this site into scope with its own authority model, or exclude it explicitly and file a tracking issue.

4. **The child census would be discarded before it reaches assessment (medium, clarification).** The spec says the collector "may accept this opaque capability ... to traverse and fence the full child census". In the collector, full traversal and per-child membership/fields/labels/blockedBy pagination only run when `classification.kind === 'epic'` (`decomposition-hook-authority.mjs:225-313`). Downstream, `collectDecompositionAuthority` → `readiness()` returns `children: []` for any non-epic kind (`decomposition-authority.mjs:479-487`). The final fence (`:325-399`) compares only presence ids. So for the intermediate source, a traversed census never reaches the assessment, and "preserve actual body kind as non-epic" guarantees that. The spec needs to say where the complete child identity inventory lives and which component compares it before each effect. That could be the canonical operation's own frame, or a separate collector return field. Otherwise "complete all existing pagination ... do not substitute the first presence page" has no consumer. It should also say whether per-child membership validation (`child membership unavailable`, `:268`) applies on the exceptional read. The spec does require rejecting "ambiguous/missing configured project membership", but that check only exists on the epic branch today.

5. **The "honest no-op" claim conflicts with the current `kind` output (low).** `verbs/kind.mjs:93` prints `set to "epic"` no matter what is returned. Separately, `reconcileEpicMetadata` returns `already-converged`. Resulting-behavior item 2 promises an honest no-op on repeat, so the routing change must turn the returned status into truthful operator output. Exit status for `already-converged` versus `reconciled` should also be specified.

## Required changes

1. Specify the plan-availability contract for the canonical conversion. Either the exceptional operation passes `requirePlan:false` at every guard call (pre-read, fresh-base validation, pre-visible-write, final), matching `kind` today. Or the admitted-state list is narrowed to states where a plan is required and available. Add positive tests for a plan-absent Backlog/Refine parent through both the public `kind` route and the automatic first-child route. Add a test that a post-body-write guard failure cannot happen just because the plan is absent.
2. Move the parent-authority decision ahead of child creation and linking for a non-epic parent. `create-issue --parent N` / project-tether should preflight "does this link need the exceptional convergence, and does the current native frame own parent N?" and refuse with zero GitHub writes (no issue, no link) when it fails. Keep the post-link reconcile for convergence only. Add negative integration tests for a foreign-bound and an unbound non-epic parent, asserting that no child is created and no link exists.
3. Address `ensure-wave-parent.mjs`: define its authority model (for example, create the wave parent with the epic kind marker already set, so the ordinary already-Epic path applies and no exceptional read is needed), or explicitly scope it out and record the tracking issue number in the spec.
4. State where the full child identity inventory is collected and compared for the non-epic exceptional read, given that `readiness()` drops children for non-epic kinds. Also state whether per-child configured-membership validation runs on that read.

## Optional suggestions

1. Have the public `kind <N> epic` print `already converged` / `reconciled` from the returned status, and document the exit code for each, so retries are visibly idempotent.
2. The collector runs under a 5s remote / 6s total deadline (`decomposition-hook-authority.mjs:48-49`). The canonical operation now calls it at least four times, and each exceptional read adds per-child pagination. Note the expected dispatch count, and have the integration suite assert that a slow-but-valid single-child census stays within budget, so `remote-deadline` does not become a new uncertain-failure source.
3. In "Verified problem", say plainly that the exit-6 split failure's nested cause is inferred (the spec already hints at this), and keep the direct `kind 2157 epic` reproduction as the evidentiary anchor. A plan reader should not treat the split failure as proven to be the same exception.

## Decision

revisions-requested
