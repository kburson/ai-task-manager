# Exact-head CI fixture correction

Initial CI run: [39444343885](https://github.com/kburson/ai-task-manager/actions/runs/39444343885), source 286c50be8597939b9f07bfa0bebdf4e46ccd7c05. Slow group 2 failed scripts/tests/slow/task-tracker/lib/move-state-approval-gate.test.mjs with the native Plan-to-Develop guard refusal `issue identity`. The exact job log is retained as ci-slow2-failed.log. This is a real failing run, not successful Test evidence.

The test's CLI GitHub double returns an explicit Issue ID and number but omits repository.nameWithOwner in its viewer/admission response. The new production collector correctly requires that selected identity field. The existing slow test reproduces the same refusal locally before correction; approval-fixture-red.log retains that result. The fixture now provides repository identity o/r. No production guard or authority policy changes. The existing test then passes its entire approval-gate scenarios; approval-fixture-green.log retains the result.

This continues the final correction/verification pass; no additional managed reviewer was dispatched. Native criterion evidence from the earlier head must be refreshed after committing this fixture and collateral. Full CI and native Test must use the new exact head; no previous green job or stale receipt will substitute.


## Remaining CI failures and final fixture verification

The completed initial run also failed guidance-recertification-capture.test.mjs and guidance-release.test.mjs in integration group 2. Both returned indeterminate for lifecycle-promote because the current simulated GitHub response omitted the newly required repository identity. The exact failed group log is retained as ci-integration2-failed.log. The production maintenance capture and test capture helper each embed this fake provider; each now supplies example/project identity in that response. Historical archived capture bytes and expected lifecycle outcomes remain unchanged.

The recertification test also reproduced the failure locally before correction (capture-fixture-red.log). After correcting all three doubles, the full three-suite rerun passed 17/17 (ci-fixtures-green.log). No production admission validator was weakened. The other initial CI unit, integration groups 1/3, slow groups 1/3, packaging and guidance-cache jobs passed; aggregate fast/slow gates correctly failed with their failing constituent groups.

The prior full quality rerun passed all audits and all 975 fast files (107.2s aggregate). After these additional fixture-only corrections, targeted format/lint/spell checks and the full fast suite run again before commit. New-head cloud CI must still pass every lane.

Final local checks passed: the full fast suite reports all 975 files green (105.9s), all three affected suites report 17/17, and targeted formatting, ESLint and spelling checks exit zero. Full fast output is retained as final-fast.log.
