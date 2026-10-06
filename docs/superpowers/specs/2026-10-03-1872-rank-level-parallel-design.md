# Authorized Rank-Level Epic Admission

## Status and intent

Draft for controller and independent read-only review. Issue #1872 is in Refine; this document authorizes no source implementation or consumer installation.

- **Beneficiary:** Epic orchestrators delivering independent stories.
- **Capability:** Run an explicitly authorized rank level in isolated child worktrees while enforcing every lower-rank completion barrier.
- **Need:** The installed sequential WIP gate refuses a second same-rank child even when the maintainer explicitly authorized independent parallel delivery.
- **Value or failure prevented:** Reduce delivery time without admitting unfinished dependencies, sharing authority identities, or weakening review and verification.

Source baseline is `171c7d93866f67b58effa635be5ae737f54ef9eb`. Consumer incident is ai-peer-review #107 rank 2, children #140/#144/#145. The user requires actual Done for every lower child. Single Claude Opus 5.5 high PR diff review follows exact-head green CI; AIPR consensus is outside this feature.

## Authority and scope

Sequential admission remains the default. A valid recorded rank-wave authorization changes admission only for its exact repository, epic, rank and members. Missing, unreadable, malformed, revoked, expired or stale authorization cannot permit parallel execution. A present invalid record is a typed refusal rather than an invisible return to sequential behavior.

This work changes shared admission policy and its registered orchestration action. It does not change native hook identity, reviewer protocols, issue closure, Done semantics, installed consumer copies, or unrelated workflow exceptions. #1841 retains native child hook ownership. Existing immutable accepted artifacts remain unchanged.

## Existing seams and defects

`epic-children-gate.mjs` has three relevant paths: `findNextEligibleChild` rejects any active sibling and sorts blocking-first; `wipAdvanceDecision` permits only one active child; `planRefineWipGate` reads current parent/children for the registered R4P-to-Plan guard. `pull-next.mjs` separately rejects active children before invoking selection. Explain evaluates the registered guard but must receive the same observation inputs.

`wave-admission.mjs` excludes lower Backlog/R4P children and coerces every closed issue to `state: done`. `isAcceptedTerminalChild` accepts Not Planned. Those observations do not prove the requested completed-Done barrier.

The existing schema-1 orchestration marker freezes strict sequential execution and mutable child states. A parallel authorization must reconcile this existing authority through a registered action. Frozen graph identity must exclude ordinary state progress.

Existing per-issue locks reside under the invoking project directory. Taking a parent-number lock from different child worktrees does not necessarily share a physical lock. Direct Promote already takes a child lock; adding a parent lock beneath it would invert pull-next's parent-before-child order.

## Alternatives and selected design

1. Recommended: separate versioned, provenance-verified rank-wave authorization, one shared evaluator, and a physical clone-wide admission lock. This scopes the new capability and preserves sequential compatibility.
2. A global WIP configuration toggle would permit unrelated waves and lacks frozen graph, revocation and isolation authority. Rejected.
3. Encoding parallel behavior only in pull-next would leave direct Plan and Explain inconsistent. Rejected.

## Frozen graph and live observations

The canonical graph contains every child once, ordered by issue number: issue number, finite non-negative rank, sorted explicit blocker IDs, and exact validated refinement snapshot identity. A terminal child's retained refinement identity remains evidence; closure must not make a frozen graph lose its identity. Unknown or duplicate graph members, unreadable blocker lists, malformed snapshots and changed rank/refinement/dependency inputs refuse.

The graph digest excludes mutable lifecycle state, timing, verification stamps and unrelated issue prose. Normal Plan/Develop/Test/Review/Done progress does not invalidate authorization. Re-refinement, dependency edits or child membership changes do invalidate it. Each read includes actual board state, GitHub issue state/disposition, recovery evidence and dependency readiness separately.

The authorized rank's exact membership must equal all children at that rank. Partial authorization cannot silently omit a same-rank child. Bindings contain issue, canonical physical worktree, actual branch, genuine provider/session identity and current occupancy binding generation. Paths must belong to the same verified Git common directory; physical roots, branches and native sessions must be distinct from siblings and the parent. Symlink aliases, missing checkout, detached branch, foreign clone, wrong occupancy issue/worktree/generation, shared native session and unverifiable native identity refuse.

Current location markers establish durable worktree/branch authority. Their `sid` can be stale because same-location binding does not append a new marker. Session proof therefore comes from the genuine active binding/occupancy and supported provider identity evidence; a caller-supplied session string or stale marker is insufficient. No synthetic identity or environment override is introduced.

## Rank completion and shared admission

One pure evaluator receives target child, complete current child observations, authorization state and verified isolation observations. It returns a typed decision containing `ok`, `code`, blocking children and remediation; callers do not reconstruct policy from strings.

An epic without schema-2 rank-level authority retains existing sequential behavior. Once the epic opts into schema-2 rank-level execution, the strict lower-Done barrier applies to EVERY target rank, including a rank without its own concurrency grant. Such an ungranted rank has a sequential WIP budget. Missing target-specific authority cannot route an opted-in epic back through the legacy lower-rank exclusions. A present expired, revoked or malformed target grant is a typed refusal, never selection of an older grant.

For an opted-in epic:

- Target must have current refinement and ready dependencies. Parallel admission additionally requires membership in the exact currently authorized rank wave; ungranted ranks remain sequential under the same strict completion barrier.
- EVERY strictly lower-ranked child must have actual board Done, GitHub CLOSED with COMPLETED disposition, no evidence error and no pending recovery transaction. Review, CODE_COMPLETE, pending PR, Backlog, R4P and Not Planned refuse.
- Active siblings at the same authorized rank are allowed only when their phase-appropriate bindings remain valid. Active siblings at any other rank refuse. An ungranted rank permits at most one active member.
- Higher rank cannot begin until every lower rank satisfies the strict barrier. Existing accepted-terminal predicates are not reused for this rule.
- Unknown or incomplete full graph/state/isolation observations refuse.

Candidate selection evaluates candidates through this same decision. Authorized mode uses rank first and stable issue-number order inside the rank. Sequential mode preserves its existing ordering. A typed refusal retains its reason when pull-next has no candidate; it cannot be laundered into a successful no-op.

The existing wave reader and WIP guard consume the shared authorized decision at the execution boundary. Direct Plan, direct Promote, pull-next and Explain agree for the same snapshot. Plan-to-Develop revalidates authorization, graph and binding for a wave member; revoked authority cannot permit a previously pulled member to start execution. Existing child-specific story, forecast, ownership and Plan approval gates remain required.

## Registered authorization action

Add `epic-wave prepare|record|resume|refresh|show|revoke <epic> --input-file <path> --json` to the canonical command routing/help/catalog. The caller must hold genuine parent orchestration authority; record and revoke do not bind children or mutate lifecycle states.

`prepare` reads the exact live graph and physical bindings and emits a closed proposal with digest and typed unmet obligations. `record` re-reads all observations under the shared parent admission lock, verifies the exact proposal digest and a supported host-verified human authorization source, and appends an immutable GitHub record. `show` is read-only. `revoke` appends a scoped revocation with the same provenance requirements. No request-file boolean or manually inserted body marker authorizes a wave.

Reuse `validateAuthorizationSource`, `resolveWorkflowExceptionAuthority` and `createCodexSessionSourceLoader` for authentic human-message provenance. The recorded decision must identify the authorized repository/epic/rank/membership and its exact proposal; unrelated human text is not wave authorization. Explicit prior user authorization remains usable when its scope unambiguously matches the proposal; no new approval is inferred from elapsed time or agent messages.

The versioned record includes schema, record ID/revision, repository/epic/rank/members, graph digest, immutable worktree/branch lineage, phase-aware binding policy and observations, proposal digest, human source/reference, recording actor, creation time and `expiresAt`. `expiresAt: null` explicitly means non-expiring; otherwise it is a valid UTC instant strictly after creation. Evaluation at or after that instant refuses. Revocation names the exact prior record. Readers select the highest valid revision first, then apply its revoked/expired status: neither expiry nor revocation can resurrect an older authorization. A conflicting or unreadable newer revision refuses.

### Authorization source scope

Human provenance validation alone is insufficient. The prepared proposal contains normalized repository, parent issue, rank and sorted complete membership. Scope normalization accepts either a direct complete human instruction or a bounded ordered transcript context linking an exact displayed proposal to its authentic human acceptance/clarification. No new canonical sentence or digest is required when existing user authorization already establishes that exact scope.

A closed contextual source lists exact message IDs/hashes in chronological order within one supported host session. The host-backed loader verifies every message, role, hash, source-session repository linkage and order. At most eight explicitly referenced messages participate; no unbounded transcript search or model inference. A displayed proposal must carry one exact scope or labeled alternatives with exact scopes. A human reply selecting its label is valid; a human `yes` is valid only for one exact proposal, or an explicitly recommended labeled proposal with no competing unresolved question. Later authentic human clarification may supply explicit rank/membership/epic details. The final normalized scope must be unique, complete and exactly match the prepared proposal. Explicit earlier rank-2 membership [140,144,145], isolated worktrees/branches and lower completion barrier followed by enablement confirmation can establish the same scope.

Repository and epic linkage must be explicit in a verified source message or the verified host task/project context referenced by those exact messages. Agent relays, injected/quoted authorization, ambiguous alternatives, missing linkage, contradictory later human statements and unrelated broad intent refuse. Exact hashes and references for both the displayed proposal and human reply are retained. The existing source resolver remains the human provenance verifier; a bounded source-context adapter and closed scope normalizer verify this contextual contract. Expanding scope or selecting a newly different proposal requires actual matching human authority; elapsed time and agent confirmation never supply it.

### Binding phases and explicit refresh

Workers can genuinely bind at Backlog/R4P before Plan; start does not depend on wave admission. Prepare/record therefore has no circular admission prerequisite. The physical worktree/branch lineage is frozen for every member, including completed members. Execution occupancy is phase-dependent:

- Target in R4P and any member in Plan/Develop require current genuine child occupancy and native identity for that exact issue/worktree/generation, distinct from parent and other implementation workers.
- A member in Test/Review may use the existing sanctioned child lifecycle handoff to the parent orchestrator. Retain its authenticated implementation lineage and validate the exact child target, parent orchestration identity and current lifecycle evidence. Sharing the orchestrator identity across lifecycle supervision is allowed; sharing implementation occupancy is not. This policy does not create a new Test/Review mutation route or bypass those verbs' own authority checks.
- A completed member requires retained authenticated physical lineage plus current strict completed Done and no pending recovery, and does not require a live worker lease. Completion cannot deadlock a still-running or newly admitted peer.

`refresh` appends an exact binding-revision record under the same parent admission lock. It names the prior record/binding digest, the one child, the old generation and the new host-verified generation, and records a positively verified release/handoff/recovery of the old implementation claim. It cannot change graph, wave membership, physical worktree, branch, binding policy or human authorization scope. It requires genuine parent orchestration authority and current child ownership; original human wave authorization explicitly covers this bounded continuation policy. Missing old-claim discharge or overlapping active generations refuse. A worktree/branch change requires a new prepared proposal and matching human authority, not refresh. No evaluator silently replaces a generation or treats pause/rebind as completion. A stopped worker with no sanctioned handoff/refresh cannot authorize new implementation admission. Readers verify record envelope integrity, authentic source and deterministic append-only revision selection. Conflicting revisions, duplicate IDs with different bytes and unverifiable comment history refuse.

After record acceptance, a scoped governed body transaction reconciles the schema-1 sequential orchestration marker to a schema-2 representation referencing the exact rank-wave record and stable graph digest. Existing Plan approval/story binding remains intact; affected parent orchestration contract is explicitly recorded. Comment/body partial publication cannot authorize admission until exact read-back proves both agree. The transaction is idempotent and refuses drift. Protected body-marker handling is extended only for this registered action.

### Partial publication and same-record recovery

Each prepared proposal has one immutable operation ID and record digest. If the GitHub record exists but body reconciliation or read-back fails, `show` reports `publication-incomplete`; admission refuses that unpublished authority. Registered `resume` names the SAME operation ID, expected record/comment identity and exact digest. Under the common parent lock it re-fetches the immutable record, authentic source, current graph, lineage and revocation history. It may complete only the missing body pointer/reconciliation and exact read-back for those identical bytes. It cannot append a second authorization comment, generate another record ID, alter the human source or change frozen graph/binding policy.

Graph drift, a revoked/expired record, a conflicting newer revision, tampered existing comment, unknown prior write outcome or a changed body contract produces typed refusal. A valid newer revocation is not an incomplete publication to repair. The operator must prepare a genuinely new authorized proposal when scope changes; resume never fabricates retroactive authority. A retry whose exact comment cannot yet be established remains indeterminate, preserving the original operation ID rather than posting again.

Concrete recovery seams are `lib/epic-rank-wave-authority.mjs` for immutable envelope/selection, `lib/epic-rank-wave-store.mjs` for publication inspection/resume, `verbs/epic-wave.mjs` for the registered route, and integration `epic-rank-wave-recovery.test.mjs` for comment-present/body-missing, retry-before-comment-observed, drift, revocation and tamper preservation.

## Clone-wide serialization

A dedicated admission-lock module resolves the physical Git common directory using sanitized Git discovery and uses one bounded lock location shared by every linked worktree in that clone. It does not repurpose worktree-local per-issue locks.

All admission and authorization mutations acquire the common parent admission lock FIRST, then any child issue lock, and retain it through live revalidation, one-edge effect and read-back. Direct Promote acquires the parent lock before its existing child lock; the pure `runPromote` path receives explicit lock context. Pull-next follows the same ordering and shares nested context without recursively acquiring the same lock. Two independent invocations still contend. Record, refresh, revoke, R4P-to-Plan and Plan-to-Develop all use this same physical lock; revocation concurrent with execution admission cannot pass through a different lock or stale read.

No issue state is held as a substitute for locking. Lock failure or unknown ownership refuses; no forced live-lock eviction or configuration bypass. Explain reads fresh authority but acquires no mutation lock and never promises its snapshot is an execution grant.

## Verification and delivery

TDD regressions exercise: authorized equal-rank concurrent admission; every lower state including closed Not Planned and closed/board-not-Done; default sequential behavior; partial/changed membership; refinement/blocker drift; revocation; malformed authority; unknown graph; shared worktree/branch/session; symlink/foreign clone; stale location sid; direct Plan/Explain/pull-next parity; Plan-to-Develop revalidation; and parent-before-child lock order.

Real-Git sibling worktree integration must prove all worktrees resolve the same physical admission lock and concurrent attempts serialize with fresh graph read-back. Include record/revoke racing Plan-to-Develop; first member completing and releasing occupancy before another enters Plan/Develop; implementation-worker to orchestrator Test/Review handoff while a peer continues; exact generation refresh; and unauthorized higher-rank selection with lower Backlog/R4P/Review children. A real installed consumer rehearsal must prove the sanctioned authorization can admit the actual #107 rank wave after reviewed code is packaged; fixtures alone do not establish that conformance.

Run the issue's focused unit/verb commands plus appropriate integration, full fast/slow suite, lint and format. Record every failure. After verified source commit, independent PR CI and the single Opus PR diff review, build the reviewed tarball. Vendored consumer dependency/lock/integrity replacement occurs only through its governed owning issue. Until that replacement and actual wave conformance pass, delivery remains pending.
