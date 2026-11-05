### Validated scope and current behavior

The approved scope matches the current architecture. AITM presently represents a dependency three times: an `aitm-blocked-by` body marker is authoritative, the `BLOCKED` label is a visual mirror, and the `Blocked By` Project field is another mirror. `block.mjs`, `unblock.mjs`, `blocked-by-guard.mjs`, `unpark-dependents.mjs`, epic child selection, refinement snapshots, wave admission, shelving recovery, and delivery-incident reconciliation all read or write at least one legacy carrier. GitHub CLI 2.97.0 exposes native dependency reads as `gh issue view --json blockedBy,blocking` with connection-shaped `{nodes,totalCount}` values and native mutations through `gh issue edit --add-blocked-by` and `--remove-blocked-by`.

The existing lifecycle already supplies the requested feature-branch completion rule. `close-gates-lineage.mjs` accepts a child issue's attributed commit when it is reachable from its immediate parent epic branch; standalone work still targets trunk. Dependency readiness therefore only needs to trust the upstream issue's AITM Project Status `Done`. It must not reimplement branch reachability.

The project field repair path is already additive: `ensureDispositionField` preserves every observed option ID and appends missing canonical options. The new transient `BLOCKED` option can use that path. `TERMINAL_DISPOSITIONS` must remain limited to Delivered, Replaced, Discarded, Duplicate, and Incorporated so projection repair cannot overwrite or clear close outcomes.

### Files to edit

- `config/project-fields.default.json` and `.ai-task-manager/project-fields.json`: add the red `BLOCKED` Disposition option and stop provisioning `Blocked By` on new installs.
- `scripts/gh/init-repair.mjs`: retain additive single-select repair and verify the new option without recreating or renumbering existing options.
- `scripts/task-tracker/lib/native-dependencies.mjs` (new): normalize GitHub connection payloads, read `blockedBy`/`blocking`, validate repository issue identities, and apply verified idempotent set additions/removals through the GitHub CLI.
- `scripts/task-tracker/lib/dependency-disposition.mjs` (new): resolve dependency AITM Status values, derive transient projection state, preserve terminal Dispositions, write or clear the project field, verify readback, and return explicit partial-failure results.
- `scripts/task-tracker/verbs/block.mjs` and `scripts/task-tracker/verbs/unblock.mjs`: replace marker/field/label mutations with native set union/subtraction and eager projection reconciliation while retaining audit comments and idempotent output.
- `scripts/task-tracker/lib/blocked-by-guard.mjs`: consume native dependencies, fail closed on unreadable relation or Status data, reconcile Disposition lazily, and gate the existing Ready-for-Planning-through-Review exits.
- `scripts/task-tracker/lib/epic-children-gate.mjs`, `scripts/task-tracker/verbs/pull-next.mjs`, and `scripts/gh/lib/wave-admission.mjs`: attach live native dependencies and their statuses to child selection/admission rather than parsing body markers.
- `scripts/task-tracker/lib/refinement-snapshot.mjs`, `scripts/task-tracker/lib/refinement-history.mjs`, and their shelving callers: issue a new snapshot schema that no longer embeds a second dependency authority while preserving schema-1/schema-2 read compatibility.
- `scripts/task-tracker/lib/unpark-dependents.mjs` and `scripts/task-tracker/lib/move-state/cache-unpark.mjs`: replace destructive marker removal with eager reconciliation of the completed issue's native `blocking` dependents; preserve dependency links as provenance.
- `scripts/task-tracker/verbs/switch.mjs` and `scripts/task-tracker/verbs/resume.mjs`: run best-effort lazy projection reconciliation after a successful bind and surface partial failures without rolling back the binding.
- `scripts/task-tracker/verbs/migrate-dependencies.mjs` (new), `scripts/task-tracker/task-tracker.mjs`, `scripts/task-tracker/lib/command-surface/catalog.mjs`, `scripts/task-tracker/lib/command-surface/routing.mjs`, `scripts/task-tracker/verbs/help-data.mjs`, and self-documentation authorities: expose `migrate-dependencies --dry-run|--apply` as a repository-wide migration command.
- `scripts/task-tracker/verbs/close.mjs`, `scripts/task-tracker/lib/shelve-transaction.mjs`, and `scripts/task-tracker/verify-delivery-incident-reconciliation.mjs`: remove runtime assumptions that legacy carriers represent the current dependency set; keep legacy parsing only where migration or historical incident evidence explicitly needs it.
- `docs/DESIGN.md`, `docs/guides/workflow.md`, `docs/guides/guard-architecture.md`, `docs/guides/parallel-agents.md`, and `.ai-task-manager/templates/references/pickup-directive-rationale.md`: document native authority, set semantics, feature-branch Done satisfaction, projection repair, migration, and the no-webhook boundary.

### Step-by-step implementation plan

1. Add the canonical `BLOCKED` Disposition option and remove `Blocked By` from provisioned field definitions. Keep existing configured IDs readable so migration can clear an already-installed legacy field without deleting it.
2. Build a single native-dependency adapter. Normalize connection shapes, reject pagination/incomplete reads, deduplicate positive issue numbers, reject self-dependencies, and verify every post-mutation set by rereading GitHub.
3. Build the Disposition projector on top of native reads plus configured-project Status reads. Derive `BLOCKED` when any dependency is not exactly Done or is unreadable; derive empty otherwise. Before mutation, read the current Disposition and leave terminal values untouched. Verify writes and clears by readback.
4. Rewrite `block` as set union and `unblock` as set subtraction. Calculate the desired set from fresh native state, invoke only missing add/remove operations, reread until the exact set is confirmed, then reconcile Disposition. A native mutation remains authoritative if projection fails; the command reports partial failure and a retry converges.
5. Rewire the universal exit guard and child-selection paths to the shared native reader. Guard failures name every unfinished dependency and its state. Missing or truncated dependency/Status data fails closed. Successful reads also repair stale Disposition before the lifecycle action proceeds.
6. Change Done side effects to enumerate the completed issue's native `blocking` connection and reconcile each dependent without deleting the satisfied relationship. Keep failures visible and retryable after the Done move has committed.
7. Remove dependency data from newly authored refinement snapshots so a mutable native relation is not copied into durable body evidence. Continue reading historical schema-1/schema-2 snapshots and treat their embedded blocker values as historical compatibility only.
8. Add `migrate-dependencies`. Dry-run reports strict-marker candidates, already-native edges, intended mutations, closed-history skips, and ambiguous label-only issues. Apply processes each open strict-marker issue in a recoverable order: add and verify native edges, reconcile Disposition, clear the installed legacy field, remove the label, then remove the strict body marker last. The marker remains the retry token until every earlier step succeeds.
9. Retire remaining runtime legacy reads/writes, update command/help/docs surfaces, and keep `blocked-marker.mjs` parsing available only to the explicit migration and historical compatibility readers.
10. Run focused tests first, then lint/format, the fast suite, the slow suite, and inspect the final commit trail.

### Test additions

- `scripts/tests/unit/task-tracker/lib/native-dependencies.test.mjs`: connection normalization, pagination refusal, identity validation, exact set verification, deduplication, and self-reference rejection.
- `scripts/tests/unit/task-tracker/lib/native-dependency-projection.test.mjs`: BLOCKED/empty derivation, unknown-state fail-closed behavior, terminal safety, readback verification, and partial failures.
- `scripts/tests/unit/task-tracker/verbs/block-verb.test.mjs`: extend existing coverage for union/upsert semantics, duplicate suppression, preserved unrelated edges, and retry convergence.
- `scripts/tests/unit/task-tracker/lib/coverage-unblock.test.mjs`: extend existing coverage for selected subtraction, absent-edge idempotence, remove-all, and projection reconciliation.
- `scripts/tests/unit/task-tracker/lib/blocked-by-guard.test.mjs`: replace marker fixtures with native relations and cover every registered lifecycle exit, unknown state, and projection failure.
- `scripts/tests/unit/task-tracker/lib/native-dependency-reconciliation.test.mjs`: eager Done fan-out and lazy bind/transition reconciliation while preserving native links.
- `scripts/tests/unit/task-tracker/verbs/pull-next-verb.test.mjs` and `scripts/tests/unit/task-tracker/lib/epic-children-gate-blocked.test.mjs`: UI-added native dependencies, cross-sibling status resolution, and dependency-ready selection.
- `scripts/tests/unit/task-tracker/lib/refinement-snapshot-schema.test.mjs`: new dependency-free snapshot schema plus schema-1/schema-2 compatibility.
- `scripts/tests/unit/task-tracker/verbs/migrate-dependencies.test.mjs`: dry-run/apply, strict open marker conversion, closed-history preservation, cleanup ordering, interruption recovery, idempotence, and ambiguous label-only reporting.
- `scripts/tests/unit/task-tracker/lib/native-dependency-docs.test.mjs`: provisioned fields, command help, and documentation consistently name native authority and the no-webhook boundary.
- `scripts/tests/unit/task-tracker/gh/disposition-install-repair.test.mjs`: additive `BLOCKED` option repair with existing option IDs preserved.
- `scripts/tests/unit/task-tracker/lib/close-gates-lineage.test.mjs`: retain proof that epic-child Done can be satisfied on the parent integration branch while standalone work still requires trunk.

The approved root acceptance criteria and their focused command citations already cover these test additions; no new product behavior was discovered that requires another criterion.

### Identified risks

- GitHub returns dependency fields as paginated connections. Treating a first page as complete could falsely unblock work, so any `hasNextPage`, total-count mismatch, malformed node, foreign repository, or missing Status must fail closed.
- `gh issue edit` applies edges one operation at a time. A later projection or comment failure cannot be rolled back safely; explicit partial results and exact readback make retries convergent.
- A transient `BLOCKED` value shares a field with terminal outcomes. Every projector mutation must read first and skip all terminal values; `BLOCKED` must not be added to `TERMINAL_DISPOSITIONS`.
- Current refinement schema binds legacy blocker state into its digest. Simply deleting marker writes would make parked work appear stale, so a dependency-free successor schema with historical readers is required.
- Migration cleanup must remove the marker last. Otherwise a crash after marker removal but before field/label cleanup would turn recoverable work into ambiguous label-only state.
- Out-of-band GitHub UI changes have no immediate push channel. They become authoritative at once, but the Disposition projection may remain stale until the next bind, pull-next, block/unblock, guarded transition, or upstream AITM Done event.
- Existing `Blocked By` fields and `BLOCKED` labels are retained as project schema/history. Runtime code must not infer dependencies from them after migration.

### Sibling sub-issues to spawn

None. The work crosses several adapters but is one atomic authority migration: splitting native reads, projection, or migration into independently deliverable issues would create an interval with conflicting dependency authorities. Adaptive Plan estimation increased the human estimate from the Refine baseline of 16h to 20h while retaining Size L, so there is no size-tier increase and no two-tier pause condition.

## Dependency Map

Depends on: none

Blocks: none
