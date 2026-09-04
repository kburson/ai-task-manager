# Rewrite-stable evidence and cycle-scoped delivery — design specification

Date: 2026-09-03

Tracking: epic #1495. Status: proposed implementation contract; approved direction, not implementation or production-cutover approval.

Implementation plan: `docs/superpowers/plans/2026-09-03-1495-rewrite-stable-delivery.md`. Hydrated sequence: #1496 harness → #1497 evidence → #1498 delivery → #1499 cycles/cleanup → #1500 CLI/enrollment → #1501 frozen rehearsal.

## 1. Outcome and authorization boundary

AITM must identify work independently from a Git commit while preserving exact, auditable evidence of what was tested, accepted, delivered, and closed. A history-only rewrite must not require deleting truthful receipts. Reopening must create a new lifecycle cycle rather than contradicting a completed close from an earlier cycle.

This project is one bounded delivery epic with six sequential children. It is not a successor defect under #1490 and does not change that issue's present scope, board state, assignee, evidence, or bindings. The execution handoff confirms that Claude is halted on #1490. Preserve its local repair as a historical candidate; do not resume the old defect chase, shelve it, or change its evidence. #1488, #1485, #1226, and the `cloud-test-automation` branch remain untouched by planning and implementation. #1486 is separate behavior-preserving adapter cleanup and is not a prerequisite.

Production application to #1490, #1488, and #1485 requires successful disposable rehearsal, inspection of a fresh read-only migration report, and a separate explicit human go decision. A passing rehearsal is not a real delivery receipt.

## 2. Verified baseline and diagnosis

Planning baseline: `origin/trunk` at `18f2af8ae867dd893020218418ea9ed41e935ac2`; the main checkout is `cloud-test-automation` at `616c7a8fcb1b798ee0c590510318c5aac86d5626`. Pickup confirmed both refs and the clean epic worktree at published planning commit `7fbc1d636db612d1c7383237d2dc59b9d6a0735c`. Current trunk is its ancestor; the sole commit above trunk contains this specification and its plan. These remain observations to refresh before later execution.

| Source          | Recorded worktree                       | Accepted source SHA                        | Delivered SHA                              | Identical root tree                        |
| --------------- | --------------------------------------- | ------------------------------------------ | ------------------------------------------ | ------------------------------------------ |
| #1490, PR #1494 | `.worktrees/1490-squash-delivery-proof` | `ca60f6526e3cb399059d591c5a66b6d975901892` | `18f2af8ae867dd893020218418ea9ed41e935ac2` | `27df2f33338b116da0d3a2943cb59c45a34e66ce` |
| #1488, PR #1489 | `.worktrees/1488-review-bind-timer`     | `82eba885bac295a57c236c611c84e0fd6f69d7e3` | `3a044ea8411a9f0e34f54c33f412749cb735c457` | `0c2d454866446b347c1ecbd1f0d253909f5b12d3` |
| #1485, PR #1487 | `.worktrees/1485-merge-back-authority`  | `94575a4a009383c8749343c5c8023241c84ebd5c` | `f83eb22f6e60c26235da479c054edbdb3ee0755b` | `d23b0244d1baf60670f66907346dc32cb0be3571` |

The original #1490 completed transaction is `ad96d1e1-8c17-471e-a060-279975761e50`, accepted SHA `d6a3dece2c4c2e429cb27683e64316b3e216c71b`. At the earlier read-only audit its old release timestamp was `2026-09-03T01:51:22.821Z`; the same Claude session's later occupancy claim was `2026-09-03T04:58:36.386Z`. That audit observed OPEN/REOPENED, Review, Delivered. These are historical fixture inputs, not a claim about current lifecycle state.

The execution handoff reports #1490 Open/Develop with clean local repair `c52c4976c56709f1d8e5da211ded7cbf33a99cd5`, one commit above the planning trunk; pickup confirmed that local HEAD through the Git worktree inventory. It is not pushed, merged, accepted, or delivered. The handoff's remote remains `ca60f6526e3cb399059d591c5a66b6d975901892` from merged PR #1494, and the original completed transaction remains without a replacement. Do not rewrite these facts into a new receipt. Import the local object directly into independent rehearsal storage when needed; no preservation push is required. A full consistent provider/binding capture still belongs to #1501.

Carry these handoff review findings as regression scenarios, not accepted fixes or instructions to repair #1490:

- Authority-root resolution must agree from the main checkout and a linked source worktree. The historical candidate defaulted to `projectDir`, yielding `no-prior-close` in the linked worktree and `own-post-close-claim` in main.
- Exercise actual production defaults for active-binding discovery, record reading, and issue-state lookup; injected dependency functions alone do not prove the normal path.
- Cover board Done when the board effect succeeded but its response or checkpoint was lost. Prefixes with persisted checkpoints alone do not cover this crash window.
- Exercise terminal release through the full dispatcher and verb, including same-session newer generations and foreign claims; source-text assertions cannot prove branch behavior.

These findings were supplied by the execution handoff and were not rerun against the protected worktrees during refinement. Recovery later requires explicit reconciliation of deferred #1490 scope in addition to fresh migration previews and separate human go approval.

Current coupling points:

- `scripts/task-tracker/lib/verification-receipt.mjs`: fingerprints contain commit SHA; reuse rejects `sha-mismatch` even when other inputs match.
- `scripts/task-tracker/lib/delivery-authority.mjs`: acceptance joins Test/Review SHAs and selects a PR by exact head SHA.
- `scripts/task-tracker/lib/delivery-verification.mjs`: content equivalence is already part of a merge-method proof but is not an independent acceptance subject.
- `scripts/task-tracker/lib/close-convergence.mjs`: the terminal transaction carries accepted SHA and a single ordered prefix, but no issue lifecycle cycle.
- `scripts/task-tracker/lib/worktree-binding-lifecycle.mjs`: release timestamps protect later bindings, but do not identify the close transaction or claim generation.
- `scripts/task-tracker/lib/reopened-close-recovery.mjs` and `verbs/close.mjs`: historical completion is replaced to restart a reopened close; the baseline recognizes replacement retry only at zero steps and uses an old-release status as new-close authorization.
- The executable tool version follows the checkout too easily. Updating tooling by rebasing accepted source creates an unnecessary dependency between running AITM and the artifact under test.

Changing a SHA can change provenance without changing source content. Changing the source, requirements, verification recipe, dependencies, or relevant environment can invalidate reuse. Neither event makes an old successful execution historically false.

## 3. Decisions and non-goals

Adopt content-addressed evidence, explicit acceptance/delivery relationships, and cycle-scoped close/binding state. Reject three alternatives as the primary model: preserving exact-SHA equality everywhere with more recovery flags; substituting tree SHA everywhere without lifecycle separation; or treating patch-ID/AST similarity as authorization.

Global constraints, copied into the implementation plan:

1. Node.js 22+ and ESM; retain the repository's current package/runtime support policy.
2. No new database, distributed coordination service, mandatory signing service, or runtime dependency in this epic.
3. Existing v1 behavior remains the default until an issue is explicitly enrolled in v2; no silent legacy receipt upgrade or fallback after v2 enrollment.
4. Keep original evidence immutable as historical statements. Append relationships; do not fabricate executions, retroactive approval, or provider observations.
5. No production mutation of #1490/#1488/#1485 during implementation or rehearsal. No push, reset, rebase, merge, checkout, cleanup, or ref update in their source worktrees.
6. The first release supports one explicitly designated authority host per enrolled repository and serialized writers on that host. Other hosts are read-only; unsupported distributed mutation refuses before effects.
7. Execute children serially. Use recorded governed implementation worktrees and the existing one-step lifecycle gates. No automatic review approval, issue closure, or production cutover.
8. Rehearsal uses independent Git object storage and authority roots, a local bare remote, synthetic issue identities, and an offline write-capable provider double. Production network credentials and transport are unavailable to the rehearsal.
9. Hash raw content deterministically; use algorithm-tagged digests. Do not omit files, normalize source whitespace, or infer semantic equivalence to gain a passing match.
10. Acceptance, delivery, workflow completion, and local cleanup are separate facts; failed cleanup must never erase delivery or authorize clearing a later/foreign binding.

Out of scope: general semantic equivalence; patch-based test reuse; automatic cross-host leader election; CI/provider security redesign; removing all old markers; wholesale state-machine rewrite; performance-driven test-impact inference; changing #1226's target branch; automatic migration of every historical issue.

## 4. Identity and evidence model

All records have a versioned schema and an envelope containing `recordId`, `recordType`, `repositoryId`, `issueNumber`, `cycleId`, `operationId`, `predecessorId`, `actor`, `recordedAt`, and `payload`. `recordId` is the SHA-256 of canonical envelope content excluding `recordId`; canonical timestamps are fixed at operation creation, not regenerated on retry. The authority host persists the pending operation's timestamp, generated IDs, and canonical payload before the first remote append; on restart it first reconciles that operation against the remote journal. Repository identity is the provider repository node ID plus observed owner/name, not an interchangeable local path. References use immutable record IDs.

`cycleId` is a UUID assigned by a governed cycle-open operation. `operationId` is a caller-persisted UUID for one logical attempt. Neither is derived from a commit SHA, process ID, clock alone, or session ID. Multiple candidates and executions may belong to one open cycle. Reopen starts a new cycle; a rebase does not. Candidate/acceptance/delivery/close references must match their current issue/cycle. Only explicit predecessor-cycle and equivalence-to-prior-verification references may cross cycles, within the same repository/issue, after validating the complete historical record chain.

| Record type       | Required payload and meaning                                                                                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cycle-opened`    | predecessor cycle or null; reason `initial`, `reopen`, or `legacy-enrollment`; correlated external reopen event ID if applicable; authority-host ID                                        |
| `candidate`       | content fingerprint; source commit/tree observations; requirements digest; immutable source-retention locator                                                                              |
| `verification`    | candidate ID; recipe/environment fingerprints; actual commands, outcome, runner identity, original tested SHA, timestamps, preserved v1 receipt link where applicable                      |
| `equivalence`     | prior verification ID, destination candidate ID, exact compared inputs, policy ID/version, independently observed comparison result; never a claim of a new execution                      |
| `acceptance`      | candidate ID; requirements digest; eligible verification/equivalence IDs; human or explicit gate-bypass authority; policy/version; target repository/ref and permitted integration methods |
| `delivery-intent` | acceptance ID; explicit PR provider ID/number; expected provider head SHA for concurrency; target identity; requested method and authorized bytes                                          |
| `delivery`        | acceptance/intent IDs; explicit PR identity; landed commit/tree; target observation; content-verification result; provider method observation when available; actual transport result      |
| `close-started`   | delivery and acceptance IDs; expected cycle revision; close transaction ID; expected binding generation or explicit absent/paused observation; fixed operation keys for close effects      |
| `close-step`      | close transaction ID; step name; effect evidence and read-back; logical operation key; no inferred completion from a different cycle                                                       |
| `cycle-completed` | close transaction ID; all required workflow effects confirmed; final GitHub issue/board/disposition observation                                                                            |
| `cleanup`         | close transaction ID; exact binding-generation ownership; `released`, `already-released`, or `pending-conflict` with diagnostics                                                           |
| `legacy-import`   | original record bytes/digests, provider IDs and source locators, explicit import interpretation, current evidence eligibility, human-approved migration-plan digest                        |

The issue body carries a protected v2 enrollment/current-cycle projection, not the full ledger or independent authority. New v2 issue-body markers have dedicated strict codecs and narrowly named advancement rules. Generic marker-loss or unverified-tick bypasses remain prohibited.

## 5. Content fingerprint and reuse policy

`buildEvidenceSubject(input)` returns an immutable `aitm.evidence-subject/v2` value. Its identity input is:

```json
{
  "schema": "aitm.evidence-subject/v2",
  "repositoryId": "provider-repository-id",
  "source": {
    "objectFormat": "sha1",
    "treeOid": "full-root-tree-oid",
    "manifestDigest": "sha256:raw-source-manifest"
  },
  "requirementsDigest": "sha256:canonical-requirements",
  "recipeDigest": "sha256:commands-and-policy",
  "environmentDigest": "sha256:declared-execution-inputs",
  "gitInputs": { "sensitivity": "content-only", "digest": null }
}
```

This is a shape illustration, not acceptable runtime data: validators require real identifiers, full algorithm-appropriate OIDs, and independently computed digests.

The source manifest is a sorted list of raw repository paths, Git modes, object types, and content digests, including deletions through the full tree. It includes all tracked files. Submodules and LFS pointers are not their payloads: record resolved material digests or refuse reuse. Untracked/ignored inputs consumed by commands must be declared and hashed; dirty tracked input is not eligible for ordinary acceptance. Hash source bytes, not rendered diffs. Do not use a worktree absolute path as content identity.

Requirements are canonical AC/VC declarations, target contract, and relevant policy, excluding checkmarks, execution-proof stamps, clocks, and receipt markers so evidence does not invalidate itself. Semantically relevant text, command arguments, policy revisions, and AC-to-VC mappings remain inputs. A versioned normalizer owns this exact projection and golden tests.

Recipe includes ordered executable/argument vectors, resolved runner implementation/tool digest, lane coverage, and execution policy. Environment includes resolved dependency material/lockfile, Node/toolchain policy identity, platform, relevant config and declared environment values. Secrets are never stored or hashed into public records; tests requiring secret-dependent external state are non-reusable unless the provider gives a safe verifiable input identity.

Default Git sensitivity is `history-sensitive`, not content-only. Commands using ancestry, commit messages, tags, `git describe`, branch/ref names, SHA-derived versions, or diff-selected test lanes capture those inputs. Only a reviewed recipe declaration may classify a command content-only. For v1 receipts, missing input completeness yields `legacy-inputs-incomplete`; execute fresh verification. Do not backfill an unrecorded environment by observing it today.

Eligibility returns `{status: 'reuse'|'verify'|'refuse', reasons, priorVerificationId, candidateId}`:

- Identical complete declared inputs and a successful trusted prior execution: `reuse`, with appended equivalence evidence.
- Any source/input/policy/requirements change or unknown historical inputs: `verify`; preserve prior records.
- Malformed evidence, wrong identity/authority, ambiguous records, or unverifiable source material: `refuse`.

Human acceptance is not automatically copied. Explicit policy may allow acceptance of a proven identical candidate with unchanged requirements/target. Otherwise record new human acceptance. Git-specific hosted checks still run for their actual required head/merge context; AITM reuse cannot synthesize GitHub check results.

## 6. Delivery is an explicit relationship

Resolve PRs by the explicit provider PR ID in the intent/acceptance relationship, not by searching for a unique PR whose head equals an old accepted SHA. Still compare `expectedHeadSha` immediately before provider action to reject head races. Preserve observed source and merge SHAs as immutable provenance.

For the pilot, acceptance fixes the complete candidate tree for the resolved target state. A history-only rewrite/squash whose landed tree matches that accepted tree may carry acceptance through the explicit relationship. If target advancement changes the integration tree, create and verify a new candidate before acceptance/delivery. This intentionally rejects an unchanged patch over changed dependencies without proof.

A trusted delivery resolver must verify repository/PR/target identity, authorized actor or intent, landed object material, candidate equality, target membership, and provider observations. Equal trees alone are not attribution or authority. Token-only commit messages are not authoritative identity. Retain the configured squash-only policy by default: content proof does not waive merge-method policy. Introduce an explicit policy option only if the human chooses method-agnostic delivery; missing required method evidence still refuses under squash-only policy.

After a verified delivery, normal advancement of the target or local source branch does not erase that historical fact. Close consumes the accepted delivery record, not current checkout HEAD. Explicit revert/non-delivery evidence before close is surfaced as a current delivery-eligibility conflict; plain target advancement is not a conflict. Never reinterpret a force-rewritten or unverifiable remote as successful delivery without preserved, trusted provenance and the configured target policy.

## 7. Cycles, close effects, and binding generations

`projectCycle(records)` returns one current cycle and its candidate/acceptance/delivery/close state. Forked cycle successors, missing predecessors, changed immutable payloads, duplicate logical keys with different content, and cross-issue references refuse. The projection never chooses the newest timestamp or first comment as authority.

A governed reopen requires explicit human authority, preserves completed cycle history, and appends exactly one successor correlated to a durable operation ID. Raw GitHub reopen is observed as external drift: read-only commands report `cycle-reconciliation-required`; an explicitly approved reconciliation correlates the provider reopen event to one successor. Repeated reads/retries must not create additional cycles. New source candidates within an open cycle do not create new cycles.

The close service is a state machine outside the large legacy verb. `planCloseEffects({cycle, live, authority})` is pure and emits the next effect and expected state. `executeCloseEffect({plan, ports})` applies only that effect and appends verified progress. Existing timing, estimation, lifecycle, board, disposition, issue-close and label semantics remain, but their idempotency keys include cycle and close transaction. No timing row, move-complete marker, or receipt from an older cycle may satisfy the new cycle. Effects may execute at least once; idempotent keys and live verification provide convergence, not a fictitious atomic transaction across GitHub and local files.

A binding claim receives a random `bindingGenerationId` when newly claimed. Heartbeat/pause preserve it; rebind after release creates a new one. Close records the exact claim generation it may release. Compare-and-clear checks repository, issue, cycle, session, worktree authority, and generation under the local authority lock. An older close cannot clear a newer generation even within the same session. Legacy timestamp-only bindings require explicit enrollment mapping from live observed ownership; no guessed generations.

Workflow completion and cleanup are separate projections. `cycle-completed` means the verified delivery and required remote lifecycle effects are complete. Cleanup may be `pending-conflict` without reopening the issue or invalidating delivery. CLI must clearly report `closed; cleanup pending`, never all-clean success. Foreign occupancy identified before workflow effects refuses the start of close; a race after remote completion leaves cleanup pending and preserves the newer claimant. This is an intentional v2 policy change, not a silent weakening of v1's eight-step contract.

Retries accept every valid prefix and every effect-before-checkpoint state. They resolve the durable close transaction before evaluating phase-specific guards. Review/Open/Reopened requirements apply to starting the relevant operation, not to resuming legitimate Done/Closed progress. Terminal no-op retries create no second cycle, approval, delivery, timing row, or cleanup authorization.

## 8. Persistence, concurrency, and trust

Reuse the repository's canonical JSON/digest patterns, protected body mutation API, exhaustive GitHub comment pagination, strict marker codecs, and read-back verification. Add a dedicated v2 journal adapter; do not overload the v1 resident-action schema.

Each journal event is a durable issue comment with its full strict record and predecessor. A main-authority lock serializes v2 writers across linked worktrees on the enrolled authority host. The writer reloads all relevant records, checks expected cycle/revision/operation, appends, reads back exact bytes, then projects. Identical duplicate transport records for the same operation/content are one logical record with all physical IDs retained; conflicting duplicates/forks refuse. Once a write outcome is uncertain, inspect by its original operation ID; do not rotate IDs or compensate blindly.

GitHub issue-body version checks are not a server-side compare-and-swap. This design therefore does not promise distributed multi-writer safety. Enrollment names one persistent authority-host identity; v2 mutations from another host refuse `authority-host-mismatch`. Same-host commands must use the lock before any cycle/acceptance/delivery/close mutation. Manual edits/deletion and external GitHub changes remain observable drift; malformed/ambiguous journal evidence refuses. The existing trusted GitHub account/runner boundary is preserved; stronger cryptographic attestations are not claimed.

Body projection loss can be repaired from verified journal records through `mutateIssueBody`; missing journal history cannot be repaired from body summary. Retain source objects/artifacts and raw evidence with their digests for the enrolled cycles; source retention cannot depend solely on a branch that may be deleted or garbage-collected.

## 9. Runtime/source separation and migration

Resolve an immutable `ExecutionContext` once: `{toolRoot, toolDigest, sourceRoot, repositoryId, authorityRoot, providerMode, transport}`. Tool code comes from an explicitly chosen trusted installed/pinned AITM runtime; candidate source and Git operations use the explicit governed source root. No automatic `node_modules` fallback from a stale worktree and no rebase to acquire a new CLI. Runtime changes are recorded as provenance and count as recipe changes where the runtime influences verification.

V2 starts opt-in. Planned public commands are `aitm evidence inspect`, `aitm evidence enroll`, and `aitm reopen`; enrollment and reopen accept an explicit issue and operation ID, and enrollment requires a read-only plan digest. Add them to CLI catalog/help, dispatcher, shared skill rules, and runtime capability wiring together. Ordinary verify/approve/deliver/close select one enrolled protocol adapter; no scattered per-SHA special cases.

`inspect` is non-mutating and reports every predicate with input source, observed value, applicable phase, proposed action, and eligibility. It reads current issue, journal, PRs, receipts, target state, bindings and tool/source identity. It emits a digest-bound migration proposal and affected-state inventory; no `verified: true` supplied by an operator is evidence.

`enroll` re-reads the proposal's inputs under the authority lock. Changed inputs refuse `migration-plan-stale`. Preserve all v1 receipts/markers as raw immutable import references. A completed historical close becomes a completed historical cycle; an approved, correlated reopen becomes a distinct open cycle. If Claude successfully closes the current #1490 attempt, enroll the completed result instead of forcing the obsolete failing shape back into production. Missing historical evidence remains missing and is reported, never fabricated. Incomplete v1 verification requires new execution in the isolated source context.

Enrollment must teach v2-aware resident actions and close readers to select current-cycle markers while retaining old bytes. Once v2 records exist, incompatible CLI mutation must be refused by the designated authority environment's supported command-entry guard. This cannot be retroactively guaranteed by an old executable that knows nothing about v2: enrollment therefore refuses until the pinned runtime/entry guard and resident automation inventory are verified compatible. Direct unguarded execution of old source-tree scripts is unsupported and forbidden after enrollment; retain those trees as source material, not authority executables. Shipping and testing this guard precedes enrollment. Disable v2 for an unenrolled issue without migration; never downgrade an enrolled issue by deleting its v2 marker. Rollback after enrollment means pause v2 writes and deploy a compatible runtime, preserving the journal.

## 10. Disposable rehearsal and production protection

Two fixture classes are mandatory: synthetic real-Git scenarios for deterministic coverage and frozen snapshots from #1490/#1488/#1485 for actual producer/consumer shapes.

Capture begins only after the user has stopped Claude or approved a consistent capture point. For each source, read branch, full HEAD, root tree, parent objects, status, PR inventory, issue body/comments, board fields and relevant binding/occupancy records. Read HEAD before and after capture; if it changes or the worktree is dirty, stop without stashing or modifying it. Store `capturedAt`, tool/runtime SHA, source path/ref/OIDs, provider IDs, original-content digests, and the user-approved baseline in the run manifest.

Create a uniquely named independent repository below `.scratch/rehearsals/<runId>/`; it must have a different Git common directory and no shared object alternates or hard links. Import pinned commits read-only from the source repositories/worktrees, preserving the histories needed for rebase/squash. Branches inside this repository are `rehearsal/<runId>/1490`, `/1488`, `/1485`, and explicit local target branches. Its only push destination is a newly created local bare repository. Do not make sibling rehearsal worktrees under the production Git common directory: they would share refs and main-anchored AITM authority.

A provider double serves the same payload shapes and mutation/read-back behavior as production, but stores all changes in the sandbox. Use synthetic repository/issue/PR IDs and a reversible provenance mapping to original IDs. Frozen original records remain untouched; generate sandbox fixtures through production builders/strict import adapters, not arbitrary marker surgery. Keep original #1490 and current-success shapes as separate scenarios if necessary.

Rehearsal commands use a sanitized child environment, explicit sandbox config roots, no inherited production transport capability, no `gh` network fallback, and an allowlisted process adapter. Real Git commit/rebase/squash/push operations are permitted only for sandbox paths and the allowlisted local bare remote. Global Git hooks/config and credentials must not route child operations back into the real repository. Do not change the user's HOME or CODEX_HOME to achieve isolation.

Run the normal public commands through the real dispatcher and protocol adapters, not only predicate helpers. Inject failures before effect, after effect before response, and after response before checkpoint. Restart with an empty process cache and the same operation IDs. For close, cover every workflow step and cleanup. For journal/body/provider failures, include ambiguous response, stale read, pagination, malformed/duplicate/forked records, and competing claim generations.

Required scenario matrix:

| Case                                                                                                    | Required result                                                                               |
| ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Same tracked tree after commit-message amend/rebase/squash                                              | Content-only verification eligible through recorded equivalence; original receipt unchanged   |
| Same patch on changed upstream code/dependency                                                          | New candidate verification required                                                           |
| Same tree with changed recipe, requirements, environment, Git-sensitive context, LFS/submodule material | Reuse refused or fresh verification required with exact reason                                |
| Accepted content dropped/reverted or wrong PR/repository/target                                         | Delivery refuses before mutation                                                              |
| Provider head changes after intent                                                                      | Expected-head concurrency refusal; no authorized merge of new head                            |
| Target advances normally after delivery                                                                 | Historical delivery remains; close does not require local HEAD equality                       |
| Close completes, then governed/raw reopen                                                               | Separate cycle; raw reopen requires explicit reconciliation                                   |
| Same-session new binding / foreign binding                                                              | Old cleanup cannot clear it; phase-appropriate refusal or cleanup-pending result              |
| Interrupted close at every boundary                                                                     | One logical close, preserved prefix, no duplicate timing, no restarted historical transaction |
| Retry completed command                                                                                 | No additional effects or UUID rotation                                                        |
| Legacy #1490 failing and subsequently repaired shape                                                    | Migration preserves actual history; neither shape is assumed current without capture          |
| Tool upgraded while source branch stays pinned                                                          | Correct runtime/source roots; no source rewrite to acquire tooling                            |
| Attempted production network/ref/state write from rehearsal                                             | Refused before side effect; protected-state manifest unchanged                                |

Before and after rehearsal compare source HEADs, branches, working-tree status/diff digests, protected remote refs, issue body/comment digests, board fields, and production binding/occupancy files. A concurrent legitimate change makes the isolation comparison inconclusive, not a passing no-change claim. Preserve a redacted immutable report, source manifest, transcript of commands, fault-injection results and hashes outside the disposable repository. Then remove only the exact manifest-listed sandbox branches/repositories, after proving the report exists and no unique unreported work remains. Do not issue broad recursive deletion commands.

The report includes `mode: rehearsal`, synthetic identity, full runtime/version, source/target OIDs and trees, input digests, provider mode, scenario outcomes, retry counts, and `productionEvidenceEligible: false`. Production readers categorically refuse rehearsal records.

## 11. Rollout and acceptance

Order: offline harness and contracts; content evidence; explicit delivery; cycle/close/binding integration; legacy enrollment and public CLI; frozen rehearsal and release readiness. All six children belong to this epic, not to the existing defect chain. Their sequence is internal to the epic; do not create circular BLOCKED links to #1490.

Production go criteria: current source capture after Claude stops; all contract/integration tests pass; actual-worktree rehearsal report passes all required cases; source/issue protection report shows no unintended mutation; source retention and rollback verified; human reviews migration preview; exact deployment/runtime and per-issue migration-plan digests authorized. Rehearse the real close order #1490 then #1488 then #1485, but do not hard-code those IDs in production logic. #1226 remains a later, separately authorized consumer on `cloud-test-automation`.

The epic is accepted when the disposable vertical slice succeeds, the architecture is available through governed commands with v1 compatibility, and a reviewed operational handoff can apply it to the three real issues without code changes or ad-hoc marker retirement. Completing this epic does not itself authorize production recovery.

## 12. References

- [Git object model](https://git-scm.com/book/en/v2/Git-Internals-Git-Objects)
- [Patch-ID limitations](https://git-scm.com/docs/git-patch-id.html)
- [Artifact/input/provenance separation](https://slsa.dev/spec/v1.2/build-provenance)
- Repository: `scripts/task-tracker/lib/{verification-receipt,delivery-authority,delivery-records,delivery-verification,close-convergence,worktree-binding-lifecycle,resident-action-ledger-codec,resident-action-ledger-write,issue-body-mutate}.mjs`, `scripts/task-tracker/runtime.mjs`, `scripts/task-tracker/lib/command-surface/catalog.mjs`, and `scripts/task-tracker/verbs/{approve,deliver,close}.mjs`.

## 13. Design self-review

The design distinguishes identity from eligibility, source from runtime, old history from current cycle, and delivery from cleanup. It does not infer safety from SHA equality, patch similarity, timestamps, body versions, or mock booleans. Distributed concurrency is explicitly bounded, existing policy is retained unless deliberately changed, and the rehearsal cannot mint production evidence. Implementation detail plans must preserve these boundaries and may refine module internals without widening authority.
