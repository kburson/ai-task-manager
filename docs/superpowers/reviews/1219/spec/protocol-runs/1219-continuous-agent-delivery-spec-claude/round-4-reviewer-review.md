# Round 4 Reviewer Review — #1219 Continuous Agent Delivery Amendment (Specification)

- Reviewer: `claude`
- Artifact: `docs/superpowers/specs/2026-09-04-1219-continuous-agent-delivery-amendment-design.md`
- Reviewed artifact commit: `c685199a0729d4792c4c120b2d30d41716a1b077`
- Comparison baseline: `07984e5137ba53f56fe062a351e5dd4111fb87bd`
- Preceding author evidence: `.scratch/co-review/1219-continuous-agent-delivery-spec-claude/round-3-author-response.md`
- Required supplements: none declared in protocol state; none acknowledged.

**Artifact state verified before this review.** `git cat-file blob c685199a:docs/superpowers/specs/2026-09-04-1219-continuous-agent-delivery-amendment-design.md` hashes to `e2d64caa4e441da30aad9b9f704ff234f3dde706926ae596055c78cc09cd037f`, identical to the round-2 review target and to `state.json.artifact.sha256`. Worktree `HEAD` is `c685199a…` with a clean tracked tree. The round-3 response states the artifact is intentionally unchanged, and that is confirmed: no normative text has been corrected yet.

---

## 1. Verdict

**REVISE**

The round-3 dispositions accept every round-2 finding and, on F-002, F-003, F-004, and N-001, replace my proposed corrections with stronger ones. I agree with all four modifications; they are recorded below as the governing correction set. But the artifact is byte-identical to the one I reviewed in round 2, so all thirteen findings remain unremediated in the normative text, and the decision cannot change on an unchanged artifact.

Two additions this round: one concession where the author is right about my round-2 wording, and one new blocking finding that the F-004 and F-006 dispositions create together and that neither disposition yet covers.

---

## 2. Blocking findings

### [finding:F-011] The chosen merge-back resolution collides with the target protection the F-006 disposition requires, and the specification has no rule for rewriting an enrolled target ref

**Violated invariant.** Core invariant 3 (spec:117-118) — "Every code or repository-document change creates a new candidate SHA and invalidates only candidate-bound CI, review, and merge authority" — and the merge-authority retirement rule at spec:223-225 ("Merge conflict, stale head, changed base, or expected-head rejection retires the candidate merge authority").

**Why this is new.** It is not a restatement of F-004 or F-006. It is the interaction the two accepted dispositions produce. F-004's disposition preserves `merge-back.mjs` as the governed child-to-parent entry surface, delegating to the PR service for enrolled issues. F-006's disposition requires the literal target ref to carry non-fast-forward and deletion protection before enrollment. The specification currently contains no statement about whether an enrolled target ref may have its history rewritten, and the preserved entry surface does exactly that.

**Evidence.**

- `scripts/task-tracker/merge-back.mjs:78-81` performs an opportunistic epic sync before anything else: `if (grandparent && !isAncestor(git, grandparent, epicBranch)) { git(['rebase', grandparent, epicBranch]); }`. This rewrites the epic branch — for the live #1219 tree, `cloud-test-automation` — whenever its parent has advanced.
- Two further behaviors in the same function are incompatible with PR-based delivery and are not addressed by the F-004 disposition's "delegate to the same service" framing: `merge-back.mjs:94` runs the child's tests locally as a merge precondition (`if (!deps.runTests({ path, branch: childBranch }))`), which the amendment forbids at spec:90; and `merge-back.mjs:103-104` deletes the child worktree and branch immediately after the merge, unconditionally, which under PR delivery must not occur before merge readback (spec:219-221) completes.
- The specification's only statement about the target moving is spec:157-158 — "A later target-branch advance may still force another refresh" — which contemplates the target *advancing*, not being *rewritten*. Nothing distinguishes the two.

**Concrete failure mode.** With `cloud-test-automation` protected per F-006's disposition, the `git rebase grandparent epicBranch` at `merge-back.mjs:79-80` produces a local history that can only reach the remote by force, which non-fast-forward protection refuses — so the preserved entry surface deadlocks on exactly the refs the amendment enrolls. If protection is not yet in place and the rewrite lands, every open sibling candidate targeting that ref has its recorded `baseSha` (spec:307) invalidated at once; under spec:223-225 each retires its merge authority and returns to Develop, and the specification gives no way to distinguish that mass invalidation from genuine per-candidate staleness.

**Smallest sufficient correction.** Add one sentence to Hierarchical Delivery, alongside the F-004 correction: an enrolled target ref advances only by fast-forward or merge commit and is never rebased or force-updated; a child that has fallen behind refreshes its own head against the target rather than the target being rewritten beneath it. State that for enrolled issues the delegating entry surface performs no local test run and no branch or worktree deletion before verified merge readback.

**Owning artifact.** Amendment specification (Hierarchical Delivery), landing with the F-004 correction.

---

### Round-2 findings — status on an unchanged artifact

All thirteen remain open in the normative text. Recorded here for continuity, with the governing correction now being the round-3 disposition where it modified mine. No marker is re-emitted, so the protocol's existing `unresolvedFindingIds` entries stand.

- **F-001** (three independent gates) — accepted as written. Correction stands.
- **F-002** (flow review vs. manual code review) — the author's modification is better than my proposal and I withdraw the "advisory" framing. The governing model is: the old ad hoc spawned implementation-review agent is displaced and does not run; the new canonical Test-stage flow reviewer always runs as a mandatory exact-candidate evidence gate; when `pullRequestReview=true` the eligible human's exact-head approval is an *additional* merge-authorization gate that no flow receipt can satisfy. This is the reading that preserves both #1512's intent and this amendment's invariant 8, and it does so without reintroducing human latency, since the flow reviewer is automated. `skill/shared/rules/full-auto.md:30` and `scripts/tests/unit/task-tracker/core/full-auto-default-doc.test.mjs:31` must be updated in the same change.
- **F-003** (trusted runtime) — the author is right that my round-2 text overstated the artifact. spec:405 does say "Lifecycle authorization **runs from** a pinned trusted runtime", so the section is not identity-only, and I withdraw that characterization. The finding survives on its substance: spec:405-406 permits "the target branch" as an eligible source, and for every #1219 child that target is `cloud-test-automation`, which the live ruleset set leaves unprotected and directly pushable. The accepted correction — an execution root outside the candidate worktree, eligible sources restricted to protected immutable refs or immutable installed packages, and a durable `aitm.runtime-activation/v1` record authorized by the previously trusted runtime on the designated authority host — resolves it.
- **F-004** (merge-back) — accepted with the author's modification: preserve the entry surface, delegate enrolled issues to the common PR/CI/flow-review/receipt service, retain the local implementation for legacy issues only. See F-011 for the consequence this creates.
- **F-005** (shared-ref tier collapse) — accepted, and the author's added corollary is the necessary one: a story still requires its own distinct bound head before opening a PR to the shared ref. That corollary is also what makes the F-106 refinement in the plan protocol correct.
- **F-006** (target protection) — accepted. Note that #1240, which owns the ruleset work, carries the `BLOCKED` label pending maintainer approval of the exported ruleset delta and is board Status `backlog`; the enrollment precondition therefore has a human-gated external dependency that the Rollout Gate should name.
- **N-001** — promoted to the required revision set by the author, with a fuller field list than I proposed. Agreed.
- **N-002, N-003, N-004, N-005** — accepted as written.
- **O-001, O-002** — accepted as written.

---

## 3. Non-blocking follow-ups

### [finding:N-011] The activation record needs an authorship restriction, not only an authorizing host

The F-003 disposition introduces a durable `aitm.runtime-activation/v1`-style record "authorized by the previously trusted runtime on the designated authority host". That is the right shape, and the designated-authority-host concept already exists in the delivered evidence-v2 surface (`scripts/task-tracker/lib/evidence-v2/runtime-capabilities.mjs:33,71-72`, `authorityHostId` with `authority-host-mismatch` refusal). One property should be stated explicitly when the section is written: a runtime may never author or countersign its own activation record. Without that, an activation record is just another record the newly activated runtime can emit about itself, and the boundary at spec:411-414 reduces to the identity problem F-003 already identified one layer up.

### [finding:N-012] The Rollout Gate should name its external human dependency

F-006's enrollment precondition depends on ruleset changes that only a maintainer can apply — #1240's `## Scope` opens with "**BLOCKING CONDITION:** Maintainer approval of the exported ruleset delta", and its checklist requires the migration be applied "through an authenticated maintainer session". The Rollout Gate (spec:527-538) currently lists only evidence the pilot produces. Adding the protection precondition as a named gate item makes the human step visible in the sequence rather than discovered at enrollment time.

---

## 4. Optional improvements

**None.** Both round-2 optional findings (O-001 terminology, O-002 Review-to-Develop surfaces) were accepted and need no refinement. The author's O-001 disposition correctly widens the terminology entry to three actors — the new clean-context flow reviewer, the displaced ad hoc implementation-review agent, and the existing structural Agent Review Gate — which is what makes the F-002 model legible in the text.

---

## 5. #1486 sequencing verdict

**ADVISABLE CLEANUP, NOT A PREREQUISITE**

Unchanged from round 2, and the author concurs. The reasoning is unaffected by any round-3 disposition: `scripts/task-tracker/lib/resolve-epic-lineage.mjs:79-109` and `scripts/task-tracker/merge-back.mjs:128-155` already supply the graph-derived parent identity and opaque-branch authority the amendment needs; `docs/superpowers/specs/2026-09-02-1485-merge-back-custom-epic-branch-authority-design.md:46-48` records the deliberate deferral; and #1486 remains OPEN, `parent: null`, zero sub-issues, board Status `backlog`, absent from #1219's `**Dependencies**: None`.

Worth noting that the F-004 disposition slightly *strengthens* this verdict rather than weakening it: routing enrolled issues through a common delivery service reduces the number of lineage call sites the amendment adds, so the duplication #1486 addresses does not grow materially from this work.

---

## 6. #1512 compatibility verdict

**INCOMPATIBLE** — unchanged, because the artifact is unchanged. The author concurs and the correction set is now settled.

The three gates, restated against the accepted model:

- **Manual plan review (`analysisToDevelopment`, Plan → Develop)** — compatible and untouched by this amendment.
- **Manual code review (`pullRequestReview`, green CI → merge authority)** — incompatible in the current text on both counts from round 2: the binary mode language (F-001) and the unreconciled flow-review requirement (F-002). Under the accepted F-002 model the two actors are cleanly separated: the canonical flow reviewer is a mandatory automated evidence gate bound to the exact candidate, and the human's exact-head PR approval is a separate, additional merge-authorization gate. The specification must say that a flow-review receipt can never satisfy the human gate, and that enabling this gate does not disable the flow review — which is precisely the inverse of what `skill/shared/rules/full-auto.md:30` says today, hence the paired doctrine update.
- **Manual task review (`reviewToDone`, Review → Done)** — incompatible only through F-001's mode collapse at spec:259-261; the underlying Review scope is compatible with `resolveReviewAuthorization` (`scripts/task-tracker/lib/gate-resolve.mjs:41-66`).

Applying F-001 and F-002 as dispositioned makes the specification compatible. No further #1512 conflict was found this round.

---

## 7. Questions for the author

1. **F-011.** Is the epic-sync rebase at `merge-back.mjs:78-81` retired for enrolled targets, or is the target ref expected to be rewritable? The F-006 disposition's non-fast-forward requirement and that rebase cannot both hold on `cloud-test-automation`.
2. **N-011.** Should the activation record explicitly forbid a runtime from authoring or countersigning its own activation, and does `authorityHostId` (`runtime-capabilities.mjs:33`) become the binding for the authorizing host?

Both are narrow; neither blocks drafting the revision.

---

## 8. Reviewed SHA and evidence inventory

**Reviewed artifact commit:** `c685199a0729d4792c4c120b2d30d41716a1b077`
**Comparison baseline:** `07984e5137ba53f56fe062a351e5dd4111fb87bd`

Independently re-verified this round: worktree `HEAD` = `c685199a…`; `git status --porcelain` empty; artifact blob sha256 `e2d64caa…` unchanged from round 2 and equal to the protocol-recorded value.

**New evidence read this round**

- `.scratch/co-review/1219-continuous-agent-delivery-spec-claude/round-3-author-response.md` (full)
- `.scratch/co-review/1219-continuous-agent-delivery-plan-claude/round-3-author-response.md` (full — read for cross-protocol consistency of the F-004/F-103 and F-005/F-106 dispositions)
- `docs/superpowers/specs/2026-09-04-1219-continuous-agent-delivery-amendment-design.md:403-414` re-read verbatim to check the round-3 objection to my F-003 wording; the objection is correct
- `scripts/task-tracker/merge-back.mjs:78-81, 94, 99-104` re-read for the F-011 interaction

**Carried forward from round 2** (unchanged, not re-read): the full evidence inventory in `round-2-reviewer-review.md` §8 — amendment specification and plan; the 2026-09-01 design, 2026-09-01 plan, and 2026-09-02 portfolio WBS; #1512 design and plan; #1485 design; `docs/guides/workflow.md:539-559`; `skill/shared/rules/` (full listing, plus `full-auto.md`, `deliver.md:1-30`); `gate-resolve.mjs`, `manual-code-review.mjs`, `deliver.mjs`, `review.mjs`, `delivery-preflight.mjs`, `delivery-authority.mjs`, `fetch-parent-issue.mjs`, `merge-back.mjs`, `resolve-epic-lineage.mjs`, `issue-worktree-location.mjs`, `ensure-self-link.mjs`, `bin/aitm.mjs`, `bin/aitm-registry.mjs`, `package.json`, `runtime-capabilities.mjs`, `rehearsal-manifest.mjs`, `full-auto-default-doc.test.mjs`; issues #1219-#1247 sampled, #1237-#1240 in full, #1485/#1488/#1512, #1486 in full; the sub-issue graph; and the live ruleset set.

**Evidence that could not be read**

- None.

**Decision:** changes-requested.
