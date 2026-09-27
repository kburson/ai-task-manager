<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-9db94a29416795699db536014299a9a6"
role: "reviewer"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/plans/2026-09-27-1830-mutation-guard-context.md"
artifact_commit: "fd37bb0427d9e2e876084110b2fc5a8aaf13c664"
artifact_blob: "873e5be211682e8a7698e9176c2e59d4eeee913d"
artifact_digest: "sha256:0001d47ccbceefff30559be86bac66e6fb26abd09228a71bc7cff953369885c7"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5"
  model_display: "Claude Opus 5"
  session_fingerprint: "sha256:88456a5175584c25e8366623b2a32c0cef6ebfff68c38191fc362d8f50486e4b"
  identity_source: "declared"
started_at: "2026-09-27T21:03:38.690Z"
submitted_at: "2026-09-27T21:31:00.827Z"
finding_ids: ["R1-F001","R1-F002","R1-F003","R1-F004"]
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Independent peer review of r3 (`0001d47c…`) of `docs/superpowers/plans/2026-09-27-1830-mutation-guard-context.md`
against the live baseline in this worktree and against issue 1830's six
acceptance criteria and six verification commands.

Method: full-document read of r3, then direct inspection of the runtime seams
the plan names — `scripts/task-tracker/activity-policy.mjs`,
`scripts/task-tracker/activity-guard.mjs`, `scripts/task-tracker/source-edit-gate.mjs`,
`scripts/task-tracker/lib/apply-patch-targets.mjs`,
`scripts/task-tracker/lib/ownership-policy.mjs`, and
`scripts/task-tracker/lib/installed-guard-path.mjs` — plus existence checks on
the five test files named in VC1 and a read of the live issue body. The four
prior SAR passes are treated as the author's own drafting record, not as review
authority; nothing below is carried over from them.

The plan's factual claims about the baseline hold up. Specifically verified as
accurate, not assumed:

- `classifyBash` recognizes only `/^git\s+commit\b/` and returns `COMMIT_CODE`
  unconditionally (`activity-policy.mjs:283`), so `git -C . commit` is not
  classified. Confirmed.
- `activity-guard.mjs` derives `projectRoot` from a `git rev-parse` rooted in the
  hook process cwd, falling back to `process.cwd()` (`activity-guard.mjs:65-76`).
  Confirmed.
- `source-edit-gate.mjs` blanket-refuses every gated tool in `PRE_DEVELOP_STATES`
  without consulting `classifyEdit` (`source-edit-gate.mjs:164-177`), while the
  post-develop lock at `source-edit-gate.mjs:188-190` is class-aware. The plan's
  "source-edit unconditionally refuses Plan edits even when the activity matrix
  permits documentation" is exactly right.
- `extractApplyPatchTargets` requires `lines.at(-1) === '*** End Patch'` after
  `text.split(/\r?\n/)` (`apply-patch-targets.mjs:23-26`), so one terminal newline
  yields an empty final element and the documented refusal. Confirmed.
- `ownershipDecision` returns `ok: true` for the `team-unassigned` verdict
  (`ownership-policy.mjs:65`). The plan's warning not to lean on that helper for
  the new allowance is correct and non-obvious.
- All five VC1 test paths exist at the reviewed baseline.
- The estimate narrative matches the live body: `aitm-refinement-snapshot` carries
  `estimate="3"`, `aitm-fields` carries `"estimate":6.5`.
- Both patch call sites use the `patch || input || text` chain
  (`activity-guard.mjs:83-85`, `source-edit-gate.mjs:413-415`), so a string-valued
  `tool_input` degrades to `''` and produces the boundary refusal. The plan's
  shared-transport requirement is grounded, not speculative.

The plan's honesty boundaries are also correct and should survive any revision
verbatim: the preflight-snapshot limitation, the trusted-pre-existing-hook
limitation, the "probes are evidence of old behavior, not passing tests"
statement, and the separation of document convergence from Plan approval.

Four required changes remain. Three are places where the plan states the correct
outcome in prose or in the matrix but does not name the code seam whose current
shape defaults the other way — so a faithful implementer can satisfy the prose and
still ship the wrong behavior. The fourth is an evidence-traceability gap between
the plan's central new deliverable and the only verification command the issue's
acceptance criteria cite.

## Findings

### R1-F001 — New commit class is fail-open in the no-binding state

`isAllowed` is deny-by-exclusion when `state == null`
(`scripts/task-tracker/activity-policy.mjs:319-331`):

- it returns `false` for exactly `WRITE_CODE` and `COMMIT_CODE`;
- it returns `true` for every other class.

`activity-guard.mjs:96` reduces an unbound or paused session to `state = null`
(`const state = activeIssue ? recordedState : null;`), and the comment there
documents the default-allow intent for the *existing* class set.

Consequence: the instant a `COMMIT_DOCS` class exists,
`isAllowed(null, 'COMMIT_DOCS')` returns `true`. A session with no bound issue —
including a paused session, which is the state this worktree is in right now —
would receive the documentation-commit allowance with no binding, no ownership
check, and no state check. That is the precise inverse of the plan's own matrix
row:

| No active binding or unknown state | No new permission | Refuse | Existing fail-closed rules |

The plan asserts the outcome and is silent on the mechanism. Nothing in "Guard
ordering and lifecycle matrix" or in the acceptance mapping tells the implementer
that the null-state branch must be inverted into an allowlist, or that
`COMMIT_DOCS` must join its refusal list. The AC4 mapping row does list "missing
binding", but scopes it to the Plan edit-stage-commit walkthrough rather than to
the unbound-session case; the AC3 row covers only index shapes.

This matters more than an ordinary omission because the failure mode is silent.
The new class simply inherits `true`, every listed positive test still passes, and
no negative test named in the current mapping would catch it.

**Required:** state explicitly that the `state == null` / unknown-state branch of
`isAllowed` becomes an allowlist (or that `COMMIT_DOCS` joins its refusal set), and
add an explicit "unbound or paused session attempts a `COMMIT_DOCS` commit →
refuse" negative to the AC3 or AC4 proof column so the regression table carries it.

### R1-F002 — Installed-guard ordering sentence is inert in one guard and unscoped in the other

Current baseline:

- `activity-guard.mjs:126-141` already places the `isInstalledGuardPath` interlock
  ahead of the `.tmp/**` and `.scratch/**` carve-outs and ahead of chore-mode, and
  the comment there names that ordering as the contract (#659). For this guard the
  plan's sentence describes existing behavior and implies no work.
- `source-edit-gate.mjs` contains no installed-guard check at all — a grep for
  `installed`, `Installed`, and `node_modules` over that file returns nothing — and
  its `choreModeActive` bypass is the **first** branch of `decide()`
  (`source-edit-gate.mjs:105-108`), ahead of the allowlist and every other check.

So the sentence is either (a) a restatement of `activity-guard`'s existing
contract, or (b) a requirement to add an installed-guard interlock to
`source-edit-gate` *and* demote its chore-mode bypass below it. Reading (b) is a
real behavior change on paths that no acceptance criterion mentions and no test in
VC1's five files exercises, and it narrows an existing documented escape hatch.
Reading (a) makes the sentence inert.

The plan cannot be implemented faithfully while that ambiguity stands. An
implementer choosing (a) leaves `source-edit-gate` able to edit an installed guard
tree under chore-mode; an implementer choosing (b) ships an unscoped, untested
change to the chore-mode contract.

**Required:** name the guard or guards the ordering sentence governs. If
`source-edit-gate` is to gain the interlock, list it as an explicit deliverable in
the implementation sequence with its own negative test row, rather than leaving it
implied inside a prose ordering clause. If it is not in scope, say that the
sentence describes `activity-guard`'s existing #659 contract and that
`source-edit-gate`'s chore-mode ordering is unchanged.

### R1-F003 — Every AC cites `vc:1`, which never runs the new shared helper's tests

All six acceptance criteria in the live issue body carry
`<!-- aitm-verified vc-list="vc:1" -->`. VC1 is a fixed enumeration of five
existing paths:

```
node --test scripts/tests/unit/task-tracker/lib/apply-patch-targets.test.mjs \
  scripts/tests/unit/task-tracker/lib/activity-policy-classify-bash.test.mjs \
  scripts/tests/slow/task-tracker/lib/activity-guard.test.mjs \
  scripts/tests/integration/task-tracker/lib/source-edit-gate.test.mjs \
  scripts/tests/integration/task-tracker/lib/bash-guard-worktree-binding.test.mjs
```

The plan's step 2 deliverable is a **new** shared helper under
`scripts/task-tracker/lib/`, and step 1 says to "add focused helper fixtures using
the canonical test walker rather than another test root" — which reads as a new
test file. Any behavior proven only in that new file has no citation path: the
command the ACs cite will not execute it, so the AC's recorded evidence points at
a run that never touched the code the AC attests to. Under this repository's
`resolveVcListStrict` contract that is exactly the "silent false green" shape the
citation rules exist to prevent.

Step 1's two sentences also read as mutually exclusive without resolving which
applies: "add failing regression tables to the issue's five named test files" and
"add focused helper fixtures" using the walker.

**Required:** resolve this explicitly, one of two ways. Either (a) state that the
shared helper's tables live inside the five named files so VC1 remains the complete
targeted proof, or (b) name the new test path and state that VC1 is extended to
include it before any AC is stamped. Do not leave the choice to the implementer.

### R1-F004 — `COMMIT_DOCS` eligibility predicate is not stated to be policy-independent

`DEFAULT_POLICY.docGlobs` is
`['docs/**', '.claude/plans/**', 'docs/plans/**', '**/*.md', 'CLAUDE.md']`
(`activity-policy.mjs:35`), and `loadPolicy` lets a project's
`.ai-task-manager/activity-policy.json` fully **replace** that list and then append
a `docGlobsExtra` sibling on top (`activity-policy.mjs:338-360`).

The plan says to "introduce a commit-specific predicate instead of reusing
`classifyEdit` as the permission proof", and separately that "root agent
instructions, runtime configuration, installed guard trees, and machine-local state
are not eligible." It never says the predicate is independent of
`activity-policy.json`.

An implementation that sources the predicate from `policy.docGlobs` satisfies the
letter of "not `classifyEdit`" while immediately making root `CLAUDE.md` and every
`**/*.md` anywhere in the tree eligible for `COMMIT_DOCS` — directly contradicting
the exclusion list two sentences earlier. A project shipping a `docGlobsExtra`
entry would widen the governed allowance as a side effect of a formatting-config
change.

The plan's forward-looking sentence — "adding an evidence format later requires a
named contract and tests rather than broadening the existing `docs/**` glob" —
gestures at non-configurability but stops short of stating it as a constraint on
this repair.

**Required:** state that the `COMMIT_DOCS` eligibility predicate is a hardcoded
contract in the guard, not derived from or overridable by `activity-policy.json`
(`docGlobs`, `docGlobsExtra`, or any successor key), and add a negative row to the
AC3 proof column in which a widened `docGlobsExtra` does **not** make an
otherwise-ineligible path eligible.

## Required changes

1. Name the `isAllowed` null/unknown-state seam and its inversion, and add the
   unbound-session `COMMIT_DOCS` refusal to the regression mapping. (R1-F001)
2. Scope the installed-guard ordering sentence to a named guard; if
   `source-edit-gate` gains the interlock, make it an explicit deliverable with its
   own negative test. (R1-F002)
3. Resolve where the shared helper's tests live and whether VC1 is extended, so
   every AC's `vc:1` citation actually executes the code it attests to. (R1-F003)
4. State that the `COMMIT_DOCS` eligibility predicate is not policy-configurable,
   and add the widened-`docGlobsExtra` negative. (R1-F004)

## Optional suggestions

1. **Review-state asymmetry is worth one explicit sentence.** `STATE_MATRIX`
   permits `WRITE_DOCS` in `review` (`activity-policy.mjs:115`), and the plan
   refuses `COMMIT_DOCS` there ("Refuse; rework must return to Develop"). Net
   effect: a Review-stage documentation edit is permitted but can never be
   committed from that state. That matches the status quo for `COMMIT_CODE`, so it
   is not a regression — but Review is precisely where peer-review evidence is
   produced, and this plan's whole subject is the evidence-commit path. One sentence
   naming the intended route for Review-stage evidence, or marking it known
   follow-up scope, would keep the table from reading as an oversight.

2. **Pin down "intended pre-Develop lifecycle states" (plural).** AC4 says
   "states"; the matrix grants the allowance in `plan` only, with Backlog, Refine,
   and Ready-for-Planning refusing. That is a defensible initial repair, but the
   plan should state in one sentence that "intended pre-Develop states" resolves to
   exactly `plan` for this issue, so the AC4 tick is not contested at Review.

3. **Flag conflicting-patch-field rejection as a deliberate new refusal.** Both call
   sites are `||` chains today (`activity-guard.mjs:83-85`,
   `source-edit-gate.mjs:413-415`), so a payload carrying both `patch` and `text`
   currently succeeds on `patch`. "Reject conflicting supplied patch fields" newly
   refuses it. The plan already requires a captured or adapter-defined fixture; make
   it explicit that the fixture must establish that no supported adapter sends two
   fields, otherwise this lands as a regression wearing hardening's clothes.

4. **`activity-policy.mjs:19-22` names the duplication this plan removes.** That
   header comment defers shared command-target extraction to "Epic W2 (#67)". Since
   step 3 removes "parallel ad hoc parser decisions at the touched seams", a line
   noting whether this repair discharges or merely narrows that deferred item would
   keep the module header honest after the change.

## Decision

revisions-requested
