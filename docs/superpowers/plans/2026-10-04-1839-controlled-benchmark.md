# #1839 Controlled Baseline Execution Amendment

Governing spec: docs/superpowers/specs/2026-10-04-1839-controlled-benchmark-design.md.
Parent reviewed plan: docs/superpowers/plans/2026-09-26-1818-graphql-usage-measurement-spike.md, Task 5. This is the explicitly approved disposable-workload amendment; original Tasks 1-4 are complete and retained.

## Task 1: Qualify controlled baseline evidence offline

Write failing completion-gate tests in scripts/tests/integration/task-tracker/graphql-usage-baseline.test.mjs. Add a pure qualification helper under scripts/task-tracker/lib/graphql-usage and an offline CLI accepting report/run-manifest paths. Validate canonical timestamps, exact root/participants, predeclaration, enrollment, overlapping 60-minute collectors, completed creation-to-planning workflow evidence, observed traffic from both worktrees, existing comparison sufficiency and scoped exclusions. Return findings and per-completed-workflow volume/known-point normalization. Test fail-closed malformed evidence and all Task 5 gate cases. Run baseline and report suites, then commit with [#1839].

## Task 2: Run disposable live measurement

Prepare the operator-supplied empty clone with a local initial commit and ignored runtime/config data. Create two linked worktrees inside the scratch clone (the native host tool cannot target a different repository). Configure a disposable GitHub Project with the native AITM eight-state schema and required fields, isolated from the production board. Target all scratch issue creation and lifecycle updates explicitly at the supplied scratch repo. Use current implementation scripts without copying changes into the scratch repository.

Perform the authorized short query/mutation smoke with accounted cleanup. Enroll both launcher sessions, capture a participant manifest and operation identities/inventory, and persist a predeclared comparison/workload before beginning the interval. Launch both collectors over the same at least 60-minute interval; run matched scripted native creation-to-planning workflows in each worktree and record actual activity and command outcomes. Preserve raw local observations. Do not fabricate elapsed time or coverage.

## Task 3: Publish evidence and #1817 handoff

After the real overlap completes, close writers, generate offline JSON/Markdown reports and qualification, retain sanitized evidence and a summary with raw totals, sample sizes, denominators, normalized values, version/config identity, graphs, unknowns, duration, exclusions and confounders. Record no supported savings claim before #1817 implementation. Write a reusable parameterized runbook and parent acceptance reconciliation reflecting the explicit amendment. Saved evidence and offline tests must remain usable after remote/local scratch deletion. Commit with [#1839].

## Task 4: Verify and review

Run baseline, collection, storage, report and both action-capture suites, destination lint and format. Verify full exact-commit cloud CI inventory through the native strict receipts provider. Perform an author whole-change review inline, disclosing that it is not an independent review. Resolve consequential findings with regression tests. Use native per-AC/DoD evidence and the lifecycle chain to the authorized boundary. Retain scratch resources for the human's subsequent deletion request.

## Review focus

False sufficiency from idle collectors, missing activity/enrollment, unknown candidate attribution, post-run population changes, clock manipulation, unrelated roots, partial storage, mismatched intervals, assumed point costs, mixed HTTP/opaque denominators, and unsafe repository/board targeting. No permanent scratch target, credential material, synthetic organic-usage claim, or test issue on the production board.
