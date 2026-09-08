# Round 4 Reviewer Review — #1219 Continuous Agent Delivery Amendment (Implementation Plan)

- Reviewer: `claude`
- Artifact: `docs/superpowers/plans/2026-09-04-1219-continuous-agent-delivery-amendment.md`
- Reviewed artifact commit: `c685199a0729d4792c4c120b2d30d41716a1b077`
- Comparison baseline: `07984e5137ba53f56fe062a351e5dd4111fb87bd`
- Preceding author evidence: `.scratch/co-review/1219-continuous-agent-delivery-plan-claude/round-3-author-response.md`
- Required supplements: none declared in protocol state; none acknowledged.

**Artifact state verified before this review.** `git cat-file blob c685199a:docs/superpowers/plans/2026-09-04-1219-continuous-agent-delivery-amendment.md` hashes to `dd1db9ad575a11cf50c56e6016a4bb203ad173064da2b3d01b5b32108b1c6527`, identical to the round-2 review target and to `state.json.artifact.sha256`. Worktree `HEAD` is `c685199a…` with a clean tracked tree. The round-3 response states the artifact is intentionally unchanged, and that is confirmed.

---

## 1. Verdict

**REVISE**

All fifteen round-2 findings were accepted, and the author promoted N-105 and N-106 to blocking on their own initiative — both correctly, since Tasks 5-7 consume a delivery-receipt schema no task defines, and the enrollment manifest is a direct path to manufactured authority. The correction set is now settled and materially better than what I proposed on three points. The artifact itself is unchanged, so nothing is remediated in the plan text and the decision stands.

This round contributes one concession where the author is right and I was wrong, one confirmation of their narrowing, and two new blocking findings that the accepted dispositions create but do not yet cover.

---

## 2. Blocking findings

### [finding:F-111] The F-103 resolution inherits three `merge-back.mjs` behaviors that are incompatible with PR-based delivery, and no task owns removing them

**Violated invariant.** The plan's Global Constraint at plan:45 — "Every mutation is idempotent, read back, and tied to a stable logical key" — and the amendment's rule that merge authority retires on a changed base.

**Why this is new.** F-103's disposition settled *which* path survives (preserve the entry surface, delegate enrolled issues to the common PR/CI/flow-review/receipt service, keep the local implementation for legacy). It did not enumerate what the entry surface currently does before and after the merge, and three of those behaviors cannot be carried into the delegated path.

**Evidence.**

- **Target rewrite.** `scripts/task-tracker/merge-back.mjs:78-81` runs an opportunistic epic sync first: `if (grandparent && !isAncestor(git, grandparent, epicBranch)) { git(['rebase', grandparent, epicBranch]); }`. For the live #1219 tree this rewrites `cloud-test-automation`. F-106's accepted disposition simultaneously requires that literal target to carry non-fast-forward protection before enrollment, and the two cannot both hold.
- **Local test run.** `merge-back.mjs:94` gates the merge on `deps.runTests({ path, branch: childBranch })`, which is the local authoritative suite the amendment moves to hosted CI.
- **Premature cleanup.** `merge-back.mjs:103-104` runs `git worktree remove` and `git branch -d` immediately after the local merge, unconditionally. Under delegated PR delivery, that must not happen before verified merge readback, and on the transport-ambiguous path it must not happen at all until live state is reconciled.
- Task 5's Files list (plan:363-370) does not include `merge-back.mjs` at all, so today no task owns any of the three.

**Concrete failure mode.** An implementer following the F-103 disposition adds a delegation branch at the top of `mergeBack` and leaves the rest of the function intact, because nothing tells them otherwise. The enrolled path then still rebases the protected target (refused by the ruleset, deadlocking the merge), still runs the full local suite the amendment moved to CI, and still deletes the child worktree and branch before the delivery receipt is read back — destroying the recovery inputs the Failure Recovery contract depends on when a merge result is ambiguous.

**Smallest sufficient correction.** Add `scripts/task-tracker/merge-back.mjs` to Task 5's Files (this is also `F-103`'s correction) and state three explicit behaviors for the enrolled branch: no rebase or force-update of the target ref; no local test execution; and no worktree or branch deletion before verified merge readback. Add one RED test per behavior to Task 5 Step 2, asserting the enrolled path emits none of the three while the legacy path is unchanged.

**Owning artifact.** Implementation plan, Task 5.

---

### [finding:F-112] The accepted activation ordering depends on an external, human-gated ruleset change that no task declares as a prerequisite

**Violated invariant.** The plan's Amendment Decomposition requirement that each task be independently acceptable, and the prerequisite discipline the F-104 disposition just committed to ("Every materialized task needs explicit governed prerequisites").

**Why this is new.** F-106's disposition fixes the ordering — "previous-runtime delivery, literal-target protection, durable runtime activation, then a dependency-ready pilot". Round 2 did not examine whether *literal-target protection* is something this plan can schedule. It is not.

**Evidence.**

- The protection work is owned elsewhere and is blocked on a human. Issue #1240's `## Scope` opens with "**BLOCKING CONDITION:** Maintainer approval of the exported ruleset delta. Read-only audit and code preparation may proceed, but the `BLOCKED` label cannot be cleared and live rulesets cannot be mutated until the maintainer explicitly approves the exact external change." Its checklist requires the migration be applied "through an authenticated maintainer session" and to "Stop for explicit maintainer approval after presenting the exported ruleset and deterministic delta". #1240 carries the `BLOCKED` label and board Status `backlog` (`npx aitm board 1240`).
- #1240's coverage does not currently include the target the pilot needs. Its checklist items name `trunk` and `refs/heads/feature/epic/*`; the live authoritative target for every #1219 child is the opaque ref `cloud-test-automation` (#1219 and #1223 body `aitm-worktree-location` markers).
- Live rulesets confirm nothing covers it today: read-only `GET /repos/kburson/ai-task-manager/rulesets` returns one active ruleset, `Protect trunk`, `conditions.ref_name.include: ["~DEFAULT_BRANCH"]`, `exclude: []`.
- Task 9 (plan:617-718) contains no prerequisite on #1240 and no gate on target protection; its Step 7 pilot (plan:692-702) and Step 8 enrollment (plan:704-711) run unconditionally.

**Concrete failure mode.** The revised plan sequences activation after "literal-target protection", but that step is not schedulable by any task in this plan: it requires a maintainer to approve and apply a ruleset delta, in an issue that is labelled `BLOCKED` and whose pattern scope does not yet include the target. An implementer reaching Task 9 either stalls with no recorded dependency explaining why, or proceeds without protection — which reinstates exactly the self-certification exposure F-101 and F-106 were accepted to close, because the pilot's `trusted-target` source is then still a directly-pushable branch.

**Smallest sufficient correction.** Add an explicit prerequisite to Task 9 naming #1240 and the condition it must satisfy — the literal ref `cloud-test-automation` carrying pull-request enforcement, exact-head required checks, deletion protection, and non-fast-forward protection — and record that #1240's pattern scope must widen from `feature/epic/*` to the recorded opaque ref. State that enrollment fails closed until that readback succeeds. No new issue is needed; #1240 already owns the work.

**Owning artifact.** Implementation plan, Task 9 prerequisites, with the scope widening owned by #1240's existing contract.

---

### [finding:F-107] — concession: reclassified as non-blocking

The author is right and I overreached in round 2. My blocking rationale was that a false count causes an implementer to discard the whole constraint including its #1512 warning; that is speculative. The operative instruction at plan:28-29 already says to synchronize with the approved current `origin/trunk`, and an implementer who follows it obtains #1512 regardless of what the count says. The finding fails the "material impact on implementing or safely delivering #1219" test, and I withdraw the blocking classification.

The author's replacement correction is also better than mine: require ancestry of #1512's implementation commit `99bec143fd3c6401076da84ab78fefe65d054d60` rather than pinning `07984e51` into the plan. My proposal would have frozen a moving trunk SHA into a document, which goes stale exactly the way "11 commits" did. Adopting the ancestry framing.

**Corrected classification:** non-blocking, required correction. Remove the numeric claim from plan:28-30; require that the synchronized branch contain `99bec143…`.

---

### Round-2 findings — status on an unchanged artifact

All fifteen remain open in the plan text. The governing correction is now the round-3 disposition wherever it modified mine. No marker is re-emitted, so the protocol's existing `unresolvedFindingIds` entries stand.

- **F-101** (trusted bootstrap/executor) — accepted as written. The pinned-tool-root execution pattern at `scripts/task-tracker/lib/evidence-v2/rehearsal-manifest.mjs:146-147,171-176` is the reference, and the adversarial fixture is the part that actually discharges the plan:723 checklist claim.
- **F-102** (manual code review in Task 5) — accepted as written, and the author's addition of "one shared policy seam serving both the legacy adapter and the enrolled Test runner" answers my round-2 question 3 in the better direction.
- **F-103** (merge-back and lineage) — accepted with modification; see F-111 for the behaviors the modification inherits. The author's caveat, "This is not permission to replace graph authority or parse branch names", is correct and matches `resolve-epic-lineage.mjs:20-23`.
- **F-104** (nonexistent files, missing prerequisites) — accepted with modification. Task 2 owning *creation* of `awaiting-ci.mjs` as the supersession of Task 14 is the cleaner resolution and removes the double-ownership risk I raised.
- **F-105** (task-number ambiguity, no owner map) — accepted as written, including moving the repin ahead of implementation commits.
- **F-106** (pilot circularity) — accepted with modification, and **the author's narrowing is correct; my round-2 phrasing invited the broader reading.** I wrote that "the nested tier the pilot must traverse cannot produce a PR", which is true of #1223's upward boundary but reads as a claim about #1237. It is not one. #1237 has no children and a parent, so `resolve-epic-lineage.mjs:102-109` classifies it `child` with `branch = node.authoritativeBranch || composeBranchName({role:'child', issue:1237})` and `parentBranch` = #1223's authoritative branch. With a distinct recorded story head it can open a PR to `cloud-test-automation` normally. The collapse applies only to #1223 → #1219. The remaining F-106 substance — replaced contract, unmet Task 11 prerequisite, Backlog state, unprotected target, missing activation step — is unaffected, and the author accepts all of it.
- **N-101** (Task 17 inventory) — promoted into the required Task 5 correction. Agreed, and "trailers remain non-authoritative projections" is the right disposition.
- **N-102, N-104** — accepted as written.
- **N-103** — accepted with modification. The author is right that touching `review.md` in two tasks is not inherently defective; requiring the plan to say *why*, plus enumerating which Agent Review validators migrate, are retired, or stay legacy, is the more useful correction.
- **N-105** (delivery-receipt schema) — promoted to blocking by the author, with the assignment placed in Task 1 or Task 5 before Tasks 5-7 consume it. Agreed; the ordering constraint is the important half.
- **N-106** (manifest provenance) — promoted to blocking by the author. Agreed. Requiring the manifest to be generated by the trusted runtime, carry a canonical digest and live-observation provenance, and be revalidated immediately before each idempotent mutation is a stronger contract than the "say it is generated" correction I proposed.
- **O-101, O-102** — accepted as written.

---

## 3. Non-blocking follow-ups

### [finding:N-111] Task 2's supersession of Task 14 leaves #1239's other deliverables unassigned

The F-104 disposition makes Task 2 own creation of `scripts/task-tracker/lib/cloud-test/awaiting-ci.mjs` as the replacement for Task 14. Task 14 / #1239 also contracts changes to four other files — `scripts/task-tracker/lib/epic-children-gate.mjs`, `lib/refine-exit-wip-budget-guard.mjs`, `lib/decomposition-plan-exit-guard.mjs`, and `lib/github-records/projection-repair.mjs` (#1239 `## Scope` Files list) — covering the WIP-exemption predicate and cross-session parking recovery. Task 2's Files (plan:158-163) include none of them, and only `epic-children-gate.mjs` appears anywhere else in the plan (Task 7, plan:499). The F-105 owner/dependency table should record explicitly whether those four are retained under #1239, absorbed into Task 2, or dropped, so the supersession does not silently orphan the WIP-safety half of that contract.

### [finding:N-112] The pilot's `--manifest` and `pilot` verbs need a stated refusal path when protection is absent

Following from F-112: once target protection becomes a precondition, `npx aitm continuous-delivery pilot` (plan:695) and `enroll-open` (plan:707) each need a defined fail-closed behavior when the literal target ref's protection readback fails — a specific refusal, not a silent skip or a partially applied manifest. Task 9 Step 8's expected output (plan:710-711) already anticipates per-issue "specific refusal requiring correction"; naming unprotected-target as one of those refusal reasons closes the loop.

---

## 4. Optional improvements

**None.** Both round-2 optional findings were accepted without modification and need no refinement this round.

---

## 5. #1486 sequencing verdict

**ADVISABLE CLEANUP, NOT A PREREQUISITE**

Unchanged from round 2; the author concurs. The evidence is unaffected by the dispositions: `scripts/task-tracker/lib/resolve-epic-lineage.mjs:79-109` supplies `parentAuthoritativeBranch` and graph-derived `parentIssue`, `scripts/task-tracker/merge-back.mjs:128-155` supplies the parent-body mapper, `docs/superpowers/specs/2026-09-02-1485-merge-back-custom-epic-branch-authority-design.md:46-48` records the deliberate deferral, and #1486 remains OPEN with `parent: null`, zero sub-issues, board Status `backlog`, absent from #1219's `**Dependencies**: None`.

The F-103 disposition marginally reduces the case for sequencing it first rather than strengthening it: routing enrolled issues through one common delivery service means Task 5 adds fewer new lineage call sites than a per-path implementation would.

---

## 6. #1512 compatibility verdict

**INCOMPATIBLE** — unchanged, because the artifact is unchanged. The author concurs, and the plan-side correction set is settled.

- **Manual plan review (`analysisToDevelopment`)** — compatible; no task touches Plan → Develop.
- **Manual code review (`pullRequestReview`)** — incompatible in the current text via F-102: Task 5 relocates merge authority out of `deliver.mjs:741-793` while naming neither `manual-code-review.mjs` nor `gate-resolve.mjs`, describing the boundary only as "mode-appropriate repository approval" (plan:377-379). The accepted correction carries the resolver, configured-reviewer resolution (`manual-code-review.mjs:14-19`), exact-head evidence evaluation (`manual-code-review.mjs:81-96`), the single idempotent request (`deliver.mjs:772-783`), the no-intent/no-action waiting result (`deliver.mjs:784-791`), and the public prompt and exit-21 contract (`deliver.mjs:1492`; `full-auto-default-doc.test.mjs:19-22`) into one shared policy seam.
- **Manual task review (`reviewToDone`)** — compatible in the plan; Tasks 6 and 7 keep it an implementation-record-only gate and do not couple it to the merge gate. The coupling exists only in the specification's mode language and is tracked in that protocol.

**Actor separation.** The plan keeps the two artifacts structurally distinct — Task 3's `aitm.flow-review/v1` receipt is spawned clean-context, read-only, with no issue-mutation capability (plan:236-238, 262-266), and the human approval is server-authored GitHub PR-review evidence — and the round-3 disposition now states the precedence the plan was missing: the displaced ad hoc implementation-review agent does not run; the canonical exact-candidate flow reviewer is a mandatory evidence gate; the human's exact-head approval is an additional `pullRequestReview` authority that no flow receipt can satisfy. Tasks 3, 5, and 9 must carry that reconciliation, together with `skill/shared/rules/full-auto.md:30` and `scripts/tests/unit/task-tracker/core/full-auto-default-doc.test.mjs:31`.

---

## 7. Questions for the author

1. **F-111.** For the enrolled delegation path, are the epic-sync rebase (`merge-back.mjs:78-81`), the local test gate (`:94`), and the post-merge worktree/branch deletion (`:103-104`) all removed, or is any retained? All three are currently unowned by any task.
2. **F-112.** Should Task 9 carry an explicit prerequisite on #1240, and does #1240's pattern scope widen to the literal `cloud-test-automation` ref as part of that? #1240 is `BLOCKED` on maintainer approval, so this is the one step in the accepted ordering that this plan cannot schedule itself.
3. **N-111.** Under Task 2's supersession of Task 14, who owns #1239's remaining four files — the WIP-exemption predicate and parking-recovery surfaces?

---

## 8. Reviewed SHA and evidence inventory

**Reviewed artifact commit:** `c685199a0729d4792c4c120b2d30d41716a1b077`
**Comparison baseline:** `07984e5137ba53f56fe062a351e5dd4111fb87bd`

Independently re-verified this round: worktree `HEAD` = `c685199a…`; `git status --porcelain` empty; artifact blob sha256 `dd1db9ad…` unchanged from round 2 and equal to the protocol-recorded value.

**New evidence read this round**

- `.scratch/co-review/1219-continuous-agent-delivery-plan-claude/round-3-author-response.md` (full)
- `.scratch/co-review/1219-continuous-agent-delivery-spec-claude/round-3-author-response.md` (full — cross-protocol consistency of the F-004/F-103 and F-005/F-106 dispositions)
- `scripts/task-tracker/merge-back.mjs:78-81, 94, 99-104` re-read for F-111
- `scripts/task-tracker/lib/resolve-epic-lineage.mjs:102-109` re-read to check the round-3 narrowing on #1237; the narrowing is correct
- #1239 `## Scope` Files list re-read for N-111
- #1240 `## Scope` BLOCKING CONDITION and ruleset checklist re-read for F-112; board Status re-confirmed

**Carried forward from round 2** (unchanged, not re-read): the full evidence inventory in `round-2-reviewer-review.md` §8 — amendment specification and plan; the 2026-09-01 design, 2026-09-01 plan (all 22 task headings plus Tasks 12/13/14/15/17 and the trailer contract at `:1192-1200`), and 2026-09-02 portfolio WBS; #1512 design and plan; #1485 design; `docs/guides/workflow.md:539-559`; `skill/shared/rules/` full listing plus `full-auto.md` and `deliver.md:1-30`; `bin/aitm.mjs`, `bin/aitm-registry.mjs:27-28`, `package.json`; `ensure-self-link.mjs`, `gate-resolve.mjs`, `manual-code-review.mjs`, `deliver.mjs`, `review.mjs`, `delivery-preflight.mjs`, `delivery-authority.mjs`, `fetch-parent-issue.mjs`, `issue-worktree-location.mjs`, `runtime-capabilities.mjs`, `rehearsal-manifest.mjs`, `full-auto-default-doc.test.mjs`, `agent-review/` listing; the existence check across all 23 `Modify` targets and every test glob in Tasks 1-9; the test-layout census; issues #1219-#1247 sampled with #1237-#1240 and #1486 in full; the sub-issue graph; the live ruleset set; and the git ancestry observations.

**Evidence that could not be read**

- None.

**Decision:** changes-requested.
