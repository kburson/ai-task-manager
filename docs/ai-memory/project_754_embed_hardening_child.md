---
name: project_754_embed_hardening_child
description: Deferred
metadata: 
  node_type: memory
  type: project
  originSessionId: ce4f7882-22ff-4b20-8190-21bbc8cd85b5
---

Under EPIC #754 (atomic+idempotent state movement), the user chose scope option **B** (2026-07-08): keep #755 right-sized, and file a NEW child of #754 for the embed-in-aitm hardening — sequenced AFTER #759, before #752.

Scope of that future child:
- Embed the move-state host INSIDE `bin/aitm.mjs`/registry so the AI cannot invoke the saga directly (superset of #755's exported `runMoveStateHost`).
- Delete standalone `scripts/gh/move-state.mjs`; the only entry becomes aitm's dispatcher, gated on `AITM_INTERNAL`/verb-context, with room for future runtime-protection layers.
- Migrate the **29 test files** that reference `scripts/gh/move-state.mjs` (structural greps → re-point at core/host modules; spawn-based integration → call the embedded entry).

Worktree-safety constraint carried into every variant: project context flows from cwd via `ctx` — `getProjectDir()` resolves `AI_TASK_MANAGER_PROJECT_DIR || CLAUDE_PROJECT_DIR || process.cwd()`, NEVER the package install dir. In-process `moveState(ctx)` is MORE worktree-safe than the old subprocess spawn. Audit any `import.meta.url`/`__dir` path in the saga to confirm it only reads packaged assets (templates), never project state.

#755 shape decision **(a)**: export `runMoveStateHost` (config-load + guard + lock + moveState + exit-mapping); `move-state.mjs` = thin CLI shim; verbs import & call in-process (no subprocess spawn). Related: [[project_marker_after_verified_move]], [[feedback_single_state_mutator]].

**File it when #759 reaches Done. Do not start mid-#755.**
