# Blocker-First Convergence Amendment

## Status and authority

This amendment governs issue #1381 together with the accepted specification
`2026-08-23-1381-governed-delivery-convergence-design.md`. Where the two
documents conflict about hierarchy, #1403 sequencing, the incident-ledger
execution boundary, or terminal ordering, this amendment takes precedence.
All other accepted requirements remain unchanged.

The amendment records a live contradiction discovered before implementation:

- #1403 cannot close as Delivered because PR #1404 was merged outside the
  governed squash path and no valid issue-local intent or receipt exists.
- The original #1381 pre-implementation gate nevertheless required #1403 to
  close before #1381 implemented the reconciliation lane.
- #1381 and #1380 were native siblings under #939. The strict sequential WIP
  gate therefore prevented #1381 from entering Plan while #1380 remained
  active, even though #1380 is downstream of #1388 and the dependency chain
  terminates at #1403.

The user approved the hierarchy correction and blocker-first sequence in
Full-Auto mode. The native #939 -> #1381 sub-issue edge was removed and verified
before #1381 entered Plan. #1381 remains related to #939 as the independent
convergence defect that must complete before the incident chain and parent epic.

## Governing dependency graph

The explicit blocker chain is:

```text
#1381
  -> #1403
  -> #1397
  -> #1395
  -> #1393
  -> #1392
  -> #1390
  -> #1389
  -> #1388
```

After #1388 reaches Done, execution returns to #939. The #939 completion scope
includes #1380, #1382, #1383, and #1384. Existing closed incident issues remain
read-only historical evidence.

The graph is deepest-first and fail-closed. A blocked issue does not advance or
close before its blocker reaches Done and the three dependency carriers agree:
the `BLOCKED` label, Project `Blocked By` field, and `aitm-blocked-by` body
marker.

## Two-phase reconciliation authority

### Phase A: implement and close #1381

Issue #1381 implements the accepted delivery-authority, historical-recovery,
idempotent-close, incident-ledger, Incorporated, verifier, integration, help,
and documentation capabilities. It then completes Test, Review, approval,
governed delivery, and ordinary Delivered close as an independent issue.

Before #1381 closes, it must record the immutable live incident ledger and pass
the read-only verifier in `pre-close` phase over the observations available at
that point. Ledger
approval remains a separate authenticated human action over the exact emitted
ledger ID and digest; Full-Auto authorization does not pre-approve unknown
future bytes.

The ledger records intended outcomes but does not need to execute every
downstream terminal mutation before #1381 closes. This is the deliberate
amendment to the original in-story execution requirement. Closing #1381 removes
the first blocker and permits the approved ledger to govern Phase B.

The verifier has two read-only phases. `pre-close` requires the approved
baseline, exact blocker graph, independent #1381 hierarchy, and matching live
observations; downstream rows without terminal records are reported as
`pending-authorized`. `terminal` requires the approved terminal record and
disposition for every row. `ok: true` in pre-close phase does not claim that
Phase B has executed, and the approved ledger remains authoritative after #1381
closes.

### Phase B: execute the dependency chain

After #1381 reaches Done, reconcile the chain in blocker order:

1. #1403
2. #1397
3. #1395
4. #1393
5. #1392
6. #1390
7. #1389
8. #1388

Each issue is bound in its recorded governed worktree before mutation. A close
must use the truthful ledger outcome, current approval policy, live GitHub and
trunk evidence, and the issue's own immutable accepted SHA.

Issue #1403 is `Incorporated`, not independently Delivered. Its implementation is
retained on trunk through PR #1404 and merge commit
`19c6f54b0354699b988c470a99f122edab3aa2ba`, but its historical merge method and
missing governed intent/receipt prohibit an ordinary delivery receipt. The
Incorporated lane must preserve PR, commit, Test, Review, approval, timing, and
incident evidence without inventing delivery authority.

Other chain outcomes remain evidence-derived. An issue with a valid exact-head
receipt uses ordinary Delivered close. An issue with an authorized pending
intent and merged exact-head PR may use read-only historical receipt recovery.
An issue whose code is retained only through a carrier uses Incorporated when
the approved ledger says so. No numeric range alone authorizes mutation.

### Phase C: finish #939

After #1388 reaches Done, resume #939 and reconcile its remaining open scope,
including #1380, #1382, #1383, and #1384. Apply the same approved-ledger and
issue-local evidence rules. Close all governed children before the epic close
gate, then deliver and close #939 through its sanctioned terminal path.

## Record and approval model

The original separation remains mandatory:

- delivery intents and receipts prove independently governed delivery;
- the incident ledger records reviewed observations and intended outcomes;
- ledger approval binds one exact ledger ID and digest;
- Incorporated records prove a truthful non-delivery disposition;
- close transaction records support partial recovery and read-only retries.

No record type substitutes for another. A stale #1403 human approval marker
that names the later #1381 worktree HEAD is incident evidence only and cannot
authorize #1403. The approved ledger and Incorporated path must preserve that
observable mistake rather than silently rewriting history.

## Failure handling and idempotence

All authorization completes before provider, record, timing, estimation,
lifecycle, board, disposition, issue-close, label, or binding mutation. A
refusal leaves the target open and records no synthetic success. A retry adopts
only byte-identical durable records and executes only missing terminal steps.
A fully converged retry performs no writes.

The implementation must not weaken the sequential WIP gate, remove downstream
blockers opportunistically, create successor defects for in-scope convergence
failures, invoke `gh pr merge`, or manufacture historical intent, receipt,
approval, merge-method, or exact-delivery evidence.

## Verification amendment

In addition to the accepted #1381 verification contract, tests must prove:

- #1381 is treated as independent delivery scope rather than a #939 child;
- the approved ledger remains authoritative after #1381 closes;
- #1403 is authorized only through its approved Incorporated row and live
  carrier evidence;
- the chain cannot advance before its current blocker reaches Done;
- #1382 and #1383 remain issue-keyed despite sharing an accepted SHA;
- #939 refuses final close until #1380, #1382, #1383, and #1384 are terminal;
- every completed close retry is read-only.

The live acceptance trace must capture #1381 delivery and close, every chain
outcome from #1403 through #1388, the final #939 child set including #1384, and
the terminal #939 result.
