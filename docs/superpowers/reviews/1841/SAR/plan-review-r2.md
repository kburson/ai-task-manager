---
model: gpt-6-astra
effort: high
filepath: docs/superpowers/plans/2026-09-29-1841-worktree-hook-boundary.md
commit_sha: 28ce5defe61490562319e6c277d3c90bbc81a8a1
uncommitted_changes: false
reviewed_file_sha256: 90df1f4267fe89836b2b7816ac30fdbef46761cc587ab444ec3f66164a890471
turn_ordinal: SAR r2
turn_description: Independent implementation plan Single Agent Review round 2
finding_count: 0
---

# #1841 implementation plan: SAR round 2

## Scope and result

**No remaining substantive findings.** The reviewer reread the complete committed plan, the [round-one record](plan-review-r1.md), the revision diff, and the accepted specification's authority, file-boundary, publication, review-ownership, migration, and acceptance requirements. The existing governed CLI and automatic commit-publication paths were rechecked to verify that the added work addresses the actual gaps rather than only changing the summary prose.

All three round-one findings are resolved at the plan level. No new correctness, sequencing, test-coverage, or specification-adherence issue requiring another plan revision was identified. This is a plan review result, not evidence that the planned runtime behavior has been implemented or verified.

## Round-one dispositions

### F1 — Resolved: One authoritative context through governed mutation

Task 1 now names `project-dir.mjs` and `runtime.mjs` in addition to the hook-side resolver. Its interface requires exact session and physical invoking-root resolution before runtime context construction and passes the validated session/root/target-issue tuple through project selection, binding enforcement, and the eventual mutation. It explicitly excludes diagnostic fallback from that path, treats environment overrides as candidates requiring validation, and separates initial binding from subsequent mutations requiring a record.

The revised tests cover present session identity with missing or wrong-issue records, both project-dir override forms, and concurrent sessions. They assert the mutation directory and side effects, while preserving local work, diagnostics, initial binding, and the audited foreign-target exception. These additions address the existing `resolveProjectDir` override/fallback behavior and the early `buildContext` directory selection identified in F1.

### F2 — Resolved: Automatic publication is within the evidence boundary

Task 4 now includes `commit-trail-handler.mjs` and its tests. The interface requires validation before any remote trail create/update, explicitly moves `commit-trace` validation before `postCommitTrail`, and subjects retained automatic publication to the exact session, effective checkout, target issue, owner, and attribution checks. It also permits disabling automatic remote publication while retaining local subject lint, which removes the same unchecked publication path.

The test requirements cover both explicit and retained automatic publication, including wrong or unavailable owner, wrong issue, tool workdir, direct `git -C`, zero remote writes for refused claims, a single valid publication, and continued success of the local commit. Review preflight and close share the evidence validator. This addresses the current PostToolUse bypass and the current explicit `commit-trace` ordering without reintroducing a PreToolUse ownership lookup.

### F3 — Resolved: Candidate validation precedes activation and retirement

Tasks 6 and 7 now distinguish disposable candidate installation from activation in this worktree. Task 6 keeps active registrations intact and exercises candidate fresh-install, update, repair, consumer-install, and doctor behavior in disposable checkouts.

Task 7 places the real-payload, linked-worktree, installer-parity, fast, slow, lint, and format gate before activation or module removal. It requires the accepted-spec formatting disposition and Grok payload evidence before that gate. Only then does it activate the generated registrations and retire unreachable modules. A separate delivered-state gate repeats parity/load, linked-worktree regressions, and the full repository gates after final removal. The sequence paragraph and AC13 table now agree with those steps and the accepted design's migration order.

## Remaining implementation gates

The following remain explicit execution requirements already present in the plan, not new findings:

- Real provider payloads and actual host permission observations must supply the parser and sandbox evidence; simulated success cannot establish host confinement.
- Missing Grok evidence blocks the provider-wide switch and old-module retirement.
- The installed `ai-peer-review` package must demonstrate artifact-only ownership, unrelated/scratch write allowance, and post-review release before AC12 can be accepted. An unresolved owning-package dependency keeps that criterion open.
- The accepted specification's formatting disposition must preserve review provenance, and generated review-output exclusions must not hide the specification or plan from checking.
- The final implementation must update the issue's old verification-command paths through the governed workflow and run the resulting commands before acceptance.

## Provenance and limits

- Reviewed commit: `28ce5defe61490562319e6c277d3c90bbc81a8a1`.
- The working plan and the committed `HEAD` plan both have SHA-256 `90df1f4267fe89836b2b7816ac30fdbef46761cc587ab444ec3f66164a890471`.
- The plan and accepted specification had no staged or unstaged differences from `HEAD`. The front-matter `uncommitted_changes: false` refers to the reviewed artifact; unrelated setup and hook changes remain in the checkout.
- The only write performed for this review is this round-two collateral file. The plan, specification, implementation, unrelated hook/dependency setup, and backup files were left unchanged. No commit, remote mutation, runtime test suite, or provider sandbox exercise was performed.

## Terminal disposition

The plan SAR is complete with zero findings for the exact artifact and commit recorded above. This record does not itself approve a lifecycle transition, satisfy implementation acceptance criteria, establish the dependent package's behavior, or replace any separately requested peer-review stage.
