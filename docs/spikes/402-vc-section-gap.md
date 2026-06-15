# Spike #402 — Issues clear Plan without a Verification Commands section

**Status:** complete (2026-06-15)
**Type:** investigation spike
**Trigger:** #399 reached Test with no `## Verification Commands` section; the section had to be hand-added mid-flow because the `test` verb dead-ended at "nothing to verify".
**Follow-up implementation issue:** #386.

## Summary

Issue bodies were reaching `Develop` (and beyond) with no `## Verification
Commands` section, which then dead-ends the `test` verb. This spike enumerates
how that happens, names the responsible rule, audits the live blast radius, and
records a recommendation plus the follow-up implementation issue.

<!-- AC1-anchor: creation-paths -->
## AC1 — Creation paths and whether each stamps a Verification Commands section

Issue bodies are rendered by `scripts/task-tracker/preflight-issue.mjs` and
created atomically by `scripts/gh/create-issue.mjs`. There are two creation
paths:

- **Freeform create** (`create-issue.mjs --title ...`): before #410 this path
  did **not** stamp a `## Verification Commands` section. The DoD +
  Pickup-Directive tail was stamped; the VC section was not.
- **Shape create** (`create-issue.mjs --shape` with scope/ac/plan-metadata
  files): same — before #410 the rendered body carried no VC section.

#410 (closed earlier this session) added creation-time VC-section seeding in
`preflight-issue.mjs` (the `auditEvidenceMarkers(assembled).missingVerificationCommands`
branch, ~lines 265-281), which inserts the section before the Pickup-Directive
anchor. **Conclusion:** as of #410 both creation paths now stamp the section;
the gap was real for every issue created before #410.

<!-- AC2-anchor: promotion-paths -->
## AC2 — Plan→Develop promotion paths and whether each requires the section

The plan→develop transition runs the body gates in
`scripts/task-tracker/lib/body-gates.mjs`. The promotion paths are
`plan-approve` (gate verb) and `promote` (plan→develop move), both of which run
the `DEFAULT_GATES` rule set. The relevant rule is `verification-commands`
(kind `ALL_CHECKED_RULE`, heading `/^#{2,3}\s+Verification Commands\b/im`).
**Conclusion:** no promotion path requires the section to *exist* — see AC3.

<!-- AC3-anchor: root-cause -->
## AC3 — Root cause: the rule and file responsible

File: `scripts/task-tracker/lib/body-gates.mjs`, function
`evaluateAllCheckedRule(lines, rule)`.

Its first action is:

```js
const headingIdx = findHeadingIndex(lines, rule.heading);
if (headingIdx === -1) return null; // vacuous pass
```

`ALL_CHECKED_RULE` semantics are "every checkbox under this heading must be
checked." With the heading absent there are zero checkboxes, so the rule returns
`null` (pass) instead of failing. Consequently a body with **no
`## Verification Commands` section at all** clears the plan→develop gate
unchallenged. The gate enforces "all VC items checked" but never enforces "a VC
section exists with ≥1 parseable item." Downstream, the `test` verb finds no VC
entries and soft non-advances ("nothing to verify"), so the issue stalls
silently rather than failing loudly.

<!-- AC4-anchor: recommendation -->
## AC4 — Recommendation: do both (creation-stamp + Plan-exit presence gate)

Two complementary fixes are needed; #410 already shipped the first half.

1. **Creation-stamp** (DONE, #410): seed the VC section at issue-creation time.
   Necessary but insufficient — it cannot catch strip-after-create and does not
   retro-fix pre-#410 issues.
2. **Plan-exit presence gate** (RECOMMENDED, the remaining work): add a presence
   gate so plan→develop **refuses** a body lacking a `## Verification Commands`
   section with ≥1 parseable entry, and make the `test` no-vc case a loud
   non-success rather than a silent non-advance. This is the durable fix because
   it enforces the invariant at the transition that actually matters,
   independent of how the body got there.

**Recommendation: do both.** Keep #410's creation-stamp and add the plan-exit
gate + loud-test behavior. The latter is the follow-up implementation issue
(#386). A creation-stamp alone leaves two holes (strip-after-create, pre-#410
issues); a presence gate alone lets a no-VC body get all the way to the gate
before failing. Together they make the invariant true at creation and enforced
at exit.

<!-- AC5-anchor: open-issue-audit -->
## AC5 — Audit of currently-open issues missing a Verification Commands section

Read-only audit (`.tmp/inspect/audit-vc-section.mjs`, `gh issue list/view`) over
all open issues on 2026-06-15:

- **Open issues scanned: 36**
- **Open issues MISSING a `## Verification Commands` section: 33**

The 33: #125, #206, #274, #306, #307, #308, #309, #310, #311, #312, #313, #316,
#317, #318, #319, #320, #321, #330, #334, #349, #370, #371, #372, #386, #402,
#405, #406, #408, #409, #411, #413, #414, #416.

(#402 — this spike — is itself a victim, created 2026-06-14 before #410.) Only 3
open issues currently carry a VC section. **Implication:** once the plan-exit
gate lands, these 33 would block at plan→develop until healed; a one-shot
heal/back-fill pass over open issues should accompany or precede the gate's
activation to avoid mass false-blocks.

<!-- AC6-anchor: follow-up-issue -->
## AC6 — Follow-up implementation issue

The plan-exit gate + loud-test fix is tracked by **#386** ("BUG: Plan→Develop
lacks Verification-Commands-present gate; test verb silently no-ops"), which
predates this spike and is the canonical implementation deliverable. #386's two
defects map 1:1 onto AC3 and the test-verb tail here; its ACs (plan-approve
refuses a no-VC body; test no-vc surfaces a loud non-success; unit tests for
both; full suite passes) are the acceptance surface for this recommendation.
A heal/back-fill of the 33 pre-existing issues (AC5) should be filed or folded
into #386's rollout so the gate does not mass-block on activation.
