<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-a57fb56728281f6213185bbfbf7f4964"
role: "reviewer"
turn: 2
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-09-30-1857-durable-runtime-cleanup-design.md"
artifact_commit: "2c563a62a5a44ef7dea77b88ed7248c440fa2189"
artifact_blob: "d2dfe05ca5d94cf41540bcc5cf82743bb221545e"
artifact_digest: "sha256:1da7c5aabf5492f7b9fb5129227d2ffb95b1c0720ff8d9b5cc5d902813d5cad1"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5-5"
  model_display: "claude-opus-5-5"
  session_fingerprint: "sha256:fd23d8eb24ff8e74c4729551cf966b917897fb1bf8a48b6a7ffcc9059e2c5032"
  identity_source: "runtime"
started_at: "2026-09-30T20:47:30.467Z"
submitted_at: "2026-09-30T20:55:50.676Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

I re-reviewed the revised specification (artifact commit `2c563a62`) against author response 1 and the source tree. Four of the five required changes from turn 1 are fully closed:

- **Recovery admission (turn-1 finding 1):** closed. The new "Migration bootstrap, quiescence and recovery admission" section adds a closed-grammar bootstrap dispatcher for `migrate-runtime` plan/status/apply/resume that runs before runtime-dependent reads. It also defines a documented direct-terminal fallback, a typed recovery-required terminal state, and the crash-then-resume-from-a-hooked-session integration scenario.
- **Skill packaging (turn-1 finding 3):** closed. The cleanup adapters live at `skill/cleanup/adapters/<provider>/SKILL.md` and resolve `../../SKILL.md` to `skill/cleanup/SKILL.md`, which mirrors the task skill's `skill/adapters/<provider>/` → `skill/SKILL.md` layout. The discovery paths `.claude/skills/aitm-cleanup/`, `.agents/skills/aitm-cleanup/` and `.grok/skills/aitm-cleanup/` match the parents of the real `installTarget` values in `scripts/providers/{claude,codex,grok}.mjs`. Collision and owned-uninstall rules are explicit.
- **Nested-sandbox anchoring (turn-1 finding 4):** closed. The spec now requires matching the exact `/.ai-task-manager/runtime/store/` suffix and verifying it against the physical owner. It removes the `.tmp/aitm` anchor and the `loadState` legacy fallback, and requires independent sandbox regressions.
- **Native-host archive (turn-1 finding 5):** closed. Codex uses a typed handoff to `archive_worktree` and revalidates the receipt. Claude-managed roots stay protected with `unsupported-host-archive`. Raw Git fallback is explicitly forbidden.

All optional suggestions were also adopted: corrupt-JSON refusal, the runtime-loss scope statement, the runtime-root deletion prohibition, the revised 24–36 h range, and runtime-before-cleanup sequencing.

Turn-1 finding 2 (project-root overrides) is only partly closed. The new "Root identity" section governs `AI_TASK_MANAGER_PROJECT_DIR` and `CLAUDE_PROJECT_DIR`. However, the source tree has a third project-root variable. Several modules also read these variables directly instead of going through the paths.mjs resolver that the new rule implicitly targets. One targeted revision is needed.

## Findings

1. **Third project-root override variable and direct env readers are not covered by the root-identity rule (High, R4).**
   - **Evidence:**
     - `TASK_TRACKER_PROJECT_DIR` is honoured as a project-root override in `scripts/task-tracker/lib/project-dir.mjs:53`, `scripts/task-tracker/lib/worktree-binding-guard.mjs:150` and `scripts/task-tracker/lib/worktree-binding-lifecycle.mjs:158`.
     - The revised spec names only `AI_TASK_MANAGER_PROJECT_DIR` and `CLAUDE_PROJECT_DIR`.
     - Several modules resolve the root from `process.env` directly rather than through `getProjectDir()`: `scripts/task-tracker/word-counter.mjs:22`, `scripts/task-tracker/epic-base-edit-guard.mjs:155`, `scripts/task-tracker/commit-trail-handler.mjs:75` and `scripts/task-tracker/lib/scratch-dir.mjs:59`.
   - **Why the current wording leaves a gap:** "All runtime path resolution passes through a single module" is a stated goal, but the root-identity section does not require these readers to be converted, and it does not enumerate the third variable. An implementer could harden `paths.mjs::getProjectDir` and satisfy every listed test ("tests for both variables") while the worktree-binding guard still accepts `TASK_TRACKER_PROJECT_DIR` pointing under `.scratch/`. The guard would then read a forged activated store or binding from an artifact-writable tree. That is exactly the R4 bypass that turn-1 finding 2 described.

2. **Test-suite migration cost of the env-override restriction is unacknowledged (Low, R9 forecast honesty).** About 90 test files (215 occurrences under `scripts/tests/`) set `AI_TASK_MANAGER_PROJECT_DIR`, many pointing at `mkdtemp` directories. The governed Test verb also passes it to the sandbox child (`scripts/task-tracker/verbs/test.mjs:211,227`). Under the new rule, each such test must either become a real Git root outside artifact subtrees or switch to injected root adapters. This is a substantial part of the runtime slice. It is not reflected in the 14–20 h breakdown or the planning risk. The spec should also state that the governed Test sandbox's own env handoff is admitted as a Git-registered worktree under the new runtime prefix. The intent is implied but not stated.

## Required changes

1. In "Root identity, corruption and persistence limits", make the rule apply to **every** project-root override variable, including `TASK_TRACKER_PROJECT_DIR`, and to any future alias. Require every module that resolves the project root from the environment (at minimum `lib/project-dir.mjs`, `lib/worktree-binding-guard.mjs`, `lib/worktree-binding-lifecycle.mjs`, `word-counter.mjs`, `epic-base-edit-guard.mjs`, `commit-trail-handler.mjs`, `lib/scratch-dir.mjs`) to route through the single validated root resolver. Extend the required tests from "both variables" to all recognised variables. Add a lint or characterization check that fails if a new direct `process.env.*PROJECT_DIR` root read appears outside the resolver.

## Optional suggestions

1. Add the test-fixture conversion for roughly 90 env-override test files to the runtime slice of the planning risk. Separately, state explicitly that the governed Test verb's `AI_TASK_MANAGER_PROJECT_DIR: wtPath` handoff is admitted because the sandbox is a Git-registered worktree under the durable runtime prefix.

## Decision

revisions-requested
