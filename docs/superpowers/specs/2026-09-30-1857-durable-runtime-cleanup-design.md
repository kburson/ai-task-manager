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

## Root identity, corruption and persistence limits

Production resolution first obtains the physical Git worktree root from the invoking checkout, independent of environment overrides. Every project-root environment override, including AI_TASK_MANAGER_PROJECT_DIR, TASK_TRACKER_PROJECT_DIR, CLAUDE_PROJECT_DIR and any future alias, remains supported only when their real paths identify that same worktree or an explicitly selected, Git-registered target worktree admitted by the existing foreign-worktree contract. Reject a target whose physical location is below docs/, .scratch/ or .tmp/ of any enclosing project root, including symlink aliases and a nested Git repository placed inside those directories. A purported control.json in such a location cannot activate production authority.

Tests retain isolated roots through explicit dependency-injected filesystem/root adapters in test processes, with no environment-variable flag that enables a production bypass. CLI/guard integration fixtures use real isolated Git roots outside artifact-allowed project subtrees. An environment override by itself is never test authority. Add tests for every recognized variable, lexical and physical aliases, nested Git roots and a forged activated store; assert the production guard refuses before reading the forged records.

All environment-derived root selection must route through the single validated resolver, including scripts/task-tracker/lib/project-dir.mjs, lib/worktree-binding-guard.mjs, lib/worktree-binding-lifecycle.mjs, word-counter.mjs, epic-base-edit-guard.mjs, commit-trail-handler.mjs and lib/scratch-dir.mjs. Preserve intentional precedence only as explicit resolver input policy; do not retain independent unchecked env fallbacks. The resolver owns one documented recognized-alias table. Add a source characterization/lint test that rejects new direct environment root reads outside that module, covering process.env, injected env objects, destructuring and computed known PROJECT_DIR aliases. Existing legitimate environment forwarding in the Test launcher is documented as forwarding rather than a second root resolver and must be validated on consumption. Adding a future alias requires adding it to the central table and adversarial matrix.

The governed Test verb's AI_TASK_MANAGER_PROJECT_DIR: wtPath handoff is admitted because wtPath is the exact Git-registered sandbox worktree below the durable runtime prefix, with fresh worktree identity/ownership validation. It does not inherit main-worktree authority; its state, gates, queue and sessions retain the sandbox-local root. No special test environment flag bypasses this validation.

For any supported state path P, projectDirForState(P) must return the exact physical owning worktree recorded by the root resolver. Match the rightmost exact /.ai-task-manager/runtime/store/ state-container suffix, then verify it against that owner; do not infer ownership from an outer .ai-task-manager host segment. Remove the .tmp/aitm anchor and loadState legacy fallback from production resolution. In a Test sandbox nested below another worktree's durable runtime, its own state, sessions, gates and queues must resolve to the sandbox, never the enclosing main/worktree. Ambiguous or mismatched ownership refuses. Legacy path interpretation exists only inside the explicit migration inventory.

Activated-store missing required files, malformed JSON or unsupported schemas yield typed refusal; replace loadState's current corrupt-JSON-to-empty-object behavior. Optional absent records have explicitly declared empty defaults and never grant binding or gate authority. This durability promise means survival of volatile-directory cleanup, not survival of deleting all ignored files, disk loss or a fresh clone. Complete local runtime loss requires explicit empty-store initialization with no inherited grants and reconciliation of canonical GitHub/native-host evidence; partially missing stores refuse as corruption. Cleanup must never propose deletion of the runtime root, control record, store root or recovery namespace.

## Explicit migration transaction

A registered migrate-runtime command has read-only plan and approved apply/resume modes. First inventory every participating linked worktree plus the main shared store. Require quiesced writers and claims, physical containment, regular expected files, supported schemas, unique sources and nonconflicting destinations. Unknown entries, symlinks, ambiguous duplicates and changed snapshots are blockers; do not silently discard them.

The plan records exact source hashes, destination preconditions, repository/worktree identity and an operator-approved trust decision for legacy data. Legacy .tmp was writable, so existence alone cannot confer provenance. No guard may auto-import it on first read.

Under one main runtime migration lock, stage complete destination stores, verify hashes and record prepared state. Publish each root by rename and journal progress. Several roots cannot share one filesystem atomic rename: during any partial publication, normal runtime access fails closed against the main transaction state. Resume reconciles exact prepared/published hashes; conflicts stop without compensation that destroys source or destination work. Mark activation complete only when every participating root is verified.

After activation, only new stores control workflow. Keep originals inert for audit until a later separately approved cleanup. Recreated, deleted or tampered old .tmp/.scratch/.db records never regain authority. Fresh installs with no legacy runtime initialize an empty valid store; missing/corrupt required records in an activated store never cause a legacy fallback or implicit grant.

Governed Test worktrees must reside beneath durable runtime, and their reaper must agree. Temporary isolated fixtures and performance logs may remain volatile because they cannot control production admission.

## Migration bootstrap, quiescence and recovery admission

Registered migrate-runtime plan, status, apply and resume forms have a narrow bootstrap dispatcher before runtime-dependent binding/gate reads. Admission verifies the actual registered CLI executable, exact command/closed argument grammar, physical invoking/target Git roots and installed-guard integrity; it does not authorize arbitrary shell wrappers, compound suffixes or commands merely mentioning migrate-runtime. The handler may inspect transaction state without requiring an already activated store. Plan/status are read-only; apply/resume still require the exact approved plan digest, explicit legacy trust decisions and migration ownership. Ordinary commands continue to fail closed during incomplete publication.

The registered migrator is the sole bounded writer exception to quiescence. Its exact genuine provider session and process identity acquire the main migration lock, drain in-flight writes and fence every participating root before taking source hashes. Other live writers, claims or uncooperative older processes block migration. The migrator records its own engagement in the protected transaction audit ledger while fenced; it neither pauses working time nor rewrites a hashed legacy timing queue. At activation it reconciles/publishes that interval through normal timing semantics exactly once, retaining an idempotency record and any unresolved publication work. No copied identity or fabricated timer receipt is allowed.

Plan creation records approved participating roots. Apply revalidates that set and the Git worktree census under the fence; newly appearing or missing roots refuse until the plan is regenerated or an explicit reviewed recovery disposition is recorded. No old runtime reader/writer may remain live through activation. Source hashes are taken only after the exclusive fence; retained legacy bytes remain unchanged during publication. The new stores carry original queued work and exact genuine session records, including the paused/resumable status of other sessions.

On a crash, a fresh hooked session can invoke the same registered status/resume forms even while ordinary runtime access is refused. It must authenticate as a genuine current operator, recover the exact transaction under the exclusive lock and revalidate all recorded source/destination hashes. Stale lock recovery requires confirmed process death and exact transaction identity; age alone is insufficient. It cannot invent activation, trust decisions or replacement source bytes.

If the host hook transport itself cannot invoke the registered recovery route, the operator runs the same installed registered CLI directly from a local terminal at the recorded physical worktree, with the exact transaction ID and approved digest printed by status. This is the documented recovery entrypoint, not manual JSON repair or a guard-disable procedure. If package/control integrity or storage prevents that handler from running, preserve all bytes and report a typed recovery-required error for restoration of the exact known package or operator-reviewed backup; do not silently initialize, delete control state or fallback to volatile files.

Required integration scenario: begin approved migration with a genuinely engaged migrator, inject a process crash after one root publishes, confirm ordinary hooked lifecycle commands refuse, then invoke registered status/resume through the hooked command classifier from a fresh session. Confirm all roots activate, original timing/queue data survives, migrator engagement is reconciled once and old volatile tampering never controls admission.

## Artifact-policy review corrections

Retain the existing all-state artifact matrix. Add .scratch installed-guard .md and physical alias regressions across activity, source-edit runHook and Bash binding; these must fail if the installed interlock is removed. Add docs suffixes .mts, .cts, .ksh, .php and .lua while retaining all scratch/temp formats. No content sniffing of fenced Markdown or extensionless text is implied.

Remove redundant scratch allowance branches only after the shared-path tests cover them. Correct the filesystem-aware worktree-guard header/import ordering. Update shipped plan-mode-backlog guidance and CLAUDE Bash wording consistently. Keep research scripts excluded from both npm packaging and c8 coverage; repair the old fixture example. Seven original research helpers remain byte-preserved.

## Cleanup skill and command

Use a separate canonical cleanup skill source at skill/cleanup/SKILL.md and provider adapters at skill/cleanup/adapters/claude/SKILL.md, skill/cleanup/adapters/codex/SKILL.md and skill/cleanup/adapters/grok/SKILL.md. Existing task adapters under skill/adapters/ remain unchanged; the cleanup adapters load the shared cleanup source, then the existing provider task adapter only when binding/lifecycle instructions are needed.

The discovery name is aitm-cleanup: install under .claude/skills/aitm-cleanup/, .agents/skills/aitm-cleanup/ and .grok/skills/aitm-cleanup/ respectively. Symlink mode targets the corresponding cleanup provider-adapter directory; stub mode writes a provider-specific SKILL.md with name aitm-cleanup, the cleanup trigger description and a pointer to the corresponding installed package cleanup adapter. Each adapter resolves ../../SKILL.md to the canonical cleanup source. Follow the existing installer package-path resolution instead of embedding this development checkout.

Before any install/update write, check the entire destination: absent or exact AITM-owned prior bytes/symlink may be installed/updated; an unowned directory, user-modified stub or unrelated symlink yields a typed collision with no overwrite or deletion. Owned uninstall removes only the exact installed stub/symlink manifest entries and preserves user additions and runtime data. Test all three providers, both modes, updates, package inclusion and collisions. Do not modify global skills. The skill routes deterministic work through the registered cleanup command and distinguishes proposals from verified applied outcomes.

Default mode produces a reviewable typed plan. Each candidate carries exact path/ref identity, kind, reason codes, observed hashes/OIDs, canonical evidence sources, protected references, unknowns and proposed action. Age is descriptive, never authority. Unknown files/schemas, tracked config/templates/memory, active bindings/occupancy/locks, pending queues, recovery and audit/evidence records remain protected.

Approved file apply rechecks all inputs and removes only positively identified obsolete owned data with no live, recovery or audit reference. No wildcard purge or instructions read from discovered files. A plan is an immutable snapshot, not perpetual permission; changed evidence invalidates an action.

## Worktree retirement and branch pruning

Inventory Git worktrees and AITM claims alongside live issue disposition, delivery/content reachability, publication, dirtiness, untracked and needed ignored work, main/current/pinned/shared status and host attachments. Missing authority yields unknown/protected. Closed issue status alone never authorizes removal.

For Codex-managed worktrees, the supported host capability is Codex app archive_worktree using the exact identityKey returned by list_artifacts; it creates a recoverable snapshot and enforces pinned/shared/attachment safeguards. AITM CLI does not pretend that a shell subprocess can invoke this host tool. Its typed native-host handoff binds the approved candidate, worktree identity, branch/OID and required pre/post observations; the active host executes archive_worktree and returns its actual receipt, which cleanup revalidates before local branch pruning. Missing host capability or attachment authority yields protected with reason native-archive-unavailable and an actionable host handoff, never silent omission or raw Git removal.

Claude .claude/worktrees roots are recognized as host-managed but no corresponding invocable recoverable archive API is established in this design. They remain protected with a typed unsupported-host-archive reason and operator handoff; no successful retirement is claimed. Future adapters require an independently established host archive contract before apply eligibility. Host classification uses provenance/registration plus physical host-root evidence; uncertain classification is protected. Ordinary Git worktrees cannot be substituted for a managed root to avoid this rule. For ordinary Git worktrees, use bounded removal only after all exact approved fresh checks pass. Do not force-remove dirty work. After successful retirement, verify no surviving worktree checks out the branch, then compare-and-delete only its exact approved local ref/OID. Failure after archival preserves the branch for reconciliation; never delete it first.

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

Advisory planning range: 24–36 additional engineering hours beyond the initial committed artifact fix. The revised breakdown below supersedes earlier expanded-scope scratch ranges. It is not elapsed time or a replacement adaptive forecast. Execute the internal units in this single user-requested issue under the recorded in-place Develop ruling; the historical M/4h forecast remains original-scope evidence.

## Revised planning risk after independent review

The expanded advisory range is 24–36 engineering hours, superseding 16–24: runtime/protection/bootstrap/migration 14–20h, file cleanup and provider skill parity 4–6h, worktree/origin cleanup and proof 6–10h. This is an uncalibrated advisory range with migration provenance and host integration uncertainty, not a fresh adaptive Plan forecast. Implement and verify runtime relocation/recovery before enabling cleanup apply; cleanup depends on authoritative new-store reads. The implementation plan will be brought into exact agreement in the ordered plan phase, before any expanded source release.

## Root-reader conversion planning risk

The source review identified roughly 90 test files and 215 references using AI_TASK_MANAGER_PROJECT_DIR, including mkdtemp fixtures. Inventory them before execution and classify each as safe real-Git-root integration fixture, injected-adapter unit fixture or environment forwarding; do not mechanically initialize every fixture or add a production test bypass. Conversion and the registered Test sandbox handoff are explicit work within the 14–20h runtime slice and a material risk to its upper bound. The 24–36h total remains an advisory range, not a promise or renewed forecast; report actual conversion scope and reassess the range if measured work exceeds that assumption. Preserve the prior closed recovery, packaging, anchoring and host-archive decisions.
