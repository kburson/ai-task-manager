# #1765 Correct Lifecycle Capture Implementation Plan

> **For agentic workers:** Use the existing #1765 child worktree. Implement each task with a failing focused test before production code, verify the result, and commit with `[#1765]` attribution.

**Goal:** Produce an ordered, provenance-bound actual-CLI capture whose bind-to-close traffic total includes every required query and external boundary exactly once.

**Architecture:** A new runner owns one mutable local authority snapshot and invokes the public `aitm explain` CLI and fake external reads in a fixed sequence. The transcript records fixture transitions separately from command traffic so the test can prove lifecycle continuity without claiming that read-only queries performed mutations. A new JSON artifact is generated after the runner commit; the original #1675 runner and artifact remain byte-identical.

**Tech Stack:** Node.js 26, `node:test`, Git, AITM public CLI, deterministic local GitHub double.

**Spec:** `docs/superpowers/specs/2026-09-15-1558-ask-the-script-guidance-design.md` §§15, 18, 20; #1765 Scope and Deep-Dive Analysis.

## Story Intent

- **Beneficiary:** delivery operator assessing the guidance migration
- **Capability:** obtain one provenance-bound capture of complete lifecycle traffic
- **Need:** the historical selection of isolated action queries undercounts the actual lifecycle
- **Value or failure prevented:** feasibility decisions do not rely on a falsely low traffic total

## Global Constraints

- Keep fixed working ceilings at 4,000 static, 240 clean response, 400 blocked response, and 5,600 full lifecycle proxy tokens. Report a failure honestly.
- Preserve `scripts/tests/fixtures/1558/actual-explain-traffic.json` and `scripts/maintenance/capture-guidance-explain.mjs` as #1675 evidence.
- Read-only explain calls do not perform lifecycle transitions. The fixture driver supplies explicit state/evidence transitions and labels them as simulated authority input.
- Never execute a blocked action to add traffic. Count each agent-visible command request, stdout, stderr, and receipt-bearing argument once.
- Current legacy static context and proposed static context are distinct measurements. Do not claim a final adapter cutover or a measured equivalent legacy lifecycle unless actually captured.

## Files and Responsibilities

- Create `scripts/maintenance/capture-guidance-lifecycle.mjs`: fixture state driver, public CLI subprocess capture, event ledger, traffic measurement, identity envelope.
- Create `scripts/tests/integration/task-tracker/lib/guidance-capture-lifecycle.test.mjs`: negative continuity and accounting tests, plus the new artifact's public-CLI/provenance checks.
- Modify `scripts/tests/integration/task-tracker/lib/guidance-actual-traffic.test.mjs`: retain #1675 checks; import the focused corrected-capture assertions or point VC1 to both files if needed.
- Create `scripts/tests/fixtures/1558/actual-explain-traffic-corrected.json`: new committed capture from the runner's exact source commit.

## Task 1: Ordered Fixture and Transcript

1. Add a failing test that rejects the #1675 `lifecycleScenarioNames` subset as a coherent lifecycle: its action queries do not share one evolving authority state or include required boundaries.
2. Define fixture snapshots with `revision`, board state, issue body, evidence identifiers, external approval/merge state, and SHA-256 of the serialized snapshot. All fake GitHub reads load the current snapshot file; remove any per-query board-state environment selector from the new runner.
3. Add a transition function that records `{fromRevision,toRevision,fromState,toState,evidenceAdded,fixtureSha256}` and refuses noncontiguous or unrecognized state changes. The allowed sequence is Plan → Develop → Test → Review → Done, with pre-transition blocked/remediation queries at the appropriate state.
4. Add a `runQuery` function that invokes `node bin/aitm.mjs explain 2100 --action <id> --json` (and explicit `--diagnostic` only for the required investigation), captures exact argv/stdin/stdout/stderr/exit status and typed envelope, and records the fixture revision read by the command.
5. Pin a schedule covering first bind, matching receipt, changed guidance, post-compaction reload, freeze refusal, remediation/retry, diagnostic request, resume, promote, test, review, deliver, and close. Place external approval/merge reads before close and record their command traffic. A blocked query is never followed by a fixture transition presented as its execution.
6. Run the focused test red, implement the smallest runner, then run it green. Commit the runner and tests before generating the artifact so `sourceCommit` names committed source bytes.

## Task 2: Complete Traffic and Provenance

1. Add a failing test that deletes one required query or boundary from an in-memory transcript and expects validation to refuse it. Add a second case that counts a receipt twice and expects accounting validation to refuse the total.
2. For every public command event, compute input as the exact joined argv plus newline and recorded stdin; output as complete stdout and stderr. Partition events into query, explicit diagnostic, and external-boundary categories. Transition records have zero agent-visible traffic. Concatenate all command event input/output once and compute characters, bytes, and `ceil(characters/4)` proxy tokens; category sums must reproduce the grand total without overlap.
3. Record source commit, runner and implementation-file digests, scenario manifest digest, initial fixture/body/config/GitHub-double digests, and transcript digest. The artifact must state that the external authority is a deterministic double and that state transitions are fixture supplied.
4. Report current full static baseline from `context-comparison.json`, proposed static text from `measureProposedStatic()`, dynamic command traffic, and the combined proposed total in separate fields. Evaluate the unchanged budgets as booleans without editing thresholds or asserting they must pass.
5. Generate `actual-explain-traffic-corrected.json` from the committed runner. Verify its source/digest read-back, the old artifact's unchanged Git blob, and a repeat run's stable semantic transcript (allowing only declared capture timestamp differences). Commit the new artifact.

## Task 3: Governed Verification and Delivery

1. Run `node --test scripts/tests/integration/task-tracker/lib/guidance-actual-traffic.test.mjs scripts/tests/integration/task-tracker/lib/guidance-capture-lifecycle.test.mjs` and inspect every assertion.
2. Run `npm run lint`, `npm run format:check`, `npm test`, and `npm run test:slow` through AITM's exact-head Test workflow. Check `git diff --check`, issue/branch attribution, and the new artifact's exact source commit.
3. Complete the AITM AC, DoD, commit-trace, Test, and Review gates. Merge back through the owned epic command, publish the epic branch, and close only after the remote attribution and human/full-auto approval gates return ready.
