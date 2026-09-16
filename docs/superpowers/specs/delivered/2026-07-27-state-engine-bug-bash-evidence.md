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

## 6. Disposition and Regression Ownership

This table is the durable rendering of C1's executable disposition fixture.
Targets name a policy child, the deferred #1006 audit area, or a delivery
constraint without expanding the approved epic scope.

| Issue | Disposition               | Target                                            | Regression owner                                                   |
| ----- | ------------------------- | ------------------------------------------------- | ------------------------------------------------------------------ |
| #819  | `1006-audit-input`        | #1006 lifecycle DoD migration audit               | #1006 JIT audit and existing corrective regression suite           |
| #845  | `direct-child`            | #1009 lifecycle action and bootstrap policy       | `state-engine-policy-characterization.test.mjs`                    |
| #848  | `direct-child`            | #1009 lifecycle action and park policy            | `state-engine-policy-characterization.test.mjs`                    |
| #853  | `verification-constraint` | C1-C6 package-version delivery gates              | repository lint, format, fast, integration, and slow quality gates |
| #854  | `direct-child`            | #1011 agentic CLI maintenance contract            | `executable-entrypoint-classification.test.mjs`                    |
| #855  | `verification-constraint` | C1-C6 untracked-test reach gate                   | repository lint, format, fast, integration, and slow quality gates |
| #879  | `direct-child`            | #1011 agentic CLI maintenance scope               | `executable-entrypoint-classification.test.mjs`                    |
| #891  | `already-centralized`     | demonstrable AC policy and verifier               | #1006 JIT audit and existing corrective regression suite           |
| #899  | `1006-audit-input`        | #1006 issue-kind body migration audit             | #1006 JIT audit and existing corrective regression suite           |
| #900  | `verification-constraint` | C1-C6 trunk quality gates                         | repository lint, format, fast, integration, and slow quality gates |
| #901  | `verification-constraint` | C1-C6 test-discovery gate                         | repository lint, format, fast, integration, and slow quality gates |
| #902  | `1006-audit-input`        | #1006 DoD verifier reconciliation audit           | #1006 JIT audit and existing corrective regression suite           |
| #904  | `direct-child`            | #1010 canonical timing-event policy               | `timing-event-emitter-characterization.test.mjs`                   |
| #921  | `1006-audit-input`        | #1006 epic fan-out and mutation audit             | #1006 JIT audit and existing corrective regression suite           |
| #922  | `verification-constraint` | C1-C6 sandbox timeout budget                      | repository lint, format, fast, integration, and slow quality gates |
| #923  | `already-centralized`     | issue-kind commit-requirement policy              | #1006 JIT audit and existing corrective regression suite           |
| #927  | `1006-audit-input`        | #1006 trunk-reference resolution audit            | #1006 JIT audit and existing corrective regression suite           |
| #928  | `already-centralized`     | AC evidence-reference policy                      | #1006 JIT audit and existing corrective regression suite           |
| #931  | `direct-child`            | #1009 lifecycle action home-state policy          | `state-engine-policy-characterization.test.mjs`                    |
| #932  | `1006-audit-input`        | #1006 demotion evidence cleanup audit             | #1006 JIT audit and existing corrective regression suite           |
| #933  | `already-centralized`     | lifecycle DoD marker parser                       | #1006 JIT audit and existing corrective regression suite           |
| #934  | `verification-constraint` | C1-C6 functional DoD runtime budget               | repository lint, format, fast, integration, and slow quality gates |
| #941  | `verification-constraint` | C1-C6 documentation test-reach gate               | repository lint, format, fast, integration, and slow quality gates |
| #942  | `verification-constraint` | C1-C6 spelling dictionary gate                    | repository lint, format, fast, integration, and slow quality gates |
| #943  | `verification-constraint` | C1-C6 kind-aware DoD regression gate              | repository lint, format, fast, integration, and slow quality gates |
| #947  | `1006-audit-input`        | #1006 closed-child board reconciliation audit     | #1006 JIT audit and existing corrective regression suite           |
| #949  | `verification-constraint` | C1-C6 full-history provenance gate                | repository lint, format, fast, integration, and slow quality gates |
| #952  | `1006-audit-input`        | #1006 Test verifier migration audit               | #1006 JIT audit and existing corrective regression suite           |
| #953  | `1006-audit-input`        | #1006 issue-kind parser boundary audit            | #1006 JIT audit and existing corrective regression suite           |
| #963  | `1006-audit-input`        | #1006 issue-kind section parser audit             | #1006 JIT audit and existing corrective regression suite           |
| #964  | `direct-child`            | #1011 agentic CLI safety inventory                | `executable-entrypoint-classification.test.mjs`                    |
| #968  | `1006-audit-input`        | #1006 Review-to-Done trunk resolution audit       | #1006 JIT audit and existing corrective regression suite           |
| #970  | `already-centralized`     | no-commit issue-kind review policy                | #1006 JIT audit and existing corrective regression suite           |
| #972  | `1006-audit-input`        | #1006 timing-writer sequence audit                | #1006 JIT audit and existing corrective regression suite           |
| #973  | `already-centralized`     | VC evidence outcome policy                        | #1006 JIT audit and existing corrective regression suite           |
| #974  | `verification-constraint` | C1-C6 transitive parallel-safety gate             | repository lint, format, fast, integration, and slow quality gates |
| #975  | `already-centralized`     | honest unverified evidence policy                 | #1006 JIT audit and existing corrective regression suite           |
| #979  | `already-centralized`     | explicit human approval policy                    | #1006 JIT audit and existing corrective regression suite           |
| #981  | `1006-audit-input`        | #1006 interrupted-session timing audit            | #1006 JIT audit and existing corrective regression suite           |
| #983  | `1006-audit-input`        | #1006 terminated-agent span audit                 | #1006 JIT audit and existing corrective regression suite           |
| #984  | `1006-audit-input`        | #1006 agent-review forensic audit                 | #1006 JIT audit and existing corrective regression suite           |
| #991  | `verification-constraint` | C1-C6 documentation quality gates                 | repository lint, format, fast, integration, and slow quality gates |
| #992  | `verification-constraint` | C1-C6 GitHub timeout budget                       | repository lint, format, fast, integration, and slow quality gates |
| #993  | `verification-constraint` | C1-C6 fast-lane ceiling                           | repository lint, format, fast, integration, and slow quality gates |
| #994  | `1006-audit-input`        | #1006 marker-normalization audit                  | #1006 JIT audit and existing corrective regression suite           |
| #996  | `direct-child`            | #1010 canonical timing-event grammar              | `timing-event-emitter-characterization.test.mjs`                   |
| #997  | `direct-child`            | #1008 executable self-loop topology               | `state-engine-policy-characterization.test.mjs`                    |
| #998  | `direct-child`            | #1008 Review drift topology                       | `state-engine-policy-characterization.test.mjs`                    |
| #999  | `direct-child`            | #1008 executable lifecycle topology               | `state-engine-policy-characterization.test.mjs`                    |
| #1001 | `direct-child`            | #1009 lifecycle history policy                    | `state-engine-policy-characterization.test.mjs`                    |
| #1002 | `direct-child`            | #1010 canonical timing-event strict-reader policy | `timing-event-emitter-characterization.test.mjs`                   |
| #1003 | `1006-audit-input`        | #1006 timing-log healing audit                    | #1006 JIT audit and existing corrective regression suite           |
| #1004 | `1006-audit-input`        | #1006 review-failure parser boundary audit        | #1006 JIT audit and existing corrective regression suite           |
