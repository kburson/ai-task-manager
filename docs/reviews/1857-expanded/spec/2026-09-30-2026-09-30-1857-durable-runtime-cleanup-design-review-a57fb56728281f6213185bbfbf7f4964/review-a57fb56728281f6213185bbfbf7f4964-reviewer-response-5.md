<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-a57fb56728281f6213185bbfbf7f4964"
role: "reviewer"
turn: 5
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/plans/2026-09-30-1857-durable-runtime-cleanup.md"
artifact_commit: "c8f3e057ba050e8d5c465246f7ce06432d5d28c7"
artifact_blob: "93b2c5054076514bc9d59f3acf10375cb359cfd7"
artifact_digest: "sha256:1f2a325b3dd709da4fa5cf3e4de606768d76c1692ccd42550911b4ad3e09fe13"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5-5"
  model_display: "claude-opus-5-5"
  session_fingerprint: "sha256:fd23d8eb24ff8e74c4729551cf966b917897fb1bf8a48b6a7ffcc9059e2c5032"
  identity_source: "runtime"
started_at: "2026-09-30T20:47:30.467Z"
submitted_at: "2026-09-30T21:17:33.230Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

I re-reviewed the revised plan at commit `c8f3e057` against my turn-4 required changes and the accepted spec (final spec commit `0d0d9247`). All seven turn-4 required changes are closed, and both optional suggestions were adopted.

1. **Migration bootstrap/recovery (turn-4 RC1).** Closed.
   - Task 3 now creates `lib/runtime-migration-admission.mjs` with a closed-grammar `classifyRuntimeMigrationInvocation`.
   - It lists the guard/registry files it touches: `bash-guard.mjs`, `bin/aitm-registry.mjs`, `task-tracker.mjs`, `verbs/help-data.mjs` and `lib/command-surface/catalog.mjs`, all verified present.
   - It adds genuine-migrator fencing and drain, and rejects live writers before hashing.
   - It adds the protected engagement ledger with idempotent reconciliation that runs exactly once.
   - It adds lock recovery on confirmed process death, the documented terminal fallback, and `recovery-required`.
   - It adds the mandatory hooked crash-after-first-publication → ordinary-refusal → fresh-session status/resume integration, with assertions for timing publication called exactly once and preserved legacy bytes.
2. **Root identity and direct readers (turn-4 RC2).** Closed.
   - The new Task 2a exports `PROJECT_ROOT_ALIASES` covering all three variables, plus `resolveRuntimeRoot`, which resolves physical Git identity independently of the overrides.
   - It routes the seven enumerated readers plus `paths.mjs` through that resolver.
   - It adds a source characterization test covering direct, injected, destructured and computed reads.
   - It adds a refusal test for a forged store under `.scratch`, asserting the forged control file is never opened.
   - It adds a classified fixture inventory. The `wtPath` sandbox handoff is validated in Task 2b.
3. **Skill packaging (turn-4 RC3).** Closed.
   - Task 6 creates `skill/cleanup/adapters/{claude,codex,grok}/SKILL.md` with the `aitm-cleanup` discovery paths and per-provider symlink/stub targets.
   - It adds atomic collision refusal and owned-uninstall tests for every provider in both modes.
   - The installer assertion now targets `skill/cleanup/adapters/${provider}/SKILL.md`.
4. **Managed-worktree handoff (turn-4 RC4).** Closed.
   - Task 5 returns a typed handoff for Codex roots.
   - `reconcileHostArchive` validates the actual receipt and never trusts a caller boolean.
   - Claude roots are handled via `unsupported-host-archive`, missing capability via `native-archive-unavailable`, and uncertain classification is protected.
   - It adds RED cases for missing, mismatched and forged receipts.
   - The required action order now uses `emit-host-handoff` and `revalidate-host-receipt`.
5. **Anchoring, corruption and deletion prohibition (turn-4 RC5).** Closed.
   - Task 2b adds the owner-verified exact-suffix `projectDirForState`, removes the `.tmp/aitm` anchor and the legacy fallback, and replaces the corrupt-to-`{}` behavior with typed `RUNTIME_STATE_CORRUPT`.
   - It asserts that nested-sandbox state resolves locally.
   - Task 4 hard-refuses runtime root, control, store root and recovery-namespace selections before any action intent.
6. **Estimate (turn-4 RC6).** Closed. Global Constraints and Plan Metadata now state the accepted 24–36 h breakdown and the fixture-conversion upper-bound risk.
7. **`activity-guard.mjs` path (turn-4 RC7).** Closed. It now reads `scripts/task-tracker/activity-guard.mjs`.

Two optional suggestions from turn 4 were also adopted: a spec-section traceability table and the Task 2a/2b split. The plan also states that Tasks 2a, 2b and 3 must be verified together before cleanup apply or deployment is enabled. I found no remaining gaps between the plan and the accepted spec that would block implementation release.

## Findings

1. **Minor path error (Low).** Task 3's Files list names `lib/activity-policy.mjs`. The file is `scripts/task-tracker/activity-policy.mjs`, at the root of `task-tracker/`, not under `lib/`. The implementer will find it, but the exact-path commit discipline benefits from correct paths.
2. **The skill RED baseline lives only in a volatile directory (Low).** Task 6 relies on the completed controller baseline at `.scratch/1857-cleanup-skill-baseline-{result.json,process.json,audit.md}`. I verified that these files exist, alongside a `-stderr.log` that is not listed. However, the accepted spec declares `.scratch/` freely deletable at any time. The baseline is the RED evidence for the skill TDD gate, so losing it before the Task 7 report would leave the GREEN comparison unsupported.

## Required changes

None.

## Optional suggestions

1. Correct the Task 3 path to `scripts/task-tracker/activity-policy.mjs`.
2. In Task 6's first step, capture the baseline's digest and key observed behaviors (including the stderr log) in a durable location. Suitable places are the owned expanded-design audit comment published in Task 7, or a tracked review document. This way the RED evidence survives `.scratch` cleanup, and "read and preserve" does not depend on volatile storage.

## Decision

accepted
