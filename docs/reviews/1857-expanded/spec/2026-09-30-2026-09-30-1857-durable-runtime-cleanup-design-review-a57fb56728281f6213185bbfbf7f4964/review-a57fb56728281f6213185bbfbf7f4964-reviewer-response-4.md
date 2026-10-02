<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-a57fb56728281f6213185bbfbf7f4964"
role: "reviewer"
turn: 4
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/plans/2026-09-30-1857-durable-runtime-cleanup.md"
artifact_commit: "a6d4790226230dcb6852ab73c6a983dded69cf3c"
artifact_blob: "c6eacb122290e04517b872097b1db7dfe061404c"
artifact_digest: "sha256:492dc9b8a8b3386be480e63dce84f700325f16333add4e138f664f171a2c1b38"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5-5"
  model_display: "claude-opus-5-5"
  session_fingerprint: "sha256:fd23d8eb24ff8e74c4729551cf966b917897fb1bf8a48b6a7ffcc9059e2c5032"
  identity_source: "runtime"
started_at: "2026-09-30T20:47:30.467Z"
submitted_at: "2026-09-30T21:07:30.385Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

This turn reviews the implementation plan `docs/superpowers/plans/2026-09-30-1857-durable-runtime-cleanup.md` at commit `a6d47902`. I checked it against the spec as accepted in phase 1 (final spec commit `0d0d9247`, per the phase-01 manifest).

The plan's overall structure is sound:

- **Task sequence:** artifact policy → runtime storage → migration → file cleanup → Git cleanup → skill/install → verification. Runtime relocation comes before cleanup apply, as the spec requires.
- **Test-first discipline:** RED-then-GREEN steps, exact-path commits, and no real deletion.
- **Integration proof:** it reuses `verifyObservedIntegration` for full-content integration proof.
- **File paths:** nearly all listed files exist (`bin/aitm.mjs`, `bin/aitm-registry.mjs`, `runtime.mjs`, `config.mjs`, `draft-branch.mjs`, `lib/hook-idempotency.mjs`, `lib/action-capture.mjs`, `lib/ready-for-plan-migration-freeze.mjs`, `lib/test-sandbox-reaper.mjs`, `lib/artifact-write-policy.mjs`, `lib/bash-worktree-guard.mjs`).

However, the plan was evidently written against the **turn-0 spec** and does not carry the obligations added during the three spec review rounds. Several of those were the High-severity closures that made the spec acceptable. As written, an implementer following this plan task by task would ship:

- a deadlock-prone migration;
- an env-override bypass;
- a cleanup skill packaging that the spec explicitly replaced;
- a managed-worktree archive step the spec says the CLI cannot perform.

The plan must be brought into agreement with the accepted spec before implementation release.

## Findings

1. **Migration bootstrap/recovery admission is absent from Task 3 (High; R3/R4; spec "Migration bootstrap, quiescence and recovery admission").** Task 3 creates `runtime-migration.mjs` and `verbs/migrate-runtime.mjs`, but none of the following appear anywhere in the plan:
   - The closed-grammar bootstrap dispatcher that admits `migrate-runtime plan|status|apply|resume` before runtime-dependent binding/gate reads. The Bash guard and hook classifier changes this requires are also missing.
   - Fencing and drain of other writers.
   - The migrator-engagement audit ledger and its once-only timing reconciliation at activation.
   - Stale-lock recovery requiring confirmed process death.
   - The documented direct-terminal fallback and the typed `recovery-required` state.
   - The spec's required integration scenario: crash after one root publishes → ordinary hooked commands refuse → registered status/resume from a fresh hooked session succeeds → timing/queue survive → engagement reconciled once.

   Task 3's invariant block even asserts `assertRuntimeReadable` throws `RUNTIME_TRANSACTION_INCOMPLETE`, but never tests that recovery is reachable through the guard in that state. This is the deadlock from turn-1 finding 1.

2. **Project-root environment override validation and direct-reader conversion are absent from Task 2 (High; R4; spec "Root identity…", including lines 38–44 and "Root-reader conversion planning risk").**
   - **Overrides not tested:** Task 2's `assertRuntimeOverrideSafe` covers configured statePath/queuePath/provider overrides only. No step validates `AI_TASK_MANAGER_PROJECT_DIR`, `TASK_TRACKER_PROJECT_DIR` or `CLAUDE_PROJECT_DIR` against the physical Git root, the foreign-worktree contract or artifact-subtree exclusion.
   - **Readers not converted:** The Files list omits the enumerated direct readers: `lib/project-dir.mjs`, `lib/worktree-binding-guard.mjs`, `lib/worktree-binding-lifecycle.mjs`, `word-counter.mjs`, `epic-base-edit-guard.mjs`, `commit-trail-handler.mjs` and `lib/scratch-dir.mjs`.
   - **Missing mechanisms and tests:** There is no central alias table and no lint/characterization test rejecting new direct `*PROJECT_DIR` reads. There is also no forged-activated-store-under-`.scratch` refusal test.
   - **Missing fixture conversion:** The inventory and classification of the roughly 90 test files / 215 references that use the override is missing.
   - **Sandbox handoff not validated:** The Test verb `AI_TASK_MANAGER_PROJECT_DIR: wtPath` handoff validation is also missing.

   This leaves the R4 bypass from turn-1 finding 2 and turn-2 finding 1 open at the plan level.

3. **Cleanup skill packaging in Task 6 contradicts the accepted spec (Medium; R5/R8; spec "Cleanup skill and command").**
   - **Adapters missing:** Task 6 creates only `skill/cleanup/SKILL.md`. It says stubs "under each provider's existing skill installTarget parent point to the shipped cleanup source". The accepted spec requires three provider adapters at `skill/cleanup/adapters/{claude,codex,grok}/SKILL.md` that resolve `../../SKILL.md`.
   - **Install contract missing:** The spec also requires:
     - the namespaced discovery name `aitm-cleanup` at `.claude/skills/aitm-cleanup/`, `.agents/skills/aitm-cleanup/` and `.grok/skills/aitm-cleanup/`;
     - a symlink-mode target of the per-provider adapter directory;
     - atomic collision refusal against unowned directories, user-modified stubs and unrelated symlinks.
   - **Wrong assertion target:** The installer assertion regex `/skill\/cleanup\/SKILL\.md/` would pass on the wrong target. Under the spec, the stub points at the provider adapter.

4. **Managed-worktree retirement in Task 5 contradicts the host-capability rule (Medium; R6; spec "Worktree retirement and branch pruning").**
   - **Wrong action model:** Task 5's interface says `applyWorktreeRetirement` "uses native archive adapter for managed roots". Its required action order includes an in-process `'archive-managed'` step. The accepted spec says the AITM CLI cannot invoke Codex `archive_worktree`. Instead, apply emits a typed native-host handoff (candidate, identity, branch/OID, pre/post observations), the host executes `archive_worktree` using the `identityKey` from `list_artifacts`, and cleanup revalidates the returned receipt before pruning the local branch.
   - **Missing Claude rule:** Claude `.claude/worktrees` roots must be protected with `unsupported-host-archive`.
   - **Missing reason codes and classification:** `native-archive-unavailable`, host classification by provenance plus physical root, and the rule that uncertain classification is protected are also absent.
   - **Missing RED cases:** The plan has no RED cases for the handoff/receipt round trip, for a forged or mismatched receipt, or for the Claude-protected path.

5. **State-path anchoring and corruption refusal are only partly planned (Medium; R2; spec "Root identity…" lines 46–48).**
   - **What Task 2 has:** "rightmost-root anchoring" and "missing/corrupt control".
   - **Anchoring gaps:** No step requires `projectDirForState` to match the exact `/.ai-task-manager/runtime/store/` suffix and verify it against the physical owner. No step removes the `.tmp/aitm` anchor and the `loadState` legacy fallback. There is no regression that a Test sandbox nested under another worktree's runtime resolves its state, sessions, gates and queues locally.
   - **Corruption gaps:** No step replaces `loadState`'s corrupt-JSON-to-`{}` behavior with typed refusal. There is no complete-loss empty-initialization path with reconciliation and no inherited grants.
   - **Missing prohibition:** Task 4 does not state the prohibition on proposing deletion of the runtime root, control record, store root or recovery namespace.

6. **Estimate is stale (Medium; R9 forecast honesty).** Global Constraints line 19 and "Plan Metadata and estimate" state 16–24 h, with runtime at 8–12 h and worktree/branch at 4–6 h. The accepted spec superseded that with an advisory range of 24–36 h:
   - runtime/protection/bootstrap/migration: 14–20 h;
   - file cleanup/skill: 4–6 h;
   - worktree/origin: 6–10 h.

   The accepted spec also records fixture conversion as a material risk to the upper bound of the runtime slice. The plan also says "Earlier scratch ranges are superseded", which now inverts which range is authoritative.

7. **Minor path error (Low).** Task 1's Files list names `scripts/task-tracker/lib/activity-guard.mjs`. The file is at `scripts/task-tracker/activity-guard.mjs`.

## Required changes

1. **Task 3:** Add the bootstrap dispatcher, including the guard/classifier files it touches, plus fencing/drain, the migrator engagement ledger with once-only reconciliation, stale-lock recovery on confirmed process death, the direct-terminal fallback and the `recovery-required` state. Add the spec's crash-then-hooked-resume integration scenario as a RED test and assert it passes.
2. **Task 2** (or a dedicated task before it):
   - Add root-identity validation for all three env aliases, plus future aliases through a central table.
   - Convert the seven enumerated direct readers to the resolver.
   - Add the lint/characterization guard against new direct `*PROJECT_DIR` reads.
   - Add the forged-activated-store and nested-Git-root refusal tests.
   - Validate the Test-verb `wtPath` handoff.
   - Add the inventory and classification step for the roughly 90 env-override test files.
3. **Task 6:** Replace the packaging with the accepted contract:
   - `skill/cleanup/adapters/{claude,codex,grok}/SKILL.md` resolving to `skill/cleanup/SKILL.md`;
   - `aitm-cleanup` discovery paths per provider;
   - per-provider symlink targets and stub contents;
   - collision refusal and owned-uninstall tests across all three providers and both modes.

   Fix the installer assertion so it targets the adapter.
4. **Task 5:** Replace in-process managed archive with the typed host handoff and receipt revalidation. Add the Claude `unsupported-host-archive` and `native-archive-unavailable` protected paths and uncertain-classification protection. Add RED cases for a missing, mismatched or forged receipt. Update the required action order so it includes `emit-host-handoff` and `revalidate-host-receipt` instead of `archive-managed`/`confirm-archive`.
5. **Task 2:** Add explicit steps for exact-suffix owner-verified `projectDirForState`, removal of the `.tmp/aitm` anchor and the `loadState` legacy fallback, the nested-sandbox local-resolution regression, and typed refusal replacing corrupt-JSON-to-`{}`. **Task 4:** Add the runtime-root/control/store/recovery-namespace deletion prohibition as a tested invariant.
6. Update Global Constraints and "Plan Metadata and estimate" to the accepted 24–36 h advisory breakdown and the fixture-conversion risk note.
7. Correct the `activity-guard.mjs` path in Task 1.

## Optional suggestions

1. Add a spec-section → task traceability table, in addition to the R1–R9 → task mapping. Several of these gaps arose because new spec sections were added under existing requirement IDs, so the R-level mapping stayed "covered" while the concrete obligations were not carried into the tasks.
2. Task 2 is now large enough (resolver, env validation, reader conversion, anchoring, corruption, sandbox relocation, guard precedence, installer ignore, fixture conversion) that splitting it into two exact-path commits would make review and bisecting tractable. One split: resolver + root identity + reader conversion, then store relocation + anchoring + guard precedence.

## Decision

revisions-requested
