# #1857 Durable runtime and safe cleanup design

## Scope and intent

Keep ordinary docs and every file format in .scratch/ and .tmp/ freely authorable, independent of binding, ownership and lifecycle. Both volatile directories may be modified or deleted at any time. Move all AITM-owned durable runtime dependencies below .ai-task-manager/runtime/ and provide an AITM cleanup skill that inventories and safely applies approved obsolete-file, worktree and branch cleanup.

This expands the original artifact-policy defect at the user's explicit request. Preserve implementation commit 26ccdd57f2815ef85ed0c1ed0ca3a8bce739a54d and its four acceptance declarations. Do not create a dependency on #1847 or nested issues. No current worktree, local branch or origin ref is authorized for mass deletion by implementing this capability.

## Story Intent

- **Beneficiary:** A workspace operator preparing and maintaining delivery work.
- **Capability:** Author disposable artifacts freely while preserving durable workflow state and safely retiring verified obsolete work.
- **Need:** Artifact guards block preparatory work, while authoritative state in freely writable temporary directories can be changed or lost and stale work accumulates without sufficient retirement evidence.
- **Value or failure prevented:** Operators can prepare artifacts and reclaim verified obsolete assets without forging workflow authority or losing active, unpublished or recoverable work.

## Existing evidence and selected approach

The shared artifact policy already admits physically contained docs/scratch/temp targets through source-edit, activity and Bash binding guards. mutation-context.mjs preserves installed-guard and symlink boundaries. Independent Opus review found missing installed-guard tests, stale shipped guidance, suffix omissions and the runtime escalation risk.

paths.mjs centralizes most runtime locations; config statePath/queuePath overrides, provider stateDir declarations, draft-branch journals, hook idempotency and action-capture have additional paths. Governed Test worktrees currently lie under .scratch, so their runtime would still inherit a parent artifact allowance. They must move too.

A .tmp carve-out was rejected by the user. A .db destination was superseded by the explicit .ai-task-manager destination. Select one durable runtime namespace with an explicit migration and no volatile fallback. Existing GitHub issue bodies/comments and native provider transcripts retain their canonical roles.

## Storage and access contract

Use .ai-task-manager/runtime/store/ for mutable runtime data and .ai-task-manager/runtime/control.json plus runtime/migrations/ for activation and recovery. All remain below the protected runtime prefix. Document purpose, durable versus volatile data, authority sources, migration and permitted access in tracked .ai-task-manager/README.md. Ignore runtime data; do not commit local identities or recovery payloads.

Worktree-local store families: state and publication queue, sessions/active-task, gates, issue/timing locks, verifier-result cache, provider mirrors/cursors, draft-branch journal and governed Test sandboxes. Main-worktree store families: fleet, occupancy, closed-bindings, orchestrator lock, hook idempotency, action capture and the old ready-for-plan freeze journal. Retain each current anchor; never share a worktree's active binding accidentally.

Verifier caches and transcript mirrors remain noncanonical but can influence evidence production, so protect their persistence. Develop/Test receipts are validated and published in GitHub body markers; local stdout logs are not trusted receipt storage. Canonical issue timing remains its GitHub comment. Advisory run-tests performance output can stay in .tmp and is explicitly nonauthoritative.

All runtime path resolution passes through a single module and activation check. Existing state/queue/transcript overrides into .tmp, .scratch or physical aliases are refused with migration guidance. No fallback may read stale volatile authority after activation. Native host transcript roots remain native; local mirrors cannot override genuine provider selection merely because a file exists.

Direct file tools and inspectable shell writers must refuse physical runtime authority targets before artifact/chore allowances. Registered AITM lifecycle, migration and cleanup operations own runtime mutations. Preserve tracked .ai-task-manager configuration and template edits under ordinary source gates. This is a governed authoring boundary, not a claim of OS confinement against already-authorized arbitrary code execution.

## Explicit migration transaction

A registered migrate-runtime command has read-only plan and approved apply/resume modes. First inventory every participating linked worktree plus the main shared store. Require quiesced writers and claims, physical containment, regular expected files, supported schemas, unique sources and nonconflicting destinations. Unknown entries, symlinks, ambiguous duplicates and changed snapshots are blockers; do not silently discard them.

The plan records exact source hashes, destination preconditions, repository/worktree identity and an operator-approved trust decision for legacy data. Legacy .tmp was writable, so existence alone cannot confer provenance. No guard may auto-import it on first read.

Under one main runtime migration lock, stage complete destination stores, verify hashes and record prepared state. Publish each root by rename and journal progress. Several roots cannot share one filesystem atomic rename: during any partial publication, normal runtime access fails closed against the main transaction state. Resume reconciles exact prepared/published hashes; conflicts stop without compensation that destroys source or destination work. Mark activation complete only when every participating root is verified.

After activation, only new stores control workflow. Keep originals inert for audit until a later separately approved cleanup. Recreated, deleted or tampered old .tmp/.scratch/.db records never regain authority. Fresh installs with no legacy runtime initialize an empty valid store; missing/corrupt required records in an activated store never cause a legacy fallback or implicit grant.

Governed Test worktrees must reside beneath durable runtime, and their reaper must agree. Temporary isolated fixtures and performance logs may remain volatile because they cannot control production admission.

## Artifact-policy review corrections

Retain the existing all-state artifact matrix. Add .scratch installed-guard .md and physical alias regressions across activity, source-edit runHook and Bash binding; these must fail if the installed interlock is removed. Add docs suffixes .mts, .cts, .ksh, .php and .lua while retaining all scratch/temp formats. No content sniffing of fenced Markdown or extensionless text is implied.

Remove redundant scratch allowance branches only after the shared-path tests cover them. Correct the filesystem-aware worktree-guard header/import ordering. Update shipped plan-mode-backlog guidance and CLAUDE Bash wording consistently. Keep research scripts excluded from both npm packaging and c8 coverage; repair the old fixture example. Seven original research helpers remain byte-preserved.

## Cleanup skill and command

Ship skill/cleanup/SKILL.md with project-local provider discovery stubs beside the existing task skill. Use existing provider installTarget parents and stub/symlink modes, safe owned uninstall checks, package inclusion and guidance release parity. Do not modify global skills. The skill routes deterministic work through a registered cleanup command.

Default mode produces a reviewable typed plan. Each candidate carries exact path/ref identity, kind, reason codes, observed hashes/OIDs, canonical evidence sources, protected references, unknowns and proposed action. Age is descriptive, never authority. Unknown files/schemas, tracked config/templates/memory, active bindings/occupancy/locks, pending queues, recovery and audit/evidence records remain protected.

Approved file apply rechecks all inputs and removes only positively identified obsolete owned data with no live, recovery or audit reference. No wildcard purge or instructions read from discovered files. A plan is an immutable snapshot, not perpetual permission; changed evidence invalidates an action.

## Worktree retirement and branch pruning

Inventory Git worktrees and AITM claims alongside live issue disposition, delivery/content reachability, publication, dirtiness, untracked and needed ignored work, main/current/pinned/shared status and host attachments. Missing authority yields unknown/protected. Closed issue status alone never authorizes removal.

For native managed worktrees, use the host's recoverable archive operation and attachment safeguards. For ordinary Git worktrees, use bounded removal only after all exact approved fresh checks pass. Do not force-remove dirty work. After successful retirement, verify no surviving worktree checks out the branch, then compare-and-delete only its exact approved local ref/OID. Failure after archival preserves the branch for reconciliation; never delete it first.

Origin cleanup is separate. Pin an exact fresh remote branch OID and prove its full contents integrated into fresh trunk. Exclude trunk, default/protected refs, active work and unknown evidence. Delete an approved ref with an explicit expected-OID lease; concurrent branch advances or trunk rewrites refuse. Reconcile uncertain network outcomes before retrying. No remote branch removal implicitly removes a local branch or worktree.

An origin-deleted branch is not retirement evidence. Active local work survives and can be pushed afresh later.

## Full-content integration proof

An exact candidate tip that is an ancestor of freshly observed trunk has complete commit containment. For squash/rebase, require complete source inventory bound to the exact candidate tip and reuse verifyObservedIntegration in delivery-integration-proof.mjs with the Git-backed virtual-merge content comparison in deliver.mjs. Prove integration commit reachability and complete equivalent delta; rebase additionally proves ordered replay and total equivalence. Partial replay, conflicts, missing objects/inventory, ambiguous PR association or post-PR additions refuse. Merged labels, messages, deleted refs or patch-id alone are insufficient.

Git operations use validated refs and argument arrays. Multi-action cleanup is journaled per action; it is not falsely presented as one transaction across Git, GitHub and native hosts. Runtime recovery state precedes destruction.

## Repository policy observation

The controller applied GitHub delete_branch_on_merge=true for kburson/ai-task-manager and verified a fresh cache-busted GET around 2026-09-30T20:18Z. The default branch is trunk. A plain GET returned stale cached false; the fresh result is the relevant observation. This setting is not proof that any local work is retired.

## Requirement identifiers and workflow authority

- **R1:** Preserve unrestricted physical docs/artifact policy, all scratch/tmp formats and installed-guard interlocks, including the independent review corrections.
- **R2:** Move every AITM-owned durable runtime dependency to the worktree/main split under .ai-task-manager/runtime; preserve canonical GitHub and native-host authority.
- **R3:** Explicit quiesced multi-root migration preserves genuine data, refuses ambiguous trust/conflicts and resumes interrupted publication without volatile fallback.
- **R4:** Durable runtime protection precedes artifact/chore allowances; volatile deletion/tampering and configured-path aliases cannot control admission.
- **R5:** Ship the cleanup skill and registered typed file inventory/plan/apply with active, recovery, audit and tracked-content protections.
- **R6:** Retire eligible managed or ordinary worktrees through their proper authority, then prune the exact local branch only after fresh safeguards.
- **R7:** Prune eligible origin branches with full-content proof and exact OID lease; missing origin alone never retires local work.
- **R8:** Preserve installation, upgrade, uninstall ownership, package and provider discovery parity; document persistence/access and prove skill behavior.
- **R9:** Preserve original acceptance declarations, honest forecast/approval provenance, engagement timing and normal exact-SHA verification/review/delivery gates.

This is in-place Develop rework. Current registered lifecycle guidance provides no Develop-to-Plan reentry, and current user-story guidance does not retroactively reopen Develop. The existing Plan approval and forecast 01M3SS09DEQCABP49A5D1B7EDV remain historical original-scope evidence, not renewed approval or an expanded adaptive forecast. Preserve the four original AC declarations and all protected markers byte-for-byte. New requirements are plain Scope obligations and R1–R9 review/test mappings; only ordinary new Verification Command IDs may be appended through admitted issue-body operations. No proof is fabricated. If future canonical AC backfill requires #1847's capability, record that administrative cost without making it a dependency or waiving any expanded requirement.

Controller read-only inventory observed 36 Git worktrees, 154 local heads, 220 remote-tracking refs and 219 actual GitHub branches. Ten local heads were preliminarily reachable from cached trunk. These counts are context, never deletion evidence. Stale remote-tracking refs are local cache entries: fetch-prune differs from deleting an actual origin ref or retiring a local branch.

## Verification and acceptance

Preserve the original four ACs and seven VC IDs. Append targeted runtime migration, volatile-tamper, cleanup and installer Verification Commands as new ordinary IDs through the registered invariant-preserving issue-body route; do not add or change protected AC declarations. Never tick evidence before execution. Required adversarial coverage includes migration conflicts/crashes, symlinks, no old fallback, configured-path refusal, sandbox placement, active/recovery protection, exact OID races, origin-deleted active work, dirty/unpublished work and substantive squash/rebase mismatch.

The controller runs an isolated skill scenario RED baseline before SKILL.md authoring, then evaluates the completed skill without implementer helper agents. Finish with full declared suites, lint/format, exact-path commits, exact-SHA receipts and independent review. No production release follows this document alone.

## Estimate and delivery sequence

Plan input: 16–24 additional engineering hours beyond the initial committed artifact fix (runtime8–12, base cleanup4–6, actionable branch cleanup4–6). This is a forecast input, not elapsed time or a replacement for adaptive estimate authority. Execute the plan's internal units in this single user-requested issue; do not bypass a decomposition refusal. The prior M/4h planning statement is superseded for expanded work.
