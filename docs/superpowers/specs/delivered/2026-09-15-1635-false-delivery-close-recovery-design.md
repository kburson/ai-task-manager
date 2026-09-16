# False-Delivery Close Recovery Design

## Context

Audit #1633 found that #1624 and its children #1625-#1630 reached Done without their accepted implementation reaching `trunk`. The systemic root cause is fixed by #1632, which now requires root-epic trunk lineage before Done. Recovery #1635 must land the preserved #1624 history and repair #1624's terminal authority without rewriting either Git history or historical issue evidence.

Issue #1624 has a completed `aitm.delivered-close/v1` transaction and an `aitm.no-commit-delivery/v1` record at historical accepted SHA `2158a289a63b27b9b4d08b8701a16f0b9d3e805d`. Those records truthfully describe what AITM authorized under the old policy, but they do not prove trunk delivery. The preserved `feature/epic/1624` branch and accepted commit remain immutable.

GitHub's protected `trunk` requires a pull-request head that incorporates the current base. Therefore the delivery source cannot remain the historical accepted SHA: the recovery must create one merge-only integration head whose first parent is that SHA and whose second parent is the current `origin/trunk`. This preserves all accepted history without rebasing or amending it while satisfying the protected-base gate.

## Problem

The existing close recovery modes do not cover a completed terminal transaction whose delivery premise was later proven false:

- `--restart-stale-transaction` accepts only a pre-terminal prefix and a null terminal disposition.
- `--restart-reopened-transaction` requires a true historical PR/intent/receipt bundle and a different newly accepted SHA.
- unauthorized-close convergence applies only to an issue closed outside the sanctioned AITM close path.

Broadening any of those modes would conflate materially different histories and weaken predicates that are deliberately fail-closed.

## Decision

Add a distinct human-only `close --restart-false-delivery-transaction` mode. It repairs one exact historical shape while leaving all existing close modes unchanged.

The command takes explicit `--audit-issue <N>` and `--recovery-issue <N>` arguments. The first use for #1624 is:

```bash
npx aitm close 1624 --restart-false-delivery-transaction \
  --audit-issue 1633 --recovery-issue 1635
```

The new mode runs only after the issue has been deliberately reopened, restored to Review through the existing force-recovery board boundary, and bound in its recorded worktree. Reopening and restoration are operator-visible recovery preparation, not inferred terminal authority.

## Authorization predicates

Before any recovery comment or issue-body mutation, the mode must prove all of the following:

1. The repository and issue number are valid and the explicit audit and recovery issue numbers are distinct positive integers.
2. The issue body contains exactly one valid completed eight-step `aitm.delivered-close/v1` transaction.
3. The completed historical transaction and historical no-commit record agree on the historical accepted SHA.
4. The issue is OPEN with state reason REOPENED, its board state is Review, its terminal disposition remains Delivered, its recorded worktree is clean, and the current session owns a post-close binding in that worktree.
5. Exactly one valid historical `aitm.no-commit-delivery/v1` record exists for the same repository, issue, accepted SHA, issue kind, and deliverable URL.
6. The current delivery bundle contains one merged pull request at the current delivery head and one correlated `aitm.delivery-intent/v1` plus `aitm.delivery-receipt/v1`. The close gate's independently verified receipt output, exact-SHA Test evidence, and exact-SHA Review evidence must all agree on that delivery head.
7. If the current delivery head differs from the historical accepted SHA, it must be an exact two-parent merge commit: the historical accepted SHA is parent one, the incorporated trunk base is parent two, and that second parent remains reachable from the verified trunk ref. Any rebase, squash, octopus merge, reversed parents, or unrelated head refuses.
8. Audit #1633 is closed with Delivered disposition and contains a current owned audit deliverable whose machine-readable findings classify the target issue as false-Done at the historical accepted SHA.
9. Recovery #1635 is open, assigned to the configured owner, carries the exact `aitm-delivery-audit-recovery audit="1633" issue="1624"` marker, and is not itself Done.

Any absent, malformed, duplicated, stale, cross-issue, cross-repository, or contradictory evidence refuses before mutation.

## Durable correction record

Add `scripts/task-tracker/lib/false-delivery-close-recovery.mjs`. Its pre-first-use protected-base amendment owns closed schema `aitm.false-delivery-close-recovery/v2`, canonical rendering/parsing, authorization, deterministic recovery identity, replacement-transaction construction, progress classification, and exact body replacement. No v1 recovery record was ever written, so accepting the obsolete shape would add ambiguity without preserving live evidence.

The immutable record includes:

- repository and target issue number;
- audit and recovery issue numbers;
- actor and canonical timestamp;
- reason `historical-no-commit-false-delivery`;
- old transaction identity, review authority, historical accepted SHA, and complete step sequence;
- obsolete no-commit record identity and deliverable URL;
- current pull-request number, intent identity, merge commit, and delivery-head SHA;
- replacement transaction identity.

Its identity is a fingerprint of the authorization intent. The comment is written and read back before the active body marker is replaced. Retries reuse the durable replacement transaction identity and recognize any valid completed-step prefix of that replacement.

The old transaction and no-commit comment remain immutable. The correction record explicitly supersedes their terminal effect; it does not claim they never existed.

## Close integration

`scripts/task-tracker/verbs/close.mjs` will parse the new flag group, reject incompatible flags, source all predicates from live issue, project, binding, delivery, audit, and recovery records, and call the new module before ordinary close convergence.

On authorization it replaces the active completed transaction with a zero-step transaction at the delivered integration SHA. The existing eight-step close saga then runs unchanged. Outcome supersession and terminal binding release will accept the new durable correction record only when it names the active replacement transaction, mirroring the existing reopened-recovery authorization boundary.

Ordinary close, stale restart, reopened restart, unauthorized-close convergence, no-commit delivery, and PR delivery remain behaviorally unchanged.

## Recovery execution

The operational sequence is:

1. Implement, test, review, and deliver #1635's recovery capability to trunk.
2. Merge current `origin/trunk` into `feature/epic/1624` with `--no-ff`, preserving `2158a289a63b27b9b4d08b8701a16f0b9d3e805d` as first parent and the trunk tip as second parent; do not rebase, amend, or drop commits.
3. Push the integration head and update the governed PR to `trunk`.
4. Verify hosted checks and merge the PR through AITM's provider action.
5. Reopen #1624 and restore its board/body cursor to Review through the sanctioned recovery boundary; bind the preserved worktree without moving its branch.
6. Refresh exact-SHA Test and Review evidence at the integration head, then run `deliver` to supersede the stale intent and record the real PR receipt.
7. Run the new close recovery mode and verify the replacement transaction completes.
8. Rerun audit #1633's live verifier and require #1624 and #1625-#1630 to classify as delivered on current trunk before #1635 closes.

## Testing

Unit tests will cover record schema validation, deterministic identity, exact-key parsing, immutable comment correlation, same-SHA compatibility, exact two-parent integration topology, old-transaction completeness, no-commit correlation, audit/recovery authority, live-state predicates, durable-write-before-body ordering, retry reuse, and stale-body refusal.

Verb tests will inject every evidence boundary and prove that no literal booleans or caller assertions satisfy delivery. They will cover incompatible flags, current delivery mismatch, missing audit/recovery evidence, mutation readback, interrupted close prefixes, estimation outcome correction, terminal binding release, and idempotent completed retry.

Help, command-surface, close rules, and workflow documentation will name the human-only scope and recovery command. Focused tests run first, followed by `npm test`, `npm run test:slow`, `npm run lint`, and `npm run format:check`.

## Non-goals

- Retrofitting delivery receipts for any issue other than the explicitly audited target.
- Rewriting, rebasing, amending, or deleting the #1624 branch or its historical records.
- Treating no-commit root-epic delivery as valid after #1632.
- Broadening the existing stale, reopened, or unauthorized-close recovery modes.
- Creating another defect issue in this recovery chain.

## Stop condition

If implementation requires weakening a current delivery predicate, accepting uncorrelated evidence, repairing additional issues, or changing history beyond #1624's audited false-Done shape, #1635 stops and returns to planning.
