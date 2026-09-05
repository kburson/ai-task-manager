# Round 2 Reviewer Review — #1219 Continuous Agent Delivery Amendment (Implementation Plan)

- Reviewer: `claude`
- Artifact: `docs/superpowers/plans/2026-09-04-1219-continuous-agent-delivery-amendment.md`
- Reviewed artifact commit: `c685199a0729d4792c4c120b2d30d41716a1b077`
- Comparison baseline for all non-artifact evidence: `07984e5137ba53f56fe062a351e5dd4111fb87bd`
- Byte identity independently verified: artifact blob sha256 `dd1db9ad575a11cf50c56e6016a4bb203ad173064da2b3d01b5b32108b1c6527` is identical at `c685199a` and `07984e51`, and matches `state.json.artifact.sha256`.
- Required supplements: none declared in the protocol state (`immutableArtifacts` contains only `round-1-author-response.md`); none acknowledged.

Line citations of the form `plan:N` refer to the artifact at `c685199a`. All other file citations are `path:line` at `07984e51`. Findings in this review are numbered from `F-101` to keep them distinct from the specification protocol's `F-00x` series; where a root cause is specification-side, it is cross-referenced rather than restated.

---

## 1. Verdict

**REVISE**

Tasks 1-9 have a coherent architecture, real TDD structure, and mostly-correct file and command paths — the test-path convention, npm script names, and evidence-v2 module names all resolve at the pinned SHA, which is more than most plans of this size manage. But the plan is not yet executable. Task 1 does not build the thing the plan's own checklist claims it builds. Task 5 changes merge authority without naming the merge-authority policy that shipped two commits ago, and cannot reach the non-trunk targets it targets. Task 2 modifies a file that does not exist. And Tasks 1-9 have no governed owners, no prerequisites, and a task-number reference that does not resolve against the plan #1219 is pinned to.

---

## 2. Blocking findings

### [finding:F-101] Task 1 produces a trusted-runtime *identity resolver* that is itself loaded from candidate-controlled bytes; no task builds a trusted bootstrap or executor

**Violated invariant.** The plan's own Global Constraint at plan:33-34 — "Use a trusted target-branch or installed runtime for all authorization. Never let candidate lifecycle code certify itself" — and its Self-Review Checklist assertion at plan:723, "No task lets candidate-controlled lifecycle code authorize itself."

**Evidence.**

- Task 1's entire deliverable is data. Files at plan:63-69 are `candidate.mjs`, `record-codec.mjs`, `trusted-runtime.mjs`, two test files, and two evidence-v2 modules. The interface at plan:76-78 is `resolveTrustedRuntime({ targetRef, installedRuntime, git })` returning "a frozen `{ source, identity, protocolVersion }`". The Step 3 constraint at plan:133-135 restricts that function's *inputs* ("must accept exactly one of a verified target commit or immutable installed package… must reject a runtime path or SHA supplied by the candidate branch") — it never requires that any lifecycle code *execute from* the resolved runtime.
- No task anywhere in the plan touches the execution path. A grep of the full artifact for `bin/`, `settings.json`, `aitm-registry`, `self-link`, `node_modules`, `bootstrap`, and `activation` returns zero matches; the sole hit for `executor` is plan:457, in an unrelated Review-boundary assertion.
- The real execution path is candidate-local. `bin/aitm-registry.mjs:27-28` computes `REPO_ROOT = path.resolve(HERE, '..')` and `TASK_TRACKER_PATH = <REPO_ROOT>/scripts/task-tracker/task-tracker.mjs`; `bin/aitm.mjs:136-147` and `bin/aitm.mjs:95-100` spawn exactly that path with `process.execPath`. In this dogfooding repository `scripts/task-tracker/lib/ensure-self-link.mjs:64-67` creates `<pkgRoot>/node_modules/ai-task-manager -> <pkgRoot>` whenever `isDevPackage(pkgRoot)` is true (`ensure-self-link.mjs:31-32`), which holds inside a governed worktree.
- The plan already has a working pattern available and does not cite it: `scripts/task-tracker/lib/evidence-v2/rehearsal-manifest.mjs:146-147` pins a tool root via `realpathSync(toolRoot)` + `rev-parse HEAD`, and `rehearsal-manifest.mjs:171-176` spawns with `cwd: pinnedToolRoot`. That is an execution boundary; `resolveTrustedRuntime` as specified is not.

**Concrete failure mode.** A candidate branch edits `scripts/task-tracker/lib/continuous-delivery/trusted-runtime.mjs`, `finding-disposition.mjs`, or `test-merge-machine.mjs`, then runs `npx aitm test #N` from its own worktree. Node resolves those modules from the candidate worktree, the edited classifier returns `merge-eligible`, and the emitted `aitm.delivery-candidate/v1` record stamps `runtime.source: 'trusted-target'` (plan:101-105) because the record is written by the same edited code. Every acceptance test in Task 1 passes, because they test the resolver's input validation, not where it ran. This is the amendment's own problem 1 surviving the amendment.

**Smallest sufficient correction.** Extend Task 1 with two additions. (a) A trusted executor: a module that materializes the resolved trusted runtime at a root outside the candidate worktree and spawns every gate-evaluating, receipt-validating, and provider-mutating verb from that root — the `cwd: pinnedToolRoot` pattern at `rehearsal-manifest.mjs:171-176`. (b) One RED test that writes a hostile edit into a fixture candidate worktree's authorization module, runs the lifecycle entry point, and asserts both that the mutated bytes were not executed and that the gate still refuses. Without (b) the checklist claim at plan:723 remains unproven.

**Owning artifact.** Implementation plan, Task 1. (Root cause is shared with the specification's Trusted Runtime Boundary; see spec protocol `F-003`.)

---

### [finding:F-102] Task 5 relocates merge authority out of `deliver.mjs` without naming the manual-code-review gate it must carry with it

**Violated invariant.** Global Constraint plan:41-42 — "Full-Auto bypasses human gates only. It never bypasses CI, flow review, expected-head merge validation, or implementation-record validation" — and Self-Review Checklist plan:725, "Human-gated and Full-Auto paths preserve the same evidence requirements."

**Evidence.**

- Task 5's only reference to the human boundary is the phrase "mode-appropriate repository approval" (plan:377-379) and the test-table entry "human approval pending, Full-Auto bypass" (plan:384). Its Files list (plan:363-370) does not include `scripts/task-tracker/lib/manual-code-review.mjs` or `scripts/task-tracker/lib/gate-resolve.mjs`. A grep of the full artifact for `manual`, `1512`, and `pullRequestReview` returns zero matches.
- The gate that must move is concrete and shipped. `scripts/task-tracker/verbs/deliver.mjs:741-793` resolves `resolvePullRequestReviewGate`, `resolveManualCodeReviewer`, and `fetchManualCodeReviewEvidence`, calls `evaluateManualCodeReview`, requests the reviewer at most once (`deliver.mjs:772-783`), and returns `manual-review-required` with no delivery intent and no provider action. Its default dependency wiring is at `deliver.mjs:1134-1160`; the prompt is emitted at `deliver.mjs:1492` as `PROMPT_REQUIRED: manual-code-review`. The policy itself is `scripts/task-tracker/lib/manual-code-review.mjs:43-101`.
- Task 5 explicitly routes enrolled issues away from that code: plan:404-407 — "Keep `deliver.mjs` as a compatibility adapter during migration, but route enrolled issues to the Test merge runner and refuse a second Review-stage merge."
- The public surface is contract-tested. `scripts/tests/unit/task-tracker/core/full-auto-default-doc.test.mjs:19-22` asserts `VERB_REFERENCE.deliver.exitCodes` code 21 means "manual code review".

**Concrete failure mode.** After Task 5, an enrolled issue's merge is performed by `test-merge-runner.mjs`, which never passes through `deliver.mjs:744-793`. With `gatePullRequestReview: true` — the exact configuration a maintainer sets by saying "manual code review" (`skill/shared/rules/full-auto.md:20-23`) — the Test merge machine has no code that reads the gate, resolves the reviewer, or checks for an exact-head `APPROVED` review. The candidate merges without the human. This is a silent regression of a gate delivered in `99bec143`, and no test in Task 5 as written would catch it.

**Smallest sufficient correction.** Add `scripts/task-tracker/lib/manual-code-review.mjs` and `scripts/task-tracker/lib/gate-resolve.mjs` to Task 5's Files list; extend `planTestMerge`'s interface (plan:377-379) to take the three seams `resolvePullRequestReviewGate`, `resolveManualCodeReviewer`, and `fetchManualCodeReviewEvidence` explicitly; and add one RED test to Step 1 asserting that with `pullRequestReview: true` and no exact-head approval, `planTestMerge` returns a waiting/request result that emits no merge action and creates no delivery intent, and that after an eligible exact-head `APPROVED` review it authorizes.

**Owning artifact.** Implementation plan, Task 5.

---

### [finding:F-103] Task 5 must deliver to non-trunk targets but touches neither `merge-back.mjs` nor lineage resolution, and the one file it does touch hard-refuses every child today

**Violated invariant.** The amendment's Hierarchical Delivery requirement that a child story targets its recorded epic branch, which Task 5 is the only task positioned to implement.

**Evidence.**

- Task 5's Files (plan:363-370) include `scripts/task-tracker/lib/delivery-preflight.mjs` but not `scripts/task-tracker/merge-back.mjs`, `scripts/task-tracker/lib/resolve-epic-lineage.mjs`, or `scripts/task-tracker/lib/fetch-parent-issue.mjs`. A grep of the full artifact for `merge-back` and `lineage` returns zero matches.
- The current contract of the file Task 5 modifies is trunk-only and parentless-only. `scripts/task-tracker/lib/delivery-preflight.mjs:98-103` fails `child-lineage` whenever `lineage.parentIssueNumber !== null` **or** `lineage.deliveryTarget !== baseRef`, and `baseRef` comes solely from `config.trunkRef` (`delivery-preflight.mjs:62-69`). `scripts/task-tracker/verbs/deliver.mjs:566-573` returns the same refusal before any PR work.
- Task 5 nonetheless intends non-trunk PRs: Task 1's own canonical example sets `targetRef: 'cloud-test-automation'` (plan:98).
- The existing non-trunk path is local, not a provider action. `scripts/task-tracker/merge-back.mjs:86` rebases the child, `merge-back.mjs:99-100` runs `git checkout <epic>` and `git merge --ff-only`, `merge-back.mjs:103-104` removes the worktree and branch. Task 5's stated emission is "the existing `github.merge-pull-request` action" (plan:379), which merge-back never performs. `merge-back.mjs:94` additionally runs the child's tests locally, which the amendment's own Non-Goals forbid.
- The lineage authority Task 5 would need is delivered and reachable: `scripts/task-tracker/lib/resolve-epic-lineage.mjs:79-109` yields `parentAuthoritativeBranch` and graph-derived `parentIssue`, and `scripts/task-tracker/merge-back.mjs:128-155` maps the parent's recorded opaque branch. Task 5 cites neither.

**Concrete failure mode.** The first enrolled child — including the plan's own pilot, #1237 — reaches `validateDeliveryPreflight`, hits `delivery-preflight.mjs:98-103`, and fails `child-lineage`. Task 5's Step 5 regression list (plan:409-413) runs `deliver*.test.mjs` and `delivery-flow.test.mjs`, none of which exercise a parented issue, so the gap surfaces only at pilot time. If an implementer instead leaves `merge-back.mjs` untouched and lets children keep using it, then no #1219 child ever receives a candidate record, hosted CI, a flow review, or a delivery receipt, and the amendment applies to nothing below the root epic.

**Smallest sufficient correction.** Add `scripts/task-tracker/merge-back.mjs` and `scripts/task-tracker/lib/resolve-epic-lineage.mjs` to Task 5's Files; state in Task 5's Interfaces that `validateLineage`'s trunk-only predicate is replaced by graph-derived `deliveryTarget` equality (citing `resolve-epic-lineage.mjs:102-109`); and add two RED tests to Step 2 — one for a parented child whose recorded target is the opaque ref `cloud-test-automation`, and one asserting the disposition of the `merge-back.mjs` path for enrolled issues, matching whichever answer the specification settles.

**Owning artifact.** Implementation plan, Task 5. (The disposition question itself is specification-side; see spec protocol `F-004`.)

---

### [finding:F-104] Task 2 modifies a file that does not exist and is owned by an unstarted Backlog child; Task 9 modifies a second nonexistent file; no task declares prerequisites

**Violated invariant.** Amendment Decomposition plan:54-55 — "Materialize each task as a governed child before production implementation so a reviewer can accept or reject it independently." A task that cannot start on the current tree is not independently acceptable.

**Evidence.**

- plan:161 lists `Modify: scripts/task-tracker/lib/cloud-test/awaiting-ci.mjs`. That path does not exist at `07984e51`; `git ls-tree -r 07984e51 -- scripts/task-tracker/lib/cloud-test` returns empty — the entire directory is absent. Task 2's Step 3 (plan:196-201) and Step 5 `git add` (plan:213-214) both reference it.
- That file is created by a different, unstarted issue. #1239's `## Scope` Files list contains `Create: scripts/task-tracker/lib/cloud-test/awaiting-ci.mjs`; #1239 board Status is `backlog` (verified via `npx aitm board 1239` sibling check and `npx aitm board 1237`/`1240` for the surrounding rows). #1239's own bounded section declares `**Prerequisite:** Task 13`, which is #1238, also Backlog.
- plan:627 lists `Modify: skill/shared/rules/test.md`. That path does not exist at `07984e51`; `skill/shared/rules/` contains `bind, block, close, commit-trail, config-init, create-issue, deliver, evidence, full-auto, functional-dod, hooks, incident-ledger, issue-records, parallel, plan-mode-backlog, preferences, report-on-block, review, scratch-dirs, state-walk` and no `test.md`.
- No task in the artifact carries a `Prerequisite` or `Prerequisites` field. The replaced contracts do — for example #1237 declares `**Prerequisite:** Task 11`, #1238 declares `**Prerequisites:** Tasks 10-12`, #1239 declares `**Prerequisite:** Task 13` — so the amendment drops an ordering discipline the plan it replaces had.

**Concrete failure mode.** An implementer starting Task 2 in order finds no `awaiting-ci.mjs`. They either create a divergent one — double-owning a file #1239 is contracted to create, which is exactly the duplication class the amendment is meant to remove — or stop, with no recorded prerequisite explaining why. Task 9 hits the same wall on `skill/shared/rules/test.md` at the rollout commit, after eight commits have already landed.

**Smallest sufficient correction.** Add an explicit `**Prerequisites:**` line to every task, naming the governed issue or in-plan task each depends on. For Task 2, state either that it depends on #1239/Task 14 delivering `awaiting-ci.mjs`, or that Task 2 now *creates* it and #1239 is folded into Task 2 (which the replacement list at plan:51-53 already implies, since Task 14 is one of the replaced contracts — this should be said outright). Change plan:627 from `Modify` to `Create` for `skill/shared/rules/test.md`.

**Owning artifact.** Implementation plan, Tasks 2 and 9. (The same `skill/shared/rules/test.md` assumption appears in the specification's Documentation Changes and is reported there.)

---

### [finding:F-105] The replaced-task reference does not resolve against the plan #1219 is pinned to, and Tasks 1-9 have no governed owners

**Violated invariant.** Amendment Decomposition plan:51-55, and the plan's own requirement that a reviewer be able to accept or reject each task independently.

**Evidence.**

- plan:51-53 reads: "The existing #1219 plan remains active except for Tasks 12, 13, 14, 17, and 18, and their consumers."
- #1219's `## Plan Metadata` pins `**Source-plan**: docs/superpowers/plans/2026-09-02-1219-cloud-test-portfolio-wbs.md` at `**Source-plan-commit**: 4d9a72ed223c71bbc36a190313fdbbfa72387734`. That WBS contains six tasks only — `### Task 1` … `### Task 6` at `docs/superpowers/plans/2026-09-02-1219-cloud-test-portfolio-wbs.md:12,24,36,48,60,72` — mapping to sub-epics #1220-#1225. It has no Task 12, 13, 14, 17, or 18.
- Those numbers belong to the other live plan: `docs/superpowers/plans/2026-09-01-1219-cloud-test-automation.md:938` (Task 12), `:979` (13), `:1019` (14), `:1148` (17), `:1228` (18) — owned by #1237, #1238, #1239, #1242, #1243 respectively, per each issue's `## Story Origin` → `source-plan-section` field.
- The amendment supplies no issue-number map. plan:54-55 requires materialization "as a governed child" but names no issue, no parent, and no edges; plan:46-47 defers the question — "commit each task independently with `[#1219]` attribution until the amended WBS materializes dedicated child issues."
- #1219's live body still declares the superseded structure: `**Delivery-decomposition**: 1 root epic, 6 sub-epics, 22 child stories`; `**Governing-spec**: docs/superpowers/specs/2026-09-01-1219-cloud-test-stage-design.md` (not the amendment); `**Dependencies**: None`. Its `## Scope` still reads "Deliver the six-epic cloud Test portfolio WBS … at commit `4d9a72ed…`". Its acceptance criterion 1 still requires "All six approved sub-epics and their 22 uniquely owned implementation stories".
- Task 9 defers the repinning to Step 5 (plan:675-679), after Tasks 1-8 have already committed.

**Concrete failure mode.** Two questions the plan must answer have no answer in the artifact: *which plan's* Tasks 12-18 are replaced (the ambiguity is real — both plans are live and are cited three lines apart at plan:24-25 and plan:630-631), and *who owns* Tasks 1-9. Meanwhile every one of the eight commits in Tasks 1-8 lands with `[#1219]` attribution against a root epic whose body still pins the pre-amendment WBS, governing spec, and 22-child decomposition — the contradictory-authority condition the review package asks about directly.

**Smallest sufficient correction.** Replace plan:51-55 with (a) the explicit source-plan filename qualifying the replaced task numbers — "Tasks 12, 13, 14, 17, and 18 of `docs/superpowers/plans/2026-09-01-1219-cloud-test-automation.md` (issues #1237, #1238, #1239, #1242, #1243)" — and (b) a table mapping each of Tasks 1-9 to its governed issue, its parent, and its prerequisites, marking each existing child as replaced, amended, or retained. Then move the #1219/WBS/child-contract repinning from Task 9 Step 5 to a new Task 0 executed before Task 1, so no task commits against contradictory authority.

**Owning artifact.** Implementation plan (Amendment Decomposition), with the corresponding body edits owned by #1219 and the portfolio WBS. No new issue is required.

---

### [finding:F-106] The Task 9 pilot is circular in both trust and path, and activation is missing from the ordering

**Violated invariant.** Global Constraint plan:33-34 (never let candidate lifecycle code certify itself), applied to the step that certifies the protocol itself.

**Evidence.**

- plan:692-702 runs `npx aitm continuous-delivery pilot 1237` and states "Issue #1237 is the existing governed PR-transition child and must be rehydrated from this amendment before use as the pilot."
- **Contract circularity.** #1237 owns Task 12 (`## Story Origin` → `source-plan-section: ## Task 12: Repoint GitHub-Record Test Entry to a PR Transition`), which plan:51-53 lists as replaced. The pilot's contract is one of the contracts the pilot is meant to validate.
- **Readiness.** #1237's bounded section declares `**Prerequisite:** Task 11` (#1236), unmet; #1237's board Status is `backlog` (`npx aitm board 1237`).
- **Path circularity.** #1237's parent is #1223, and #1223 is a sub-issue of #1219 (read-only GraphQL `repository.issue.parent` / `subIssues`). Both #1219 and #1223 record `<!-- aitm-worktree-location … branch="cloud-test-automation" … -->` in their bodies, and `scripts/task-tracker/lib/issue-worktree-location.mjs:63-89` returns the last such record as branch authority, so `resolve-epic-lineage.mjs:79-99` gives #1223 `branch === parentBranch === 'cloud-test-automation'`. The nested tier the pilot must traverse cannot produce a PR.
- **Trust circularity.** The pilot's target `cloud-test-automation` is the branch on which this governance code is being developed, and it is unprotected: read-only `GET /repos/kburson/ai-task-manager/rulesets` returns exactly one active ruleset, `Protect trunk`, `conditions.ref_name.include: ["~DEFAULT_BRANCH"]`. `resolveTrustedRuntime`'s `trusted-target` source (plan:76-78, 102) therefore resolves, for the pilot, to a directly-pushable branch carrying the code under test.
- **Missing activation.** plan:692-711 sequences pilot (Step 7) directly into `enroll-open` (Step 8). The artifact contains no occurrence of "activation" or "activate" anywhere, so the boundary between "new runtime merged" and "new runtime eligible to govern" is never established in the plan.

**Concrete failure mode.** The pilot cannot run as written: its target tier cannot produce a PR, and its issue is Backlog with an unmet prerequisite. If forced past those, it would certify the new protocol by executing the new protocol's own bytes, resolved from an unprotected branch that the authoring session can push to without review — producing a rollout-gate evidence bundle (plan:654-659) whose every record was authored by the code it is supposed to vouch for.

**Smallest sufficient correction.** Two changes to Task 9. (a) Write the ordering explicitly as six numbered stages and split activation into its own step with a named authorizing actor and a durable activation record: implement Tasks 1-8 → deliver them under the **previous** trusted runtime → merge to a protected ref → activate the new runtime → run the pilot → accept the pilot → `enroll-open`. (b) Select a pilot whose target is trunk and whose contract is not among the replaced five; if #1237 must remain, state how its unmet Task 11 prerequisite and its collapsed nested tier are resolved first.

**Owning artifact.** Implementation plan, Task 9. (The tier-collapse question is specification-side; see spec protocol `F-005`.)

---

### [finding:F-107] The "11 commits behind" Global Constraint is factually wrong

**Violated invariant.** A Global Constraint is a precondition an implementer must satisfy before starting; it must state a checkable fact.

**Evidence.**

- plan:28-30: "Before implementation, synchronize the governed #1219 branch with the approved current `origin/trunk`; the planning branch is currently 11 commits behind and must not implement against its stale legacy evidence surface."
- Verified read-only from the canonical worktree: `git rev-list --count c685199a..07984e51` = **2**; `git rev-list --count 07984e51..c685199a` = **23**. The two trunk-side commits are `07984e51 [#1512] Governed PR delivery` and `91e65af2 docs(plan): publish cloud Test delivery architecture [#1219] (#1511)`.
- `git rev-parse origin/trunk` = `07984e5137ba53f56fe062a351e5dd4111fb87bd` — no drift from the pinned review package.
- The constraint's real content is the #1512 delta, and the plan never names it: `99bec143 [#1512] Default AITM sessions to Full-Auto` is reachable from `07984e51` and not from `c685199a`.

**Concrete failure mode.** An implementer who checks the stated fact observes 2, not 11, and cannot determine whether the plan means a different baseline, was written against an earlier state, or is simply wrong. Because the constraint's substance — that #1512's three-gate model and `manual-code-review.mjs` must be visible before Task 5 is designed — is never stated, an implementer who dismisses the count as stale also discards the warning, which is precisely how `F-102` becomes a shipped regression.

**Smallest sufficient correction.** Replace the count with the named baseline: synchronize against `origin/trunk` at `07984e5137ba53f56fe062a351e5dd4111fb87bd`, which carries #1512 (`99bec143`), and state that #1512's `pullRequestReview` gate and `manual-code-review.mjs` policy must be visible to Tasks 5 and 6. Drop the numeric claim entirely; a count in a document is stale the moment trunk moves.

**Owning artifact.** Implementation plan, Global Constraints.

---

## 3. Non-blocking follow-ups

### [finding:N-101] Task 5 under-scopes its replacement of Task 17

plan:51-53 replaces Task 17, but Task 5's Files list (plan:363-370) omits every module Task 17 owns except `delivery-preflight.mjs`. Task 17's own Files are `scripts/task-tracker/lib/delivery-provider-action.mjs`, `delivery-records.mjs`, `delivery-verification.mjs`, `delivery-attribution.mjs`, and `scripts/task-tracker/lib/github-records/capsule-chain.mjs` (`docs/superpowers/plans/2026-09-01-1219-cloud-test-automation.md:1155-1161`), and it defines the `AITM-Validation-Receipt` / `CI-Verified-Sha` / `CI-Run` commit trailers at `:1192-1200`. Moving the merge into Test without those modules leaves the receipt, verification, and attribution surfaces owned by a replaced contract with no successor. Adding them to Task 5's Files, and stating explicitly that commit trailers are projections and never a receipt-authority source, would close it.

### [finding:N-102] Three shipped documentation contracts invalidated by this plan appear in no task's Files list

`skill/shared/rules/deliver.md:8-10` states "Delivery stays in Review and is a re-entrant transaction" — the sentence Task 5 overturns — and appears nowhere in the plan. `skill/shared/rules/full-auto.md:30` states "Do not spawn an implementation-review agent", which conflicts with the flow-review requirement Tasks 3 and 5 implement, and is enforced by `scripts/tests/unit/task-tracker/core/full-auto-default-doc.test.mjs:31`. Task 9's documentation list (plan:626-631) includes neither file nor that test. Whichever way the specification resolves the conflict, both files and the contract test need an owner in this plan.

### [finding:N-103] `skill/shared/rules/review.md` is double-owned across two commit boundaries, and Task 6 does not name the gate it replaces

`skill/shared/rules/review.md` is modified by Task 6 (plan:434, committed at plan:485) and again by Task 9 (plan:628, committed at plan:716). Separately, Task 6 Step 4 says "Replace the current Agent Review Gate with implementation-record validation" (plan:468-472) without naming `scripts/task-tracker/lib/agent-review/review-gate.mjs` or its six validators under `scripts/task-tracker/lib/agent-review/validators/`, several of which — `body-sections.mjs`, `ac-dod-vc-attributes.mjs`, `required-comments.mjs` — are exactly the collateral checks Review is supposed to keep. Naming which validators survive as collateral validation and which are retired would make Step 4 implementable.

### [finding:N-104] The child contracts this plan rehydrates carry a retired test-path convention

#1237, #1238, and #1239 all declare test files under `scripts/task-tracker/tests/...` (each issue's `## Scope` Files list). That directory contains zero files at `07984e51`, while `scripts/tests/**` contains 1129, and the layout is lint-enforced (`package.json:51` runs `lint:test-layout` and `lint:test-reach` as part of `npm run lint`). This plan uses the correct convention throughout, which is right. Since `F-105` requires rehydrating those contracts anyway, correcting their paths in the same pass avoids a second edit.

### [finding:N-105] No task specifies the delivery-receipt schema that Tasks 5, 6, and 7 all depend on

Task 5 must "produce a delivery receipt before the Test-to-Review transition" (plan:380), Task 6 requires "a verified delivery receipt before entry" (plan:443), and Task 7's close preconditions rest on it — but no task defines its shape, and the amendment specification defines only the candidate, flow-review, and implementation-record schemas. This is also the only place a target-branch head SHA could be bound, which Task 5's "stale base" and "lane conflict" test rows (plan:385-386) need something to compare against. Mirrors spec protocol `N-001`.

### [finding:N-106] The enrollment manifest has no provenance contract

Task 9 Step 8 (plan:704-711) consumes `.tmp/aitm/continuous-delivery-open-issues.json` — correctly placed per the repository's runtime-state convention — but Step 4 (plan:669-673) only says the manifest must be "checked". Nothing says the manifest is machine-generated rather than hand-authored, or how a manifest whose live-state observations have gone stale between generation and application is refused. Given that the manifest carries "live issue number, state, PR/merge observation, chosen migration action, and evidence disposition", a hand-edited row is a direct path to inventing the authority plan:673 forbids.

---

## 4. Optional improvements

### [finding:O-101] Repinning last is the expensive ordering

Task 9 Step 5 (plan:675-679) updates `docs/superpowers/specs/2026-09-01-1219-cloud-test-stage-design.md`, the portfolio WBS, and the child contracts at the very end, after Tasks 1-8 have produced eight commits attributed to a root epic whose body still pins the pre-amendment WBS and governing spec. Moving the documentation repinning to the front costs one extra commit and removes the entire window in which committed work contradicts its own governing authority. This overlaps `F-105`'s correction but is worth doing even if `F-105` is resolved differently.

### [finding:O-102] Task 1's example hard-codes live identifiers

plan:90-106 uses `issueNumber: 1219`, `headRef: 'feature/child/1237'`, `targetRef: 'cloud-test-automation'`, and `prNumber: 1511` in what is otherwise a schema illustration. Because `targetRef` here happens to be the real recorded authority for the live #1219 tree, the example reads as a pinned contract rather than a fixture — and it asserts a `feature/child/1237` → `cloud-test-automation` edge that the graph does not currently support (see `F-106`). Obviously synthetic values would keep the example from being mistaken for a decision.

---

## 5. #1486 sequencing verdict

**ADVISABLE CLEANUP, NOT A PREREQUISITE**

Reasoning, grounded in the repository:

- #1486 is behavior-preserving by its own definition. Its `## Scope` describes consolidating five existing sites and bounds itself explicitly: "It does not cover changing `resolveEpicLineage`'s role/branch semantics or `resolveCurrentIssueWorktreeBranch`'s parse contract." Its acceptance criteria require each migrated consumer to "preserve its existing error-surfacing contract".
- Everything Task 5 needs to fix `F-103` is already delivered and directly callable: `scripts/task-tracker/lib/resolve-epic-lineage.mjs:79-109` supplies `parentAuthoritativeBranch` and the graph-derived `parentIssue` that #1485 added precisely so callers stop parsing branch names (`resolve-epic-lineage.mjs:20-23`), and `scripts/task-tracker/merge-back.mjs:128-155` supplies the parent-body mapper. Task 5 can consume both without consolidation.
- The deferral was deliberate and recorded: `docs/superpowers/specs/2026-09-02-1485-merge-back-custom-epic-branch-authority-design.md:46-48` rejects "Centralize every epic graph adapter" for #1485 because it "expands the change surface across independently governed workflows," and #1486's `## Story Origin` records `scope-boundary: … explicitly deferred by #1485's design spec (Approach 3)`.
- No graph coupling exists: #1486 is OPEN with `parent: null` and zero sub-issues (read-only GraphQL), board Status `backlog` (`npx aitm board 1486`), and #1219's `## Plan Metadata` records `**Dependencies**: None`.

The one honest cost of skipping it is that Task 5 becomes a sixth consumer of the duplicated adapter logic. That is a maintainability argument, not a correctness one, and the review standard here explicitly rejects promoting shared-code cleanliness into a blocker. It is required only if the amendment demonstrably cannot preserve target/lineage authority through existing delivered interfaces, and it can.

---

## 6. #1512 compatibility verdict

**INCOMPATIBLE** as written. The plan-side defect is `F-102` and is correctable inside Task 5.

**Gate 1 — manual plan review (Plan → Develop).** Compatible. No task in Tasks 1-9 touches Plan→Develop, `analysisToDevelopment`, or the `aitm-plan-approved` marker path. `gate-resolve.mjs:4-14` and `docs/guides/workflow.md:549` remain intact.

**Gate 2 — manual code review (green CI → merge authority).** Incompatible. Task 5 moves the merge out of `deliver.mjs` (plan:404-407) while naming neither `manual-code-review.mjs` nor `gate-resolve.mjs` and describing the boundary only as "mode-appropriate repository approval" (plan:377-379) — see `F-102`. The plan therefore does not preserve the gate's four shipped conditions (`manual-code-review.mjs:64-96`: configured reviewer, non-author and non-bot, commit OID equal to the accepted head, latest applicable state `APPROVED`), nor the no-intent-no-action-while-waiting behavior (`deliver.mjs:784-791`), nor exit 21 (`full-auto-default-doc.test.mjs:19-22`).

The **ordering** the plan implies is nevertheless correct and worth preserving explicitly: `planTestMerge` requires green CI before approval (plan:377-379), matching the shipped sequence where `fetchRequiredChecks` and preflight run at `deliver.mjs:733-740` before the manual-code-review block at `deliver.mjs:744-793`. Task 5's test table already anticipates "human approval pending" and "Full-Auto bypass" rows (plan:384); those rows only need to be bound to the real policy module.

**Separation of spawned flow review from requested human exact-head approval.** The plan keeps the two artifacts structurally distinct, which is right: Task 3 produces `aitm.flow-review/v1` receipts carrying `provider`, `model`, `agentId`, and a verdict restricted to `pass`/`block`/`pass-with-defect`/`uncertain` (plan:236-238, 246-251), spawned with "a clean context, read-only repository access, and no issue mutation capability" (plan:262-266); the human approval is server-authored GitHub PR-review evidence read back from the PR. Nothing in the plan lets a flow-review receipt stand in for a human approval, and `F-102`'s correction does not change that.

What the plan does **not** state is the precedence between them when `pullRequestReview: true`. `skill/shared/rules/full-auto.md:30` says the spawned agent must not run at all in that mode; #1512's design says it is displaced only "as merge authority" (`docs/superpowers/specs/2026-09-04-1512-full-auto-default-manual-review-overrides-design.md:17`). Task 3 spawns unconditionally (plan:220-281) and Task 5 gates on an "accepted flow review" unconditionally (plan:377-378), so the plan silently adopts the second reading without saying so — and without updating `full-auto.md` or its contract test (`N-102`). That reading is defensible; it just has to be written down and the doctrine files brought with it.

**Gate 3 — manual task review (Review → Done).** Compatible in the plan. Task 6 makes Review's human approval an implementation-record approval after validators pass (plan:468-472) and Task 7 requires "one implementation-record approval" in human mode (plan:508), which maps cleanly onto `reviewToDone` and `resolveReviewAuthorization` (`gate-resolve.mjs:41-66`). The plan does not couple it to the merge gate; the coupling exists only in the specification's mode language and is reported there.

Applying `F-102` — plus writing down the flow-review precedence noted above — makes the plan compatible.

---

## 7. Questions for the author

1. **F-105 disambiguation.** "Tasks 12, 13, 14, 17, and 18" — of which plan? The portfolio WBS that #1219 pins has six tasks; the numbers only resolve against `2026-09-01-1219-cloud-test-automation.md`. And which governed issues own Tasks 1-9: rehydrated #1237/#1238/#1239/#1242/#1243, new children, or a mix?
2. **F-104 ownership.** Does Task 2 now create `scripts/task-tracker/lib/cloud-test/awaiting-ci.mjs` (folding in #1239/Task 14), or does it depend on #1239 delivering it first? The file does not exist at `07984e51` and the plan lists it as `Modify`.
3. **F-102 seams.** Should the Test merge runner import `evaluateManualCodeReview` directly, or should `deliver.mjs`'s existing dependency wiring (`deliver.mjs:1134-1160`) be lifted into a shared module that both the compatibility adapter and the Test runner consume? The second keeps one policy call site during migration.
4. **F-103 disposition.** Is `validateLineage` (`delivery-preflight.mjs:98-103`) being generalized to graph-derived targets, or is child-to-epic delivery staying on `merge-back.mjs`? Task 5 modifies the file that refuses children but names neither outcome.
5. **F-106 pilot.** Given #1237 is Backlog with an unmet Task 11 prerequisite and sits under a nested tier whose recorded branch equals its parent's, is #1237 still the intended pilot? If so, what resolves those two conditions first?
6. **F-101 scope.** Is a trusted executor in scope for this amendment at all, or is Task 1's resolver intended as identity-recording only with execution isolation deferred? If deferred, the plan should say so and name what carries the risk in the interim, because plan:723 currently claims otherwise.

---

## 8. Reviewed SHA and evidence inventory

**Reviewed artifact commit:** `c685199a0729d4792c4c120b2d30d41716a1b077`
**Comparison baseline:** `07984e5137ba53f56fe062a351e5dd4111fb87bd`

Independently verified before review: canonical worktree `HEAD` = `c685199a…`, tracked tree clean, governed branch 2 commits behind and 23 ahead of `07984e51`; `origin/trunk` = `07984e51` (no drift from the pinned package); artifact blob sha256 identical at both commits and equal to the protocol-recorded value.

**Artifact (at `c685199a`)**

- `docs/superpowers/plans/2026-09-04-1219-continuous-agent-delivery-amendment.md` (full, 731 lines)

**Repository documents (at `07984e51`)**

- `docs/superpowers/specs/2026-09-04-1219-continuous-agent-delivery-amendment-design.md` (full, 542 lines)
- `docs/superpowers/plans/2026-09-01-1219-cloud-test-automation.md` — task index (all 22 headings) and Task 12/13/14/15/17 sections including the trailer contract at `:1192-1200`
- `docs/superpowers/plans/2026-09-02-1219-cloud-test-portfolio-wbs.md` — full task/epic structure
- `docs/superpowers/specs/2026-09-01-1219-cloud-test-stage-design.md` (referenced as amended baseline)
- `docs/superpowers/specs/2026-09-04-1512-full-auto-default-manual-review-overrides-design.md` (full)
- `docs/superpowers/plans/2026-09-04-1512-full-auto-default-manual-review-overrides.md` (Tasks 1-4)
- `docs/superpowers/specs/2026-09-02-1485-merge-back-custom-epic-branch-authority-design.md` (Approaches Considered, `:44-48`)
- `docs/guides/workflow.md:539-559`
- `skill/shared/rules/full-auto.md` (full); `skill/shared/rules/deliver.md:1-30`; `skill/shared/rules/review.md`, `close.md`, `evidence.md` (runtime-marker lines); full listing of `skill/shared/rules/`

**Source files (at `07984e51`)**

- `bin/aitm.mjs` (full); `bin/aitm-registry.mjs:27-28`; `package.json:15-19, 20-24, 37-38, 51`
- `scripts/task-tracker/lib/ensure-self-link.mjs:1-69`
- `scripts/task-tracker/lib/gate-resolve.mjs` (full)
- `scripts/task-tracker/lib/manual-code-review.mjs` (full)
- `scripts/task-tracker/verbs/deliver.mjs:1-140, 212-226, 560-600, 700-800, 1130-1160, 1490-1495`
- `scripts/task-tracker/verbs/review.mjs:685-760`, plus demote/test-surface grep
- `scripts/task-tracker/lib/delivery-preflight.mjs:62-120, 175-205, 246-305`
- `scripts/task-tracker/lib/delivery-authority.mjs` (target/lineage grep)
- `scripts/task-tracker/lib/fetch-parent-issue.mjs` (full)
- `scripts/task-tracker/merge-back.mjs:1-160`
- `scripts/task-tracker/lib/resolve-epic-lineage.mjs` (full)
- `scripts/task-tracker/lib/issue-worktree-location.mjs:1-110`
- `scripts/task-tracker/lib/evidence-v2/runtime-capabilities.mjs` (full)
- `scripts/task-tracker/lib/evidence-v2/rehearsal-manifest.mjs:146-215`
- `scripts/tests/unit/task-tracker/core/full-auto-default-doc.test.mjs` (full)
- Listing of `scripts/task-tracker/lib/agent-review/` and its `validators/`
- Existence check at `07984e51` for all 23 `Modify`-target paths and every test glob named in Tasks 1-9; test-layout census (`scripts/tests/**` = 1129 files, `scripts/task-tracker/tests/**` = 0)

**Issues (live, read-only)**

- #1219 — full body: Scope, Story Origin, Plan Metadata, Deep-Dive Analysis, Acceptance Criteria, Verification Commands, Definition of Done, worktree-location markers; board Status `develop`
- #1220 (`develop`), #1221-#1225, #1226 (`review`), #1227, #1228, #1229, #1247 — title/state/labels; board Status sampled for #1219, #1220, #1223, #1226, #1227, #1228, #1237, #1240, #1486
- #1223 — body worktree-location marker; board Status `ready-for-plan`
- #1237, #1238, #1239 — full Scope, Files lists, checklists, Story Origin, Plan Metadata (source-plan-section and Prerequisite fields)
- #1240 — full Scope including BLOCKING CONDITION and `feature/epic/*` ruleset checklist; `BLOCKED` label; board Status `backlog`
- #1241, #1242, #1243 — title/state/labels
- #1485 (CLOSED), #1488 (CLOSED), #1512 (CLOSED) — title/state/labels
- #1486 — full body: Scope (five named sites), Story Origin including `scope-boundary`, Acceptance Criteria, Verification Commands; `parent: null`, zero sub-issues; board Status `backlog`
- Sub-issue graph via read-only GraphQL: #1219 → {#1220…#1225}; #1237 → parent #1223; #1240 → parent #1224

**Repository configuration**

- `GET /repos/kburson/ai-task-manager/rulesets` and `/rulesets/20694244` — single active `Protect trunk`, `~DEFAULT_BRANCH`, `exclude: []`, rules `deletion`, `non_fast_forward`, `pull_request`, `required_status_checks`

**Git observations (read-only)**

- `git rev-parse HEAD`, `git status --porcelain`, `git rev-parse origin/trunk`
- `git rev-list --count c685199a..07984e51` = 2; `git rev-list --count 07984e51..c685199a` = 23
- `git log --oneline 91e65af2..07984e51`; `git log --oneline -1 99bec143`
- `git cat-file blob` sha256 comparison of both amendment documents at `c685199a` and `07984e51`

**Protocol evidence**

- `.scratch/co-review/1219-continuous-agent-delivery-plan-claude/`: `reviewer-handoff.md`, `author-handoff.md`, `state.json`, `start-manifest.json`, `round-1-author-response.md`
- `.scratch/co-review/1219-continuous-agent-delivery-spec-claude/`: `reviewer-handoff.md`, `author-handoff.md`, `state.json`, `start-manifest.json`, `round-1-author-response.md`

**Evidence that could not be read**

- None. Every path named in the artifact resolved at `07984e51` or was confirmed absent; the two confirmed-absent paths (`scripts/task-tracker/lib/cloud-test/awaiting-ci.mjs`, `skill/shared/rules/test.md`) are reported as `F-104`.

**Decision:** changes-requested.
