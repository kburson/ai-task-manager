# #1839 Disposable Controlled GraphQL Benchmark

## Intent and approved scope amendment

The human discussion on 2026-10-04 explicitly authorized a disposable scratch GitHub repository and local clone with two linked worktrees for #1839. The purpose is to test the measurement scripts and produce a repeatable creation-to-planning workload for #1817, without creating test issues or test project items in ai-task-manager. This amendment supersedes only the independently scheduled real-workflow restriction in Task 5 of the #1818 specification and plan. Tasks 1-4 remain unchanged.

The benchmark repository and clone paths are explicit operator inputs. No shipped script, test, config default, or future verification depends on a particular scratch repository. Fixture-based automated tests remain offline. Disposable live resources can be deleted after sanitized evidence has been saved; deletion cannot invalidate verification of that saved evidence. Deletion of the entire remote repo is deferred to the human's requested cleanup boundary.

## Measurement and delivery contract

Two independently enrolled local linked worktrees share one Git common usage root. Their measurement launcher processes remain alive for a declared overlapping interval of at least 60 minutes, with actual observed AITM traffic from both. Manifest evidence records successful enrollment, start/end times and outcomes, including excluded denials. Collector uptime is not continuous request load.

Before the interval, declare participants, candidate operation groups, comparable observation kinds, signals, inventory sites, workload recipe, repetition count, and comparison configuration. Preserve the declaration hash and pre-run evidence. Do not remove inconvenient candidates after collection. Run a controlled query and mutation; compare query cost with the same-response GitHub value, record unavailable mutation cost, verify redaction, and include cleanup traffic.

Exercise sanctioned AITM issue creation and native refinement/planning operations against a disposable scratch board. No direct gh issue create or arbitrary move-state calls. No writes to the production AITM board for disposable issues. Sequential scripted execution can drive two local worktree participants; no additional agents are required.

Qualify the resulting report conservatively. Short overlap, absent workflow, a single participant, no participant traffic, incomplete enrollment, inadequate candidate coverage, storage loss, and unsupported evidence remain preliminary. Adequate predeclared volume with unavailable point costs is a valid controlled-volume benchmark; it is not a total-point ranking or point-savings finding. Excluded participants must be disclosed and never permit fleet generalization.

Retain the runbook, sanitized participant/run evidence, report, baseline gate tests, parent reconciliation and #1817 handoff in the implementation repository. Raw observations remain local. No issue bodies, GraphQL payload values, tokens or private response content enter the checked-in report. Snapshot extent hashes and declaration hashes permit audit without a continuing connection to the scratch repo.

## Baseline qualification and future comparison

A pure offline qualifier consumes the existing report plus a validated run manifest. It checks the declared interval, actual collector overlap, exact participant identities/root, recorded successful creation-to-planning workflows and observed activity, and existing report comparison sufficiency. It returns explicit findings and a preliminary or decision-grade controlled status; it does not contact GitHub or invent coverage.

The handoff includes raw totals, sample sizes, per-completed-workflow normalization, workload/stage mix, collector/config identity and remaining confounders. A later #1817 run must match those factors. No optimization has occurred in this story, so savings are unsupported. The #1818 parent still refuses completion on preliminary evidence; a sufficient controlled benchmark fulfills its evidence deliverable under this explicit human scope amendment, without claiming observed organic fleet usage.

## Verification

Meaningful completion-gate tests cover short intervals/overlap, absent workflow, single worktree, no traffic, root/session mismatch, late/failed enrollment, inadequate denials, scoped excluded denials, sufficient volume with insufficient points, and accepted controlled evidence. Run focused collection, storage, report, baseline and both action-capture suites. Full unit/integration/slow verification uses exact-commit GitHub CI receipts; do not run full suites locally.
