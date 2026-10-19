# Estimate revision and decomposition recovery

A recorded estimate is a fact about publication. Permission to implement is a separate current decision. A successful revision from 10h to 25h records values while restricting new implementation. It does not demote the issue, invent an approval or convert its kind.

Use the bound issue's native commands. Inspect the live issue, recorded worktree and pinned plan before recovery. Commands below use issue 1908 as an example; use the actual bound issue. Lifecycle, ownership, source, review, Test, delivery and Close gates remain required.

## Current assessment

| Status                     | Meaning and permitted next work                                                                                                                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| story-ok                   | Complete current inputs permit ordinary scoped work, through normal gates.                                                                                                                                                |
| needs-decomposition-review | Visible advisory warning; inspect scope and checkpoints. It does not independently forbid scoped work.                                                                                                                    |
| must-decompose             | Mandatory story restriction. Inspection, checkpoints and governed decomposition remain available; new product, deliverable and completion effects are refused.                                                            |
| epic-readiness-required    | Materialized planning readiness permits orchestration/Develop preparation. Accepted terminal children permit epic deliverable/completion assertions. Parent product implementation stays unavailable.                     |
| pending                    | Registered publication has unresolved effects, possibly before any business write. Old low fields cannot restore permission. Reconcile the exact operation; independently authorized decomposition may still be prepared. |
| indeterminate              | Current inputs, observations or projection cannot be trusted. Recover the named authority; an old marker or remembered receipt grants nothing.                                                                            |

The shared policy retains Estimate, XL, task-count and verifier-group signals. A 23h story can still be mandatory because of its plan; 24h and 25h cross the estimate boundary. Classification uses whole-hour normalization while actual fields/forecasts retain sanctioned precision. Epics retain readiness constraints instead of the story aggregate cap. Human or AI waiver prose and prior approval do not suppress the current flag.

## Inspect and refresh

Run `npx aitm explain 1908 --json` after bind/resume, drift, refusal, external approval/merge or context reset. Explain is read-only: it neither repairs markers nor starts product effects. Typed ready/blocked/indeterminate, warnings and returned remediation IDs determine the next action. Bind readiness is inspection readiness, not implementation permission.

Use `npx aitm resume 1908` when the native remediation calls for current refresh. Start/resume can confirm a genuinely absent or stale projection only from complete inputs and read-back. Refresh cannot erase a pending publication or finish missing writer effects. On unavailable authority, preserve inspection and restriction; retry after the named source is usable.

## Partial results and exact retry

Registered writers persist bounded pending intent before their first estimate/history/forecast effect. Each effect has an identity, intended digest and observed result. Provider acceptance alone is not confirmation. A final recorded result requires expected projections, fresh assessment and matching read-back.

| Observation                                                 | Safe recovery                                                                                                                                                                           |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pending persistence fails                                   | No business effect starts. Restore persistence/authority, then retry the original registered writer.                                                                                    |
| Some audit, board, body or forecast effects succeed         | Keep successful values/history and the operation ID. Retry the identical native writer; confirmed effects are reconciled rather than repeated.                                          |
| Provider may have applied an effect before transport failed | Treat the outcome as unknown. Exact retry reads it back before deciding to apply. Never infer success or rerun a raw write.                                                             |
| Old fields still show 10h while the revision intends 25h    | Pending controls admission even before business writes. Fresh bind, Explain, hooks and completion cannot reuse the low assessment.                                                      |
| Another host changes scope, plan, kind, policy or fields    | Retain drift and successful effects; obtain fresh authority and reconcile the predecessor. Do not overwrite the external edit or strip markers to regain permission.                    |
| A different intended revision is appropriate                | An edited command is not identical retry. Explicit supersession reconciles every predecessor effect through the owning registered writer, retaining history and new operation identity. |
| Timing or encoding repair runs beside pending intent        | Narrow target keys preserve Estimate and pending records. Repair cannot manufacture a completed revision or admission.                                                                  |

Retry the exact original `npx aitm inflate-estimate ...` invocation when its transport is usable; retry adaptive `npx aitm plan-estimate ...` with the same evidence/intent. Use current help and diagnostics. Never construct a publication marker, effect ID or supersession record manually. Cancellation and Shelve retain their journal/restore semantics; empty fields or Backlog alone do not erase pending intent.

## Governed decomposition and partial creation

Inspect current source and existing children before `npx aitm split-plan 1908 --dry-run`. Review every intent, bounded scope, verifier and pinned provenance; confirm only the reviewed proposal with `npx aitm split-plan 1908 --confirm`. Source, plan and ownership must be usable even while publication convergence is pending. A low old estimate alone does not make an otherwise bounded plan splittable; current plan signals must justify the proposal.

On partial creation, retain confirmed child numbers and the exact failed task. The sanctioned creator token confirms identity even if a later tether or assessment refresh fails. List existing children before retry; never duplicate or delete successful children or treat an unconfirmed continuation assessment as failed creation. Resume confirmed children through native binding and fresh authority.

A converted epic's reviewed children at Ready for Planning establish planning readiness only. The seven-child #1908-shaped proof preserves bounded 6+7+12+6+9+6+6h children, rank waves, dependencies and accepted sections. Completion requires accepted terminal delivery, actual board Done for completed children, and no pending recovery. Re-read ACs against shipped work, publish the genuine deliverable and use `epic-reconcile` before new epic completion assertions. Root aggregate commits still use native exact-head provider delivery, Test/review and Close authority; readiness never independently authorizes Close.

## Concurrency and proof limits

This is a cooperative CLI/hook boundary. Registered writers share issue locks, persist pending intent and revalidate before effects. Hooks fetch one fresh combined base snapshot per invocation with bounded resource continuations: five seconds remote, six seconds total, and no edit-attempt retry storm. Exhaustion or unsupported concurrent-host drift denies recognized scoped effects and leaves diagnostic recovery available.

The checks do not globally serialize arbitrary hosts or make multi-resource GitHub writes atomic. They do not protect arbitrary shell bypasses. An allowed check applies to that invocation, not later writes.

See [adapter and verifier census](decomposition-adapter-census.md) for actual seams and source-backed exclusions. Archived waiver examples remain historical evidence; current waiver prose is not admission.
