# Epic Test-Stage AC Deferral Design

## Problem

#1599 lets a code issue leave Develop with an unchecked acceptance criterion only when the criterion resolves to a command that policy restricts to Test. #1592 demonstrates the same deadlock for a code-bearing epic, but `gateCodeComplete` excludes every epic because `isNoCommitKind` groups `epic` with `audit`, `research`, and `spike`.

The other #1592 refusals are correct. An epic must still record AC reconciliation and a deliverable before Test. This design changes only the acceptance-criterion deferral.

## Decision

Treat default code issues and `epic` as the only kinds eligible for Test-stage AC deferral. Keep `audit`, `research`, and `spike` unchanged.

The gate will continue to resolve stable verification-command citations with `isTestStageDeferredAc`. For an unchecked AC, it will defer only when both conditions hold:

1. the issue is a code issue or its parsed kind is exactly `epic`; and
2. at least one resolved command is Test-restricted.

Deferral is not evidence. It changes no checkbox or marker. The Test resident action remains responsible for executing every cited command and auto-ticking the AC only when the complete fan-in passes at the exact SHA.

## Dependency provenance

#1599 is Done on #1592's parent branch but is not yet on trunk. The #1603 branch will cherry-pick #1599's exact plan and implementation commits before adding the epic extension. This preserves the original `[#1599]` attribution and lets #1603 deliver the prerequisite plus its correction to trunk without importing unrelated #1592 removal work.

When #1603 is delivered, merging current trunk into #1592 will make the policy files content-equivalent. #1592's own commits and worktree remain intact; no rebase, reset, or force-push is needed.

## Invariants

- Ordinary unchecked ACs continue to block every issue kind.
- Dangling or malformed citations continue to block.
- Audit, research, and spike issues receive no new deferral.
- Epic AC reconciliation and deliverable evidence remain mandatory.
- Develop produces no proof for the deferred criterion.
- Test requires all cited commands to pass before it ticks the criterion.
- No new defect may be added beneath #1603.

## Alternatives considered

Allowing all no-commit kinds would be simpler syntactically but would broaden policy without a demonstrated requirement. Waiving or manually checking #1592's final criterion would discard exact-SHA proof and is not acceptable. Reopening #1599 would invoke a completed child-close recovery transaction and obscure that the missing behavior is a separately observed epic boundary.

## Verification

Focused tests will cover a reconciled epic with a deliverable marker and a Test-restricted AC, an ordinary unchecked epic AC, audit/research/spike controls, and the existing Test all-command fan-in. The existing code-complete gate suite will independently prove reconciliation and deliverable blockers remain present.
