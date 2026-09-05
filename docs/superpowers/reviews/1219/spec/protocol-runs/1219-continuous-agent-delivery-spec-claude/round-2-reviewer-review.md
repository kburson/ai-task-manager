# Round 2 Reviewer Review — #1219 Continuous Agent Delivery Amendment (Specification)

- Reviewer: `claude`
- Artifact: `docs/superpowers/specs/2026-09-04-1219-continuous-agent-delivery-amendment-design.md`
- Reviewed artifact commit: `c685199a0729d4792c4c120b2d30d41716a1b077`
- Comparison baseline for all non-artifact evidence: `07984e5137ba53f56fe062a351e5dd4111fb87bd`
- Byte identity independently verified: artifact blob sha256 `e2d64caa4e441da30aad9b9f704ff234f3dde706926ae596055c78cc09cd037f` is identical at `c685199a` and `07984e51`, and matches `state.json.artifact.sha256`.
- Required supplements: none declared in the protocol state (`immutableArtifacts` contains only `round-1-author-response.md`); none acknowledged.

Line citations of the form `spec:N` refer to the artifact at `c685199a`. All other file citations are `path:line` at `07984e51`.

---

## 1. Verdict

**REVISE**

The central correction — Test proves and merges, Review certifies the record — is sound, well-motivated by the #1490 evidence, and the invariant set is mostly coherent. Six boundaries are not yet safe to implement as written: the review-mode model contradicts the review model that shipped two commits ago in #1512; the trusted-runtime section states an identity rather than an execution boundary and, on the live #1219 graph, nominates a candidate-writable branch as the trusted source; and the Hierarchical Delivery section replaces a governed non-trunk path that #1219's own body preserves, on a graph where the nested tier it describes cannot be instantiated.

---

## 2. Blocking findings

### [finding:F-001] The binary Full-Auto/human-gated model collapses #1512's three independent, additive controls

**Violated invariant.** Amendment invariant 11 (spec:133) — "Full-Auto removes human approval gates; it does not remove evidence gates" — is expressed throughout as a single two-valued mode, which is not the shipped policy model.

**Evidence.**

- The specification recognizes exactly two modes: spec:72-73 ("a human-gated mode in which CI passes before a human is invited to approve the PR merge and final implementation record"), spec:213-215, spec:259-261 ("Human-gated mode requests one implementation-record approval after all static validators pass"), spec:495-496.
- #1512 shipped three independent gates: `scripts/task-tracker/lib/gate-resolve.mjs:4-14` defines `analysisToDevelopment`, `pullRequestReview`, `reviewToDone` with independent resolution at `gate-resolve.mjs:16-24`.
- The shipped doctrine is explicit that they are independent: `docs/guides/workflow.md:539` ("AITM has three review boundaries, each independent") and the table at `docs/guides/workflow.md:541-545`; `skill/shared/rules/full-auto.md:18` ("The three controls are independent and additive").
- The independence is contract-tested: `scripts/tests/unit/task-tracker/core/full-auto-default-doc.test.mjs:25-38`.

**Concrete failure mode.** Under spec:213-215 and spec:259-261, one mode selector governs both the Test-stage merge approval and the Review-stage record approval. An operator who runs `npx aitm auto manual-code` (PR approval only) would, implementing this specification literally, also acquire a Review→Done human record gate that `gateReviewToDone=false` says is off; an operator who runs `manual-task` would acquire a merge-blocking PR approval requirement that `gatePullRequestReview=false` says is off. Either direction silently re-enables a gate the operator turned off, which is precisely the failure #1512 was filed to remove.

**Smallest sufficient correction.** In the Merge modes (spec:211-227) and Review (spec:259-261) subsections, replace "human-gated mode" / "Full-Auto mode" with the named gates, binding each boundary to exactly one: the Test-stage merge approval to `pullRequestReview`, the Review-stage implementation-record approval to `reviewToDone`, and state that Plan→Develop (`analysisToDevelopment`) is untouched by this amendment. Restate invariant 11 in the same terms.

**Owning artifact.** Amendment specification.

---

### [finding:F-002] Mandatory pre-merge flow review contradicts the shipped, contract-tested manual-code-review replacement rule

**Violated invariant.** Amendment invariant 8 (spec:127-128) — "Hosted CI plus the fresh-agent review are the minimum Full-Auto merge gates" — is asserted for both modes without reconciling it against the delivered #1512 doctrine that manual code review displaces the spawned agent.

**Evidence.**

- Specification: spec:63-64 ("Refuse merge until hosted CI and a clean-context spawned-agent review both pass"), spec:127-128, spec:213-215 ("passing CI and flow review mark the PR ready for human code approval"), acceptance test 8 at spec:495 ("Human-gated mode waits for PR approval only after CI and flow review pass").
- Shipped skill rule: `skill/shared/rules/full-auto.md:30` — "Manual code review replaces the spawned implementation-review agent for that run. **Do not spawn an implementation-review agent.**"
- That sentence is enforced: `scripts/tests/unit/task-tracker/core/full-auto-default-doc.test.mjs:31` asserts `/do not spawn.*implementation-review agent/i` against `skill/shared/rules/full-auto.md`.
- #1512's own design states a narrower rule: `docs/superpowers/specs/2026-09-04-1512-full-auto-default-manual-review-overrides-design.md:17` — "Manual code review replaces spawned-agent PR implementation review **as merge authority**." The shipped rule text and the shipped design text therefore already differ in scope, and this amendment resolves neither.
- The specification's Documentation Changes list (spec:511-525) never names `skill/shared/rules/full-auto.md`; spec:522 refers only to "Full-Auto documentation" generically.

**Concrete failure mode.** An implementer following this specification with `pullRequestReview=true` must spawn a flow reviewer before requesting the human (spec:213-215, spec:495). Doing so violates `full-auto.md:30` and breaks `full-auto-default-doc.test.mjs:31`. Not doing so violates spec:127-128. There is no reading of the two documents together that is simultaneously satisfiable, and the amendment does not claim to override `full-auto.md`, so the runtime is left with two live doctrines and no precedence rule.

**Smallest sufficient correction.** Add one explicit reconciliation clause to Merge modes (spec:211-215) stating what manual code review replaces. The reading that preserves both documents' intent is #1512's design reading: the flow review always runs as an evidence gate and is never merge authority; when `pullRequestReview=true`, the eligible human's exact-head PR approval is the sole merge authority and the flow-review verdict is advisory input to that human. State that this supersedes the "do not spawn" sentence, and add `skill/shared/rules/full-auto.md` to the Documentation Changes list at spec:511-525 so the contract test is updated in the same change.

**Owning artifact.** Amendment specification (Merge modes + Documentation Changes).

---

### [finding:F-003] The Trusted Runtime Boundary specifies an identity, not an execution boundary, and its named trusted source is candidate-writable on the live #1219 graph

**Violated invariant.** Amendment invariant 9 (spec:129-130) — "A pinned trusted runtime, not candidate-controlled lifecycle code, evaluates gates and performs provider mutations."

**Evidence.**

- The section (spec:403-414) describes what the runtime record *contains* ("The runtime record includes its SHA or immutable package identity", spec:411) and where it is *resolved from* ("from the target branch or an installed release", spec:405-406). It never states that lifecycle verbs must be *executed from* that root. The candidate record's `runtime` field (spec:312-316) is likewise a descriptive triple.
- Actual execution resolution is candidate-local. `bin/aitm-registry.mjs:27-28` computes `REPO_ROOT = path.resolve(HERE, '..')` and `TASK_TRACKER_PATH = <REPO_ROOT>/scripts/task-tracker/task-tracker.mjs`; `bin/aitm.mjs:80-111,136-147` spawns exactly that path. In this dogfooding repository `scripts/task-tracker/lib/ensure-self-link.mjs:29-68` creates `<pkgRoot>/node_modules/ai-task-manager -> <pkgRoot>` whenever `isDevPackage(pkgRoot)` holds (`ensure-self-link.mjs:31-32`), which is true inside a governed worktree. So `npx aitm test|deliver|review|close` run inside a candidate worktree execute the candidate's own gate, receipt-validator, and merge-adapter bytes.
- The nominated trusted source is candidate-writable for this very epic. #1219's body records `<!-- aitm-worktree-location worktree=".../.worktrees/1219-cloud-test-automation" branch="cloud-test-automation" ... -->`, so every #1219 child's immediate target ref is `cloud-test-automation`; and the only live ruleset is `Protect trunk` with `conditions.ref_name.include = ["~DEFAULT_BRANCH"]` (verified by read-only `GET /repos/kburson/ai-task-manager/rulesets`). "trusted-target" therefore resolves to an unprotected branch that the candidate author can push to directly, with no PR, no CI, and no review.
- The activation boundary at spec:411-414 is asserted but unowned: it names no actor, no recorded authority, and no artifact.
- The repository already contains the shape this section needs and does not cite it: `scripts/task-tracker/lib/evidence-v2/rehearsal-manifest.mjs:146-147,171-176` pins a tool root (`realpathSync(toolRoot)`, `rev-parse HEAD`) and spawns the suite with `cwd: pinnedToolRoot` — an actual execution root, not an identity field.

**Concrete failure mode.** A candidate that edits `scripts/task-tracker/lib/continuous-delivery/*.mjs`, `gate-resolve.mjs`, or the merge machine, then runs `npx aitm test #N` in its own worktree, executes the edited bytes to evaluate its own gates and to emit its own `aitm.delivery-candidate/v1` record — including the `runtime` field asserting it used a trusted runtime. Nothing in the specification prevents this, because nothing in it makes the runtime an execution boundary. This is problem 1 of the amendment's own Problem section (spec:44-45) surviving the amendment.

**Smallest sufficient correction.** Rewrite spec:403-414 to state three executable requirements: (a) the trusted runtime is materialized at a root outside the candidate worktree and every lifecycle verb that evaluates gates, validates receipts, or performs provider mutations is spawned from that root; (b) an eligible trusted source is a protected ref or an immutable published package only — an unprotected target branch is not eligible; (c) the activation boundary names its authorizing actor and the record in which activation is durable. Strengthen invariant 9 to say "executes from" rather than "evaluates".

**Owning artifact.** Amendment specification (Trusted Runtime Boundary + Core Invariant 9).

---

### [finding:F-004] Hierarchical Delivery replaces the governed non-trunk `merge-back.mjs` path without saying so, contradicting #1219's own pinned deep-dive and today's hard refusal

**Violated invariant.** Status and Authority (spec:13-18) — the amendment governs only where it "explicitly changes a boundary", and the original design "remains authoritative … unless this amendment explicitly changes a boundary." Hierarchical Delivery changes the child-to-epic delivery boundary without declaring the change.

**Evidence.**

- Specification: spec:280-288 — "a child story targets its recorded epic branch … Each PR receives its own target-aware Test cycle and merge receipt."
- #1219's live body, `## Deep-Dive Analysis (2026-09-02)` section, third paragraph, states the opposite as a preserved contract: "`merge-back.mjs` remains the non-trunk child-to-epic path."
- The current PR delivery path refuses children outright. `scripts/task-tracker/lib/delivery-preflight.mjs:98-103` fails `child-lineage` when `lineage.parentIssueNumber !== null` or `lineage.deliveryTarget !== baseRef`, and `baseRef` is derived solely from `config.trunkRef` at `delivery-preflight.mjs:62-69`; `scripts/task-tracker/verbs/deliver.mjs:566-573` returns the same `child-lineage` refusal. PR-based delivery today is trunk-only and parentless-only.
- The governed non-trunk path is local, not PR-based: `scripts/task-tracker/merge-back.mjs:86` rebases the child, `merge-back.mjs:99-100` performs `git checkout <epic>` + `git merge --ff-only`, and `merge-back.mjs:103-104` deletes the worktree and branch. No PR, no hosted CI, no receipt.
- `merge-back.mjs:94` runs the child's tests locally as a merge precondition, which the amendment's own Non-Goals forbid at spec:90 ("Running the full Test suite locally when a hosted provider is available").

**Concrete failure mode.** Two authorities now describe child-to-epic delivery in opposite terms, and the amendment does not say which wins. An implementer either leaves `merge-back.mjs` in place — in which case children still merge locally with local tests and no candidate/CI/flow-review/delivery receipt, and the amendment's Test-owned merge never applies to any #1219 child — or removes it, silently retiring a path #1219's pinned body preserves and #1485 was delivered to repair.

**Smallest sufficient correction.** Add one paragraph to Hierarchical Delivery (after spec:284) that explicitly states the disposition of `merge-back.mjs` for enrolled issues: either it is retired in favor of per-target PRs (and say so, superseding the #1219 deep-dive sentence), or it is retained for the non-trunk hop (and state which of candidate record, hosted CI, flow review, and delivery receipt bind to it, and how spec:90 is satisfied given `merge-back.mjs:94`).

**Owning artifact.** Amendment specification (Hierarchical Delivery).

---

### [finding:F-005] The three-tier target rule is unsatisfiable on the live #1219 graph, including the pilot path

**Violated invariant.** Hierarchical Delivery (spec:280-284) — "a nested epic targets its parent epic branch" — combined with spec:286 ("Each PR receives its own target-aware Test cycle and merge receipt").

**Evidence.**

- Live graph (read-only GraphQL, `repository.issue.parent`): #1237 → parent #1223 → #1223 is a sub-issue of #1219. #1237 is therefore a child of a nested epic.
- Both tiers record the same authoritative branch. #1219's body carries `<!-- aitm-worktree-location ... branch="cloud-test-automation" ... ts="2026-09-04T16:41:28.958Z" -->`; #1223's body carries `<!-- aitm-worktree-location ... branch="cloud-test-automation" ... ts="2026-09-02T03:56:59.425Z" -->`.
- `scripts/task-tracker/lib/issue-worktree-location.mjs:63-89` returns the last recorded marker as the branch authority, so `resolveCurrentIssueWorktreeBranch` yields `cloud-test-automation` for both #1219 and #1223.
- `scripts/task-tracker/lib/resolve-epic-lineage.mjs:79-99` then gives nested epic #1223 `branch === 'cloud-test-automation'` and `parentBranch === 'cloud-test-automation'`.

**Concrete failure mode.** For #1223, "a nested epic targets its parent epic branch" requires a PR whose head ref and base ref are both `cloud-test-automation`, which cannot be created, and a per-level merge receipt that can never exist. Because #1237 is the specification's own pilot target for the migration (spec:439-442 delegates the pilot to "a bounded #1219 child path"), the tier the pilot must traverse is the tier that cannot be instantiated.

**Smallest sufficient correction.** Add one sentence to Hierarchical Delivery stating the collapse rule: when a nested epic's recorded branch equals its parent's recorded branch, that tier is not a delivery boundary — it produces no PR and no merge receipt, and its children's merges into the shared branch constitute its delivery; its implementation record aggregates child receipts only. (The alternative — requiring a distinct recorded branch per tier — is also acceptable but obliges a live re-record of #1223 before enrollment, which should then be stated.)

**Owning artifact.** Amendment specification (Hierarchical Delivery).

---

### [finding:F-006] "Repository rules remain authoritative" is vacuous for every target this amendment actually uses

**Violated invariant.** Core invariant 2 (spec:117-118) — "The PR is open throughout Test and is merged only after exact-head CI and flow review pass" — read together with Non-Goal spec:86 ("Replacing GitHub branch rules or required checks") and spec:215 ("Repository rules remain authoritative for the approval requirement").

**Evidence.**

- Live rulesets (read-only `GET /repos/kburson/ai-task-manager/rulesets` and `/rulesets/20694244`): exactly one active ruleset, `Protect trunk`, `enforcement: active`, `conditions.ref_name.include: ["~DEFAULT_BRANCH"]`, `exclude: []`, rules `deletion`, `non_fast_forward`, `pull_request`, `required_status_checks`. No ruleset covers `cloud-test-automation` or `feature/epic/*`.
- The governed target for every #1219 child is `cloud-test-automation` (F-003, F-005 evidence).
- The one governed contract that would add non-trunk protection targets a pattern that does not match this ref, and is itself blocked. Issue #1240, `## Scope`, checklist items 1, 2, and 6, protect `refs/heads/feature/epic/*`; its `## Scope` opens with "**BLOCKING CONDITION:** Maintainer approval of the exported ruleset delta"; it carries the `BLOCKED` label and board Status `backlog` (verified via `npx aitm board 1240`).

**Concrete failure mode.** On an unprotected target, GitHub enforces nothing: no required PR, no required exact-head status check, no non-fast-forward protection. The amendment's merge invariant is then enforced solely by AITM's own lifecycle code — which, per F-003, is the candidate's own bytes. A candidate can also bypass the PR entirely with a direct push to the target. Deferring to "repository rules" (spec:215) therefore defers to nothing on precisely the refs this amendment introduces.

**Smallest sufficient correction.** Add one precondition to the Rollout Gate (spec:527-538) or Migration (spec:437-457): an issue whose immediate target is not trunk may be enrolled only when that exact recorded ref — named literally, not by a `feature/epic/*` pattern — carries pull-request enforcement, required exact-head status checks, and non-fast-forward protection. State that the recorded opaque ref is the protection subject, so `cloud-test-automation` is covered rather than assumed to match a naming grammar.

**Owning artifact.** Amendment specification (Rollout Gate / Migration precondition). The corresponding ruleset work is already owned by #1240 and needs no new issue, but #1240's pattern scope will have to widen to the recorded ref.

---

## 3. Non-blocking follow-ups

### [finding:N-001] The delivery receipt — the record that actually carries merge authority — has no schema

The Evidence Model specifies `aitm.delivery-candidate/v1` (spec:299-318), `aitm.flow-review/v1` (spec:325-343), and `aitm.implementation-record/v1` (spec:353-368), but the delivery receipt appears only as a foreign key (`deliveryReceiptId`, spec:359) and as a Done precondition (spec:266-267). Close, Review entry (spec:231), and the merge readback (spec:219-221) all depend on it. It is also the only place a *target head* could be bound: no schema in the amendment carries a target-branch head SHA or a merge-expected-head field, so spec:224's "changed base … retires the candidate merge authority" has no recorded quantity to compare against. Adding the receipt schema with `sourceSha`, `baseSha`, `targetRef`, `targetHeadShaBeforeMerge`, `expectedHeadSha`, `mergeSha`, and `mergeMethod` would close both gaps.

### [finding:N-002] Commit trailers are not excluded as a receipt-reconstruction source

The Failure Recovery row at spec:428 permits reconstructing a delivery receipt "from live PR, commit, candidate, CI, and review records". The #1219 plan being amended defines commit trailers `AITM-Validation-Receipt`, `CI-Verified-Sha`, and `CI-Run` (`docs/superpowers/plans/2026-09-01-1219-cloud-test-automation.md:1192-1200`), which are candidate-authored bytes inside the merged commit message. The amendment neither adopts nor excludes them. Since a candidate controls its own commit message, a trailer must never be an authority source for a receipt that could not otherwise be reconstructed. One sentence stating that trailers are projections and never authority would settle it.

### [finding:N-003] Documentation Changes omits the two rule files this amendment most directly invalidates

`skill/shared/rules/deliver.md:8-10` states "Delivery stays in Review and is a re-entrant transaction" — the exact sentence spec:162-173 overturns — and is absent from the Documentation Changes list at spec:511-525. `skill/shared/rules/full-auto.md` is likewise absent (see F-002). Both should be listed.

### [finding:N-004] A third runtime-identity concept is introduced without reconciling the two that shipped

The amendment's `runtime` triple (spec:312-316) sits alongside the delivered `aitm.runtime-capability/v2` record (`scripts/task-tracker/lib/evidence-v2/runtime-capabilities.mjs:23-50`, with `authorityHostId`, `toolDigest`, `commandCatalogDigest`, and a required entry inventory including `deliver`, `review`, `test`, `close` at `runtime-capabilities.mjs:4-13`) and the `pinnedRuntime { root, sha, digest }` shape at `rehearsal-manifest.mjs:193`. The amendment should say whether its runtime record extends `aitm.runtime-capability/v2` or replaces it; three parallel notions of "which runtime authorized this" is the condition that produced the #1490 evidence tangle.

### [finding:N-005] Migration does not say what happens to approval evidence already bound to an accepted head

The migration row at spec:452 reclassifies "Review with unmerged PR" to Test, and spec:118 says a new candidate "invalidates only candidate-bound CI, review, and merge authority." But `scripts/task-tracker/lib/gate-resolve.mjs:26-35,41-66` binds both human and Full-Auto approval evidence to `acceptedHeadSha`. The amendment should state explicitly that a migration reclassification retires any existing head-bound approval evidence rather than carrying it into the new generation.

---

## 4. Optional improvements

### [finding:O-001] "Flow reviewer" collides with the existing "Agent Review Gate" name

The repository already has an Agent Review Gate (`scripts/task-tracker/lib/agent-review/review-gate.mjs`, with validators at `scripts/task-tracker/lib/agent-review/validators/`), which is a structural collateral validator, not a code reviewer. #1512's design keeps them distinct (`docs/superpowers/specs/2026-09-04-1512-full-auto-default-manual-review-overrides-design.md:17`). A one-line Terminology note (spec:94-109) distinguishing the flow reviewer from the Agent Review Gate would prevent implementers conflating them, particularly since spec:236-243 assigns the gate's current work to Review.

### [finding:O-002] Invariant 4 could name the surfaces it retires

"Review never returns to Develop" (spec:120) is currently implemented in two places — `scripts/task-tracker/verbs/review.mjs:722-724` (`runMoveState(target, 'develop', { extraArgs: ['--demote', ...] })`) inside `emitSandboxVerificationFailureTimeline`, and the gate-objection timeline it mirrors (`review.mjs:688-697`). Naming them in the Lifecycle → Review subsection would make the invariant checkable rather than aspirational.

---

## 5. #1486 sequencing verdict

**ADVISABLE CLEANUP, NOT A PREREQUISITE**

Reasoning, grounded in the repository:

- #1486's own `## Scope` describes a behavior-preserving consolidation of five existing sites and states the boundary explicitly: "It does not cover changing `resolveEpicLineage`'s role/branch semantics or `resolveCurrentIssueWorktreeBranch`'s parse contract."
- The authority the amendment needs — graph-derived numeric parent identity and recorded opaque-branch authority — is already delivered and reachable through existing interfaces: `scripts/task-tracker/lib/resolve-epic-lineage.mjs:79-109` (`parentAuthoritativeBranch`, `parentIssue`) and `scripts/task-tracker/merge-back.mjs:128-155` (`buildMergeBackGraphNode`), both #1485 work. F-004 and F-005 are contradictions in the specification's own delivery model, not defects in those adapters; consolidating five call sites would not resolve either.
- The deferral was deliberate and is recorded: `docs/superpowers/specs/2026-09-02-1485-merge-back-custom-epic-branch-authority-design.md:46-48` rejects "Centralize every epic graph adapter" for #1485 because it "expands the change surface across independently governed workflows."
- Live position confirms no coupling: #1486 is OPEN, board Status `backlog` (`npx aitm board 1486`), with `parent: null` and zero sub-issues (read-only GraphQL), and appears in no #1219 dependency field — #1219's `## Plan Metadata` records `**Dependencies**: None`.

The amendment can preserve target and lineage authority through the delivered interfaces. #1486 would make a sixth consumer unnecessary, which is worth doing, but not before #1219.

---

## 6. #1512 compatibility verdict

**INCOMPATIBLE** as written. Both defects are correctable inside this specification.

**Gate 1 — manual plan review (Plan → Develop).** Compatible and untouched. The amendment does not alter Plan→Develop, and `analysisToDevelopment` (`gate-resolve.mjs:4-14`) and its `aitm-plan-approved` marker enforcement (`docs/guides/workflow.md:549`) remain intact.

**Gate 2 — manual code review (green CI → merge authority).** Incompatible on two counts. First, the specification models it as half of a binary mode rather than as the independent `pullRequestReview` gate (F-001). Second, the specification requires the spawned flow review to run and pass before the human is invited (spec:213-215, spec:495), while the shipped rule at `skill/shared/rules/full-auto.md:30` forbids spawning that agent at all in this mode, enforced by `scripts/tests/unit/task-tracker/core/full-auto-default-doc.test.mjs:31` (F-002).

What the specification *does* get right on this gate, and should keep: it never treats the flow-review receipt as a substitute for human approval — `aitm.flow-review/v1` (spec:325-347) carries `provider`, `model`, `agentId`, and a `verdict`, and spec:126 forbids the reviewer approving "a different SHA than the one it inspected", which matches the shipped policy that the approval must be an eligible human's, non-author, non-bot, latest-applicable, exact-head `APPROVED` review (`scripts/task-tracker/lib/manual-code-review.mjs:64-96`; `docs/guides/workflow.md:553`). The separation of the two artifacts is clean. What is missing is the precedence rule between them.

The CI-before-request ordering the specification states (spec:213-215) does match the shipped implementation: `scripts/task-tracker/verbs/deliver.mjs:733-743` fetches required checks and runs preflight before the manual-code-review block at `deliver.mjs:744-793`, which requests the reviewer at most once (`deliver.mjs:772-783`) and returns `manual-review-required` with no delivery intent and no merge action, surfacing `PROMPT_REQUIRED: manual-code-review` at `deliver.mjs:1492`. Moving that block from `deliver.mjs` into the Test merge machine preserves the ordering, but the specification must say that the gate moves with it — spec:211-227 currently describes only "human code approval" without naming the policy that decides eligibility.

**Gate 3 — manual task review (Review → Done).** Independence is not preserved. spec:259-261 folds the implementation-record approval into the same "human-gated mode" as the merge approval (F-001). Otherwise the amendment's Review scope is compatible: an implementation-record-only gate is exactly what `reviewToDone` and `resolveReviewAuthorization` (`gate-resolve.mjs:41-66`) already express, and spec:266-272's close preconditions map onto the existing marker-based enforcement (`docs/guides/workflow.md:551`).

Applying F-001 and F-002 makes the amendment compatible; no other #1512 conflict was found.

---

## 7. Questions for the author

1. **F-002 precedence.** Which reading of "manual code review replaces the spawned agent" do you intend — #1512's design reading (replaces it *as merge authority*, agent still runs) or the shipped rule's reading (agent does not run at all)? The answer determines whether `full-auto.md:30` and `full-auto-default-doc.test.mjs:31` are amended or the specification is.
2. **F-004 disposition.** Is `merge-back.mjs` retired for enrolled issues, or retained for the non-trunk hop? #1219's deep-dive preserves it; spec:280-288 appears to replace it. If retained, does the child-to-epic hop carry a candidate record, hosted CI, and a delivery receipt, and how is spec:90 satisfied given the local test run at `merge-back.mjs:94`?
3. **F-005 collapse rule.** #1219 and #1223 both record `cloud-test-automation`. Do you intend the nested tier to collapse (no PR, no receipt for #1223), or should #1223 be re-recorded onto a distinct branch before enrollment?
4. **F-003 activation.** Who performs the "explicit activation boundary" at spec:411-414, and in which durable record is activation stored? Without a named authority the boundary cannot be audited.
5. **N-001.** Is the delivery-receipt schema deliberately deferred to the plan, or should it appear in the Evidence Model alongside the other three? Its absence is what leaves target-head binding unspecified.

---

## 8. Reviewed SHA and evidence inventory

**Reviewed artifact commit:** `c685199a0729d4792c4c120b2d30d41716a1b077`
**Comparison baseline:** `07984e5137ba53f56fe062a351e5dd4111fb87bd`

Independently verified before review: canonical worktree `HEAD` = `c685199a…`, tracked tree clean, governed branch 2 commits behind and 23 ahead of `07984e51`; `origin/trunk` = `07984e51` (no drift from the pinned package); artifact blob sha256 identical at both commits and equal to the protocol-recorded value.

**Artifact (at `c685199a`)**

- `docs/superpowers/specs/2026-09-04-1219-continuous-agent-delivery-amendment-design.md` (full, 542 lines)

**Repository documents (at `07984e51`)**

- `docs/superpowers/plans/2026-09-04-1219-continuous-agent-delivery-amendment.md` (full, 731 lines)
- `docs/superpowers/plans/2026-09-01-1219-cloud-test-automation.md` (task index; Task 12/13/14/15/17/18 sections)
- `docs/superpowers/plans/2026-09-02-1219-cloud-test-portfolio-wbs.md` (task/epic structure)
- `docs/superpowers/specs/2026-09-01-1219-cloud-test-stage-design.md` (referenced as amended baseline)
- `docs/superpowers/specs/2026-09-04-1512-full-auto-default-manual-review-overrides-design.md` (full)
- `docs/superpowers/plans/2026-09-04-1512-full-auto-default-manual-review-overrides.md` (Tasks 1-4)
- `docs/superpowers/specs/2026-09-02-1485-merge-back-custom-epic-branch-authority-design.md` (Approaches Considered)
- `docs/guides/workflow.md:539-559`
- `skill/shared/rules/full-auto.md` (full)
- `skill/shared/rules/deliver.md:1-30`
- `skill/shared/rules/review.md`, `skill/shared/rules/close.md`, `skill/shared/rules/evidence.md` (runtime-marker lines)

**Source files (at `07984e51`)**

- `scripts/task-tracker/lib/gate-resolve.mjs` (full)
- `scripts/task-tracker/lib/manual-code-review.mjs` (full)
- `scripts/task-tracker/verbs/deliver.mjs:1-140, 212-226, 560-600, 700-800, 1130-1160, 1490-1495`
- `scripts/task-tracker/verbs/review.mjs:685-760` and grep of demote/test surfaces
- `scripts/task-tracker/lib/delivery-preflight.mjs:62-120, 175-205, 246-305`
- `scripts/task-tracker/lib/delivery-authority.mjs` (target/lineage grep)
- `scripts/task-tracker/lib/fetch-parent-issue.mjs` (full)
- `scripts/task-tracker/merge-back.mjs:1-160`
- `scripts/task-tracker/lib/resolve-epic-lineage.mjs` (full)
- `scripts/task-tracker/lib/issue-worktree-location.mjs:1-110`
- `scripts/task-tracker/lib/ensure-self-link.mjs:1-69`
- `bin/aitm.mjs` (full), `bin/aitm-registry.mjs:27-28`, `package.json:15-19`
- `scripts/task-tracker/lib/evidence-v2/runtime-capabilities.mjs` (full)
- `scripts/task-tracker/lib/evidence-v2/rehearsal-manifest.mjs:146-215`
- `scripts/tests/unit/task-tracker/core/full-auto-default-doc.test.mjs` (full)
- Existence check at `07984e51` for every path named in the amendment plan's Files lists

**Issues (live, read-only)**

- #1219 — full body: Scope, Story Origin, Plan Metadata, Deep-Dive Analysis, Acceptance Criteria, Verification Commands, Definition of Done, worktree-location markers; board Status `develop`
- #1220 (`develop`), #1221-#1225, #1226 (`review`), #1227, #1228, #1229, #1247 — title/state/labels; board Status sampled for #1219, #1220, #1223, #1226, #1227, #1228, #1237, #1240, #1486
- #1223 — body worktree-location marker; board Status `ready-for-plan`
- #1237, #1238, #1239 — full Scope/Files/checklist and Plan Metadata
- #1240 — full Scope including BLOCKING CONDITION and ruleset checklist; `BLOCKED` label; board Status `backlog`
- #1485 (CLOSED), #1488 (CLOSED), #1512 (CLOSED) — title/state/labels
- #1486 — full body: Scope, Story Origin, Acceptance Criteria, Verification Commands; `parent: null`, zero sub-issues; board Status `backlog`
- Sub-issue graph via read-only GraphQL: #1219 → {#1220…#1225}; #1237 → parent #1223; #1240 → parent #1224

**Repository configuration**

- `GET /repos/kburson/ai-task-manager/rulesets` and `/rulesets/20694244` — single active `Protect trunk`, `~DEFAULT_BRANCH`, rules `deletion`, `non_fast_forward`, `pull_request`, `required_status_checks`

**Protocol evidence**

- `.scratch/co-review/1219-continuous-agent-delivery-spec-claude/`: `reviewer-handoff.md`, `author-handoff.md`, `state.json`, `start-manifest.json`, `round-1-author-response.md`
- `.scratch/co-review/1219-continuous-agent-delivery-plan-claude/`: `reviewer-handoff.md`, `round-1-author-response.md`, `state.json`

**Evidence that could not be read**

- None. Every path named in the amendment plan resolved or was confirmed absent at `07984e51`; the two confirmed-absent paths (`scripts/task-tracker/lib/cloud-test/awaiting-ci.mjs`, `skill/shared/rules/test.md`) belong to the plan protocol and are reported there, not here.

**Decision:** changes-requested.
