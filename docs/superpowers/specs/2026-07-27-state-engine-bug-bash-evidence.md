# State Engine Bug-Bash Evidence Register

**Date:** 2026-07-27
**Parent design:** `2026-07-27-state-engine-refactoring-design.md`
**Collection start:** 2026-07-19
**Status:** Audited input to #1005 planning

---

## 1. Collection Method

This register is the evidence corpus for the #1005 refactoring plan. It is not
limited to the immediate #931 blocking chain.

The collection includes every GitHub issue labeled `bug` or `beta-defect` whose
AITM `startTime` is on or after 2026-07-19. A defect with no recorded
`startTime` is retained when its GitHub creation date is on or after the cutoff;
those rows are marked `created*`. This fallback prevents missing Start metadata
from hiding the exact workflow defects the audit is intended to expose.

Primary commits come from reachable git history and use the issue-tagged
corrective commit where one exists. `No tagged commit` means the issue remains
in the evidence corpus but no `[#N]` commit was found in reachable refs during
this audit.

The collection is intentionally broader than implementation scope. Every row
must receive a disposition in the implementation plan, but a defect does not
automatically justify another refactoring story.

## 2. Theme Codes

| Code  | Theme                                                          | Planning use                                      |
| ----- | -------------------------------------------------------------- | ------------------------------------------------- |
| `LP`  | Lifecycle topology, state eligibility, and transition behavior | Direct lifecycle-policy children                  |
| `TP`  | Timing-event grammar, sequencing, spans, and recovery          | Timing policy or #1006 timing mechanisms          |
| `GE`  | Gates, evidence, review, issue-kind, and approval semantics    | Action policy or #1006 workflow mechanisms        |
| `OM`  | Mutation, parsing, reconciliation, GitHub, and orchestration   | #1006 JIT architecture audit                      |
| `CLI` | Agent-callable maintenance and command safety                  | Agentic CLI contract child                        |
| `TI`  | Test, CI, release, and delivery stability                      | Verification constraints unless coupling is found |

## 3. Evidence Register

| Issue | Start basis   | Theme | Corrective signal                                      | Primary commit   |
| ----- | ------------- | ----- | ------------------------------------------------------ | ---------------- |
| #900  | 7/19          | `TI`  | Trunk suite drift after epic-gating merge              | `70499ef`        |
| #901  | created 7/19* | `TI`  | Test discovery omitted `it` and `describe`             | `b925597`        |
| #902  | 7/19          | `GE`  | DoD stamp failed to reconcile verifier commands        | `3ea7ecc`        |
| #904  | 7/20          | `TP`  | Review pass emitted no symmetric timing event          | `e916791`        |
| #921  | 7/21          | `OM`  | Epic fan-out allowed duplicate sub-issues              | `63031f1`        |
| #923  | 7/21          | `GE`  | Missing commit-bearing, testless issue kind            | `5e393f5`        |
| #927  | 7/21          | `OM`  | Trunk-ref resolution differed across consumers         | `57ad17f`        |
| #928  | 7/21          | `GE`  | AC citations emitted retired ordinal metadata          | `49b02b9`        |
| #933  | created 7/22* | `GE`  | Lifecycle DoD toggle rejected marker-bearing lines     | `ab9335b`        |
| #934  | 7/22          | `TI`  | Functional DoD verification exceeded runner budget     | `6d1f671`        |
| #941  | 7/23          | `TI`  | Documentation tests bypassed the reach gate            | `867bc70`        |
| #942  | created 7/23* | `TI`  | Duplicate spelling entries blocked quality             | `65bec4f`        |
| #943  | created 7/23* | `TI`  | Kind-aware DoD tests retained retired expectations     | `6ba127b`        |
| #947  | created 7/24* | `OM`  | Closed child in stale board state blocked its epic     | `a15cbe9`        |
| #949  | created 7/24* | `TI`  | Shallow CI checkout broke provenance checks            | `44429b9`        |
| #952  | 7/24          | `GE`  | Promote-to-Test did not migrate retired verifier       | `171c0d3`        |
| #932  | 7/24          | `GE`  | Demotion preserved stale execution evidence            | `c4c1409`        |
| #922  | 7/24          | `TI`  | Sandbox suite had no timeout headroom                  | No tagged commit |
| #899  | 7/24          | `GE`  | Issue-kind change left stale DoD structure             | `776a308`        |
| #854  | 7/24          | `CLI` | Live migration targeted retired state vocabulary       | `9541098`        |
| #879  | 7/24          | `CLI` | Maintenance heals lacked per-issue targeting           | `1dcb9d1`        |
| #845  | 7/24          | `LP`  | Cold bind skipped assignee preflight                   | `e32ace4`        |
| #855  | 7/24          | `TI`  | Develop verification skipped untracked tests           | `08f14dd`        |
| #931  | 7/24          | `LP`  | Bare action verbs lacked home-state guards             | `f792708`        |
| #819  | 7/24          | `GE`  | In-flight issues retained obsolete lifecycle DoD       | `feabb2d`        |
| #848  | 7/24          | `LP`  | Refine/Plan had no sanctioned park path                | `0f614aa`        |
| #853  | 7/24          | `TI`  | Package and lockfile versions diverged                 | `a07091a`        |
| #891  | 7/24          | `GE`  | Demonstrable-AC opt-out matched prose                  | `7ba4a6b`        |
| #964  | 7/24          | `CLI` | Apply-capable script was absent from safety manifest   | `faf8028`        |
| #968  | 7/24          | `OM`  | Review-to-Done used inconsistent trunk resolution      | `9579777`        |
| #970  | 7/24          | `GE`  | Review preflight ignored no-commit issue kinds         | `7cf0758`        |
| #963  | created 7/24* | `OM`  | Issue-kind parser read markers outside their section   | `ae2d543`        |
| #974  | 7/25          | `TI`  | Parallel-safety audit missed transitive subprocesses   | `7eb3fa6`        |
| #975  | 7/25          | `GE`  | Review ignored the honest unverified-tick hatch        | `86a424b`        |
| #984  | 7/25          | `GE`  | Agent review omitted timing/detail forensics           | `12f9d77`        |
| #973  | created 7/25* | `GE`  | Rejected VC was incorrectly scored as failed           | `0a4ac60`        |
| #981  | created 7/25* | `TP`  | Resume after unmarked departure inflated active time   | `306ed33`        |
| #979  | 7/26          | `GE`  | Explicit human approval was misclassified as Full-Auto | `b9729a0`        |
| #972  | 7/26          | `TP`  | Timing writer allowed consecutive departures           | `5499480`        |
| #991  | 7/26          | `TI`  | Documentation commits left trunk lint/format red       | `4f946a8`        |
| #992  | 7/26          | `TI`  | GitHub timeout failed under suite contention           | `ed6d2e6`        |
| #993  | 7/26          | `TI`  | Serial-heavy tests breached fast-lane ceiling          | `53a9312`        |
| #983  | 7/26          | `TP`  | Agent termination left Develop spans open              | `d4193e5`        |
| #996  | 7/26          | `TP`  | Reject emitted a malformed bare timing slug            | `f3a09cc`        |
| #994  | created 7/26* | `OM`  | Marker normalizer orphaned review-failure prose        | `1988ddb`        |
| #997  | created 7/26* | `LP`  | Home-state guard broke the Review self-loop            | `0d1a18d`        |
| #998  | created 7/26* | `LP`  | Review drift re-verification deadlocked                | `43c4901`        |
| #999  | created 7/26* | `LP`  | Executable topology omitted Review-to-Test             | `20aa5cb`        |
| #1001 | 7/26          | `LP`  | Marker-history topology omitted Review-to-Test         | `ae82cf2`        |
| #1002 | created 7/26* | `TP`  | Strict timing reader omitted the update checkpoint     | `d103dcc`        |
| #1003 | 7/26          | `TP`  | Healer did not migrate legacy bare reject rows         | `8aff526`        |
| #953  | 7/27          | `OM`  | Issue-kind parser matched inline-code examples         | No tagged commit |
| #1004 | created 7/27* | `OM`  | Review-failed parser matched delimiter prose           | `5438567`        |

## 4. What the Corpus Shows

The immediate #931, #996, #1001, and #1002 chain is only one slice of the
evidence. The full corpus shows recurring classes:

1. **Authority drift.** Executable transitions, history transitions, action
   eligibility, issue-kind policy, timing vocabulary, and script safety
   manifests were updated independently.
2. **Producer-reader gaps.** Timing writers, strict validators, healers, marker
   writers, and marker parsers did not share one contract.
3. **Current-history gaps.** Correct current behavior still failed on legacy
   issue bodies, retired verifiers, old timing rows, or stale board state.
4. **Entry and recovery asymmetry.** Cold bind, self-loop, demotion,
   re-verification, interrupted timing, and close paths did not consistently
   exercise the same policy.
5. **Evidence-semantic drift.** Human approval, issue kinds, AC/VC outcomes,
   DoD checks, and review evidence were interpreted differently by adjacent
   workflow stages.
6. **Agentic-operability gaps.** Maintenance scope, apply-script inventory,
   command discovery, test selection, and runtime budgets were not uniformly
   encoded or audited.

These patterns justify a broader refactoring audit, but they do not justify
collapsing all behavior into one state-engine module. The implementation plan
must preserve the domain boundaries in the parent design.

## 5. Required Planning Disposition

Before stories are generated, every issue in this register must be assigned
exactly one disposition:

| Disposition             | Meaning                                                                          |
| ----------------------- | -------------------------------------------------------------------------------- |
| Direct child            | The fix exposed policy owned by a named #1005 child                              |
| #1006 audit input       | The fix exposed an operational mechanism to inspect after policy convergence     |
| Verification constraint | The fix constrains tests, CI, packaging, or delivery but adds no refactor scope  |
| Already centralized     | The fix established an authority that the new design should consume, not replace |
| Independent concern     | The fix is outside #1005 and must not expand the epic                            |

A disposition must cite the target child or audit area and the regression test
that preserves the corrected behavior. Multiple issues may map to one invariant;
the plan must not create one refactoring story per defect.
