# #1847 Refine evidence and scope acceptance

This report grounds the accepted specification at artifact commit
`3bb590b5702754f4d222ce43262291083eb28b99` and XPR finalization
`9b9825cee89e6dde1f73d664f19e09429481248d`.
The human instructed continuation through normal delivery gates using the verified
local peer-review build; this is implementation direction, not authorization of
a future consumer criteria-revision proposal.

## Concrete Refine obligations

| Obligation | Evidence and decision |
| --- | --- |
| Cooperative writer topology | The bound worktree is `/Users/kpburson/.codex/worktrees/1847-draft/ai-task-manager`, branch `codex/1847-draft`. `git rev-parse --git-common-dir` resolves `/Users/kpburson/projects/Vibe-Coding/ai-task-manager/.git`; the package self-link resolves this exact worktree. Implement shared interlock and admission state below that common directory. Domain registration is explicit and default-disabled; independent clones/hosts remain refused. This bounded deployment is accepted for this local consumer. |
| Archive ceiling | Read-only #124 body has 16,151 UTF-8 bytes (16,479 as a JSON string). A non-executable fixture archives the full body, AC/VC declarations, and current referenced forecast/approval/scope records. Compact fixture JSON is 26,141 bytes. Reserving another 16,000 bytes for concrete proposal identities, mappings, invalidation, write-set, provenance, and envelope yields 42,141 bytes, leaving 17,859 bytes below the 60,000-byte ceiling. This is a sizing assessment, not a successful production prepare: the complete rendered event must still pass the exact production cap before any write. No live #124 criteria changed. |
| Later-stage boundary | #124 is actually Develop. The accepted design's Develop reapproval path covers the motivating case. Existing Test/Review demotion is code-rework-only; criteria-only later-stage replanning remains explicitly unsupported. No fabricated code-rework reason or stage skip is allowed. |
| Actual host message format | Read-only native Codex transcript metadata inspected by the orchestrator contained 22 `response_item` user records, all with `payload.id`; the latest four each had one `input_text` block. The direct human continuation request has host ID `msg_01a0f2db-1795-7940-bc45-a7724cf0fd60`. This establishes real host-provided identifiers and raw-block availability. The existing loader trims blocks, so the revision adapter must validate original bytes first. Forwarded agent messages and this report cannot approve a proposal. Unsupported or ambiguous actual source formats refuse. |
| Consumer inventory | The implementation plan enumerates low-level body and canonical writers, lock-owning public verbs, hook admission, bind, proof generators, lifecycle evaluation, reconciliation, delivery and close. Coverage is executable: a registry/audit test must fail when a covered writer is omitted. |

The #124 sizing source records are:
- Forecast: https://github.com/kburson/ai-peer-review/issues/124#issuecomment-5896077136
- Plan transition: https://github.com/kburson/ai-peer-review/issues/124#issuecomment-5896128348
- Approval provenance: https://github.com/kburson/ai-peer-review/issues/124#issuecomment-5896659146
- Superseding scope: https://github.com/kburson/ai-peer-review/issues/124#issuecomment-5901265966

The fixture is local audit input, explicitly non-executable and without
authorization. Timing/history comments remain preserved on GitHub; they are not
new current approval or proof. Production preparation must discover and archive
every actual affected authority record; the fixture's selection is not an
allowlist that may omit newly discovered evidence.

## Scope, estimate and decomposition

The normal Refine entry succeeded: Backlog → Refine, XL, 48 human hours, P1,
rank 1, existing bug classification. Work breakdown:
exact proposal/authorization 6h; durable log/recovery 8h; shared local interlock
and admission 8h; legacy invalidation 8h; canonical amendment/Plan reapproval 8h;
consumer wiring and verification 10h. These are rough necessary human work,
not agent elapsed time.

Registered `aitm decompose-check 1847 --json` returned exit 3,
`effectiveStatus: must-split`, because estimate 48 exceeds threshold 24.
There is no waiver. The parent remains #1847 and owns the complete accepted
deliverable; numbered plan tasks must become sanctioned child issues before
implementation. Do not lower the estimate, rename tasks, or invent an approval
to bypass that result. The detailed plan may redistribute hours without
discarding required scope.

## Concrete producer/consumer inventory

| Surface | Exact baseline entry points | Required integration |
| --- | --- | --- |
| Body authority | `lib/issue-body-mutate.mjs::mutateIssueBody`, `lib/versioned-issue-write.mjs::versionedWriteBody`, compatibility `lib/issue-body-push.mjs` | Guard low-level direct paths as well as wrapper; exact internal retirement capability; all ordinary invariants retained. |
| Existing lock owners | `issue-mutator-lock.mjs::withIssueLock`; promote, reconcile, approve, test, assign/unassign, pull-next, shelve, cancel-plan, action-ledger, estimation/record-claim, draft-branch; `lib/repository-adapter.mjs::withBoundaryLock` | Strict common-directory interlock must be outermost; determine multi-issue lock set before acquisition. |
| Body-producing helpers | deep-dive/markers/state-recording, verification-receipt-retirement, functional-dod-derive, evidence-v2/runtime-adapter, estimation/runtime-adapter, resident-action-ledger-write, shelve-transaction, discuss markers, close-disposition; scaffold-web-issue/log-issue-time/epic-metadata | Enumerate through shared body chokepoint and direct-import/call audit; timing/history-only content must not be mistaken for current semantic authority. |
| Canonical authority | `github-records/contract-write.mjs::writeDirectoryContractOperation`, `capsule-chain.mjs::appendCapsule`, lifecycle-transition, adopt-github-records, singleton-initializer | Interlock before pre-write reads; exact grant/epoch/revision; update/read-back projections; cover direct capsule/projection routes. |
| Comment semantics | github-comment-store create/update and owned-comment upsert | Authority-bearing writers require semantic capability; unrelated historical/timing comments do not acquire false current authority and are not unnecessarily fenced. |
| Projection repair | `github-records/projection-repair.mjs::repairIssueProjections`, lifecycle-transition authority, reconciliation/adoption | Existing durable transition capability plus revision fence/interlock; no synthesized fence clearance or epoch rollback. |
| Plan | plan-approve, story-approval-binding-guard, plan-transition-authority, action-decision Plan guards | Shared fresh source validation plus current revision/digest and real canonical persistence. |
| Proof/Test | ac-stamp, dod-stamp/check, evidence-v2 eligibility/subject/runtime-adapter, develop-exit-receipt-guard, Develop finalization, verification receipt parsing | Pending fence; subject/command/revision binding; only exact legacy preserved-individual exception. |
| Review/completion | Review projected guards/exact Test receipt/functional DoD; approve; deliver verification/authority; close delivery/review/projections; canonical lifecycle-gate-source | Shared complete chain observation and fresh current authority; reject pre-revision aggregate proof. |
| Local activity/session | activity-guard, source-edit-gate, bind/reconcile, resident-action-runner and delegated ledger paths | Read atomic shared admission on each local mutation; refresh under strict interlock at bind/gates; no GitHub request on every edit. |

Paths in this table are under `scripts/task-tracker/` unless identified as
GitHub scaffolding. Tests must exercise the real adapters with effect spies.
A source walker/import-call audit checks coverage against concrete root seams,
ignoring comment text and fixture pseudo-calls. Listing command names alone is
not sufficient. Task 5 owns closing any discovered direct path before enablement
can report ready.

## Explicit operator and compatibility decisions

Name the operator bootstrap `aitm criteria-revise enable`. It registers the
runtime-derived local common-directory domain, quiescence acknowledgement, and
schema version; no caller-selected arbitrary lock root is accepted. It performs
authoritative refresh for bound issues before allowing local activity. It never
silently enables on install, bind, ordinary edit, or prepare. Moving/disabling a
domain while a transaction is pending refuses. `status` describes unsupported
or dirty admission without changing it. Read-only `prepare` never enables a
domain or changes task bindings.

Registering this explicit operator action does not expand the sealed mutation
request: `apply` and `recover` still accept only the closed proposal and
authorization source. It makes the accepted design's domain-enablement obligation
operable and visible in sizing.

## Source-grounded risks and required validation

- `issue-mutator-lock.mjs` is worktree-local and honors inherited string state;
  it is not the new strict common-directory interlock.
- `mutateIssueBody` and `versionedWriteBody` already enforce fresh-base and
  ordinary invariants. Internal transaction capabilities must be exact and
  unforgeable through a public flag; ordinary callers keep all protections.
- Canonical `contract-write.mjs` supports set-check, record-evidence, seal and
  invalidate, but not semantic amendment persistence; that extension is real work.
- `plan-approve.mjs` refuses directory authority and needs the scoped canonical
  adapter plus revision-specific Develop admission. Existing unrelated Plan
  checks remain required.
- No local hook projection is remote authority. Publish deny before effects,
  validate full remote chains at bind/gates, and restore allow only after exact
  read-back. Uncertainty blocks rather than manufacturing completion.

Refine accepts these bounded design choices and costs as a planning input.
This report is not Plan approval, code completion, verification proof, or a
consumer mutation authorization.
