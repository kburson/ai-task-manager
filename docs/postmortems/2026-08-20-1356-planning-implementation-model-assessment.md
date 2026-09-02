# Postmortem: #1356 Planning, Implementation, and Model Performance

**Status:** Final  
**Scope:** #1356 and its chained defect #1359  
**Times below:** Central Time

## Executive conclusion

The completed evidence changes the preliminary interpretation: Grok's implementation was not merely blocked by an unrelated slow-test defect. After Codex fixed #1359, an independent review found four material correctness gaps in Grok's merged #1356 implementation. Codex then substantially hardened the implementation before it could safely close.

The defensible conclusion is:

- This incident strongly supports that Codex materially outperformed Grok in planning completeness, correctness, verification, debugging, and delivery recovery.
- It does not establish that Grok is globally "grossly inferior" to Codex from one incident.
- It provides no valid Grok-versus-Claude evidence because Claude did not execute the same work under comparable conditions.

Confidence that Codex performed better on this incident is high. Confidence in a general model ranking is low-to-medium.

## Outcome

[#1356](https://github.com/kburson/ai-task-manager/issues/1356) closed successfully at 9:58 PM after approximately 8h55m wall time.

The final solution required three merged PRs:

| PR | Owner | Purpose | Result |
|---|---|---|---|
| [#1358](https://github.com/kburson/ai-task-manager/pull/1358) | Grok | Initial receipt-reuse implementation | Merged, but later found materially incomplete |
| [#1360](https://github.com/kburson/ai-task-manager/pull/1360) | Codex | Repair unrelated co-review fixture defect #1359 | Merged and #1359 closed |
| [#1361](https://github.com/kburson/ai-task-manager/pull/1361) | Codex | Correctness and fail-closed hardening of #1356 | Merged; #1356 verified and closed |

The final issue reports approximately seven engaged hours: its review delta records 7h03m50s, while its outcome record reports 6.85h. That small projection discrepancy should be treated as a measurement caveat, not a model-performance signal.

## Timeline

| Time | Event |
|---|---|
| 1:27 PM | Grok picks up #1356 |
| 1:28-1:36 PM | Refinement and planning |
| 1:50 PM | Core implementation commit and PR #1358 opened |
| 4:16 PM | PR #1358 merged |
| 4:39 PM | First governed Test attempt fails from ambient session leakage |
| 5:40 PM | Second attempt: fast lanes pass; slow co-review fixture fails |
| 6:00 PM | Third attempt repeats the same slow failure |
| 6:18 PM | Fourth attempt repeats the same slow failure |
| 6:27 PM | #1356 blocked by newly filed #1359 |
| 7:49 PM | Codex merges #1360 repairing #1359 |
| 7:51 PM | #1359 closes; Codex resumes #1356 |
| 8:41 PM | Independent review demotes #1356 after finding four correctness gaps |
| 9:04 PM | Codex opens hardening PR #1361 |
| 9:33 PM | PR #1361 merges |
| 9:53 PM | Exact-head sandbox verification passes |
| 9:58 PM | #1356 closes Done |

## What Grok did well

Grok's initial diagnosis and architectural direction were good.

It correctly identified that:

- Review should reuse an exact-SHA Test receipt.
- Review must never silently rerun standard suites.
- Missing, stale, or red receipts should fail closed and direct the task back through Test.
- Runtime behavior and the agent-facing workflow documentation needed to change together.

It produced a meaningful implementation: PR #1358 changed 14 files with 599 additions and 22 deletions. The focused #1356 tests remained green throughout the later closure failures.

Grok also preserved governance integrity. It refused to fabricate a receipt, skip Test, or force closure. Its final handoff accurately reported that the board could not legally advance without a valid Test receipt. Those are important positives. Grok was not incapable of understanding or implementing the story.

## Where Grok fell short

### 1. The plan covered the happy path, not the full trust boundary

The plan called for receipt matching and Review refusal, but its verification strategy was limited to unit and focused tests. It did not adequately cover:

- Canonical structural validation of the receipt.
- Unknown or unavailable lifecycle state.
- Review and Done fail-closed behavior for uncovered commands.
- Preservation of original Test provenance.
- Shell-aware parsing of quoted focused commands.
- Public coverage through both `dod-stamp` and `ac-stamp`.
- Package-surface ceilings.
- Pickup-directive token budgets and mirror parity.
- Corpus registration.
- The slow lane.

Its stated risks were only partial receipt coverage and missing recovery wording. The later review findings were outside the plan's risk model.

### 2. The merged implementation contained material correctness defects

Codex's independent review found:

- Invalid receipts could be reused without canonical validation.
- Review and unknown-state paths could fail open and execute verifiers.
- Reused evidence could carry false execution provenance.
- Quoted or shell-structured commands were matched incorrectly.

These were not cosmetic improvements. They affected the integrity of the exact-SHA evidence mechanism and whether restricted commands could execute in forbidden lifecycle states.

PR #1361 consequently changed 13 files with 461 additions and 98 deletions, including 78 additions and 33 deletions in the central reuse helper plus extensive new negative-path tests. The final timing record explicitly says #1356 was demoted because the independent review found "invalid-receipt reuse, Review and unknown-state fail-open execution, false reuse provenance, and quoted-command matching gaps." See the [final #1356 review evidence](https://github.com/kburson/ai-task-manager/issues/1356#issuecomment-5364178532).

### 3. Repository-wide verification was under-scoped

PR #1358 required multiple CI repair commits:

- Package-boundary ceiling and pickup token-budget repairs.
- Corpus registration.
- Restoration of required evidence wording.
- Runtime/template mirror parity.

Two ceiling decisions were explicitly operator-directed, so they should not be attributed solely to Grok. Nevertheless, the need for these repair cycles shows that the original verification matrix did not account for the repository contracts affected by the change.

### 4. Grok made an inaccurate verification claim

Grok reported, "Full suite is on the PR, not this workstation."

But PR #1358 ran only the fast lane; the slow lane was skipped by PR policy. That was an evidence-quality failure: Grok asserted broader verification than the PR actually supplied. See the [PR #1358 checks](https://github.com/kburson/ai-task-manager/pull/1358).

### 5. Recovery behavior was inefficient

Grok ran the governed Test process four times. The first failure differed, but the final three reproduced the same co-review slow-test failure on the same implementation SHA. See [attempt two](https://github.com/kburson/ai-task-manager/issues/1356#issuecomment-5362926131), [attempt three](https://github.com/kburson/ai-task-manager/issues/1356#issuecomment-5363100629), and [attempt four](https://github.com/kburson/ai-task-manager/issues/1356#issuecomment-5363237861).

Afterward, Grok proposed continuing to retry until the test "flakes green" or filing a defect. A repeated, narrowly localized failure should instead have triggered focused reproduction and root-cause isolation.

## What Codex did differently

Codex used a systematic diagnostic sequence:

1. Reproduced the single failing test directly.
2. Exposed the hidden subprocess error.
3. Traced it to provider-session authority introduced by an earlier change.
4. Distinguished the pre-existing fixture defect from #1356.
5. Filed and planned [#1359](https://github.com/kburson/ai-task-manager/issues/1359).
6. Repaired the fixture boundary without weakening production session authorization.
7. Merged [PR #1360](https://github.com/kburson/ai-task-manager/pull/1360) and closed #1359.
8. Resumed #1356 and performed an independent implementation review.
9. Found and fixed the four substantive #1356 correctness gaps.
10. Ran focused regression sets, the complete local fast lane, the slow lane, and exact-head governed Test verification.
11. Demonstrated that the new receipt-reuse behavior itself worked by reusing the exact-head receipt without rerunning standard commands.
12. Closed #1356.

#1359 took about 1h24m wall time from creation to closure and changed only the two relevant fixture files. Its recorded engaged effort was approximately 1.1-1.3 hours, depending on which AITM projection is used.

This is strong evidence of better fault isolation, scope control, negative-path reasoning, and closure discipline.

## Root causes

The incident had five contributing causes:

1. **Planning undercoverage:** Grok designed the main behavior but did not model the full evidence and lifecycle trust boundary.
2. **Insufficient independent review:** PR #1358 had no recorded GitHub review before merge. The later independent review found issues that focused tests and fast CI missed.
3. **Verification-selection failure:** The plan did not include all affected repository contracts, and Grok incorrectly assumed the PR supplied full-suite coverage.
4. **Weak repeated-failure escalation:** Three equivalent slow failures did not trigger immediate focused diagnosis.
5. **Pre-existing fixture defect:** #1359 was unrelated to the #1356 production implementation and would have blocked any model operating in the same environment. This explains part of Grok's closure failure, but not the defects later found in its implementation.

## Model-performance assessment

| Claim | Verdict | Confidence |
|---|---|---|
| Grok understood the basic problem and found a viable architecture | Supported | High |
| Grok's initial implementation was closure-ready | Refuted | High |
| Codex debugged and recovered more effectively | Strongly supported | High |
| Codex produced a safer final implementation | Strongly supported | High |
| Grok was materially inferior to Codex on this incident | Supported | High |
| Grok is globally "grossly inferior" to Codex | Suggestive, not proven | Low-medium |
| Grok is inferior to Claude | No evidence from this incident | None |

## Recommended operating policy

Based on this incident alone:

- Use Codex as the primary delivery agent for state machines, authorization, evidence provenance, lifecycle enforcement, and repository-wide governed closure.
- Grok may still be useful for diagnosis, solution exploration, and first-pass implementation, but require independent review before merge on high-risk workflow changes.
- After two equivalent failures on the same SHA, prohibit another full retry until the failing test is reproduced in isolation.
- Require plans to enumerate package boundaries, token budgets, mirror parity, corpus registration, fast CI, slow CI, negative states, and provenance when those surfaces are affected.
- Trigger the PR slow lane when changes touch review orchestration, provider sessions, test harnesses, or lifecycle verification.

## Final verdict

The hypothesis is partially supported but overstated.

The evidence supports saying:

> On #1356, Grok was materially less reliable and substantially less effective than Codex at producing a correct, fully verified, governed delivery.

The evidence does not yet support saying:

> Grok is generally grossly inferior to both Codex and Claude.

To make that broader claim responsibly, run 5-10 comparable stories with identical starting SHAs, prompts, tools, environments, approval modes, and verification requirements. Score first-pass correctness, review findings, operator interventions, CI cycles, recovery time, engaged time, and final defect escape rate.
