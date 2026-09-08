# Reviewer Review — Round 2 — #1219 Continuous Agent Delivery Amendment (specification only)

Reviewer: `claude` (independent NAVIGATOR/REVIEWER)
Protocol: `c1655cdd-f0c8-48fd-95e3-57af190d9f0c`
Artifact reviewed: `docs/superpowers/specs/2026-09-04-1219-continuous-agent-delivery-amendment-design.md`
Reviewed commit: `3370ccb8cafb42b629de1561094310f72d2b35a4`
Reviewed blob: `6ef6b8afa06bd4e64c2a1cb0e52ffc52fae75032`
Comparison baseline: `origin/trunk` = `07984e5137ba53f56fe062a351e5dd4111fb87bd`

Scope note: I reviewed only the specification above, at the exact handed-off
commit, in full. I read no implementation plan and issue no findings against
either plan. Required supplements: none are active
(`status.activeSupplements = []`), so there is no `[supplement:S-n]` marker to
acknowledge.

---

## 1. Verdict

**REVISE**

Four blocking findings. Each has material impact on #1219 and a small,
self-contained correction. The specification's central thesis — Test proves and
merges the code, Review certifies the implementation record — is sound, is
better grounded in repository evidence than the ordering it replaces, and its
trusted-runtime, exact-head, and separation-of-authority boundaries verify
cleanly against live code and live repository protection. The blocking defects
are in the evidence-schema identity, the definition of a delivery boundary, the
close preconditions for the tier the amendment itself creates, and one
documentation target that does not exist.

---

## 2. Blocking findings

### `[finding:F-001]` `aitm.delivery-receipt/v1` reuses a live schema identifier for an incompatible record

**Violated requirement.** Core Invariant 10 (lines 157-158) and the Evidence
Model's premise that a receipt is an unforgeable, validated binding. A schema
identifier must name exactly one record shape.

**Direct evidence.**

- Specification lines 426-448 define `"schema": "aitm.delivery-receipt/v1"`
  with the key set `schema, receiptId, candidateId, issueNumber, sourceSha,
  testedBaseSha, headRef, targetRef, targetHeadShaBeforeMerge,
  expectedTargetHeadSha, mergeSha, mergeMethod, prNumber, ciEvidenceIds,
  flowReviewId, humanApprovalId, runtimeCapabilityId, mergedAt, readBackAt`.
- `origin/trunk:scripts/task-tracker/lib/delivery-records.mjs:8` already binds
  `const RECEIPT_SCHEMA = 'aitm.delivery-receipt/v1';`.
- The same file, lines 53-67, fixes `RECEIPT_KEYS` to a different, disjointly
  named set: `baseRef, expectedHeadSha, intentId, issueNumber, mergeCommitSha,
  mergeMethod, prNumber, provider, result, schema, sessionId, verifiedAt,
  verifiedTrunkRef`.
- Validation is closed, not permissive:
  `origin/trunk:scripts/task-tracker/lib/delivery-records.mjs:247-251` —
  `validateReceipt` calls `hasExactlyKeys(receipt, RECEIPT_KEYS)` and throws
  `delivery-records:receipt-keys`, then requires
  `receipt.schema === RECEIPT_SCHEMA`. `hasExactlyKeys`
  (`delivery-records.mjs:97-102`) requires an exact key-set match.
- The v1 record is live and consumed downstream:
  `origin/trunk:scripts/task-tracker/lib/reopened-close-recovery.mjs` and
  `origin/trunk:scripts/task-tracker/verbs/deliver.mjs` read it.

**Concrete failure mode.** An enrolled candidate merges. The trusted runtime
emits the amendment's receipt. `validateReceipt` throws
`delivery-records:receipt-keys`, so no delivery receipt persists and the Done
precondition "a verified merge and delivery receipt for the immediate target"
(line 309) can never be met for a successfully merged candidate. If the
implementation instead bypasses the existing validator, one issue's comment
chain carries two byte-incompatible records under one schema string: any reader
selecting by `schema` — including the "Merge succeeds before receipt"
reconstruction path (line 546) — can bind the wrong shape and either miss
`mergeSha` or misread `expectedHeadSha` (PR head) as `expectedTargetHeadSha`
(post-merge target head). Those two fields carry different SHAs by definition.

**Owning section.** Evidence Model → Delivery receipt (lines 421-454).

**Smallest sufficient correction.** Version the new record —
`aitm.delivery-receipt/v2` — and add one sentence stating that
`aitm.delivery-receipt/v1` remains the legacy record, is never emitted for an
enrolled candidate, and is never accepted as authority for one. (Same treatment
applies if the author prefers a distinct name.) `aitm.delivery-candidate/v1`,
`aitm.flow-review/v1`, `aitm.implementation-record/v1`, and
`aitm.runtime-activation/v1` are clean: I confirmed none of those identifiers
exists anywhere under `origin/trunk:scripts`.

---

### `[finding:F-002]` "recorded branch" is undefined, so a collateral-only issue-body edit can create or destroy a repository delivery boundary

**Violated requirement.** Core Invariants 1, 3, and 10 (lines 136-137, 141-142,
157-158): only a code or repository-document change creates a new candidate and
moves code-proof authority; collateral must not disturb it.

**Direct evidence.**

- Specification lines 322-332 make the delivery topology turn on an equality
  test over recorded branches: "a child story targets its **recorded** epic
  branch; a nested epic targets its parent epic branch"; "When a nested epic's
  **recorded** branch equals its parent's **recorded** branch, that tier is not
  a repository delivery boundary: it produces no PR or merge receipt."
- The specification never defines where a recorded branch is recorded or how it
  resolves when absent or unparseable.
- The live resolver silently synthesizes a name when no record exists:
  `origin/trunk:scripts/task-tracker/lib/resolve-epic-lineage.mjs:68` —
  `const branch = node.authoritativeBranch || canonicalBranch;` and
  `resolve-epic-lineage.mjs:86-88` — when the parent carries no authority
  marker, `parentEpicBranch = composeBranchName({ role: 'epic', issue: parent })`.
- The three outcomes are deliberately distinct and are not equivalent:
  `origin/trunk:scripts/task-tracker/merge-back.mjs:112-122` documents that a
  valid marker yields `parentAuthoritativeBranch`, a parse failure yields
  `parentAuthorityError`, and "a parent body with no marker at all yields
  NEITHER field, which is what preserves canonical `feature/epic/<N>` fallback
  downstream."
- The authority record is mutable issue-body collateral: it is parsed from the
  parent issue body by `resolveCurrentIssueWorktreeBranch`
  (`merge-back.mjs:145`), which is precisely the class the specification calls
  collateral (line 131-132).
- The amendment names `cloud-test-automation` as its opaque-ref example (line
  350), and that is the live governed branch of this protocol, so the collapsed
  tier is the operative case, not a hypothetical.

**Concrete failure mode.** Two directions, both reachable without any code
change:

1. Nested epic `#A` carries the explicit marker `cloud-test-automation`; parent
   `#B` carries no marker, so `#B` resolves by fallback to `feature/epic/<B>`.
   The recorded branches differ, so the amendment classifies `#A` as a real
   delivery boundary and requires a PR from `cloud-test-automation` to
   `feature/epic/<B>` — a ref that need not exist and that, per the
   enrollment precondition at lines 347-351, would itself have to carry literal
   pull-request enforcement, strict exact-head checks, deletion protection, and
   non-fast-forward protection. Enrollment refuses, or delivery targets a
   nonexistent ref.
2. A maintainer later adds the marker `cloud-test-automation` to `#B`. The
   equality now holds, the tier silently collapses, and `#A` stops being
   required to produce a PR and a merge receipt. A pure collateral edit has
   removed a merge receipt from the delivery record with no candidate change —
   exactly what Invariants 1, 3, and 10 forbid.

**Owning section.** Hierarchical Delivery (lines 320-355).

**Smallest sufficient correction.** Define recorded branch as the explicit,
durable branch-authority record only, state that a synthesized or canonical
fallback name is never a recorded branch for this test, and require the trusted
runtime to refuse enrollment (rather than infer a name) when either tier's
branch authority is absent or unparseable. Add one sentence pinning the tier
classification to the enrollment-time observation so that a later collateral
edit cannot reclassify an enrolled tier.

---

### `[finding:F-003]` Close preconditions are unsatisfiable for the collapsed shared-ref tier the specification itself creates

**Violated requirement.** Internal consistency between Hierarchical Delivery
(lines 328-331) and Done (lines 307-314); Goal 7 (unattended child close).

**Direct evidence.**

- Specification lines 307-314 state Done's requirements without qualification:
  "a verified merge and delivery receipt for the immediate target; a passing
  exact-SHA CI receipt; a passing exact-SHA flow-review receipt; ...".
- Specification lines 328-331 create a class of issues that by design produce
  none of those: "that tier is not a repository delivery boundary: it produces
  no PR or merge receipt. Its implementation record aggregates the terminal
  receipts of children already delivered to the shared branch."
- Specification lines 360-362 repeat the exemption: "A collapsed shared-ref tier
  aggregates receipts without manufacturing a candidate, PR, or merge receipt."
- The existing implementation already has a sanctioned lane for exactly this
  case and the amendment does not carry it forward:
  `origin/trunk:scripts/task-tracker/lib/no-commit-delivery-record.mjs:8` —
  `const SCHEMA = 'aitm.no-commit-delivery/v1';` ("Canonical durable
  authorization for explicit no-commit issue kinds", `@story #1439`), keyed on
  `NO_COMMIT_KINDS` from `issue-kind.mjs` and consumed by
  `origin/trunk:scripts/task-tracker/verbs/close.mjs`.

**Concrete failure mode.** A collapsed nested epic completes: every child has
merged to the shared ref and closed. The tier has no candidate SHA, no PR, no
CI receipt, no flow-review receipt, and no delivery receipt, because the
specification forbids manufacturing them. Close evaluates Done's first three
bullets and refuses permanently. There is no sanctioned exit: Review may not
demote (line 291), Review may not create a candidate commit (line 288), and the
tier may not manufacture a receipt (line 361). The issue is unclosable, which
directly defeats Goal 7 and makes Acceptance Test 13 untestable for the
collapsed branch of its own condition.

**Owning section.** Lifecycle → Done (lines 305-318), with a cross-reference
from Hierarchical Delivery.

**Smallest sufficient correction.** Add one Done clause: for a tier with no
repository delivery boundary, the merge, delivery-receipt, CI, and flow-review
requirements are satisfied by the aggregated terminal receipts of its children
plus the existing no-commit delivery authorization
(`aitm.no-commit-delivery/v1`), and by nothing else. State explicitly that this
exemption is available only to a tier classified as collapsed at enrollment, so
it cannot be used to close a real delivery boundary without a merge.

---

### `[finding:F-004]` Documentation Changes requires revising a file that does not exist, so the Full-Auto correction lands nowhere

**Violated requirement.** Goal 7 and Core Invariant 11 (lines 159-161), which
redefine what Full-Auto does and does not disable; the Documentation Changes
list (lines 652-669) is the specification's normative delivery surface for that
redefinition.

**Direct evidence.**

- Specification lines 664-666 require revising "`skill/shared/rules/full-auto.md`
  and its documentation contract tests to distinguish the displaced ad hoc
  reviewer, canonical flow reviewer, and independent human gates."
- That file does not exist. `find . -path ./node_modules -prune -o -name
  "*full-auto*" -print` returns no `skill/shared/rules/full-auto.md`, and the
  only reference to the path anywhere in the repository is line 664 of the
  specification itself.
- The Full-Auto doctrine and its documentation contract test live elsewhere:
  `origin/trunk:docs/guides/workflow.md:661` — `### Full-Auto Doctrine (autonomy
  boundary)`; and
  `scripts/tests/unit/task-tracker/core/full-auto-doctrine-doc.test.mjs:16`
  resolves `const DOC = path.resolve(__dir, '.../docs/guides/workflow.md')` and
  asserts the doctrine's three tenets against that file.
- The specification distinguishes create from revise elsewhere and gets it right
  (line 658, "create `skill/shared/rules/test.md`"), so this is a factual target
  error rather than an intended new file.

**Concrete failure mode.** An implementer following the list creates a new
`skill/shared/rules/full-auto.md` carrying the amendment's three-actor
distinction. `docs/guides/workflow.md:661` keeps the pre-amendment doctrine, and
`full-auto-doctrine-doc.test.mjs` keeps passing against it, so the repository
ships two Full-Auto doctrines — one stale and contract-tested, one new and
untested — and the runtime rule surface an agent actually reads is the stale
one. Invariant 11's distinction between the displaced ad hoc reviewer and the
mandatory canonical flow reviewer is precisely the confusion that produced the
#1490 failure mode described in the Problem section, so shipping it into an
untested file is not a cosmetic miss.

**Owning section.** Documentation Changes (lines 652-669).

**Smallest sufficient correction.** Retarget the bullet to
`docs/guides/workflow.md` → "Full-Auto Doctrine (autonomy boundary)" and its
contract test
`scripts/tests/unit/task-tracker/core/full-auto-doctrine-doc.test.mjs`. If a
dedicated rules file is genuinely wanted, say "create" and require the doctrine
and its contract test to move there so exactly one home remains.

---

## 3. Non-blocking follow-ups

`[finding:F-005]` **`state-walk.md` is omitted from Documentation Changes while
contradicting Invariant 4.** `origin/trunk:skill/shared/rules/state-walk.md:33`
documents `/task demote` as "Back to `develop` from `test`/`review`", and line
39 tells Review to "reuse or refuse (demote + `/task test`)". Core Invariant 4
(line 143-144) and the Review forbidden list (line 291) prohibit both for
enrolled issues. `review.md` is already listed; `state-walk.md` and the Review
sentence in `functional-dod.md` are not. Recommend adding them.

`[finding:F-006]` **`aitm.runtime-capability/v2` cannot be extended in place, and
does not carry the field the specification attributes to it.** Line 391-393
says the candidate's `runtime` entry references "the existing
`aitm.runtime-capability/v2` identity and **its pinned execution-root digest**",
and line 516-517 says the runtime identity "extends `aitm.runtime-capability/v2`
with the pinned root, commit or package digest, command-catalog digest, and
protocol inventory." Against
`origin/trunk:scripts/task-tracker/lib/evidence-v2/runtime-capabilities.mjs:52-67`,
v2's key set is closed by `exact(...)` over ten keys and sealed by
`capabilityDigest = hash(identity)` (line 48), so adding fields is a version
bump, not an extension. v2 has no pinned-root field: the nearest is `toolDigest`,
which in the live path is
`hash(git -C context.toolRoot rev-parse HEAD)`
(`runtime-adapter.mjs:84-88`) — a commit id, not a root identity —
plus `commandCatalogDigest` and `protocolVersions`, two of the four things the
sentence claims to add. Recommend naming the successor version explicitly and
correcting the attribution, since "does not define a third, parallel runtime
authority concept" (line 392-393) currently reads as forbidding the only
mechanism available.

`[finding:F-007]` **Activation has no defined genesis.** Lines 526-532 make
`aitm.runtime-activation/v1` the sole source of eligibility ("Only that durable
activation makes the new runtime eligible for later candidates") and require
"the previous runtime on the designated `authorityHostId`" to author it. Line
558-561 repeats this for the pilot. Nothing defines what makes the first runtime
in the chain trusted, and "trusted" is a status this specification creates. The
reading that resolves it — the incumbent pre-amendment implementation, identified
by its existing `aitm.runtime-capability/v2` capability digest, is the genesis
authority for the first activation record — is inferable but unstated. One
sentence would close it.

`[finding:F-008]` **The runtime-outside-candidate boundary is stronger than
today's check and should say so.**
`origin/trunk:scripts/task-tracker/lib/evidence-v2/execution-context.mjs:168-171`
(`resolveInstalledExecutionContext`) refuses only exact aliasing —
`if (toolRoot === sourceRoot) throw rehearsalRefusal('tool-source-alias')` —
whereas the rehearsal path at lines 120-126 uses full `containedBy` refusals.
"materialized outside the candidate worktree" (line 512-513) should be stated as
a containment refusal, not an inequality, so the enrolled check is
unambiguously stronger than the installed path's current alias test. This
matters concretely in a dogfooding checkout where `node_modules/ai-task-manager`
is a self-symlink to the repository root.

`[finding:F-009]` **Pilot selection states a protection prerequisite but not a
CI prerequisite.** The Rollout Gate (lines 684-688) requires the #1240-style
ruleset delta for every literal pilot target before the pilot, which the live
repository confirms is necessary: `GET /repos/kburson/ai-task-manager/rulesets`
returns exactly one active ruleset, `Protect trunk` (id `20694244`), conditioned
on `~DEFAULT_BRANCH` only, so `cloud-test-automation` has no protection today.
Migration (lines 557-564) requires the pilot to demonstrate "successful hosted
CI" but never states that the hosted CI workflow and its required contexts must
exist first. The pilot's own evidence bundle would catch this, so it is not
blocking, but one sentence naming the CI prerequisite alongside the protection
prerequisite would make the sequencing self-contained.

---

## 4. Optional improvements

`[finding:F-010]` No acceptance test proves the three-way gate independence that
Goal 8 asserts ("Enabling one gate must not enable either of the others").
Acceptance Tests 8, 9, and 12 cover `pullRequestReview` and `reviewToDone`
individually; nothing covers `analysisToDevelopment` or the pairwise
non-interference. #1512 already ships that coverage
(`origin/trunk:scripts/tests/unit/task-tracker/lib/auto-mode.test.mjs:56-77,
113-129`), so a cross-reference rather than a new test would suffice.

`[finding:F-011]` The Status and Authority clause (lines 13-18) scopes the
amendment's precedence to "the accepted cloud Test-stage design or portfolio
plan" and never names #1512, yet the amendment does adjust #1512's delivery
ordering by inserting a mandatory flow review between green required CI and the
human reviewer request (lines 249-250) where #1512's design orders required CI
directly to the manual-code-review decision
(`origin/trunk:docs/superpowers/specs/2026-09-04-1512-full-auto-default-manual-review-overrides-design.md`,
"Delivery ordering", steps 2-5). The substance is compatible and additive — see
§6 — but naming #1512 in the authority clause would remove the ambiguity about
which document a reader follows on ordering.

---

## 5. #1486 sequencing verdict

**Advisable cleanup. Not a required predecessor, and not unrelated.**

`#1486` ("Consolidate epic graph-node parent branch-authority adapters", OPEN,
no labels) is by its own scope a behavior-preserving refactor: it consolidates
five duplicated parent-branch-authority sites into one injectable adapter
"without changing any consumer's observable lineage behavior." Two of those five
sites are on the amendment's critical path —
`scripts/task-tracker/merge-back.mjs` (the preserved child-to-parent entry
surface, lines 334-338 of the specification) and
`scripts/task-tracker/lib/close-gates-lineage.mjs` (close-time lineage) — and
`#1486`'s own scope text records that they diverge in failure handling: some let
parser errors propagate, some map them to `parentAuthorityError`, and
`decomposition-delivery-readiness.mjs` wraps them as `branch-authority:`
blockers.

That divergence is the mechanism behind `F-001`'s sibling defect
`F-002`, but it is not a prerequisite for it: `F-002` is fixed by
defining recorded-branch authority in the specification, and the amendment can
then name one adapter as the authority whether or not the other four have been
consolidated. Consolidating first would make that single-authority requirement
structurally easier to hold, and consolidating after would be safe. I recommend
sequencing `#1486` before or alongside the enrolled merge-back work, not as a
blocker on accepting this specification.

---

## 6. #1512 compatibility verdict

**Compatible. Verified against the refreshed baseline, which contains #1512.**

- #1512 is merged and present at the stated comparison baseline: `origin/trunk`
  `07984e5137ba53f56fe062a351e5dd4111fb87bd` is `[#1512] Governed PR delivery`.
- All three gates exist and are genuinely independent, not a coupled tuple:
  `origin/trunk:scripts/task-tracker/lib/gate-resolve.mjs:4-14` defines
  `DEFAULTS = { analysisToDevelopment: false, pullRequestReview: false,
  reviewToDone: false }` with per-gate project keys; and
  `origin/trunk:scripts/task-tracker/lib/session-store.mjs:81-93` provides the
  additive single-gate patches `manual-plan`, `manual-code`, `manual-task`,
  `auto-plan`, `auto-code`, `auto-task` alongside the legacy whole-policy
  choices. Specification Core Invariant 11 (lines 159-161) and Goal 8 (lines
  86-89) hold against that implementation.
- Full-Auto is the shipped default (`DEFAULTS` all `false`), matching the
  specification's "Full-Auto disables all three human gates" without the
  specification having to change the default.
- **Separation of spawned flow-review evidence from human exact-head approval is
  clean.** The specification separates them at four points and never lets one
  stand in for the other: Invariant 8 (lines 151-153) — "Hosted CI plus the
  canonical flow review are minimum merge gates in every mode. A flow-review
  receipt never satisfies `pullRequestReview`."; the Terminology entries at
  lines 114-122 distinguishing flow reviewer, ad hoc implementation reviewer,
  and Agent Review Gate; lines 218-223 — "neither actor substitutes for the
  other"; and lines 251-255 — "No flow review, Agent Review Gate result, or
  approval of an older head satisfies this gate." That is the correct reading of
  #1512's "Manual code review replaces spawned-agent PR implementation review as
  merge authority": what #1512 displaced is the ad hoc reviewer, and the
  amendment's canonical flow reviewer is an added evidence gate, never an
  approval authority. `origin/trunk:docs/guides/workflow.md:553` states the same
  boundary in the shipped documentation ("The PR author, bots, stale-head
  approvals, and spawned-agent review do not satisfy this boundary").
- The one ordering adjustment (flow review before the human request) is additive
  and fail-closed; it is recorded as optional `F-011` only because the
  authority clause does not name #1512, not because the behavior conflicts.

---

## 7. Questions for the author

1. For `F-002`: do you intend the recorded branch to be the issue-body
   worktree-location marker specifically, or a new durable record the trusted
   runtime owns? The correction differs slightly — the former needs an explicit
   "no canonical fallback" rule, the latter needs a schema.
2. For `F-003`: should a collapsed tier reuse
   `aitm.no-commit-delivery/v1`, or should the amendment define an aggregation
   receipt of its own? Reuse is smaller; a new record makes the child-receipt
   aggregation explicit.
3. For `F-006`: is `aitm.runtime-capability/v3` the intended successor,
   or a separate record that references v2's `capabilityDigest`? Line 392-393
   currently reads as ruling out the second option.
4. Is the collapsed shared-ref tier meant to apply to the live #1219 family —
   that is, is `cloud-test-automation` intended to be the shared recorded ref for
   #1219 and one or more of #1220-#1225?

---

## 8. Reviewed SHA and evidence inventory

**Artifact under review**

| Item | Value |
| --- | --- |
| Path | `docs/superpowers/specs/2026-09-04-1219-continuous-agent-delivery-amendment-design.md` |
| Commit | `3370ccb8cafb42b629de1561094310f72d2b35a4` |
| Blob | `6ef6b8afa06bd4e64c2a1cb0e52ffc52fae75032` |
| SHA-256 | `56bba8431de4f6cfd8def0b01555a19e41fe54cf29f78dcc4822e60870916c10` |
| Lines | 694 |

**Git facts verified directly**

- `git rev-parse HEAD` = `3370ccb8cafb42b629de1561094310f72d2b35a4` (matches the
  handed-off review commit); `git status --porcelain` clean; branch
  `cloud-test-automation`.
- `git cat-file -t 3370ccb8...` = `commit`.
- Restart baseline `530df9951ccb675c2aedd29ee38a08f6d8149dbc` resolves.
- Refreshed comparison baseline `origin/trunk` =
  `07984e5137ba53f56fe062a351e5dd4111fb87bd`; `HEAD..origin/trunk` = 2 commits
  (`07984e51 [#1512] Governed PR delivery`, `91e65af2 docs(plan): publish cloud
  Test delivery architecture [#1219] (#1511)`); merge-base `081aa3e8`.

**Repository evidence consulted**

- `origin/trunk:scripts/task-tracker/lib/delivery-records.mjs` (lines 8, 53-67,
  97-102, 247-251) — F-001.
- `origin/trunk:scripts/task-tracker/lib/reopened-close-recovery.mjs`,
  `origin/trunk:scripts/task-tracker/verbs/deliver.mjs` — live `aitm.delivery-receipt/v1`
  consumers, F-001.
- Full `aitm.*/v*` schema inventory over `origin/trunk:scripts` — confirmed the
  `aitm.delivery-receipt/v1` collision and confirmed
  `aitm.delivery-candidate/*`, `aitm.flow-review/*`,
  `aitm.implementation-record/*`, `aitm.runtime-activation/*` are unused.
- `origin/trunk:scripts/task-tracker/lib/resolve-epic-lineage.mjs` (lines 61-68,
  74-89) — F-002 canonical fallback.
- `origin/trunk:scripts/task-tracker/merge-back.mjs` (lines 1-17, 56-106,
  112-150) — F-002; also positive verification of the specification's corrections
  to the epic rebase (step 1), the local child suite (step 3), and pre-readback
  worktree/branch deletion (step 5) at specification lines 340-345.
- `origin/trunk:scripts/task-tracker/lib/no-commit-delivery-record.mjs` (lines
  1-25), `origin/trunk:scripts/task-tracker/verbs/close.mjs` — F-003.
- `origin/trunk:docs/guides/workflow.md` (lines 553, 661),
  `scripts/tests/unit/task-tracker/core/full-auto-doctrine-doc.test.mjs` (line
  16), repository-wide search for `skill/shared/rules/full-auto.md` — F-004.
- `origin/trunk:skill/shared/rules/state-walk.md` (lines 15, 33, 39),
  `origin/trunk:skill/shared/rules/review.md` (line 29),
  `origin/trunk:skill/shared/rules/deliver.md` (lines 8, 33-74),
  `skill/shared/rules/` directory listing (no `full-auto.md`, no `test.md`) —
  F-004, F-005.
- `origin/trunk:scripts/task-tracker/lib/evidence-v2/runtime-capabilities.mjs`
  (lines 22-70), `.../runtime-adapter.mjs` (lines 28, 78-90),
  `.../execution-context.mjs` (lines 105-180) — F-006, F-008, and positive
  verification of the trusted-runtime boundary.
- `origin/trunk:scripts/task-tracker/lib/gate-resolve.mjs`,
  `origin/trunk:scripts/task-tracker/lib/session-store.mjs` (lines 81-93),
  `origin/trunk:scripts/tests/unit/task-tracker/lib/auto-mode.test.mjs` — §6,
  F-010.
- `origin/trunk:docs/superpowers/specs/2026-09-04-1512-full-auto-default-manual-review-overrides-design.md`
  (full) — §6, F-011.
- `docs/superpowers/specs/2026-09-01-1219-cloud-test-stage-design.md` (lines
  465-537, 1135-1198, 1199-1238) — original-design consistency; the amendment's
  trailer stance (lines 452-454) agrees with the original's "It never
  reconstructs either receipt from trailers alone."

**Live GitHub evidence**

- `gh issue view 1512` — state `done`; scope confirms the three manual-review
  controls and their boundaries.
- `gh issue view 1486` — OPEN, no labels; scope confirms a behavior-preserving
  five-site consolidation deferred by #1485.
- `gh issue view 1219` — OPEN, `🧑‍🧒‍🧒 [Epic] Automate Cloud Test Delivery and
  Validation`.
- Sub-issue graph: #1219 → {#1220, #1221, #1222, #1223, #1224, #1225}, all OPEN;
  grandchildren #1226-#1247 enumerated, all OPEN. #1240 ("Migrate Required
  Contexts and Epic-Branch Protection") confirms the Rollout Gate reference at
  specification lines 684-688.
- `GET /repos/kburson/ai-task-manager/rulesets` — exactly one active ruleset,
  `Protect trunk` (id `20694244`), `ref_name.include = ["~DEFAULT_BRANCH"]`, with
  `deletion`, `non_fast_forward`, `pull_request`
  (`required_approving_review_count: 0`, `dismiss_stale_reviews_on_push: true`),
  and `required_status_checks` (`strict_required_status_checks_policy: true`,
  context "Fast lane (format, lint, unit + integration)"). `cloud-test-automation`
  has no protection, confirming the enrollment precondition at specification
  lines 347-351 is currently unmet for every non-trunk target — F-009, and
  positive verification that the precondition is necessary rather than
  theoretical.

**Review conduct**

I made no edits to any repository-tracked file, no commits, no pushes, no issue
or project mutations, and created no follow-up issues. The only file I created is
this review, under the ignored protocol runtime. I read the complete
specification at the handed-off commit, not only a diff, and evaluated
interactions among its sections.

**Decision:** `changes-requested`
