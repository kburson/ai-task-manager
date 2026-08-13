// Refine-exit guard: `aitm-refine-complete` stage-completion marker (#357).
//
// Migrated from the inline pre-flight check at scripts/task-tracker/verbs/
// promote.mjs L270-285. `/task refine` stamps `aitm-refine-complete` after
// fields and rationale are written; its absence means the user has not
// signalled that refinement work is done.
//
// Reached through `runGuards('refine', 'ready-for-plan', ctx)` invoked by promote.mjs
// and `scripts/gh/move-state.mjs`. Surfaces at verb level as
// `refine-exit-refused` via the `REFUSAL_ID_TO_STATUS` mapping.
//
// Context contract:
//   { toState?: string, body?: string }
//
// Fail-open when ctx is missing or `toState` is not `ready-for-plan` — parity with
// sibling adapters; lets non-promote runGuards callers no-op safely.

export const GUARD_ID = 'refine-exit-complete-marker';

export const refineExitCompleteMarkerGuard = {
  id: GUARD_ID,
  async run(ctx) {
    if (!ctx) return { ok: true };
    if (ctx.toState && ctx.toState !== 'ready-for-plan') return { ok: true };
    const body = typeof ctx.body === 'string' ? ctx.body : '';
    // Widened (#375) to accept both legacy colon and new `ts="..."` forms.
    if (/<!--\s*aitm-refine-complete(?::[^>]*|\s+ts="[^"]*")\s*-->/i.test(body))
      return { ok: true };
    const reason = 'missing aitm-refine-complete marker; run `/task refine`';
    return {
      ok: false,
      reason,
      blockers: [reason],
    };
  },
};
