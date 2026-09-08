# Round 4 Reviewer Review — #1219 Continuous Agent Delivery Amendment Plan

## Reviewed artifact

- Plan: `docs/superpowers/plans/2026-09-04-1219-continuous-agent-delivery-amendment.md`
- Commit: `9b05328a075334d7d9c5360806b86403121d4cfc`
- Blob: `565b82ecfff98bd9972487ffc873fcee6d404cf1`
- SHA-256: `sha256:0db417beee17773576b30a95607ed281414e9048a54173a99e6698f8cb99f1d1`
  (independently recomputed from `git show <commit>:<path>`; matches
  `lastHandoff.artifact.sha256`)
- Answered review: `round-2-reviewer-review.md`
- Author response: `round-3-author-response.md`
  (`sha256:a3b8b9a74237b65bbbda2395f3638f5f8c76f68b5b9018c95fe2e4b1be66662b`)
- Normative specification:
  `docs/superpowers/specs/2026-09-04-1219-continuous-agent-delivery-amendment-design.md`
  at `1375edfd4b29c98e407ae428a15f992dbdff2cd6` (unchanged, re-read)
- Implementation comparison: `origin/trunk` at
  `07984e5137ba53f56fe062a351e5dd4111fb87bd`
- Required supplements: none. `activeSupplements` is empty.

Scope of this round: the full round-2 plan was read line-by-line last round;
this round I read the complete `ff974bd..9b05328` diff (95 insertions, 26
deletions, plan-only) in context plus every region it touches, and re-verified
each of the thirteen dispositions against the pinned repository. `git
diff --name-status` confirms the plan is the only tracked file changed.

## 1. Verdict

`REVISE` — decision `changes-requested`.

All thirteen round-2 findings are correctly resolved; I verified each against
the repository rather than accepting the response (§4). One **new** blocking
finding, `F-014`, is a direct consequence of the `F-005` remedy: mandating
#1226's `review-to-test` reclassification without scheduling where it executes
collides with A13's dependency on #1226 and with the reservation of #1244 as
the first enrolled delivery. One non-blocking follow-up, `F-015`, is unrelated
to this round's edits.

### Correction to my own round-2 record

`F-002`'s stated remedy was wrong, and the author is right to have widened it.
I asserted that `bin/aitm-registry.mjs` derives `VERBS` by parsing `case`
labels out of `task-tracker.mjs`. It does not. At the pinned base,
`bin/aitm-registry.mjs:58` is `export const VERBS = taskVerbNames();`, sourced
from `scripts/task-tracker/lib/command-surface/catalog.mjs:1024`; the file's
own comment at lines 39-43 states that `parseVerbs` "is NO LONGER the
registry's source of truth — the manifest is", retained only as the reference
the parity test diffs against. My "add task-tracker.mjs to Files" correction
would have registered a `case` with no manifest entry and turned
`scripts/tests/unit/task-tracker/core/command-manifest.test.mjs` red. The
author's `accepted-with-modification` disposition is the correct one and the
wider surface it names is the real requirement.

## 2. Blocking findings

### [finding:F-014] #1226's mandated `review-to-test` reclassification has no scheduled execution point, and the only available one contradicts both A13's dependency set and the reserved #1244 pilot

- **Violated spec requirement:** Migration, spec line 625 ("Review with
  unmerged PR | Perform a one-time migration reclassification to Test") read
  together with spec lines 605-612, which require the pilot to run on "a
  bounded, dependency-ready #1219 child path whose own contract is not a
  foundation needed to run the protocol" and place the open-issue migration
  strictly after a successful pilot. Also the plan's own Self-Review claim
  (plan line 1404) that every task is "atomic, ordered, and independently
  executable".
- **Repository evidence:** three plan statements cannot all hold.
  1. Plan lines 112-116 now mandate: "Its lifecycle state is not immutable …
     Task 12 must classify #1226 as the one-time `review-to-test` migration
     row." But Task 12's only #1226 content is a *test fixture* — plan lines
     1203-1207, "Include #1226's preserved accepted O1 commit and evidence as
     the Review/unmerged fixture". `planOpenIssueMigration` (plan line 1183)
     is a pure classifier. Nothing in Task 12 executes a migration against
     live #1226.
  2. Plan line 202 keeps A13's dependency row as "current #1226-#1244 set plus
     all seven new issue IDs", so #1226 must be complete before A13 starts.
     Plan lines 210-212 reinforce this: #1246 "adds #1226's fresh baseline",
     and #1246 ranks before #1247.
  3. The only step that actually migrates live open issues is Task 13 Step 4,
     `npx aitm continuous-delivery enroll-open --manifest ...` (plan lines
     1337-1345) — which sits *inside* A13, after Task 13 Step 3, and Step 3
     ends "Refuse A13 entry if #1244 was delivered through a legacy path"
     while plan lines 214-218 reserve #1244 as "the first enrolled delivery"
     after A12 activation.
- **Failure mode:** the executing orchestrator has no non-contradictory move.
  If it waits for Task 13 Step 4 to reclassify #1226, then A13 depends on an
  issue only A13 can unblock — a hard cycle, and A13 never enters. If instead
  it reclassifies and delivers #1226 right after A12 activation so the
  dependency can be satisfied, then #1226 — not #1244 — is the first enrolled
  delivery, contradicting the pilot reservation; and #1226 would be carrying
  the protocol's first-ever enrolled merge with no pilot bundle and no
  accepted evidence, which is exactly the unpiloted rollout spec lines 605-612
  forbid. A third reading — that #1226 finishes through the legacy
  Review→Done path before A13 — is defensible but is precisely what plan
  lines 112-116 now prohibit.
- **Owning task/step:** Decomposition section (plan lines 109-120), the A13
  dependency row (line 202), Task 12 Step 1 (lines 1200-1208), and Task 13
  Steps 3-4 (lines 1325-1345).
- **Smallest sufficient correction:** pick one lane and state it in one
  sentence in the Decomposition section. The lane I would choose, because it
  keeps both the spec's migration row and the pilot reservation intact:
  add a Task 12 Step 8b (or a Task 13 Step 3a) that performs a **single-issue**
  `review-to-test` reclassification of #1226 under the activated runtime, and
  narrow plan lines 214-218 from "#1244 … is the first enrolled delivery" to
  "#1244 is the first pilot-bundle delivery", so a reclassified-but-not-yet-
  delivered #1226 does not claim that slot. Whichever lane is chosen, the
  Decomposition text must say where #1226's reclassification executes and
  whether A13's dependency on #1226 means "closed" or "reclassified".

## 3. Non-blocking follow-ups

### [finding:F-015] The migration gate creates seven children without Priority, Size, Estimate, or start time

Migration gate Step 2 (plan lines 145-165) now renders bodies correctly, but
the `create-issue` invocation passes only `--title`, `--body-file`, and
`--parent`. `scripts/lib/self-doc.mjs:49` shows the same command also accepts
`--priority`, `--size`, `--estimate`, `--rank`, and `--start-time`. The
repository rule is that every issue carries `Estimate` and `Size` before work
starts, and the Refine→Plan gate additionally needs Priority, Size, Estimate,
Labels, and start time. Gate Step 6 says "A1 may begin only after all checks
pass", but `scripts/task-tracker/verbs/decompose-check.mjs` validates
decomposition structure only — I read it, and it asserts nothing about
estimation fields — so nothing in the gate catches the omission. Either pass
those flags in the Step 2 command (a per-row estimate column in the Seven new
children table would supply them) or state that estimation happens during each
child's own Refine and is deliberately out of the gate's scope.

## 4. Round-3 dispositions independently verified

Each was checked against the plan text at `9b05328` and, where it makes a
repository claim, against `origin/trunk` at `07984e5`.

- **F-001 — resolved.** Plan line 583 now reads `'reviewId'` inside Task 4
  Step 1's sorted key list; `'flowReviewId'` is gone from that list and
  survives only at plan line 829 as `aitm.delivery-receipt/v2`'s
  cross-reference, which is the spec's own name (spec line ~470). Matches spec
  line 433.
- **F-002 — resolved, better than my correction.** Task 12's Files block now
  adds `scripts/task-tracker/task-tracker.mjs`,
  `scripts/task-tracker/lib/command-surface/routing.mjs`,
  `scripts/task-tracker/lib/command-surface/catalog.mjs`, and
  `scripts/tests/unit/task-tracker/core/command-manifest.test.mjs`, and the
  new Interfaces bullet names the verb-hub switch, preflight mode, route
  identity, catalog contract, related-command metadata, and help reference.
  Every one of those surfaces is real at the pinned base: `PREFLIGHT_MODE` is
  exported from `task-tracker.mjs:67`; `ROUTE_IDENTITIES` /
  `routeIdentityForVerb` from `routing.mjs:20,294`; `taskVerbNames` from
  `catalog.mjs:1024`; and `command-manifest.test.mjs:17-18,20-60` imports all
  of them plus `parseVerbs` and asserts route/catalog/registry parity — so it
  is exactly the test that would have failed under my narrower fix. All four
  paths exist at `07984e5`. Step 4, Step 6, and the Step 7 `git add` all
  include the manifest test.
- **F-003 — resolved.** Task 6 line 714 now reads "Consume unchanged:
  `…/full-auto-doctrine-doc.test.mjs`", the file is dropped from Task 6's
  Step 6 `git add`, and Task 13's Files block now carries it as **Modify**
  alongside `docs/guides/workflow.md`, with both staged in Task 13 Step 8.
  Task 6 still runs it as a regression in Steps 3 and 5, which is right. The
  test reads only `docs/guides/workflow.md`, so it can now be green at Task 6
  and meaningfully modified at Task 13.
- **F-004 — resolved.** Task 1 Step 1 (plan lines 325-331) now requires a
  hostile-candidate fixture planting a modified lifecycle-authorization module
  beneath `sourceRoot`, asserting the trusted `toolRoot` copy loads, the
  candidate copy never executes, and candidate-minted authority is rejected by
  `validateRuntimeCapabilityV3()`. That is spec Acceptance Test 19 (spec line
  694) as an executable step.
- **F-005 — resolved as written, but see F-014.** The immutability claim is
  correctly narrowed to "body, branch, worktree, receipts, and approval
  evidence" (plan lines 111-112), migration gate Step 4 now scopes
  current-state preservation to the WBS/body migration only, and the #1220
  contract line reframes the reclassification as migration rather than
  invalidation. The wording change is right; what is missing is the schedule.
- **F-006 — resolved.** `- Create: scripts/tests/unit/gh/audit-ci-rulesets.test.mjs`
  now appears in Task 8's Files block, matching its Step 4 RED run and Step 7
  staging. Confirmed still absent at `07984e5`, so `Create` is the correct
  verb.
- **F-007 — resolved.** The signature is now
  `validateFlowReviewReceipt(value, candidate, reviewPackage)` with an explicit
  statement that the validator recomputes `issueBodyDigest` and `planDigest`
  from the immutable package and invents no receipt field. No spec amendment
  was smuggled in.
- **F-008 — resolved.** Task 2 Step 2 now requires four independent
  enrollment refusals — missing PR enforcement, strict exact-head required
  checks, deletion protection, non-fast-forward protection — each proven to
  refuse "before any enrollment record or projection is written", and
  explicitly names Task 8 as the later hierarchy-wide audit rather than the
  first enforcement point. That satisfies the Global Constraint at plan lines
  72-76.
- **F-009 — resolved.** `aitm.runtime-activation/v1` and
  `aitm.crossover-audit/v1` are now in Task 1 Step 1's `schemaVersions`
  inventory.
- **F-010 — resolved.** Plan lines 204-208 state the exclusion and its reason.
- **F-011 — resolved, and the command is executable as written.** I verified
  the full contract: `scripts/task-tracker/preflight-issue.mjs` header lines
  9-15 document the `--shape` full-body mode, its required flags are
  `--user-story-file`, `--scope-file`, `--ac-file`, `--story-origin-file` with
  `--plan-metadata-file`, `--verification-commands-file`, and `--parent`
  optional (`scripts/lib/self-doc.mjs:57`), and it emits the assembled body on
  stdout (`preflight-issue.mjs:579`, plus the trailing body-version marker at
  line 588) — so the `> "$FRAGMENTS/body.md"` redirect is correct. The six
  fragment files the gate creates map one-to-one onto those flags, and
  `npx aitm create-issue --title … --body-file … --parent …` matches the
  documented example at `self-doc.mjs:471`. No `--assignee` is passed, which
  is correct for new issues.
- **F-012 — resolved.** A9 is now nested beneath A8 in the ladder, preserving
  the A8→A9 edge that the dependency table declares.
- **F-013 — resolved.** Migration gate Step 3 now requires replacing the WBS's
  contiguous ranges with explicit child-ID enumerations before the WBS-only
  commit.
- **Additional clarifications — all verified present.** The #1486 sequencing
  note is at plan lines 93-95 and is correctly advisory; Task 6 marks
  `gate-resolve.mjs` and `session-store.mjs` as "Consume unchanged"; Task 13's
  Files block now includes `scripts/task-tracker/config.mjs`, matching its
  Step 5 default change and Step 8 staging.

## 5. Existing-WBS migration verdict

**Unchanged: migrate, not discard.** The round-2 basis still holds and the
F-011/F-013 fixes make the gate executable — the issue-creation command now
matches the real CLI contract, and the WBS edit is specified as explicit
enumeration rather than range arithmetic. `F-015` is the only remaining gap in
the gate, and it is non-blocking.

## 6. #1486 sequencing verdict

**Unchanged: advisable, not required.** The recommendation I made is now in
the plan verbatim in effect (plan lines 93-95: cheapest after A2, before A8,
"advisory and does not gate either task"). Nothing in this round changes the
analysis.

## 7. #1512 compatibility verdict

**Unchanged: compatible.** The round-3 edits improve it: Task 6 now labels
`scripts/task-tracker/lib/gate-resolve.mjs` and
`scripts/task-tracker/lib/session-store.mjs` as consumed unchanged, so the
eight-combination gate test at Task 6 Step 1 no longer reads as an incomplete
Files block. The three gate keys, their disabled-by-default values, and the two
reused exports were re-confirmed at `07984e5` and are untouched by this
revision.

## 8. Questions for the author

1. On F-014: which lane do you intend — a single-issue #1226 reclassification
   under the activated runtime before the #1244 pilot, or #1226 reclassified by
   Task 13 Step 4 with A13's dependency row amended to drop it? Both are
   defensible; the plan currently implies both and permits neither.
2. On F-014: does A13's "current #1226-#1244 set" dependency mean each issue is
   **closed**, or merely **enrolled/reclassified**? The answer changes whether
   the cycle exists at all, and it is worth stating once for every row rather
   than only for #1226.
3. On F-015: is estimation of the seven new children deliberately deferred to
   each child's own Refine, or should the gate's `create-issue` call carry
   `--priority`, `--size`, and `--estimate`?

## 9. Reviewed SHA and evidence inventory

**Reviewed SHA:** `9b05328a075334d7d9c5360806b86403121d4cfc`

Read-only evidence consulted this round:

- Plan at the reviewed commit; full `ff974bd..9b05328` diff plus surrounding
  context for every hunk; targeted re-reads at plan lines 93-95, 109-120,
  142-180, 198-232, 255-265, 305-335, 405-420, 545-585, 705-780, 880-895,
  1160-1215, 1235-1265, 1280-1300, 1325-1380, 1395-1410.
- `round-3-author-response.md`, resolved from
  `lastHandoff.artifacts.response.path` and hash-matched.
- Accepted spec at `1375edfd4b29c98e407ae428a15f992dbdff2cd6` — Migration
  (lines 605-640), Acceptance Tests (line 694), Evidence Model (line 433).
- `origin/trunk` at `07984e5137ba53f56fe062a351e5dd4111fb87bd`:
  `bin/aitm-registry.mjs` (lines 30-60, incl. the `parseVerbs` demotion comment
  and `VERBS = taskVerbNames()`),
  `scripts/task-tracker/lib/command-surface/catalog.mjs:1024`,
  `scripts/task-tracker/lib/command-surface/routing.mjs:20,292-296`,
  `scripts/task-tracker/task-tracker.mjs:63-67,166`,
  `scripts/tests/unit/task-tracker/core/command-manifest.test.mjs` (full),
  `scripts/task-tracker/preflight-issue.mjs` (header lines 1-30 and stdout
  writes at 579/584/588/693/695), `scripts/lib/self-doc.mjs:42-57,471-485`,
  `scripts/task-tracker/verbs/decompose-check.mjs` (full argument and check
  surface).
- Path existence at that base for every path added this round: `routing.mjs`,
  `catalog.mjs`, `command-manifest.test.mjs`, `task-tracker.mjs`,
  `config.mjs` all present; `scripts/tests/unit/gh/audit-ci-rulesets.test.mjs`
  still absent, consistent with its new `Create` declaration.
- `git diff --name-status ff974bd 9b05328` — plan only; working tree clean at
  `HEAD == 9b05328`.

No tracked file was created, edited, staged, committed, or pushed this round.
No issue, project, ruleset, branch, or remote state was mutated. No issues were
created. This review file is the only artifact written, inside the ignored
protocol directory.
