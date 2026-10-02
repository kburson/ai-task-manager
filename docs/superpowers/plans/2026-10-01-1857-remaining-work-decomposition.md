# #1857 Remaining Work and Epic Decomposition Revised Plan

> Implementation remains paused. Interactive implementation uses GPT Sol 6.1; GPT Astra 6 performs the requested single-agent review/revision (SAR); Opus 5.5 remains the XPR reviewer. Sol 5.6 handles subsequent documentation. Headless implementation is reserved for genuinely independent parallel work.

**Goal:** Finish accepted artifact/runtime/timing/cleanup obligations through bounded remaining-work children, preserving completed work, WIP and honest evidence.

**Architecture:** Once the structure is agreed and admitted, convert #1857 into the integration epic through registered kind/metadata operations. Five children own remaining outcomes. C1 runtime kernel and C2 consumer adoption form one jointly gated runtime release. C3 cleanup capability and C4 shipped skill/provider installation are separately reviewable implementation deliverables but form one usable cleanup release; neither alone satisfies R5/R8. C5 verifies the combined candidate and records the distinct operational admission decision.

**Tech stack:** Existing Node.js ESM, node:test, Git, registered AITM CLI, provider installer and native host archive. Retain Node >=24 and current dependencies.

## Authority, baseline and preservation

The latest user directive supersedes the old plans' single-issue/no-children rule and former Astra implementation assignment. Their R1–R9 contracts, accepted reviews and provenance remain inputs. Do not edit accepted historical documents to make their instructions appear current.

WIP location: /Users/kpburson/.codex/worktrees/1857-artifact-writes/ai-task-manager; branch codex/1857-draft. Historical source-bearing WIP base: e52c8152d7c21f16111fb3746b72dc001e726863. This decomposition plan was first committed at 0445849c27d2fcebd2cf97bff043b0923bd2e648, the round-1 XPR artifact commit; later protocol revisions have their own recorded commits. Neither historical identity is an assertion of current HEAD. Re-read HEAD, index and worktree at hydration and bind later verification receipts to the actual tested candidate SHA. The earlier controller checkout is not the WIP location.

Preserve the index: its sole staged change is the actor-flush-journal unit-to-integration rename, with later unstaged edits. Preserve all source/test WIP, untracked runtime modules/tests, seven dirty APR configuration/skill files and backups, accepted collateral, loose earlier review artifacts, untracked = entry and four runtime fixture files. No broad staging, reset, stash, clean, archive, deletion or installed-image replacement during reassessment.

Use the verified scoped installed CLI: node node_modules/@kburson/ai-task-manager/bin/aitm.mjs. Candidate source defaults are durable; live control remains legacy. Never invoke candidate lifecycle commands against live state. Native and owned installed surfaces must be reconciled before activation. A commit alone is not self-hosting isolation.

Explicit option A authorized administrative release after fresh reads confirmed Astra's unchanged occupancy generation, paused timestamp 2026-10-01T16:07:56.902Z and absent overlay. Release succeeded, this genuine session resumed #1857, and installed status confirmed the correct worktree/branch and active timer. The release has no expected-owner/CAS argument: this is reviewed administration, not owner-checked release proof. No identity was copied or history rewritten. Native hook context still sees the controller checkout; documented status --allow-foreign-worktree admitted verification. Explain rejects that option; do not invent another syntax or bypass its refusal.

Fresh REST enumeration returned zero children. #1857 is open; body retains Develop, M/7h, original forecast/approval and four unticked original ACs. Re-enumerate before hydration. Initial sandboxed board reads lacked network and cannot establish board absence. Network-enabled Explain selected promote but reported worktree authority unavailable. No lifecycle readiness is claimed.

## Inputs and provenance

All paths below are relative to the WIP checkout.

| Input | Exact identity | Use |
| --- | --- | --- |
| docs/reviews/1857-revised-plan-xpr/2026-10-01-1857-stop-reassessment.md | Historical stopping handoff at source-bearing WIP base e52c8152 plus preserved WIP | Remaining contracts and operating boundary; refresh before hydration |
| docs/reviews/1857-revised-plan-xpr/1857-delivery-report.md | Historical observations plus uncommitted update | Actual outcomes and verification limits |
| docs/reviews/1857-revised-plan-xpr/1857-runtime-coupling-census.md | Preserved untracked inventory | Eighteen families and call-site boundaries |
| docs/superpowers/specs/2026-09-30-1857-durable-runtime-cleanup-design.md | SHA256 bafb27685858804b7cac62870cbf260439575d5c925903337ef0cfc05e21f4f0 | Accepted R1–R9 |
| docs/superpowers/specs/2026-09-30-1857-actor-timing-contract-addendum.md | SHA256 426f87c2530885e303f4d08bd42a3bcea72203ce1b138119db31e18e1d63cc87 | Actor/incomplete telemetry and lawful Close |
| docs/superpowers/plans/2026-09-30-1857-durable-runtime-cleanup.md | SHA256 1f2a325b3dd709da4fa5cf3e4de606768d76c1692ccd42550911b4ad3e09fe13 | Historical plan; superseded execution structure |
| docs/superpowers/plans/2026-09-30-1857-complete-outcomes-revised.md | SHA256 cf4b8ab03e4dac6ef1b4e0d602b2da8476b685c5d98089e62192a607375c4713 | Accepted requirements and matrices; superseded structure |
| Committed timing Outcome 1 | e0429245bf42da3e07221d20cbef20bd9eccfbd4 | Inherited implementation credit |
| Authoritative-kind correction | e52c8152d7c21f16111fb3746b72dc001e726863 | Last source-bearing commit before decomposition |
| Initial decomposition plan / round-1 XPR artifact | 0445849c27d2fcebd2cf97bff043b0923bd2e648 | Plan-only commit, distinct from the historical source-bearing base and future tested candidate SHA |
| Original artifact fix and corrections | 26ccdd57f2815ef85ed0c1ed0ca3a8bce739a54d and 825b5e34 | Preserve, do not implement again |
| Accepted revised-plan XPR | review-fe3b8aacd416cf76d25d311dc272c4dc; artifact 2079261adada8e9c4087c6c66a0b4a76031618d8; finalization 1fc6e44d4263c66a09e07dabfcaa086237c42fea | Opus consensus, authority assurance unavailable; not renewed lifecycle approval |

SAR collateral in docs/reviews/1857-revised-plan-sar is self-review only. Accepted XPR preserved Close-lane provenance, stable self-hosting, unmigrated upgrade admission, version compatibility, genuine host evidence and budget ownership. Those contracts survive decomposition.

## Requirement-to-code-and-evidence matrix

Verified scoped completion means limited observed implementation/evidence, not final acceptance. Partial WIP means actual uncommitted candidate work. Missing means the required capability is absent. Operational blockers need fresh authority/disposition, not speculative fixes.

| Contract | Actual code/evidence | Status | Remaining owner |
| --- | --- | --- | --- |
| R1 artifacts, docs script exclusion, aliases and installed interlocks | Committed artifact-write-policy, activity/source/Bash guard baseline and review corrections; WIP runtime-target/corrupt-control interactions | Verified scoped baseline; partial interaction | C2, C5 |
| R2 physical root/owner identity | Committed runtime-storage resolver/alias/readers; WIP runtime-writer rightmost exact durable store ownership | Verified scoped baseline; partial adoption | C1, C2 |
| R2 local/shared families | paths/state/session/queue/fleet/occupancy/gates/word/cache/provider/capture/draft/Ready/Test/rehearsal candidate adoption; eighteen classified groups | Partial WIP, not release proof | C2 |
| R3 explicit trust/migration/census | runtime-migration catalog/input/plan/apply/admission and registered verb candidate; hashes, binary payload and schema validation | Partial WIP | C1, C5 |
| R3 leases/death/recovery | migration lock/writer and issue/timing/orchestrator adoption; genuine killed writer/coordinator/operation/initializer tests exist; many transaction cases only throw | Partial WIP | C1 |
| R3 multi-record publication | state.mjs saveState separately publishes binding, actor timing and global state. Question pause/marker and capture pending boundaries remain | Missing complete crash-safe contract | C1 primitive, C2 consumers |
| R3 new roots/total loss/generations | runtime-initialize and initialization recovery candidate; completed no-fence retry/census evolution partially covered | Partial WIP | C1 |
| R4 protected runtime/no volatile fallback | WIP physical runtime protection before artifacts/chore, artifact decision before corrupt authority reads; override/alias refusal | Partial WIP; installed chain unverified | C2, C4, C5 |
| Actor timing/Close/reports/calibration | Committed e0429245 plus kind correction; actor state/queue/journal, v1/v2/v3 compatibility, lawful lanes, Unknown and calibration exclusion | Verified scoped implementation; aggregate/final gates pending | Inherited; C2 compatibility, C5 verification |
| Actor migration accounting | runtime-migration-timing only confirms canonical same-actor ordinary coverage, addedMs=0; coupled 18/18 | Partial WIP; not remote publication or full process coverage | C2 |
| R5 file cleanup | Existing cleanup-base-aware is insufficient; accepted typed cleanup command/plan/apply absent | Missing | C3 |
| R6 worktree retirement/local branch ordering | Host receipt reconciliation and cleanup retirement absent; reaper WIP now reports candidates without deletion | Missing; native application separately admitted | C3, C5 |
| R7 origin proof/OID lease | Existing delivery integration proof reusable; cleanup coupling absent | Missing | C3 |
| R8 skill/install parity | Provider stateDir WIP changed; bin/cli remains single task-skill installer; no cleanup skill. Genuine Opus RED retained | Missing capability, partial forwarding | C4 |
| R9 final work evidence | Current aggregate/slow/lint/format/package, exact-SHA receipts, final review/delivery/Close absent | Missing | C5, epic controller |
| Legacy live admission | Preliminary historical 31 available roots/65,416 files; unadmittable/unavailable roots, active writers, unknown families and nine invalid records | Operational blockers; stale observation | C5, operator |
| Native/owned execution surfaces | Owned immutable f5e72b59 image; historical native source fallback and shell forwarding; APR dirt/backups preserved | Operational blockers | C4 contract, C5 admission |

## Reusable evidence and limits

Preserved logs are under .scratch; they are observations, not current-head receipts.

| Log | Result | Limit |
| --- | --- | --- |
| 1857-runtime-unit-classification.log | 109 of 933 files failed | Last full runtime unit result; never subtract focused fixes |
| 1857-runtime-adoption-combined.log | 124/126 | No whole-batch green rerun |
| 1857-combined-fixture-green.log | 14/14 | Corrected scoped fixtures |
| 1857-unit-close-batch.log | 146/146, seven files | Explicit unit model, no production bypass |
| 1857-migration-timing-coupled.log | 18/18 | Coverage/retry, not live publication |
| 1857-ready-journal-current-green.log | 19/19 | Unique current log; overwritten filenames do not establish historical 24 cases |
| 1857-question-writer-current-green.log and 1857-hook-question-green.log | 3/3 and 2/2 | Question/lease/stamp scope |
| 1857-orchestrator-guard-green.log and 1857-terminal-ledger-green.log | 3/3 and 1/1 | Guard/ledger scope |
| 1857-draft-durable-green.log and 1857-transcript-provenance-green.log | 1/1 and 4/4 | Real-Git draft and provenance scope |
| 1857-test-root-reaper-green.log and 1857-evidence-authority-green.log | 6/6 and 11/11 | Durable placement/rehearsal, no real cleanup |

Committed Outcome 1 historical unit result remains 929/930 plus focused 8/8, not a full all-green rerun. Controller correction 13/13 and actor/proof 26/26 remain scoped reported evidence. Relevant log tails were read during reassessment; no new source tests are claimed. A successful fixture must prove its intended operation ran rather than a refusal branch. Final receipts bind command, exact SHA, census, output and exit status.

## Proposed child graph and remaining estimates

C1–C5 are planning labels, not invented issue IDs. No child reimplements delivered artifact/timing behavior.

| Child | Remaining outcome | Dependencies | Advisory engagement | Reassess |
| --- | --- | --- | --- | --- |
| C1 | Crash-safe runtime transaction/recovery kernel | Preserved WIP, agreed interface | 8–12h | 12h or material new publication contract |
| C2 | Complete writer/timing adoption and compatibility | C1 batch/recovery interface | 10–16h | 16h or actual production defect hidden as fixture conversion |
| C3 | Safe cleanup file/Git/host plan/apply capability | Start: frozen C1 observation/read/journal/recovery interfaces. Acceptance/integration: jointly verified C1/C2 candidate; usable cleanup also requires C4 | 12–18h | 18h or new host authority requirement |
| C4 | Cleanup skill and provider/package installation parity | Start: frozen C3 closed grammar and C1 bootstrap/recovery descriptors, plus disjoint file ownership. Acceptance/integration: jointly verified C1/C2 runtime and C3 cleanup candidate; no live cutover required | 6–10h | 10h or unsupported ownership/install route |
| C5 | Joint release verification and operational admission | C1–C4 accepted candidates | 6–10h | 10h or unresolved operational disposition |

Total advisory remaining child engagement: **42–66h**. This prices unproved crash recovery, failing fixture compatibility, unimplemented cleanup and installation/admission. It is uncalibrated, excludes unknowable operator waiting and adds no historical time. Child estimates include targeted verification/review repair; epic coordination is separately tracked. The old 7h field, stale 24–36h estimate and former 8/16/10/6 allowances are not replacement forecasts. Use current registered estimation at child Refine/Plan. Stop/reassess the entire child at its threshold instead of creating tiny nested defects.

The epic controller owns the advisory budget ledger in docs/reviews/1857-revised-plan-xpr/1857-delivery-report.md and records the adopted child allowances, assumptions, validation/reviewer allocation and reassessment decisions before implementation resumes. The ranges are judgment-based planning allowances, not measured productivity forecasts: C1 assumes completion of the existing kernel plus the three identified batch boundaries; C2 assumes closure of the existing eighteen-family census and affected fixture population; C3 assumes reuse of existing substantive integration proof and established host handoff rather than a new host API; C4 assumes the existing three project-local providers and two installation modes; C5 assumes one combined release-verification sequence plus repair verification required by actual findings.

At each child Plan gate, replace these assumptions with a concrete owned file/interface and remaining verification inventory, and establish whether its allowance remains credible. New production contracts or materially larger inventories trigger reassessment before source work expands. Child engagement includes implementation, test/integrity execution and attributable review/repair effort; record their allocation explicitly without adding contained process durations twice. Epic coordination and unavailable historical/provider telemetry remain separately labeled. No cost or productive-time total is inferred from wall bounds.

**Full-unit verification allocation:** C1 owns the first complete `npm run test:unit` run after its kernel lands in the coherent candidate, classification against the preserved failing baseline, and repair/reverification of regressions attributable to C1. C2 owns the subsequent complete adoption/compatibility unit lane and its existing fixture/consumer failures. Do not charge C1-induced breakage silently to C2's 10–16h allowance. C5 owns final combined exact-SHA verification. Attribute repair and necessary repeat runs to the causing child; unresolved attribution is recorded for epic triage, never inferred by subtracting historical failures. At each Plan gate budget these runs explicitly within the advisory range or reassess it before expanding work. Reuse a valid unchanged-candidate receipt where the normal gates permit; never count one execution twice or treat a changed candidate as covered.

## C1: Crash-safe runtime transaction and recovery kernel

**Outcome:** Complete authority publication or protected typed recovery; ordinary readers cannot accept a mixed generation. Migration/initialization survive real process death without age-based takeover.

**Files:** scripts/task-tracker/lib/runtime-storage.mjs, scripts/task-tracker/lib/runtime-migration.mjs, scripts/task-tracker/lib/runtime-migration-{input,lock,apply,plan,admission}.mjs, scripts/task-tracker/lib/runtime-initialize.mjs, scripts/task-tracker/lib/runtime-initialization-{record,recovery}.mjs, scripts/task-tracker/lib/runtime-writer.mjs and scripts/task-tracker/verbs/migrate-runtime.mjs; focused batch journal module if the child design requires it. C1 also owns migrate-runtime-specific descriptor/help/dispatch changes in shared registration surfaces, serialized as below. C1 owns primitives; C2 owns production state/question/capture call sites and the explicitly listed catalogs/censuses.

**Interface:** Retain sync return contracts and existing withRuntimeRecordLockSync, withRuntimeWrite, withRuntimeOperation and readRuntimeJsonRecord semantics. C1 Plan defines exact new batch inputs: physical owning root, genuine actor, expected prior bytes/hashes, typed targets, generation/operation ID, prepared/published/complete states, read refusal and registered status/resume grammar. These are planned interfaces, not claimed existing exports.

**Ownership and handoff:** C1 owns runtime-storage.mjs, the migration facade/input/plan/apply/admission/lock modules, initialization/recovery primitives, runtime-writer.mjs and the migrate-runtime registered handler. C2 owns runtime-record-catalog.mjs, runtime-capture-catalog.mjs, runtime-migration-catalog.mjs, runtime-process-census.mjs, runtime-writer-census.mjs, runtime-migration-timing.mjs and production consumers. C4 owns provider descriptors, installer/guidance generation and installed entrypoint forwarding. C1 owns the migrate-runtime command descriptor/help/dispatch contract; C3 owns the cleanup descriptor/help/dispatch contract. Shared scripts/task-tracker/lib/command-surface/{catalog,routing}.mjs, scripts/task-tracker/verbs/help-data.mjs, bin/aitm.mjs and bin/cli.mjs have one editor at a time under the epic integration owner, with exact per-child hunks and handoff order recorded at Plan time.

Before C2 adopts a new primitive or C3 binds recovery storage, the consuming child Plan records the accepted exact inputs, outputs, sync/async behavior, typed refusal/recovery states and contract-test ownership. C1 and C2 explicitly agree on catalog/census callbacks and timing reconciliation boundaries; C4 implements forwarding against the same frozen registered command descriptors. These are candidate interface approvals, not live runtime admission. An interface change reopens affected child acceptance and combined verification.

**Frozen start contracts:** C3's start gate freezes physical-root/owner and observation identities, runtime record read/refusal semantics, journal schema/generation/operation IDs, exact recovery inputs and outputs, and sync/async behavior. C4's start gate additionally freezes C1's registered migrate-runtime/bootstrap/status/resume/recovery argument grammar and typed migration-required outputs, and C3's cleanup plan/apply/selection/digest and host handoff/refusal grammar. Record those contracts, their source snapshot/digests and owning contract tests in the admitted child plans before parallel work begins. Frozen means agreed candidate interface, not implemented or jointly verified runtime. Changes pause dependent work until the affected contract is agreed again; do not let mocks silently redefine it.

**Acceptance:**

- Journal complete before/after identities and payloads before any member publication. Every interrupted binding/timing/global batch refuses ordinary reads; registered exact recovery is idempotent and refuses changed/conflicting bytes.
- Coordinator/writer/operation/initialization ownership, pending publication artifacts and competing recovery claims have real SIGKILL cases. Only exact identity plus confirmed death admits recovery; live/reused PID, foreign host and unknown owner refuse.
- Cover bootstrap/approved plan, stage copy, each root rename, control activation, manifest complete, timing retry and fence release with killed child processes. Thrown faults remain supplemental.
- Completed no-fence timing retry tolerates proven successor generations and legitimate census evolution without republishing stores. Retained fence requires original roots. New roots initialize separately; partial loss refuses; explicit empty initialization requires proven total absence of legacy/durable data.
- Synchronous promise misuse preserves recovery evidence. A lease alone is never multi-file atomic publication proof.

**Verification:** Extend scripts/tests/integration/task-tracker/lib/runtime-migration-transaction.test.mjs, scripts/tests/integration/task-tracker/lib/runtime-coordinator-recovery.test.mjs, scripts/tests/integration/task-tracker/lib/runtime-operation-recovery.test.mjs, scripts/tests/integration/task-tracker/lib/runtime-initialization-crash.test.mjs, scripts/tests/integration/task-tracker/lib/runtime-initialize.test.mjs and scripts/tests/integration/task-tracker/lib/runtime-publication-validation.test.mjs; add batch integration driving registered handler/guard, with its exact new test path declared in the C1 plan. Isolated real Git fixtures assert bytes/owner/refusal/SIGKILL/replay and eventual complete state. Run the post-kernel full unit lane under C1's allocation above. No live migration.

## C2: Complete runtime writer/timing adoption and compatibility

**Outcome:** All production readers/writers and timing use the protected protocol, with fixtures proving actual behavior under lawful explicit authority.

**Files:** state/session/queue/word-counter/fleet/occupancy/gates/cache; hooks/on-ask, capture shim/library, draft/Ready, Test/reaper and guard consumers; scripts/task-tracker/lib/runtime-record-catalog.mjs, scripts/task-tracker/lib/runtime-capture-catalog.mjs, scripts/task-tracker/lib/runtime-migration-catalog.mjs, scripts/task-tracker/lib/runtime-process-census.mjs, scripts/task-tracker/lib/runtime-writer-census.mjs and scripts/task-tracker/lib/runtime-migration-timing.mjs; corresponding tests/helpers. Provider descriptor/installer changes are owned by C4, with C2 declaring consumer requirements and verifying the serialized handoff.

**Acceptance:**

- Adopt C1 batches at saveState binding/actor/global, question pause/marker and resume/removal, capture sequence/intent/payload/outcome. Replay preserves original bytes/identity; human wait has no writer lease or actor charge.
- Close eighteen-family census through actual indirect call graphs and shipped bin/shell/guidance/provider entrypoints. Classify advisory/pure/rehearsal explicitly; scan counts alone do not establish closure.
- Inventory exact supported persisted local schemas separately from public outcome v1/v2/v3. Cover pre-Outcome-1 legacy and post-Outcome-1 state, binding, actor, queue, word-cursor and pending-publication/question records, including mixed-generation queues. Preserve original entries/identity/bytes where required; do not synthesize missing historical authority or silently reinterpret unsupported records. Version any further persisted shape change before its emitters adopt it.
- Give supported older .ai-task-manager/.claude/custom sources an explicit migration-input, trust, duplicate and conflict route. Unsupported or malformed entries remain typed protected blockers; trust does not repair schemas. Prove binary capture payload preservation and supported historical source migration in fixtures, independently of the operational disposition of this repository’s current invalid records.
- Validate every alias/custom override/nested Test physical owner. Required corrupt/missing authority refuses; optional absence grants nothing. Volatile tampering never regains authority; all three artifact guards allow safe writing under corrupt control.
- Complete uncovered-but-attributable migration engagement publication or durable typed pending reconciliation through canonical registered timing transport and exact idempotency/readback. Same actor union prevents double credit; distinct observed actors add. Missing attribution/crash/completion tails remain Unknown, never copied identities or zero.
- Convert every affected fixture by injected-unit/real-Git/forwarding classification. Preserve assertions and invariants; require proof the intended operation executed. Reconcile package/provider/emitter inventories without weakening guards.
- Fresh complete unit lane and runtime integration batch establish actual compatibility; no subtraction from 109 failures and no live image/default activation.

**Verification:** Runtime actor/queue/question/capture/orchestrator/hook/terminal/Ready/Test/transcript/evidence; staged actor-flush rename; root/alias/artifact suites. Run npm run test:unit and one collected affected integration batch with full census/results. C5 supplies final combined exact-head evidence; C2 owns conversion/repair completeness.

**Collection boundary (C1–C5):** Use the canonical scripts/task-tracker/lib/discover-test-files.mjs `discoverTestFiles({ projectRoot })` and scripts/run-tests-lanes.mjs lane selection against the candidate checkout's scripts/ tree. Record the exact repository-relative selected test paths, counts and results; preserve canonical divergence checks. Exclude .scratch/ and all preserved stable-image copies from test collection and the test/source/caller/package census of the candidate. In particular, extend only scripts/tests/integration/task-tracker/lib/runtime-migration-transaction.test.mjs, never .scratch/1857-stable-image/source/scripts/tests/integration/task-tracker/lib/runtime-migration-transaction.test.mjs. Stable installed images may still be inventoried separately as operational execution surfaces for C5; their files are not candidate tests or additional candidate source coverage.

## C3: Safe cleanup capability with worktree and branch proof

**Outcome:** Registered typed inventory/immutable plan/exact apply for positively eligible file/Git actions, with recoverable action state and truthful host handoff/refusal.

**Files:** Proposed scripts/task-tracker/lib/cleanup-plan.mjs, scripts/task-tracker/lib/cleanup-apply.mjs, scripts/task-tracker/lib/cleanup-git.mjs, scripts/task-tracker/verbs/cleanup.mjs and cleanup-specific registry/help changes under the serialized shared-file ownership above. Reuse scripts/task-tracker/lib/delivery-integration-proof.mjs verifyObservedIntegration and existing substantive virtual-merge/content comparator. cleanup-base-aware recommendations are not proof.

**Interface:** Freeze closed CLI/handoff grammar before C4. Proposed buildCleanupPlan({roots,observations,adapters}) and applyCleanupPlan({plan,approvedCandidateIds,approvedPlanDigest,adapters}) carry exact identities/hashes/OIDs/reasons/evidence/protected references/unknowns. Journal before each action; changed evidence invalidates selection. Caller JSON success is not host authority.

**Acceptance:**

- Dry plan has no effects. Protect runtime/control/store/recovery, tracked config/templates/memory, audit/evidence, pending queues, live claims/locks and unknown files/schemas. Age is descriptive.
- Revalidate approved digest/selection/hash/authority before bounded file action; interruption and uncertain network outcomes remain reconcilable per action. No wildcard purge.
- Before proposing or applying any ordinary or managed worktree retirement, inventory fresh Git worktrees and exact AITM claims, live issue disposition, delivery/content reachability, publication, dirtiness, untracked and needed ignored work, protected main/current/pinned/shared status and host attachments. Bind eligibility to exact approved root/branch/OID and evidence. Closed issue status, missing origin or availability of a recoverable archive alone never authorizes retirement. Missing or ambiguous evidence stays protected. Ordinary removal is bounded and never forces dirty work; local branch deletion additionally requires proven preservation/integration of the exact candidate contents, successful retirement and the fresh surviving-checkout census.
- Codex-managed retirement requires exact list_artifacts identityKey and actual archive_worktree evidence, recoverable snapshot and fresh pre/post observations. Missing capability stays protected/actionable; Claude-managed roots remain unsupported without an established archive contract. Ordinary roots cannot disguise managed provenance or discard dirty/unpublished/needed ignored work.
- Local compare-delete follows successful retirement and fresh no-surviving-checkout census. Main/current/pinned/shared/default/trunk/active assets survive. Missing origin is not retirement evidence.
- Origin deletion requires fresh trunk/candidate OIDs, complete ancestry or substantive squash/rebase equivalence/ordered replay, and expected-OID lease. Partial replay, post-PR additions, missing objects, ambiguous PR, changed refs and uncertain outcomes refuse or remain pending.

**Verification:** New scripts/tests/integration/task-tracker/lib/cleanup-plan.test.mjs and scripts/tests/integration/task-tracker/lib/cleanup-git.test.mjs with disposable real repos: protection, races, interruption, ancestry/squash/rebase equivalence/mismatch, host forgery and retirement-before-prune ordering. No real asset deletion during implementation. Genuine host readiness/application evidence belongs to C5.

## C4: Cleanup skill and provider/package installation parity

**Outcome:** Discoverable cleanup product across supported project-local providers with safe ownership-aware install/update/uninstall and consistent runtime bootstrap/recovery forwarding.

**Files:** skill/cleanup/SKILL.md, skill/cleanup/adapters/{claude,codex,grok}/SKILL.md, provider descriptors/registry, bin/cli.mjs, installer helpers, package/guidance tests and .ai-task-manager/README.md. Generate guidance through sanctioned generators. Existing task adapters retain behavior.

**Acceptance:**

- Discovery name aitm-cleanup; Claude .claude/skills, Codex .agents/skills, Grok .grok/skills. Stub/link modes load canonical installed package sources without development paths; no global skills.
- Preflight all destinations before writes. Unowned directory, modified stub or unrelated symlink yields atomic collision. Owned update/uninstall preserves user additions, legacy bytes and durable runtime; single-task installs upgrade compatibly.
- Package/help/emitter/provider/native-owned-hook/shell forwarding agree. Upgraded unmigrated installs yield typed migration-required; artifacts and closed status/resume/bootstrap remain reachable before ordinary runtime reads.
- Document main/local anchoring, persistence limits, explicit trust, total/partial loss, recovery and host boundaries. Skill distinguishes proposed/handoff/refused from verified applied.
- Preserve genuine cleanup skill RED baseline and reevaluate the same scenario after command/skill implementation. Never claim applied actions without tools or raw Git retirement of managed work.

**Verification:** scripts/tests/unit/providers/registry.test.mjs, scripts/tests/unit/providers/parity.test.mjs, scripts/tests/unit/package/install-contract.test.mjs, scripts/tests/integration/package/install-health.test.mjs and proposed scripts/tests/integration/package/cleanup-skill.test.mjs; all providers, both modes, collisions, upgrade/uninstall preservation. npm pack --dry-run inclusion/exclusion. C5 proves actual current installations; fixture parity alone is insufficient.

## C5: Joint release verification and operational admission

**Outcome:** Complete current-head candidate evidence and an exact operational decision, distinguishing technical code acceptance, installed deployment, live runtime activation and destructive selections. Candidate acceptance requires all mandatory source/fixture/package/skill gates. Installed deployment and live activation additionally require their actual execution evidence and separate exact operator admission. Absent authority remains pending with a named owner and next supported action; it is not deployed completion. The epic may close only when the normal workflow and final review accept the explicit disposition of every R1–R9/addendum obligation, including any permitted not-executed host scenario.

**Files:** Release census/admission/evidence under docs/reviews/1857-remaining-work; approved disposition inputs and registered exact-SHA receipts. Newly demonstrated cross-child defects are repaired in their owning child without tiny nested issues.

**Acceptance:**

- Joint source/caller/fixture/package census using the candidate-only collection boundary above, and npm test, npm run test:integration, npm run test:slow, npm run lint, npm run format:check plus package/skill tests. Preserve command/output/census/exit/SHA receipts at the freshly read tested candidate SHA, not the historical source base or initial plan commit; reuse valid exact-head registered Test execution instead of duplicate unchanged lane runs.
- Reverify inherited artifact behavior and actor/Close/report/calibration: all lawful source/docs/resident/epic/child/local-trunk/cascade/recovery lanes, v1/v2/v3, Unknown source/readback, no stale totals or double actor accounting. Historical subsets never replace changed-head acceptance.
- Fresh usable all-root migration plan includes every unavailable/unadmittable root and unknown entry. Historical preliminary blockers: 2 unadmittable, 3 unavailable, 39 lock recovery, 1,447 unknown-source, nine unsupported records, active writers and 65,416 trust-required files. Preserve eight bad cursors/invalid verifier cache until exact disposition. Trust cannot bless malformed schema; no omission, age purge or empty fallback.
- Record native/owned image digests, hook paths, genuine actors, quiescence and recovery entrypoint. Preserve APR dirt/backups through explicit disposition. Activate defaults/emitters together only with separate exact operator admission; absent trust/cutover means pending activation, never deployed completion.
- Genuine non-destructive host inventory/readiness and missing-capability scenario are mandatory. Actual archive requires separately approved disposable managed fixture or exact candidate and actual receipt; not-executed stays explicit. No mass cleanup authorization.
- Independent final code review includes runtime/cleanup and incomplete-telemetry Close. Normal Test/Review/approval/delivery/Close remain; preserve original four protected ACs/markers and forecast history. PR uses Refs, not closing keywords.

**Verification:** One coordinated exact-SHA registered lifecycle sequence, independent review, installed-image census, unchanged legacy-byte evidence and operator dispositions. Parent requires accepted children plus complete R1–R9/addendum matrix; epic kind cannot launder delivered source into unverified no-commit acceptance.

## Parallel opportunities and WIP integration

Serialize C1 interface finalization before C2 adoption: shared kernel/source/index make concurrent edits unsafe. They are not independently deployable.

C3 may start pure plan/proof design and isolated tests alongside C1 after the frozen observation/read/journal/recovery start contracts above are recorded; C3 acceptance/integration waits for the jointly verified C1/C2 candidate. C4 may explicitly begin before C1/C2 joint verification, but only after both C3's closed grammar and C1's bootstrap/recovery descriptors are frozen, with exact disjoint files and serialized shared registration/provider changes. C4 acceptance/integration waits for the jointly verified C1/C2 runtime and C3 cleanup candidate. C3 and C4 may complete their component reviews separately; scenario GREEN and usable cleanup acceptance require their combined candidate, avoiding a circular requirement to close either child before reviewing the other. C5’s combined verification waits for all four technically accepted candidates; read-only operational disposition work may proceed earlier. No parallelism depends on live migration or installed-default activation.

This plan launches no headless implementation. Parallel workers require agreed interfaces, distinct issue bindings, disjoint files and isolated worktrees from a coherent preserved integration snapshot. Do not copy another actor's binding/runtime or mechanically distribute the dirty index. Retain provenance for Astra's pre-existing WIP and attribute future work honestly.

## Hydration through normal gates

1. Complete the requested iterative SAR with the same GPT Astra 6 agent reviewing and revising the plan. Save turn-based notes for every loop under docs/reviews/1857-revised-plan-sar, recording the input plan digest, findings/dispositions, authored revisions and honest actor/time observations. The controller may mechanically transport Astra-authored revisions; Astra rereads each saved revision and continues until no further issues remain. Only then write a review-acceptance document bound to the final saved plan digest. This is manual same-agent review/revision; ai-peer-review does not yet support SAR, and no package orchestration or SPR/XPR substitution is required. Obtain agreement on structure before issue-graph mutation or implementation. SAR acceptance is not independent XPR or lifecycle Plan approval.
2. Freshly read HEAD, index, worktree, issue/tree and installed Explain from an admitted invocation. Distinguish the historical e52c8152 source-bearing base, initial 0445849c plan commit and latest protocol/candidate commit; preserve the staged rename and unrelated WIP. Registered kind 1857 epic/metadata reconciliation only after admission; preserve original ACs, protected markers, commits and timing. No Develop-to-Plan stage jump or rewriting old forecast as renewed authority. On refusal, report exact supported remediation rather than substitute another parent silently.
3. Hydrate Scope/Plan Metadata via installed issue-body exact-version operations and reassessment via owned comment. Preserve historical accepted bytes.
4. Create only agreed missing C1–C5 children with installed scripts/gh/create-issue.mjs --shape sub-issue --parent 1857, assignee and Scope/AC/Story Origin/VC/Plan Metadata fragments. ACs bind root VCs with vc-list. Re-enumerate before each create; reconcile ambiguous outcomes before retry. Numeric child IDs enter filenames only after creation. Use only the sanctioned shaped creation wrapper.
5. Normal Backlog/Refine/current estimates/ranks then one-step promote, Ready for Planning, JIT Plan, plan approval and Develop through admitted gates. Supported dependency metadata/readback; no arbitrary state jumps or guessed calibrated forecast.
6. Keep WIP in the existing branch until governed source ownership/integration is admitted. No broad commit for this draft. Future exact-path plan/review commits must preserve the staged rename and exclude unrelated WIP. Implementation remains stopped until decomposition, child approvals and stable self-hosting admission.

## Planning exit

Every remaining requirement maps to a child; inherited committed behavior receives credit. This decomposition plan is not a line-by-line implementation recipe: each admitted child produces its own numeric-ID spec/plan and exact interface/verification declarations before source resumes.

Exit requires saved notes for every Astra SAR loop, a final review-acceptance document issued only after the same Astra agent freshly reviews the final saved bytes and finds no further issues, the accepted plan digest, preserved WIP/index readback and user agreement. A reviewed draft is not hydrated issues, passing source verification, deployment authority or renewed lifecycle approval. Present the concrete structure and SAR acceptance, then hydrate the agreed graph through normal gates.
