<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-a57fb56728281f6213185bbfbf7f4964"
role: "reviewer"
turn: 3
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-09-30-1857-durable-runtime-cleanup-design.md"
artifact_commit: "0d0d9247d36c9c858382fb7bb696ff301639ec7e"
artifact_blob: "ce5a60e3ef0af463ab517df4bfc3dcfd557fc513"
artifact_digest: "sha256:bafb27685858804b7cac62870cbf260439575d5c925903337ef0cfc05e21f4f0"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5-5"
  model_display: "claude-opus-5-5"
  session_fingerprint: "sha256:fd23d8eb24ff8e74c4729551cf966b917897fb1bf8a48b6a7ffcc9059e2c5032"
  identity_source: "runtime"
started_at: "2026-09-30T20:47:30.467Z"
submitted_at: "2026-09-30T21:00:33.445Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

I re-reviewed the revised specification against author response 2. I checked the "Root identity, corruption and persistence limits" section (spec lines 36–48) and the new "Root-reader conversion planning risk" section (lines 146–148).

Turn-2 required change 1 is fully closed:

- **All project-root variables are covered.** The root-identity rule now names every project-root environment override: `AI_TASK_MANAGER_PROJECT_DIR`, `TASK_TRACKER_PROJECT_DIR`, `CLAUDE_PROJECT_DIR`, and any future alias. Each one must pass the same physical-root validation and the same exclusion of artifact subtrees (`docs/`, `.scratch/`, `.tmp/`).
- **All direct readers must use the resolver.** Every source module I identified as reading the root directly from the environment must route through the single validated resolver, with no independent fallback:
  - `lib/project-dir.mjs`
  - `lib/worktree-binding-guard.mjs`
  - `lib/worktree-binding-lifecycle.mjs`
  - `word-counter.mjs`
  - `epic-base-edit-guard.mjs`
  - `commit-trail-handler.mjs`
  - `lib/scratch-dir.mjs`
- **A regression check is required.** The resolver owns one central table of recognised aliases. A characterization/lint test must reject new direct root reads outside that module, covering `process.env`, injected env objects, destructuring and computed keys.
- **Tests cover every variable.** The adversarial tests now apply to every recognised variable, not just two.

Turn-2 optional suggestion 1 was also adopted:

- **Test sandbox handoff.** The spec now explicitly admits the governed Test verb's `AI_TASK_MANAGER_PROJECT_DIR: wtPath` handoff. It rests on fresh Git-registered worktree identity and sandbox-local ownership, not a bypass flag.
- **Fixture conversion cost.** Converting the roughly 90 test files that use the override is now an inventoried, classified task. It is recorded as a material risk to the upper bound of the 14–20 h runtime slice, and the range must be reassessed if measured work exceeds it.

The turn-1 closures (recovery admission, skill packaging, nested-sandbox anchoring, native-host archive handling) and all optional safeguards remain intact. I found no regressions or new gaps. The design is sufficiently specified to proceed to the ordered plan phase.

## Findings

None.

## Required changes

None.

## Optional suggestions

None.

## Decision

accepted
