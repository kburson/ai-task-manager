# #2071 WBS title compatibility and decomposition route support plan

> **For agentic workers:** After separate authorization, use the repository's executing-plans or subagent-driven-development procedure. This document authorizes neither implementation nor a new review.

**Goal:** Preserve an accepted BUG child claim when native Epic conversion changes only its canonical prefix, and identify the remaining admission conditions for decomposing #2071 without rewriting sibling provenance.

**Architecture:** Keep literal WBS title comparison as the default. Add one narrowly qualified BUG-to-Epic compatibility case using current native child identity and strict body kind. Retain those facts through both existing collectors and bind them into assessment digests; add no new dispatch, policy engine, metadata field, or conversion flag.

**Tech Stack:** Existing Node ESM, GitHub GraphQL collectors, native AITM lifecycle, and node:test fixtures.

**Spec:** The accepted design is `docs/superpowers/plans/2026-11-06-2071-public-activation-integration.md`, artifact commit `00ca5ab7a9c041464846c4563532a6061c2c178b`, blob `6ed42482aad392a25d11f559091468c3cf11525b`. Its XPR finalization is `bd544bd08a93b5d46f01c16f85ac6f3110bdee53`; design acceptance does not approve this support proposal or Phase6.

## Global constraints

- Root authorized source/duplicate inspection and this bounded documentation proposal only. No issue creation, implementation, product tests, new review, kind/estimate/graph change, carrier construction, or lifecycle move has occurred.
- This is #2071 planning support, not a claim that a new defect exists or that #2071's stale 3.5/4h authority covers production edits.
- Preserve all original refs P/D/O/H/C/B and their historical commits, actor identities, timing, the #2071-to-#2039 relationship, #2145 dependency, and all 31 other sibling claims: 29 closed and open #2050/#2051, as confirmed by the source-only follow-up below. Re-observe the live inventory before any future operation.
- The potential correction is one independently deliverable compatibility fix. Do not add a dual-pin metadata field, generalized prefix stripping, descendant queries, exception engine, manual retitling, sibling rebinding, or an automatic follow-on defect.
- The current-source carrier and integration route below remain conditional. A delivered title fix alone is insufficient to authorize decomposition.

## Decision and duplicate check

The defect is a real incompatibility between existing contracts: registered kind conversion and first-child tethering intentionally replace the BUG prefix with the canonical Epic prefix, while outer WBS reconciliation compares the entire live title literally. Neither a historical carrier nor a current-source carrier alone resolves that mismatch.

Live GitHub search on 2026-11-06 covered `WBS title`, `decomposition epic title`, `"2071"`, and `"kind" "title"`, followed by these narrower queries in kburson/ai-task-manager:

- `is:issue WBS in:title`
- `is:issue "title" "epic" in:title`
- `is:issue "wbs-provenance-mismatch"`
- `is:issue is:open "conversion" "title"`

No open issue for this exact compatibility contract was found. Broad searches were capped at 100 results; this is a targeted duplicate check, not a claim to have read the entire backlog. Fresh issue fetches confirmed:

| Existing issue                                                                                                                   | State             | Relationship to this proposal                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------- |
| [#1130](https://github.com/kburson/ai-task-manager/issues/1130)                                                                  | Closed, completed | Established canonical Epic metadata/title convergence; it did not relax WBS title matching.                          |
| [#1279](https://github.com/kburson/ai-task-manager/issues/1279), [#1287](https://github.com/kburson/ai-task-manager/issues/1287) | Closed, completed | Established materialized WBS coverage and readiness.                                                                 |
| [#1991](https://github.com/kburson/ai-task-manager/issues/1991)                                                                  | Closed, completed | Preserved governed kind/split recovery and readiness, without this conversion/title case.                            |
| [#2161](https://github.com/kburson/ai-task-manager/issues/2161)                                                                  | Closed, completed | Fixed truthful intermediate first-child convergence, not a converted child's outer WBS claim.                        |
| [#1091](https://github.com/kburson/ai-task-manager/issues/1091)                                                                  | Closed, completed | A provenance diagnostic appears in estimation history; its delivered estimation scope is not this compatibility fix. |
| [#2146](https://github.com/kburson/ai-task-manager/issues/2146)                                                                  | Open              | Recovery feasibility for preserved #2145; do not repurpose it for this production change.                            |

Recommendation: if Root accepts this bounded contract and its delivery route, it may separately authorize one actual defect through native creation, after refreshing duplicate/ownership checks. Do not reopen completed issues or silently expand another story.

## Qualified source seams

All five proposed production files and the existing strict-kind/prefix helpers are byte-identical between delivered baseline Z=`2e5a3feec6d6296778f767977cf8086f587d1967` and K=`849239a672fdae97c9475e47bcc5eb8fc050f6fd`. The planning branch adds documentation only. These are current-source observations, not claims about the historical O/H implementation.

| File                                                            | Current behavior and proposed responsibility                                                                                                                                                                             |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `scripts/task-tracker/lib/decomposition-wbs-coverage.mjs`       | Lines 6–13 discard kind/native context; lines 144–150 require literal title equality. Add the narrow compatibility predicate without changing path, section, duplicate, or complete-plan-byte checks.                    |
| `scripts/task-tracker/lib/decomposition-delivery-readiness.mjs` | Lines 142–159 receive issueNumber but do not forward parent context to coverage. Add repository and forward the expected parent number.                                                                                  |
| `scripts/gh/lib/wave-admission.mjs`                             | Existing detail and identity-fence queries retain child IDs internally, then mapping drops them and the native parent. Add repository/root identity selections to those same requests and retain validated context.      |
| `scripts/task-tracker/lib/decomposition-hook-authority.mjs`     | Existing root, child, and final inventory observations provide the native relationship. Preserve it through mapSubIssueNodes; add child repository selection to the existing detail query.                               |
| `scripts/task-tracker/lib/decomposition-authority.mjs`          | Lines 492–500 invoke readiness; normalized readiness at 502–524 and project observation at 690–707 omit the new facts. Pass the expected repository and bind the normalized identity/title/kind facts into both digests. |

Reuse `classifyDecompositionKind(body)` from `decomposition-kind.mjs`: exactly one valid unfenced marker in Progress Markers, no ambiguity or malformed marker. Do not use permissive `parseIssueKind` to grant the exception. Reuse `KIND_PREFIXES.bug` and `EPIC_PREFIX` from `scripts/gh/lib/kind-prefix.mjs`, without calling `stripKnownPrefix`.

Native causality is established by `verbs/kind.mjs:82–91` and `scripts/gh/lib/epic-retitle.mjs:40–44`, both invoking canonical reconciliation with forceEpic=true. Existing conversion behavior remains unchanged.

## Exact compatibility contract

Literal equality remains the existing first case, with its existing title normalization. All current exact-title callers remain valid without new evidence. Only a mismatched title may try the following second case; every condition must hold:

1. The accepted task title begins with exactly `KIND_PREFIXES.bug` and has a nonempty business suffix.
2. The raw provider title equals exactly `EPIC_PREFIX + acceptedSuffix`. No trimming, case folding, Unicode normalization, removal of another prefix, or business-title edit is allowed in this case.
3. `classifyDecompositionKind(child.body)` yields kind=epic and no reasons. A fenced marker, duplicate marker, marker outside Progress Markers, title alone, label alone, or body-authored conversion claim grants nothing.
4. Current native observation identifies the same child node ID and positive safe issue number in the expected parent's complete immediate-child inventory. Its repository equals the independently supplied expected repository. The parent node ID, number, and repository come from the queried provider parent, not Plan Metadata.
5. Expected parent number equals the actual readiness subject. The collector validates root identity across existing pages/fences; missing, mixed, duplicated, or drifted identity cannot grant the exception.
6. All existing source path, exact selected heading, pinned commit, complete plan bytes, one-task/one-child, section, planning, branch, and disposition checks still run normally.

No new synthetic “converted=true” proof exists. These are current provider observations establishing a recognized current representation, not a cryptographic history of who converted the issue. The fixed native producers establish why the representation is legitimate. A mutable body flag cannot replace native relationship evidence.

### Proposed interfaces

Keep these names and shapes consistent in the implementation and its tests:

- `reconcileWbsCoverage({ tasks, acceptedPlanPath, acceptedPlanText, children, readPlanAtCommit, repository = null, parentIssueNumber = null })`.
- `evaluateMaterializedWbsReadiness({ issueNumber, repository = null, ...existing })` forwards repository and parentIssueNumber=issueNumber. The sole production caller supplies subject.repository.
- Child descriptors gain `nativeWbsIdentity: null | { repository, nodeId, number, parent: { repository, nodeId, number } }`. Repository comparisons use the existing lowercase repository identity convention; node IDs remain exact opaque strings and numbers remain positive safe integers.
- `parseWbsChildClaim(child)` retains its existing fields and adds `rawTitle`, `kindClassification: { kind, reasons }`, and `nativeWbsIdentity`. The new fields derive from the provider descriptor/body, never visible Plan Metadata.
- Use one local normalization in decomposition-authority for both digest inputs: existing claim provenance plus rawTitle, strict kind/reasons, and nativeWbsIdentity. Canonically sort a copy of the new identity-fact list; retain existing dependency set ordering fixes and never mutate provider arrays.

Keep the serialized `epicReadiness.children` shape unchanged: `decomposition-assessment.mjs:319–333` rejects additional child keys. Build the new fact list as a local hash input in decomposition-authority, alongside the existing normalized children inside the readiness digest, and include the same facts inside the project-observation digest. Do not add them to the closed assessment schema or introduce a schema migration. Test the resulting complete input with the real normalization/assessment codec as well as comparing the digests.

Keep the existing return type of `fetchAllSubIssueNodes` (an array). After its existing complete inventory/fence validation, return cloned nodes carrying a native parent context, e.g. `nativeWbsParent`; do not modify body bytes. `mapSubIssueNodes` combines that context with the raw node's id/number/repository into nativeWbsIdentity, or null when context is absent. The hook collector supplies the same parent context from its already validated root after the existing fences. Legacy pure mapping callers without context retain normal exact-title behavior and cannot gain conversion compatibility.

For wave admission, add parent id/number/repository and child repository to existing detail/fence selections; validate root continuity and compare child identity tuples without another request. For hook collection, add child repository to the existing detail selection and retain root context already validated by assertRoot. A foreign child repository must stay foreign, not be overwritten with cfg.repo; it cannot use the conversion case. The fixed exception does not impose a new title policy on existing exact-title cross-repository cases.

Neither collector provides an atomic snapshot of all child bodies and titles. Preserve the existing final inventory/root continuity fence and its limits. A later fresh collection must invalidate stale title/kind/identity facts; do not claim every concurrent child edit is observable in the existing last request. No descendant query or additional dispatch is proposed.

## Review focus and proof obligations

| Input/failure class            | Required behavior and owning coverage                                                                                                                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Title or kind spoofing         | Pure WBS tests reject changed suffix, extra/legacy prefix, whitespace variant, lowercase prefix, title/label alone, fenced/duplicate/malformed/out-of-section kind.                                                 |
| Foreign or incomplete identity | Coverage and both collector tests reject compatibility with missing/mixed child ID, number, repository, or wrong native parent; body-authored parent/conversion claims cannot fill gaps.                            |
| Historical provenance          | Full fixture keeps J's original path, headings, complete bytes, and all 31 other sibling claims untouched (29 closed, two open); wrong path/section/commit content, duplicate claim, or missing task still refuses. |
| Stale observations             | Public assessment tests change each new fact and require changed readiness/project/input digest and stale prior projection; equal canonical facts remain equal without mutating source arrays.                      |
| Real conversion and traffic    | Registered kind and split→creator→tether paths produce actual Epic titles, followed by public assessment through both collectors; preserve current pagination/drift refusals and exact fixture dispatch counts.     |

### Task 1: Preserve converted BUG children in native WBS readiness

**Deliverable:** One complete compatibility fix through both production observation paths, independently reviewed, tested, delivered, and closed under its eventual real defect ID.

**Files:** Modify the five production files above. Root's source-only follow-up also identifies a possible explicitly reviewed F-scope amendment: one exact `.prettierignore` entry preserving the admitted original #2039 plan bytes. That config edit is not authorized here and must be included in the real defect's reviewed scope, estimate and normal format qualification before implementation; it is not a blanket formatting exemption. Extend:

- `scripts/tests/unit/task-tracker/lib/decomposition-plan-exit-gate.test.mjs`
- `scripts/tests/unit/task-tracker/lib/decomposition-delivery-readiness.test.mjs`
- `scripts/tests/unit/task-tracker/lib/decomposition-authority.test.mjs`
- `scripts/tests/unit/task-tracker/gh/lib/wave-admission.test.mjs`
- `scripts/tests/integration/task-tracker/lib/decomposition-hook-traffic.integration.cases.mjs` and its existing test entry.

Add `scripts/tests/integration/task-tracker/wbs-converted-epic-compatibility.test.mjs`. Reuse the actual fixture entry points `firstChildFixture` and `installFirstChildCli` in `scripts/tests/fixtures/first-child-epic-provider.mjs`; extend that fixture and `first-child-epic-cli-provider.mjs` only where necessary to serve the exact new selections and outer-parent scenario. Do not replace native source collection or readiness with a success stub.

**Interfaces:** The complete proposed interfaces are above; there are no downstream implementation units or a second defect assumed by this task.

**Working estimate:** 5–6 active engineering hours, including approximately 0.5h regression/source setup, 1.25h collector/predicate/digest work, 1.5h native integration fixture work, 0.75h targeted qualification, and 1–2h review/delivery repair. This is a provisional proposal, not a published estimate or a promise of <=4h. If detailed review cannot keep this one causal correction within 6h, stop for rescoping before creation; do not disguise it as a 4h story or launch a repair chain.

- [ ] Add the failing pure test: a literal BUG task plus the real converted Epic title, strict Epic body, and exact native identity should cover the same task; today it fails at wbs-provenance-mismatch. Add the refusal matrix above and prove old exact-title behavior remains.
- [ ] Extend the existing provider fixtures and write failing public integration cases for registered kind and split/creator/tether convergence followed by outer-parent assessment. Use a separate disposable physical Git/provider fixture, the actual inherited native actor, and the committed J outer artifact. Preserve and compare all original 31 other sibling claim/body records, retaining their actual 29-closed/two-open states. Do not mutate live #2039/#2071.
- [ ] Implement the five-file predicate/context/digest change. Use only existing request boundaries, strict kind grammar, exact constants, and typed existing WBS refusals. Avoid generic prefix matching and a new exception schema.
- [ ] Run the declared targeted unit suites and `node --test scripts/tests/integration/task-tracker/wbs-converted-epic-compatibility.test.mjs scripts/tests/integration/task-tracker/first-child-epic-convergence.test.mjs scripts/tests/integration/task-tracker/lib/decomposition-hook-traffic.integration.test.mjs`. Require successful positives, zero effects in read-only assessment, exact provider call counts, stale-fact invalidation, and all specified refusals. Tests are not yet run.
- [ ] Commit under the actual assigned defect ID, record its exact commit trail, and use the ordinary native Develop/Test/Review/provider-delivery/Close sequence. The owned Test stage runs required complete suites/CI at the final source SHA; Review reuses valid receipts. No early merge-back or source-only “done” declaration.

## Delivery and source activation before #2071 decomposition

The fix must be a standalone prerequisite with a trunk parent, based on the then-current delivered source. It must not inherit unfinished P/D/O/H code. Z and K currently agree on its five production seams, but actual creation must recheck the then-current trunk, source identities, file ownership, and dependency inventory.

A future authorized native sequence is:

1. Root reviews this proposal and resolves the route decisions below before claiming the work will unblock #2071. Refresh duplicates. Only then, if expressly authorized, create the one real bounded defect with the native creator, exact source-grounded plan, honest estimate and normal refinement/Plan approval.
2. In a suitable authorized trunk-based worktree and genuine issue/session, implement and complete that defect's native Test/Review. Deliver by the registered provider path, verify its actual merged receipt, and Close normally. Call the resulting delivered trunk Z'. Do not merge unfinished #2071 or old P into trunk to make the fix available.
3. Record that Z' invalidates the original “trunk remains Z until old P lands” route premise. Root must explicitly amend and requalify the P/D integration and hold-package conditions, including #2145, accepted source inventories and eventual parent/child delivery ancestry. Keep the original P/D/O/H/C/B refs and old commits preserved until a concrete replacement/integration action is authorized.
4. Qualify source synchronization using the actual recorded branch/worktree authority. A possible preservation strategy is separately authorized new parent/child working refs containing Z', the retained K changes, and the accepted D documentation, leaving the old refs intact. This is a candidate, not an already admitted branch recipe. Record the exact new ancestry, attribution, runtime files and reviewed diff before any use; do not silently cherry-pick broader historical candidates.
5. Prove the actual CLI and hook processes serving #2071 resolve the delivered compatibility implementation at the admitted source, with the correct self-link/package/runtime and real binding. Fresh collector/Explain/readiness evidence must come from those processes. The existence of the fix on remote trunk, an artifact-commit argument, or a pure helper test does not activate it in old D.
6. Only after the runtime route and the single-commit artifact route below are admitted may Root authorize reviewed inner-plan publication, honest 39–52h-or-revised estimate publication, canonical kind conversion, and native split. Parent and each child retain their own current authority and lifecycle gates.

**Concrete synchronization limit:** Current `sync-epic.mjs::realGraphNode` returns only parent/children. `resolveEpicLineage` falls back to composed branch names when authoritativeBranch is absent. Its CLI also rebases and normally force-pushes. It is not qualified for frozen custom P/D and must not be prescribed here. `merge-back` is for landing a finished child and has no sync-only mode; using it now would attempt verification and parent advancement before #2071 completion. A raw ref writer, a generic commit checkpoint, or a command-classification gap is not source-update authority. If no ordinary explicitly admitted operation can establish the replacement/current-source route, report that exact missing capability and retain the hold; do not add another defect automatically.

## Single-commit artifact route

The existing selector chooses an Epic's Decomposition-plan path but resolves its commit from Source-plan-commit, falling back to Plan-commit. Thus the new inner plan and the exact outer-plan bytes must coexist at one genuine source commit. A separate Decomposition-plan-commit field is neither implemented nor proposed.

The preferred candidate for review is a current-source ordinary commit R after admitted synchronization or the separately qualified fresh-carrier route below, containing:

- The original path `docs/superpowers/plans/2026-10-20-2039-active-child-execution-plan.md` with **exact J bytes**, blob `b67d48b254e0d26d558ae22a8ca525ff38468c3d`.
- A new, separately reviewed inner decomposition plan at `docs/superpowers/plans/2026-11-06-2071-public-activation-decomposition.md`, carrying actual bounded Story Intent, ownership, dependencies and executable verifiers. This support proposal is not that split input.
- Preservation of the current K outer bytes, blob `2a5ce3d1c53f37aff9b1cc0e377d2659bbb4ae42`, at an explicitly approved archive path such as `docs/superpowers/plans/2026-11-06-2039-active-child-execution-plan-K-archive.md`, with K retained as a source reference.
- If approved, an exact single-path `.prettierignore` entry for the admitted J artifact, explained as immutable byte preservation. J is not the current formatted variant; package format:check is `prettier --check .`. Existing #1857 admitted-artifact entries are precedent, not permission for #2039. No blanket ignore, hidden format failure, or alteration of J's bytes is allowed.

The inspected J→K diff contains presentation/formatting and prose-leading “Issue” additions rather than task-scope changes. Exact bytes still matter to WBS; semantic similarity cannot substitute. A copy under a new outer path fails the path comparison. A J-rooted carrier preserves the outer bytes but has unproven current-source creation/admission and still needs current runtime integration. Neither candidate removes the need for the real title correction.

**Concrete target-admission limit:** `isDecompositionPreparationTargets` accepts only flat issue-numbered plan/spec paths matching the bound issue. Under #2071, the #2039 outer file, archive path, and `.prettierignore` do not qualify. They cannot inherit #2071's permitted documentation preparation, its stale small-story field, or a commit hook's checkpoint classification. Root must identify the genuine owning issue/current capability and obtain explicit target authority for each proposed write before R exists. None has been established here. Do not expand the five-file defect to hide unrelated carrier work.

### Registered metadata publication after R is admitted

The public issue-body verb already supports a declarative `aitm.issue-body-operation/v1` replace-section operation with heading `## Plan Metadata`, an exact expected section and expectedVersion, and an exact replacement. It preserves protected markers, requires the genuine mutation session, checks readback, and refreshes decomposition after confirmed preparation. A failed/unconfirmed refresh remains unconfirmed.

After Root separately approves R and the precise metadata diff:

1. Re-read #2071's current Plan Metadata and version; build the operation against those exact bytes.
2. Keep Source-plan at the original outer path, Source-plan-section at the original Task30 heading and parent relation unchanged. Set Source-plan-commit to R and Decomposition-plan to the reviewed inner path; keep any Plan-commit consistent where required by the reviewed current-source approval. Do not fabricate a second pin.
3. Use `node bin/aitm.mjs issue-body 2071 --operation-file <contained-operation-file>` through the actual bound runtime. Require confirmed body readback and current decomposition refresh. A body write alone is not approval.
4. Qualify outer #2039 coverage and inner #2071 selection independently at R, including the unchanged 31 other sibling claims and native converted-title facts. Fresh approval/convergence checks must accept the actual scalar source commit. Historical accepted design hashes remain historical evidence, not an approval marker for R.
5. Publish the genuine revised estimate through its registered current writer, verify all confirmed effects, then use native kind recovery and reviewed split dry-run before any separately authorized confirm. Do not call generic plan-approve --current-scope after children exist; it refuses that case. Do not demote to manufacture approval or bypass #2145.

## Source-only follow-up: existing #2145 trial admission

Root requested this qualification after reading the first support proposal; it is not permission to create or implement a leaf. This section evaluates only the existing trial-admission capability, called P1 in the coordinator's discussion, rather than the entire earlier prerequisite program.

### Live authority and preservation correction

A fresh primary read of [#2145](https://github.com/kburson/ai-task-manager/issues/2145) confirmed the independent Epic “Native preservation-safe bridge trials”, Backlog marker, body version 3, empty Plan Metadata, and the preserved f7be/default-session location history. A bounded native GraphQL query returned zero immediate children and hasNextPage=false. Its Scope already includes separate pinned-trunk trial admission preserving existing delivery binding/evidence, retained-source readiness, and recorded-custom-branch sync. Therefore a necessary admission leaf belongs to this existing causal scope; no new unrelated framework issue is justified by this finding. No existing leaf ID or accepted leaf plan exists in that observation.

The same query returned 32 immediate #2039 children, hasNextPage=false: 29 closed and three open (#2050, #2051, #2071). The first version of this support proposal repeated “31 closed sibling claims”; that was inaccurate. Preserve **31 other claims**, including the two open siblings and their existing states/refs. Accepted design/review artifacts remain unchanged historical bytes; their inherited count is not current inventory authority. Recording a new #2039 parent location retargets the future lineage of both open siblings, so their explicit disposition remains a route condition.

A regression preserving this real inventory must prove the converted-title coverage result without concealing independent readiness blockers. Do not mark the two open siblings closed or fabricate refinement/approval to make a live-shaped fixture green. Use a separately admissible disposable fixture for the complete positive; its success is not live #2039 readiness.

### Existing primitives and their actual limits

| Primitive                                                                            | Source-supported behavior                                                                                                                             | Why it is not the proposed trial operation                                                                                   |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Codex create_worktree                                                                | Creates a managed checkout detached at the supplied ref; the tool has no branch parameter.                                                            | It does not grant AITM branch, binding, occupancy, or decomposition authority.                                               |
| `draft-branch.mjs:124–163`                                                           | Chooses resolveCurrentIssueWorktreeBranch(body), checks holders/head, and requires exact active binding.                                              | A new checkout at trunk still selects the old durable D0. Absence of codex/2071-draft does not select a new name.            |
| `native-branch-renewal.mjs:208–320`                                                  | Same physical root/current actor/generation; old/new branches and HEAD must share a commit; exact checkout observation and durable location required. | It cannot admit a different trunk commit/root or authorize the preceding new-branch effect.                                  |
| `worktree-relocation-guard.mjs:137–249` and `location-mutation-authority.mjs:55–201` | Ordinary Start validates the real actor/owner/occupancy and appends a new current durable location.                                                   | Relocation is a real authority change, not a separate preserved trial. A confirmation flag is not a dual-binding capability. |
| `native-worktree-bootstrap.mjs:163–254`                                              | Canonical setup is bounded to a clean registered root and exact setup inputs; lines 219–221 refuse a session that already has a binding.              | Attaching a new checkout does not allow a bound delivery session to install/seed it under existing bootstrap admission.      |
| `cut-child-worktree.mjs:27–58`                                                       | Creates the resolver's child branch at the current recorded parent head.                                                                              | It cannot select an independent pinned-default trial/name or preserve an old delivery binding by itself.                     |
| `cut-epic-branch.mjs`, `sync-epic.mjs`, and merge-back                               | Existing graph-derived construction, rebase/sync, or finished-child integration.                                                                      | They are not a preservation-safe trial transaction; none grants the missing exact trial context.                             |
| `decomposition-local-targets.mjs` / `decomposition-activity.mjs`                     | Flat bound-issue plan/spec paths may be preparation; branch/code writes require scoped implementation.                                                | An oversized #2071 cannot create its new branch by borrowing the old 4h assessment or a commit-checkpoint classification.    |

No production trial-admission implementation was found in the inspected current source/registered helper paths. These are source findings, not observed runtime refusals from a live experiment.

### What the bounded admission leaf must prove

A narrowly implemented native trial entry could avoid every old P0/D0 rebase and custom-sync dependency by admitting fresh refs on a delivered default source. That remains a capability proposal requiring its own bounded plan and native tests, not a demonstrated route. The plan must cover the complete causal operation:

1. **Initial parent carrier:** accept an exact then-current delivered default SHA and unused explicit branch/root identity, with fresh provider owner/repository/issue observations and real host actor. Reject dirty/aliased/foreign roots, unsupported environment, existing branch/holder, stale source pin, conflicting occupancy, or changed preserved authority before effects. An app-created detached root is only an input.
2. **Bootstrap and actual execution source:** establish how the newly delivered native entry and hooks run before local dependencies/seeding are available, and how canonical bootstrap is admitted without pretending the actor is unbound. The tested route must use the actual shipped source and genuine host context; no alternate interpreter/global install, SID override, or self-authored binding receipt.
3. **Preserved delivery versus current trial:** specify what old records remain byte-retained and what genuine handoff/departure event changes current ownership. There must be one truthful current execution owner, not two active delivery bindings. Preserve historical review/timing/pending evidence; never copy an old SID or active record into the new root. Ordinary Stop/Start, if selected by the later plan, are explicit real effects and not a no-op preservation claim.
4. **Child branch after the parent checkpoint:** cover creation/admission of D_new at P_new's reviewed docs-only checkpoint while #2071 is truthfully must-decompose. A trunk-only first step leaves this boundary unresolved. The checkpoint differs from the original trunk SHA, so do not call it exact-trunk admission; qualify the precise allowed parent-document delta and unchanged runtime source. Existing same-HEAD renewal can only be reused after a legitimately admitted branch effect.
5. **Restricted preparation and effect ordering:** the new context grants only the sanctioned issue-numbered preparation/checkpoint and existing governed-decomposition operations until current native authority permits implementation. Register it at the real CLI/hook/admission boundaries. Revalidate actor, source, refs, occupancy and retained evidence before each actual effect; preserve partial state and diagnose it truthfully on failure. No generalized guard bypass or classifier loophole.
6. **Actual native fixtures:** disposable physical Git/provider fixtures must exercise the genuine public entry, bootstrap/branch/handoff sequence, changed-source and wrong-parent refusals, failed writes, exact retry/partial-effect handling, and old refs/evidence noninterference. Do not substitute helper success or a manufactured old binding. No such tests have run here.

This qualification does not establish a credible <=4h estimate for that leaf. Its own source-grounded plan must expose the full entry/bootstrap/child-transition boundary before sizing; discovering those needs after a narrow “name a branch” implementation would repeat the defect-chain problem.

### Conditional fresh-carrier sequence

Use P_new/D_new only as notation here, not already selected branch names or authority. Let Z2 denote the actual delivered default after both the title fix F and the admitted #2145 trial capability have completed their own native delivery.

1. **Deliver the prerequisites legitimately.** F may include the one exact reviewed format-preservation entry as code/config scope. The admission leaf needs its own genuine delivery route: attaching it as a native child of #2145 otherwise resolves frozen f7be parent authority. Root must review a route that does not require the new admission capability to deliver itself. A separately authorized standalone delivery topology referencing #2145, or an already supported qualified #2145 parent route, would require an explicit native graph/ownership decision; neither is assumed here.
2. **Freeze/requalify.** Read live Z2 and every protected ref/location; preserve old P0/D0/O/H/C/B and f7be without source/dirty-state inspection outside the agreed inputs. Amend the old fixed-Z/no-drift Phase7 premise before any new carrier. Re-observe #2050/#2051 and approve their future parent lineage explicitly.
3. **Admit P_new with the delivered operation.** The real actor uses the qualified new entry and exact pin, producing a fresh named carrier and truthful limited context. All pre-write fences and real bootstrap/occupancy results must be retained; no old checkout is recovered or rewritten.
4. **Genuine #2039 checkpoint.** Through the tested handoff, bind #2039 as orchestrator on P_new. Restore exact J at the original flat #2039 plan path and retain exact K at flat `docs/superpowers/plans/2026-11-06-2039-active-child-execution-plan-K-archive.md`. Both paths structurally match #2039 preparation; actual ownership/state/admission still must pass. F's already delivered exact ignore entry allows normal format qualification while preserving J. Commit and trace under #2039 with exact blob readback; no config edit occurs under #2071.
5. **Genuine #2071 child preparation.** Use the separately proven native admission for a fresh D_new at that parent checkpoint, with current #2071 ownership/timing and a restricted must-decompose result. Write only the reviewed flat #2071 inner decomposition plan in that phase. Commit SC: it contains both the inherited exact original-path J artifact and the new inner plan. They need not have been added in the same commit; both must be readable at SC. Original D0 plan/review objects remain separately retained and referenced; do not claim they have been merged or freshly approved on SC.
6. **Native publication and assessment.** The existing declarative metadata operation can select Source-plan-commit=SC and the inner Decomposition-plan path, while preserving Task30's outer path/heading/relation. Execute only after exact review/target authority and fresh current-source approval/convergence. Verify source selection, title compatibility, every sibling claim, honest estimate effects, kind recovery and split dry-run/confirm through their actual owners. The accepted design's O/H source qualification remains outstanding.
7. **Dependency and eventual delivery.** Finishing a trial-admission leaf does not finish #2145 or remove #2071's current #2145 edge. Only actual route proof can support Root's later explicit native dependency disposition; retain the remaining retained-readiness/custom-sync scope and never mark it completed because this new route avoids it. Later #2071 child/parent integration still needs current exact-head gates and qualified ancestry. Fresh construction does not guarantee trunk will never advance again.

The flat archive and allocation of the exact ignore entry to legitimate F scope resolve the earlier _target-allocation_ objection in principle. They do not implement P1, authorize a new source route, settle its own delivery topology, or establish current admission. The missing capability is the bounded existing #2145 trial operation including the child-preparation handoff, not a reason to implement all earlier prerequisite packages or invent a new framework.

## Stop boundary and required Root decisions

This is a concrete title-fix proposal plus a conditional route, **not a proven end-to-end admission recipe**. Before authorizing implementation as an unblocker, Root must settle:

- Whether the 5–6h single causal correction is accepted and deserves one native defect after the refreshed duplicate check.
- The admitted source synchronization/replacement route after Z' that preserves original refs and amends the former parent/hold-package premise.
- The actual owning authority for the original #2039 artifact, archive and exact format-preservation edit, followed by ordinary R creation and scalar current-source approval.
- The separately reviewed inner decomposition plan and independent historical O/H source qualification required by the accepted design.

If any required route has no compliant owner/capability, report it precisely and leave #2071 held. Do not promise autonomous closure based only on the title predicate, fabricate an approval, broaden the framework, or create chained repair stories.

## Verification of this proposal

Source reads and live duplicate/state checks only; no product tests, classifier execution, issue edits, source integration, or carrier construction. The planned tests and route steps above are unexecuted. Before handoff, verify this new document's formatting, whitespace, and documentation-only diff; preserve the accepted design and XPR records unchanged.
