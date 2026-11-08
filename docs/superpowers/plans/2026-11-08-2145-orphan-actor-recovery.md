# #2145 historical actor recovery amendment

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. This is one bounded amendment to Task 3 of the existing #2145 plan, not a new story.

**Goal:** Resolve the actual native Review objection for the original November 3 actor while retaining every historical row and Unknown accounting.

**Architecture:** Add one immutable allowlisted profile to the existing actor-evidence recovery command. Reuse its dry-run, exact source/comment binding, original evidence archive, current-operator authentication, candidate validation, fresh reread and verified write. Recording time acknowledges an unavailable endpoint; it does not claim the actor stopped at that time.

**Tech Stack:** Existing Node.js ESM and node:test; no dependency or schema change.

**Spec:** docs/superpowers/specs/2026-11-08-2145-bounded-completion-design.md, preservation and native completion constraints; this document supplies the narrow recovery decision after the observed Review refusal.

## Global constraints and budget

The owner authorizes all necessary recovery and closure, forbids new stories and work above Medium, and requires reviewed replanning before an estimate overrun. Retain Medium/six hours counted from 02:59Z; the current time is approximately 05:08Z. Allocate at most one remaining hour for this amendment and qualification, within that unchanged budget. Review any further replan before 08:59Z. No new general repair framework, waiver, invented time, actor substitution, original-owner file edits or #2169 source changes.

## Evidence and bounded choice

CI42448091100 and native Test passed at 0927fe840018650a6a0f4891a8d117c9619c97cb. Review had one objection: incomplete actor engagement v1:68e116fec85fd2f53872162c7ebac004f3d5b9195bb3ef056617cef6e90848a1. The original actor has only its genuine start row, at November 3 14:39:32Z. Retained original state has no endpoint. Its word markers are 32 and 2602. Original-owner files must remain byte-identical to the already committed preservation manifest.

The canonical comment is IC_kwDOSU6LgM8AAAABicpVmw (numeric6606706075), repository kburson/ai-task-manager, issue2145. The observed prefix through the original opener is 685 bytes, SHA25646b157160e90c26499e3f4f371aefcb7c5821a8e9a3407be951f3d1a4d4bcf6f. The preserved current source is docs/reviews/2145/timing-recovery/before.md. Later canonical rows may append; any change to the pinned original prefix or any additional conflicting original-actor row refuses.

Existing recovery profiles for AIVC63 and AITM2055 remain unchanged. New profile ID: aitm-2145-2026-11-03. It selects the same orphan-recovery algorithm as AITM2055 with fixed repository, issue, comment, prefix, actor and word-marker data. Caller-supplied profile data is never accepted.

## Review focus

Review the truthful Unknown semantics and whether an existing route already handles this exact orphan without touching retained owner state. Check cross-issue selection, prefix/append drift, duplicate or altered recovery, recording-time ordering, original byte preservation, current operator identity, and unchanged legacy profile behavior.

## Task 1: Qualify and apply the exact profile

**Files:** scripts/task-tracker/lib/heal-actor-evidence-recovery.mjs; scripts/task-tracker/heal-timing-log.mjs (existing fixed CLI profile allowlist); scripts/tests/unit/task-tracker/lib/heal-actor-evidence-recovery.test.mjs; scripts/tests/unit/task-tracker/lib/heal-2145-actor-evidence.test.mjs; scripts/tests/fixtures/2026/aitm-2145-timing.json; scripts/tests/integration/task-tracker/heal-actor-evidence-recovery.test.mjs; bounded evidence/review documents in docs/reviews/2145/timing-recovery. No other production file unless a concrete failing compatibility audit requires its existing generated inventory update.

**Interfaces:** planActorEvidenceRecovery(body, {profile,repo,issueNumber,commentId,now}) and recoverActorEvidence retain their signatures. Refactor only fixed profile data needed to reuse the existing orphan implementation. The CLI remains heal-timing-log --actor-evidence-recovery with its existing exact dry-run/apply contract. Add the fixed profile to its existing allowlist and test main() through the native issue lock and dry-run path, as required by independent amendment review.

- [ ] Add a test using the retained prefix and valid later rows; assert the current unsupported-profile refusal (RED).
- [ ] Add the fixed profile and data-driven selection of the existing orphan algorithm. Append exactly one session-end-recovery row at recording time, Active/Idle Unknown, zero delta words and original markers32/2602. Preserve every input byte and refuse duplicate/conflicting actor records, identity/prefix drift and invalid time. Existing profiles must retain exact output.
- [ ] Run unit and integration recovery tests. Exercise the current-operator dry-run/apply pipeline with fresh-source drift, exact comment identity and readback checks. Recheck all37 protected artifacts with the existing proof verifier. Expected: all pass without updating any protected file.
- [ ] Obtain independent review of the amendment and exact implementation delta. Commit [#2145], qualify the changed package, renew complete exact-head CI/native Test, then invoke the existing repair driver in dry-run and apply modes using the observed source SHA/comment ID. Retain before/candidate/manifest artifacts.
- [ ] Rerun ordinary Review; require its real success, Full-Auto approval, governed delivery and Close. Unknown totals must remain Unknown. No successful-source-review claim substitutes for these outcomes.

Self-review: two existing production files, existing algorithm, one issue/profile and explicit failure predicates. No scope or estimate inflation. The new profile is recovery evidence, not authorization to waive the Review validator.
